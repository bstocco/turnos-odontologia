# Design

## Context

Motivación y alcance: ver [proposal.md](proposal.md). Requisitos verificables: [esquema-notificacion-y-cola](specs/esquema-notificacion-y-cola/spec.md), [puerto-y-adaptadores-email](specs/puerto-y-adaptadores-email/spec.md) y [cola-y-servicio-notificaciones](specs/cola-y-servicio-notificaciones/spec.md).

Estado observado en el repositorio (`a0deac3`) que condiciona el diseño:

- **`C-01`, `C-03`, `C-04` y `C-07` archivados en `main`**:
  - `docker/postgres/init/01-roles.sql` crea dos roles: `migra` (propietario de la base y del esquema `public`) y `app` (sin superusuario, sin `BYPASSRLS`, sin `CREATEDB`, sin privilegio `CREATE` sobre la base ni sobre `public`).
  - `migrations/C03_001_tenant_rls.sql` define `aplicar_rls(tabla)` (`ENABLE` + `FORCE ROW LEVEL SECURITY` y política `FOR ALL TO app USING (clinica_id = NULLIF(current_setting('app.clinica_id', true), '')::uuid)`).
  - `src/infrastructure/db/tenant/with-tenant.ts` ejecuta `withTenant(clinicaId, fn)` dentro de una transacción con `set_config('app.clinica_id', clinicaId, true)`.
  - `src/infrastructure/db/ejecutor-de-migraciones.ts` envuelve cada migración `migrations/C{NN}_{seq}_{nombre}.sql` dentro de `BEGIN` / `COMMIT` propios y registra su huella SHA-256 normalizada a LF.
  - `test/support/base-de-datos.ts` expone `reiniciarEsquema(urlDeMigracion)`, que ejecuta `DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO app;` (sin tocar otros esquemas de PostgreSQL).
- **`C-09` (`turnos-persistencia-y-casos-de-uso`) aún no está fusionado en `main`**: la tabla `turno` no existe todavía en `migrations/`. Conforme a la Convención 4 de `CHANGES.md`, `C11_001` no puede declarar clave foránea hacia `turno`.
- **Frontera hexagonal controlada por ESLint (`eslint.config.mjs`)**:
  - `src/application/**/*.ts` tiene prohibido importar `pg`, `pg-boss`, `fastify`, `nodemailer`, `argon2`, `jose`, `@fastify/*`, `**/infrastructure/**`, `**/interfaces/**` y leer `process.env`.
  - `src/domain/comunicacion/plantillas.ts` (`C-04`) ya provee funciones puras de plantillas en español con saneamiento de asunto y formateo en zona horaria IANA.
- **Dependencias y configuración ya presentes desde `C-01`**:
  - `package.json` incluye `pg-boss` (`^12.39.0`), `nodemailer` (`^10.6.1`), `@types/nodemailer` (`^8.0.2`) y `pg` (`^8.23.1`).
  - `src/config/variables.ts` y `.env.example` ya declaran `EMAIL_API_KEY` (sensible, opcional en arranque base) y `EMAIL_FROM` (no sensible, ejemplo `turnos@clinica.example`).
  - **API real verificada en `node_modules/pg-boss@12.39.0/dist/`**:
    - `getConstructionPlans('pgboss')` genera el DDL completo del esquema `pgboss` (versión `47`, ~21 KB) comenzando con `BEGIN;` y terminando con `COMMIT;`.
    - `PgBoss` v12 expone `start()`, `stop()`, `createQueue(name, options)`, `send(name, data, options)`, `work(name, options, handler)` (donde `handler` recibe un **array** `Job<T>[]` o `JobWithMetadata<T>[]` si `includeMetadata: true`, y con `perJobResults: true` resuelve `JobResult[]` con `status: 'completed' | 'failed' | 'deadletter'`).

## Goals / Non-Goals

**Goals:**
- Persistir el estado de cada notificación en PostgreSQL con aislamiento multi-tenant por RLS (`notificacion`) e instalar el esquema `pgboss` de forma limpia e idempotente bajo `migra` para que `app` opere sin DDL.
- Garantizar cumplimiento estricto de Ley 25.326: payloads en `pgboss.job` exclusivamente con `{ clinicaId, notificacionId }`, resolución diferida de destinatario/contenido al momento del envío y ausencia de PII/secretos en `notificacion.error`, `pgboss.job.output`, errores tipados y logs.
- Proveer envío con backoff exponencial, idempotencia tanto en encolado como en entrega y aislamiento total frente a fallos de proveedor o cola (`RN-NO-03`).
- Soportar ejecución del worker tanto embebida (componible con el servidor HTTP) como standalone (`worker-cli.ts`), con adaptador SMTP neutral (`nodemailer`) y adaptador falso determinista para pruebas.

**Non-Goals:**
- Implementar la FK `notificacion.turno_id -> turno(id)` (corresponde a `C-14` tras fusionarse `C-09`).
- Implementar suscriptores de eventos de turno o el job periódico de recordatorio 24 hs (`C-14`).
- Implementar emisión/validación de códigos OTP de reserva pública (`C-15`).
- Modificar `src/config/**`, `.env.example`, `src/main.ts`, `package.json`, `package-lock.json`, `test/support/**` ni `RequestContext`.

## Decisions

### D1. Tabla `notificacion` multi-tenant (`migrations/C11_001_notificacion.sql`)
Columnas propuestas:
- `id uuid PRIMARY KEY`
- `clinica_id uuid NOT NULL REFERENCES clinica (id)`
- `turno_id uuid` (nullable; sin `REFERENCES turno` en C-11; `C-14` agregará la FK cuando `C-09` esté en `main`)
- `canal text NOT NULL` (`CHECK (canal = 'email')`)
- `tipo text NOT NULL` (`CHECK (tipo IN ('creacion', 'confirmacion', 'recordatorio', 'cancelacion', 'reprogramacion', 'codigo'))`)
- `estado text NOT NULL DEFAULT 'pendiente'` (`CHECK (estado IN ('pendiente', 'enviada', 'fallida'))`)
- `clave_idempotencia text NOT NULL` (`CHECK (length(btrim(clave_idempotencia)) > 0)`)
- `intentos integer NOT NULL DEFAULT 0` (`CHECK (intentos >= 0)`)
- `programada_para timestamptz NOT NULL DEFAULT now()`
- `enviada_en timestamptz` (nullable)
- `error text` (nullable; máximo saneado de código/resumen técnico sin PII)
- `creada_en timestamptz NOT NULL DEFAULT now()`
- `actualizada_en timestamptz NOT NULL DEFAULT now()`

Restricciones e índices:
- `UNIQUE (clinica_id, clave_idempotencia)` para deduplicar a nivel de base por clínica.
- `CHECK ((tipo = 'codigo' AND turno_id IS NULL) OR (tipo <> 'codigo'))` (las notificaciones de código OTP no pertenecen a un turno; los tipos de turno pueden llevar `turno_id` aunque no se fuerza `NOT NULL` en C-11 para facilitar pruebas desacopladas antes de `C-14`, o se afina según Q1).
- `CHECK ((estado = 'enviada' AND enviada_en IS NOT NULL) OR (estado <> 'enviada' AND enviada_en IS NULL))` para garantizar consistencia temporal.
- Índices: `(clinica_id, estado, programada_para)` y `(clinica_id, turno_id) WHERE turno_id IS NOT NULL`.
- Privilegios: `REVOKE ALL ON TABLE notificacion FROM PUBLIC; GRANT SELECT, INSERT, UPDATE ON TABLE notificacion TO app;` (sin `DELETE`) y `SELECT aplicar_rls('notificacion');`.

*Alternativa descartada*: guardar `asunto`, `cuerpo` o `email` destinatario en `notificacion`. Descartada por Ley 25.326 y minimización de datos (ver D4): en `codigo` el código OTP es efímero y confidencial, y en turnos los datos del paciente viven ya en `paciente`/`turno`.

### D2. Instalación idempotente del esquema `pgboss` (`migrations/C11_002_pgboss_esquema.sql`)
Como `app` no tiene permisos para crear esquemas ni tablas (`docker/postgres/init/01-roles.sql`), delegar la instalación automática de `pg-boss` a runtime (`migrate: true`) fallaría con `42501`.

Además, `test/support/base-de-datos.ts` ejecuta `reiniciarEsquema()` borrando únicamente `public` (`DROP SCHEMA IF EXISTS public CASCADE`), por lo que en corridas sucesivas de archivos de test `schema_migrations` desaparece pero el esquema `pgboss` ya existe en la base de pruebas.

Solución:
1. Extraer el DDL exacto de `getConstructionPlans('pgboss')` de `pg-boss@12.39.0` (versión `47`), **retirando** los `BEGIN;` y `COMMIT;` externos porque `ejecutor-de-migraciones.ts` ya corre cada migración dentro de su propia transacción.
2. Envolver la creación del esquema en un bloque `DO $pgboss_init$ BEGIN IF to_regclass('pgboss.version') IS NULL THEN ... END IF; END $pgboss_init$;` (escapando adecuadamente los delimitadores internos de `pg-boss` como `$$` y `$cmd$` para evitar colisiones de dollar-quoting).
3. Al final de `C11_002`, fuera del `IF` (para que siempre se reafirme), otorgar privilegios mínimos al rol `app`:
   - `GRANT USAGE ON SCHEMA pgboss TO app;`
   - `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO app;`
   - `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO app;`
   - `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO app;`
4. `pgboss` NO lleva RLS por `clinica_id`: no almacena PII (solo `{ clinicaId, notificacionId }`) y un único worker del proceso procesa trabajos de todas las clínicas sin sesión de tenant previa antes de abrir `withTenant(clinicaId, ...)`.

*Alternativa descartada*: `pgBoss.start()` con `migrate: true` usando `DATABASE_MIGRATION_URL` o dando `CREATE` a `app`. Descartada porque viola el principio de mínimo privilegio de `RN-MT-02` (`app` nunca debe tener credenciales de migración ni DDL en runtime) y rompería las migraciones deterministas.

### D3. Configuración de `PgBoss` v12 y política de cola (`src/infrastructure/queue/`)
Instancia de `PgBoss` conectada con `DATABASE_URL` (rol `app`):
```ts
new PgBoss({
  connectionString: databaseUrl,
  schema: 'pgboss',
  migrate: false,
  createSchema: false,
  supervise: true,
  schedule: false,
  reindex: false,
  persistQueueStats: false,
  registerInstance: false,
})
```
- `reindex: false` evita intentos de `REINDEX INDEX CONCURRENTLY` que requieren ser dueño de los índices (`migra`).
- `persistQueueStats: false` evita escrituras adicionales de métricas por partición mientras `app` no crea particiones futuras.
- Cola única en C-11: `notificaciones.email` creada al iniciar mediante `boss.createQueue('notificaciones.email', { partition: false, policy: 'standard', retryLimit, retryDelay, retryBackoff: true, retryDelayMax })`. Se usa `partition: false` para que las inserciones vayan a `pgboss.job_common` sin ejecutar `CREATE TABLE pgboss.j...` bajo el rol `app` (`42501`).
- **Política de reintentos**:
  - Por defecto en producción: `retryLimit: 4` (5 intentos totales), `retryDelay: 30` s, `retryBackoff: true`, `retryDelayMax: 1800` s (30 min).
  - Parametrizable por inyección en fábrica/opciones del worker para que los tests de integración verifiquen backoff real en milisegundos/segundos bajos (`retryDelay: 1`, `retryLimit: 2`, `retryBackoff: true`).
- **Consumo de lote en `pg-boss` v12**:
  - `boss.work('notificaciones.email', { includeMetadata: true, perJobResults: true, batchSize: 1, pollingIntervalSeconds: ... }, handler)` entrega `JobWithMetadata<PayloadColaEmail>[]`.
  - Si `procesarTrabajo` devuelve `reintentable` y el intento actual (`job.retryCount`) aún es menor que `job.retryLimit`, se retorna `{ id: job.id, status: 'failed', output: { codigo } }` para que `pg-boss` programe el siguiente reintento con `retryBackoff`.
  - Si es un fallo definitivo (`reintentable === false`) o un payload inválido/corrupto, se retorna `{ id: job.id, status: 'deadletter', output: { codigo } }` para terminación inmediata sin consumir reintentos.

### D4. Privacidad Ley 25.326: payloads solo-IDs y resolución diferida
1. **Payload en cola**: estrictamente `{ clinicaId: string, notificacionId: string }` (ambos UUID v4/genéricos válidos, sin propiedades adicionales). `validarPayloadColaEmail(entrada)` rechaza cualquier clave extra o valor inválido con `ErrorDeDominio('PAYLOAD_NOTIFICACION_INVALIDO', 'solicitud_invalida', ...)` **antes** de tocar `pg-boss`.
2. **Resolución diferida (`ResolvedorContenidoEmail`)**:
   - Puerto definido en `src/application/notificaciones/puertos.ts`:
     ```ts
     export interface ResolvedorContenidoEmail {
       resolver(
         ctx: { readonly clinicaId: string; readonly notificacion: NotificacionRegistrada },
       ): Promise<ResultadoResolucionEmail>;
     }
     ```
   - Retorna `{ estado: 'listo', mensaje: MensajeEmail }` o `{ estado: 'descartar', codigo: string }` (por ejemplo, si entre el encolado y el envío el turno fue cancelado o el paciente ya no tiene email válido).
   - Así, en `C-14` el resolvedor leerá `turno` + `paciente` + `clinica` en `withTenant` y armará el texto con las plantillas de `C-04`, sin haber puesto jamás nombre, email, teléfono ni enlaces con tokens en `pgboss.job.data`.
3. **Saneamiento de errores**: una función pura `sanearCodigoError(error)` en `src/application/notificaciones/` extrae únicamente códigos estables (`ErrorDeEnvioEmail.codigo`, `ErrorDeDominio.codigo` o categoría fija `ERROR_PROVEEDOR_EMAIL` / `ERROR_TRANSPORTE_COLA`) y jamás serializa `error.message` crudo ni `stack` en `notificacion.error` o `pgboss.job.output`.

### D5. Idempotencia en doble barrera y aislamiento de fallos (`RN-NO-03`)
1. **En encolado (`NotificacionService.encolar`)**:
   - Paso 1: Persiste en `notificacion` mediante `INSERT ... ON CONFLICT (clinica_id, clave_idempotencia) DO NOTHING RETURNING ...`; si no devuelve fila, realiza `SELECT` por `(clinica_id, clave_idempotencia)`. Si ya existía en estado `enviada` o `pendiente` (ya encolada), devuelve la existente sin reencolar ni duplicar.
   - Paso 2: Encola en `ColaNotificaciones.encolar({ clinicaId, notificacionId }, { singletonKey: `${clinicaId}:${claveIdempotencia}`, startAfter: programadaPara })`.
   - **Aislamiento de fallos**: todo error en la cola (o incluso en la persistencia si el consumidor usa el modo resiliente por defecto) se captura, se registra en el logger estructurado solo con `{ clinicaId, notificacionId, tipo, codigo }` y `encolar` retorna un resultado estructurado `{ estado: 'encolada' | 'duplicada' | 'no_encolada', notificacionId? }` **sin lanzar excepción** hacia el flujo de negocio llamador (`RN-NO-03`).
   - `NotificacionService.encolar` nunca recibe ni invoca a `EmailSender`.
2. **En procesamiento (`NotificacionService.procesarTrabajo`)**:
   - Paso 1 (en transacción `withTenant(clinicaId)`): lee `notificacion` por `id`. Si no existe o `estado === 'enviada'`, corta de inmediato y retorna `{ accion: 'omitida' }` (idempotencia en entrega; `EmailSender` no se llama).
   - Paso 2 (en transacción `withTenant(clinicaId)` o callback de lectura del resolvedor): resuelve `MensajeEmail` vía `ResolvedorContenidoEmail`. Si devuelve `'descartar'`, marca `estado = 'fallida'` y retorna `{ accion: 'fallida_definitiva' }`.
   - Paso 3 (**fuera de cualquier transacción de PostgreSQL**): invoca `EmailSender.enviar(mensaje)`. Esto evita mantener conexiones y bloqueos de base de datos abiertos durante llamadas de red SMTP/HTTPS.
   - Paso 4 (en transacción `withTenant(clinicaId)`):
     - Si el envío tuvo éxito: `UPDATE notificacion SET estado = 'enviada', intentos = intentos + 1, enviada_en = now(), error = NULL, actualizada_en = now()`.
     - Si falló con `ErrorDeEnvioEmail`: si `reintentable === true` y `intentoActual < maxIntentos`, actualiza `intentos = intentos + 1, error = codigoSaneado, actualizada_en = now()` manteniendo `estado = 'pendiente'` y retorna `{ accion: 'reintentar', codigo }`; si `reintentable === false` o `intentoActual >= maxIntentos`, actualiza `estado = 'fallida', intentos = intentos + 1, error = codigoSaneado, actualizada_en = now()` y retorna `{ accion: 'fallida_definitiva', codigo }`.

### D6. Puerto `EmailSender` y adaptadores (`src/infrastructure/email/`)
- **Puerto** (`src/application/notificaciones/puertos.ts`):
  - `MensajeEmail { para: string; asunto: string; texto: string; html?: string }`
  - `ResultadoEnvioEmail { idProveedor: string }`
  - `EmailSender { enviar(mensaje: MensajeEmail): Promise<ResultadoEnvioEmail> }`
  - `ErrorDeEnvioEmail(codigo, reintentable, mensajeFijo)` sin PII ni credenciales.
- **Adaptador SMTP real (`src/infrastructure/email/smtp-sender.ts`)**:
  - Construido sobre `nodemailer` (decisión `C-01 D12`).
  - Por defecto toma el preset de Resend SMTP (`host: 'smtp.resend.com'`, `port: 465`, `secure: true`, `auth: { user: 'resend', pass: emailApiKey }`) o configuración SMTP explícita inyectada por opciones (`host`, `port`, `secure`, `user`, `pass`, `from`), lo que permite cambiar entre Resend, Brevo o un servidor SMTP de pruebas sin cambiar código de aplicación.
  - Valida en construcción que `emailApiKey` (o `pass`) y `emailFrom` no estén vacíos y que `emailFrom` tenga formato válido, lanzando error tipado que nombra la propiedad sin exponer valores.
  - Sanea `asunto` eliminando/reemplazando `\r` y `\n` por espacio antes de entregarlo a `nodemailer`.
  - Traduce errores de `nodemailer`: códigos de red (`ETIMEDOUT`, `ECONNRESET`, `ECONNREFUSED`, `EAI_AGAIN`), `responseCode` `4xx` o `429` → `reintentable = true`; `responseCode` `5xx` o `EAUTH` → `reintentable = false`. Mensaje siempre fijo sin dirección destinatario ni cuerpo.
- **Adaptador falso (`src/infrastructure/email/falso-sender.ts`)**:
  - `crearEmailSenderFalso()` guarda copia inmutable de `enviados: MensajeEnviadoFalso[]` y permite programar secuencias de respuestas (`fallarTransitoriamente(veces, codigo?)`, `fallarPermanentemente(codigo?)`, `limpiar()`) para tests unitarios y de integración deterministas.

### D7. Frontera hexagonal y estructura de archivos
Zona exclusiva de `C-11`:
- `migrations/C11_001_notificacion.sql`
- `migrations/C11_002_pgboss_esquema.sql`
- `src/application/notificaciones/`: `puertos.ts`, `errores.ts`, `validaciones.ts`, `servicio.ts`, `index.ts` (cero imports de `pg`, `pg-boss`, `nodemailer`, `infrastructure`, `interfaces`, `process.env`).
- `src/infrastructure/email/`: `smtp-sender.ts`, `falso-sender.ts`, `index.ts`.
- `src/infrastructure/queue/`: `notificacion-repositorio-pg.ts`, `cola-pg-boss.ts`, `worker.ts`, `worker-cli.ts`, `index.ts`.
- `test/unit/notificaciones/**` y `test/integration/notificaciones/**`.

Sin cambios en `src/config/**`, `.env.example`, `src/main.ts`, `RequestContext`, `package.json`, `package-lock.json` ni `test/support/**`.

### D8. Modos de ejecución del worker (embebido y standalone)
`src/infrastructure/queue/worker.ts` expone `crearWorkerNotificaciones(dependencias)` con métodos idempotentes `iniciar(): Promise<void>` y `detener(): Promise<void>`:
- **Modo embebido**: un consumidor (`C-14` o `src/main.ts` cuando se cableen los casos de uso de turnos) puede instanciar el worker compartiendo el ciclo de vida del servidor Fastify y llamando a `iniciar()` / `detener()` en `onClose`. No se modifica `src/main.ts` en C-11 porque C-11 no define aún el `ResolvedorContenidoEmail` de dominio (eso es `C-14` + `C-15`).
- **Modo standalone (`src/infrastructure/queue/worker-cli.ts`)**: punto de entrada ejecutable por separado que carga `loadConfig('app')`, valida `DATABASE_URL` + `EMAIL_API_KEY` + `EMAIL_FROM`, inicia el worker con el adaptador SMTP real y captura `SIGINT`/`SIGTERM` para ejecutar `detener()` de forma ordenada y cerrar el pool antes de salir.

### D9. Estrategia de pruebas unitarias y de integración real
- **Unitarias (`test/unit/notificaciones/**`)**: sin DB ni red; cubren validación estricta solo-IDs (incluyendo propiedades `fast-check`), saneamiento de errores sin PII, `NotificacionService` (encolado idempotente, aislamiento de fallos, máquina de estados de `procesarTrabajo`, envío fuera de tx), `crearEmailSenderFalso` y `crearEmailSenderSmtp` (con transporte mockeado de `nodemailer` para verificar mapeo 4xx/5xx/red y saneamiento de asunto/config).
- **Integración (`test/integration/notificaciones/**`)**: contra PostgreSQL real usando `test/support/base-de-datos.ts` y `test/support/aislamiento.ts` más un soporte local en `test/integration/notificaciones/soporte.ts` que limpia `pgboss.job` / `notificacion` entre casos sin tocar `test/support/**`. Verifican:
  1. Esquema, índices, privilegios `app` vs `migra`, `CHECK`s e idempotencia de `C11_002` tras `reiniciarEsquema`.
  2. Aislamiento RLS por clínica (`CLINICA_A` vs `CLINICA_B`, 0 filas sin contexto, `42501` cruzado, `DELETE` rechazado).
  3. Ciclo completo con `PgBoss` real + `crearEmailSenderFalso`: reintentos con `retryBackoff: true` (`start_after` creciente y éxito al N-ésimo intento), agotamiento de reintentos → `fallida`, fallo permanente → `fallida` inmediata sin reintentos, fallo del proveedor/cola no rompe el flujo que encola (`RN-NO-03`), idempotencia en encolado y en entrega, y verificación sobre columnas reales de `pgboss.job` y `notificacion` de que **no existe PII**.

## Risks / Trade-offs

- **[Esquema `pgboss` persistente tras `reiniciarEsquema` en tests]** → `reiniciarEsquema` borra solo `public`. Mitigación: `C11_002` comprueba `to_regclass('pgboss.version') IS NULL` y reafirma los `GRANT` a `app` fuera del `IF`, asegurando que todas las suites previas sigan pasando aunque `pgboss` ya exista.
- **[`C-09` (`turno`) aún no fusionado]** → `notificacion.turno_id` no puede llevar FK todavía. Mitigación: Convención 4 de `CHANGES.md`: `turno_id` se crea como `uuid` nullable indexado y `C-14` agregará `ALTER TABLE notificacion ADD CONSTRAINT ... FOREIGN KEY (turno_id) REFERENCES turno(id)`.
- **[Cambio de API de `pg-boss` v12 respecto a versiones anteriores]** → en `pg-boss@12.39.0` `work()` recibe arrays y usa `perJobResults` + `deadletter` en lugar de callbacks unitarios antiguos. Mitigación: se inspeccionaron directamente las definiciones en `node_modules/pg-boss/dist/` y se valida contra PostgreSQL real en tests de integración.
- **[Dependencia de configuración SMTP al usar `worker-cli.ts`]** → `EMAIL_API_KEY` y `EMAIL_FROM` son opcionales en `loadConfig('app')` (para no romper arranque de `buildApp` en tests sin email). Mitigación: el adaptador SMTP y `worker-cli.ts` validan `EMAIL_API_KEY` y `EMAIL_FROM` de forma *fail-fast* al construirse, sin alterar `loadConfig('app')`.

## Migration Plan

1. Precondición verificada: `C03_001` (`clinica`, `aplicar_rls`), `C05_001`, `C06_001`, `C06_002` y `C07_001` presentes en `migrations/`; roles `migra` y `app` creados por `docker/postgres/init/01-roles.sql`.
2. Aplicar `migrations/C11_001_notificacion.sql` y `migrations/C11_002_pgboss_esquema.sql` con `npm run db:migrate` (`DATABASE_MIGRATION_URL` / rol `migra`).
3. Verificar con `npm run test:integration` contra PostgreSQL real (`_test`).
4. **Rollback** (solo antes de fusionar a `main`): con el rol `migra`, ejecutar `DROP SCHEMA IF EXISTS pgboss CASCADE; DROP TABLE IF EXISTS notificacion;` y eliminar las filas `'C11_001_notificacion.sql'` y `'C11_002_pgboss_esquema.sql'` de `schema_migrations`. Una vez fusionadas a `main`, las migraciones son inmutables (Regla 6).

## Open Questions

Por gobernanza **ALTO** (`CHANGES.md`), el Líder debe revisar y aprobar estas decisiones antes de iniciar `/opsx:apply`:

1. **Q1 — Alcance de `tipo` y nulabilidad de `turno_id` en `notificacion` (`C11_001`)**: ¿se aprueba el conjunto de 6 tipos (`creacion`, `confirmacion`, `recordatorio`, `cancelacion`, `reprogramacion`, `codigo`) alineado con `plantillas.ts` (`C-04`) y mantener `turno_id uuid` nullable **sin FK** en `C11_001` (difiriendo la FK a `C-14` cuando `C-09` esté fusionado)?
2. **Q2 — Adaptador de email por defecto (`nodemailer` SMTP neutral vs SDK/REST)**: `C-01 D12` instaló `nodemailer` como cliente neutral entre Resend y Brevo sin agregar dependencias nuevas. ¿Se aprueba `crearEmailSenderSmtp` sobre `nodemailer` (preset Resend SMTP por defecto usando `EMAIL_API_KEY` y `EMAIL_FROM`, más opciones host/puerto configurables para Brevo u otro SMTP), o se prefiere agregar un adaptador REST directo vía `fetch` para la API HTTP de Resend/Brevo?
3. **Q3 — Instalación de `pgboss` vía migración idempotente (`C11_002`)**: dado que `app` no tiene permisos DDL en `01-roles.sql` y `reiniciarEsquema` solo reinicia `public`, ¿se aprueba instalar el esquema `pgboss` (v47) dentro de `migrations/C11_002_pgboss_esquema.sql` bajo `migra` con guarda `IF to_regclass('pgboss.version') IS NULL`, otorgando permisos mínimos a `app` y configurando `PgBoss` con `migrate: false, createSchema: false, reindex: false, partition: false`?
4. **Q4 — Contrato `ResolvedorContenidoEmail` para cero PII en cola**: para garantizar que `pgboss.job.data` contenga únicamente `{ clinicaId, notificacionId }` sin email ni código OTP en texto plano, ¿se aprueba introducir el puerto `ResolvedorContenidoEmail` en `C-11` (entendiendo que en `C-15` el OTP o su vínculo deberá resolverse de forma segura sin exponerlo en la cola)?
5. **Q5 — Política de reintentos y modo *fail-open* al encolar (`RN-NO-03`)**: ¿se aprueban los defaults `retryLimit: 4`, `retryDelay: 30` s, `retryBackoff: true`, `retryDelayMax: 1800` s (parametrizables para tests) y que `NotificacionService.encolar` capture fallos de cola devolviendo resultado estructurado sin lanzar error al caso de uso llamador?
6. **Q6 — Preservación de archivos compartidos fuera de la zona de `C-11`**: ¿se confirma mantener intactos `src/config/**`, `.env.example`, `src/main.ts` (exponiendo el controlador embebido del worker para que lo cablee `C-14`/`C-20`), `package.json` y `test/support/**`?
