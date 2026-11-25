# Design

## Context

Motivación y alcance: ver [proposal.md](proposal.md). Requisitos verificables: [esquema-notificacion-y-cola](specs/esquema-notificacion-y-cola/spec.md), [suscriptor-notificaciones-turno](specs/suscriptor-notificaciones-turno/spec.md) y [job-recordatorios-turno](specs/job-recordatorios-turno/spec.md).

Estado observado en el repositorio (`d3e7469`) que condiciona el diseño:

- **`C-09` y `C-11` fusionados y archivados en `main`**:
  - `src/domain/turno/turno-eventos.ts` define el **contrato congelado** `EventoDeTurno` (`creado` | `confirmado` | `cancelado` | `reprogramado`, cada uno con `{ tipo, turnoId }`) y `TurnoEventPublisher { publicar(evento: EventoDeTurno): void | Promise<void> }`. No transporta `clinicaId` ni datos de paciente/clínica.
  - `src/application/turnos/{agendar,confirmar,cancelar,reprogramar}-turno.ts` y `src/interfaces/http/modules/turnos/index.ts` aún no reciben ni invocan `TurnoEventPublisher`. En `reprogramarTurno`, se inserta el nuevo turno en estado `confirmado` con `reprogramadoDe = original.id` y se retorna el nuevo turno.
  - `migrations/C09_001_turno.sql` crea `turno` con `PRIMARY KEY (id)`, `aplicar_rls('turno')` e índice `(clinica_id, estado, inicio)`, pero sin restricción `UNIQUE (clinica_id, id)` aún.
  - `migrations/C11_001_notificacion.sql` dejó `notificacion.turno_id` como `uuid` nullable sin clave foránea, difiriendo explícitamente la FK a `C-14` (resolución `Q1` de `C-11`).
  - `migrations/C11_002_pgboss_esquema.sql` instala el esquema `pgboss` v47 bajo `migra` y otorga al rol `app` `SELECT, INSERT, UPDATE, DELETE` sobre todas sus tablas (incluida `pgboss.schedule`) sin permisos DDL.
  - `src/infrastructure/queue/cola-pg-boss.ts` instancia `PgBoss` en `crearPgBossApp` con `schedule: false` fijo. En `pg-boss@12.39.0` (`node_modules/pg-boss/dist/types.d.ts`), `SchedulingOptions` habilita `schedule?: boolean` y `boss.schedule(name, cron, data, options)` opera sin DDL sobre colas creadas con `partition: false`.
  - `src/infrastructure/queue/worker-cli.ts` usa actualmente un `resolvedorSinDominio()` placeholder que descarta todo con `RESOLVEDOR_NO_CONFIGURADO`.
- **Primitivas de comunicación y zona horaria disponibles**:
  - `src/domain/comunicacion/plantillas.ts` (`C-04`) expone `plantillaCreacionTurno`, `plantillaConfirmacionTurno`, `plantillaCancelacionTurno`, `plantillaReprogramacionTurno` (requiere `inicioAnterior`) y `plantillaRecordatorioTurno`, todas formateando en `zonaHoraria` IANA explícita.
  - `src/domain/agenda/zona-horaria.ts` (`C-02`) provee `instanteALocal`, `sumarDias` y `localAInstante` (que devuelve `HORA_LOCAL_INEXISTENTE` si un adelanto DST invalida una hora local).
- **Directorio de clínicas y configuración**:
  - `migrations/C03_001_tenant_rls.sql` define `clinica` (`id`, `nombre`, `slug`, `zona_horaria`, `activa`) sin RLS (consulta de directorio autorizada con `SELECT` para `app`) y `clinica_config` (sin columna para anticipación de recordatorio).
- **Frontera hexagonal controlada por ESLint (`eslint.config.mjs`)**:
  - `src/application/**/*.ts` no puede importar `pg`, `pg-boss`, `fastify`, `nodemailer`, `**/infrastructure/**`, `**/interfaces/**` ni leer `process.env`.
- **Hallazgo crítico sobre pruebas existentes de `C-11`**:
  - `test/integration/notificaciones/cola-y-worker.test.ts` (línea 137) y `test/integration/notificaciones/repositorio-pg.test.ts` (líneas 41 y 57) insertan filas en `notificacion` con `turnoId: randomUUID()` sin crear un `turno` previo. Al activar la FK en `C14_001`, esos 3 fixtures deberán crear previamente una fila mínima válida en `turno` dentro del mismo tenant.

## Goals / Non-Goals

**Goals:**
- Agregar la integridad referencial multi-tenant entre `notificacion` y `turno` respetando `tipo = 'codigo'` con `turno_id IS NULL`.
- Proveer un suscriptor de `TurnoEventPublisher` por clínica que encole emails de `creacion`, `confirmacion`, `cancelacion` y `reprogramacion` de forma idempotente y *fail-open* (`RN-NO-03`).
- Resolver al vuelo y dentro de `withTenant(clinicaId)` todo el contenido del correo usando las plantillas de `C-04` en `clinica.zona_horaria`, sin depositar PII en `pgboss.job.data`, `notificacion.error` ni logs.
- Calcular la ventana de recordatorios en la zona horaria IANA de cada clínica (default 24 hs, parametrizable) y ejecutar un job periódico multi-tenant en `pg-boss` bajo el rol `app` sin DDL y sin duplicados.

**Non-Goals:**
- Emitir o consumir tokens de un solo uso / OTP de reserva pública (`C-15`). El resolvedor de turnos acepta un puerto opcional `ProveedorEnlacesTurno` para que `C-15` lo inyecte cuando exista, sin acoplar `C-14` a tablas futuras.
- Modificar contratos congelados (`EventoDeTurno`, `TurnoEventPublisher`, `RequestContext`), ni agregar columnas a `clinica_config` o nuevas variables en `src/config/variables.ts`.
- Generar enlaces manuales de WhatsApp (`C-12`) ni implementar pruebas E2E HTTP globales (`C-18`).

## Decisions

### D1. Migración `migrations/C14_001_notificacion_turno_fk.sql` (FK compuesta multi-tenant)
- En `C05_001` todas las referencias entre tablas multi-tenant usan clave foránea compuesta `(clinica_id, <fk>)` porque las verificaciones de FK en PostgreSQL no pasan por RLS.
- `C14_001_notificacion_turno_fk.sql` ejecutará bajo `migra`:
  1. `ALTER TABLE turno ADD CONSTRAINT turno_clinica_id_id_key UNIQUE (clinica_id, id);`
  2. `ALTER TABLE notificacion ADD CONSTRAINT notificacion_turno_fk FOREIGN KEY (clinica_id, turno_id) REFERENCES turno (clinica_id, id);`
- Al usar `MATCH SIMPLE` (comportamiento por defecto de PostgreSQL), si `turno_id IS NULL` (caso `tipo = 'codigo'`), PostgreSQL **no** exige fila en `turno` aunque `clinica_id` no sea nulo; si `turno_id IS NOT NULL`, exige que `(clinica_id, turno_id)` pertenezca exactamente a la misma clínica (`23503` si el turno no existe o pertenece a otra clínica).
- *Alternativa descartada*: `FOREIGN KEY (turno_id) REFERENCES turno (id)` simple. Descartada porque permitiría apuntar `notificacion.clinica_id = A` a un `turno` de la clínica `B` saltando RLS (inconsistente con el patrón `D2` de `C05_001`).

### D2. Suscriptor de `TurnoEventPublisher` por tenant (`src/application/notificaciones/turnos/suscriptor-turnos.ts`)
- Como el contrato congelado `EventoDeTurno` (`{ tipo, turnoId }`) no incluye `clinicaId`, la fábrica `crearPublicadorEventosTurno({ clinicaId, servicio, logger, ... })` captura `clinicaId` al instanciarse por operación o por tenant y expone la interfaz exacta `TurnoEventPublisher`.
- Mapeo de eventos:
  - `'creado'` → `tipo: 'creacion'`
  - `'confirmado'` → `tipo: 'confirmacion'`
  - `'cancelado'` → `tipo: 'cancelacion'`
  - `'reprogramado'` → `tipo: 'reprogramacion'`
- Clave de idempotencia determinista: `turno:${evento.turnoId}:${tipoNotificacion}`.
- **Aislamiento de fallos (`RN-NO-03`)**: `publicar(evento)` delega a `servicio.encolar(...)` dentro de un bloque protegido: si `encolar` retorna `{ estado: 'no_encolada' }` o si ocurre una excepción inesperada (por ejemplo, rechazo de validación), captura el error, loguea únicamente `{ clinicaId, turnoId: evento.turnoId, tipo: evento.tipo, codigo }` y **nunca** lanza hacia el caso de uso llamador.
- *Alternativa descartada*: cambiar `EventoDeTurno` para agregar `clinicaId`. Descartada porque `TurnoEventPublisher` es un contrato congelado (`CLAUDE.md` regla 14).

### D3. Semántica de eventos de reprogramación y resolución de `inicioAnterior`
- En `src/application/turnos/reprogramar-turno.ts`, una reprogramación crea un turno nuevo (estado `'confirmado'`, `reprogramado_de = original.id`) y marca el original como `'reprogramado'` en la misma transacción.
- Para que el paciente reciba **un solo** email claro con el horario anterior y el nuevo (`plantillaReprogramacionTurno`), en el evento `{ tipo: 'reprogramado', turnoId }`, `turnoId` identifica al **turno nuevo** (sin publicar un segundo evento `'creado'` para evitar dos correos simultáneos al reprogramar).
- Al resolver `tipo = 'reprogramacion'`, el lector hace `LEFT JOIN turno t_ant ON t_ant.clinica_id = t.clinica_id AND t_ant.id = t.reprogramado_de` para obtener `inicioAnterior`. Si `reprogramado_de` es nulo o no se encuentra el turno origen, el resolvedor retorna `{ estado: 'descartar', codigo: 'TURNO_ORIGEN_REPROGRAMACION_NO_ENCONTRADO' }` en lugar de inventar una fecha.
- *Alternativa descartada*: publicar `{ tipo: 'reprogramado', turnoId: original.id }` y además `{ tipo: 'creado', turnoId: nuevo.id }`. Descartada porque enviaría dos emails por una sola acción de reprogramación y no permitiría saber cuál fue el turno nuevo si hubiera múltiples reprogramaciones encadenadas.

### D4. `ResolvedorContenidoTurno`, puerto opcional de enlaces y descarte defensivo
- En `src/application/notificaciones/turnos/resolvedor-turno.ts` se implementa `crearResolvedorContenidoTurno(deps)` cumpliendo `ResolvedorContenidoEmail` (`C-11`):
  - Lee los datos agregados mediante un puerto `LectorDatosNotificacionTurno` ejecutado en `withTenant(clinicaId)`:
    - `turno` (`id`, `inicio`, `estado`, `reprogramadoDe`), `inicioAnterior` (si aplica),
    - `clinica` (`nombre`, `zonaHoraria`),
    - `paciente` (`nombre`, `apellido`, `email`),
    - `profesional` (`nombre`, `apellido`),
    - `prestacion` (`nombre`).
  - Opcionalmente consulta `ProveedorEnlacesTurno` (`obtenerEnlaces({ clinicaId, turnoId, tipo, estadoTurno })`) para adjuntar `enlaceConfirmar` / `enlaceCancelar` en `creacion`, `confirmacion`, `reprogramacion` y `recordatorio` cuando `C-15` esté integrado. Por defecto retorna enlaces vacíos.
  - **Reglas de descarte defensivo** (evitan enviar correos desactualizados o inválidos y evitan reintentos inútiles):
    1. Notificación con `turnoId === null` o turno inexistente en el tenant → `descartar` (`TURNO_NO_ENCONTRADO`).
    2. Paciente sin email o email en blanco → `descartar` (`PACIENTE_SIN_EMAIL`).
    3. `tipo === 'creacion'` o `'confirmacion'` si el turno ya pasó a `'cancelado'` o `'reprogramado'` → `descartar` (`TURNO_YA_NO_ACTIVO`).
    4. `tipo === 'recordatorio'` si el turno ya no está en `('pendiente_confirmacion', 'confirmado')` o su `inicio <= reloj.ahora()` → `descartar` (`TURNO_NO_ELEGIBLE_RECORDATORIO`).
    5. `tipo === 'reprogramacion'` si falta `inicioAnterior` → `descartar` (`TURNO_ORIGEN_REPROGRAMACION_NO_ENCONTRADO`).
    6. `tipo === 'codigo'` → `descartar` (`TIPO_NO_SOPORTADO_EN_TURNO`) — este resolvedor cubre únicamente tipos de turno; un resolvedor compuesto podrá delegar `codigo` en `C-15`.
  - Con los datos validados, invoca la plantilla pura correspondiente de `src/domain/comunicacion/plantillas.ts` pasando `zonaHoraria: datos.clinicaZonaHoraria` y `nombrePaciente: "${nombre} ${apellido}".trim()`.

### D5. Cálculo puro de ventana de recordatorio en zona horaria IANA (`ventana-recordatorio.ts`)
- Para cumplir "`la ventana de 24 horas se calcula en la zona horaria de la clínica`" sin usar desplazamientos fijos ni `now() + interval '24 hours'` como única aritmética ciega de servidor:
  1. Se parametriza `anticipacionHoras` (entero positivo, default `24`; con soporte para descomponer en días enteros `dias = Math.trunc(anticipacionHoras / 24)` + resto `horasResto = anticipacionHoras % 24`).
  2. Para la parte de días completos (e.g. `24h` = `1` día local), se convierte `ahora` a `(fechaLocal, minutosLocal)` en la zona IANA de la clínica con `instanteALocal(ahora, zonaHoraria)` (`C-02`), se avanza `fechaObjetivo = sumarDias(fechaLocal, dias)` y se resuelve el instante objetivo en esa zona con `localAInstante(fechaObjetivo, minutosLocal, zonaHoraria)`.
  3. Si `localAInstante` detecta una hora inexistente por adelanto DST (`HORA_LOCAL_INEXISTENTE`), se avanza minuto a minuto dentro de ese día hasta el primer instante local válido (`localAInstante` acepta), manteniendo un resultado determinista sin lanzar excepción; luego se suma `horasResto * 3_600_000` ms si `horasResto > 0`.
  4. **Ventana *catch-up* semiabierta `(ahora, limiteSuperior]`**: el límite inferior es `ahora` (exclusivo: nunca recuerda turnos que ya comenzaron) y el límite superior es `limiteSuperior` (inclusivo). Como cada turno se deduplica con `NOT EXISTS` y `claveIdempotencia = "turno:<turnoId>:recordatorio"`, una corrida cada 15 minutos recuerda exactamente una vez tanto los turnos que acaban de entrar a la ventana de 24 hs como un turno que estuviera un poco más cerca (por ejemplo, agendado 18 hs antes o recuperado tras una caída breve del worker).
- *Alternativa descartada*: ventana estrecha `[ahora + 23h45m, ahora + 24h00m]` acoplada al cron. Descartada porque si el worker se reinicia o se atrasa unos minutos por carga, perdería turnos para siempre sin enviar recordatorio.

### D6. Planificador multi-tenant de recordatorios (`planificador-recordatorios.ts` + `repositorio-recordatorios-pg.ts`)
- El job periódico corre como proceso de sistema sin un único `clinicaId` previo.
- Para respetar `RN-MT-01` (RLS forzada) sin crear políticas especiales ni usar `BYPASSRLS`:
  1. Un lector de catálogo (`listarClinicasActivas`) consulta `SELECT id, zona_horaria FROM clinica WHERE activa = TRUE ORDER BY id` (`clinica` no tiene RLS por diseño de `C03_001` y tiene `GRANT SELECT` a `app`).
  2. Por cada clínica activa `{ id: clinicaId, zonaHoraria }`, calcula `ventana = calcularVentanaRecordatorio({ ahora, zonaHoraria, anticipacionHoras })`.
  3. Abre una transacción `withTenant(clinicaId, ...)` que ejecuta una única consulta SQL parametrizada sobre `turno` filtrando:
     - `t.clinica_id = NULLIF(current_setting('app.clinica_id', true), '')::uuid`
     - `t.estado IN ('pendiente_confirmacion', 'confirmado')`
     - `t.inicio > $1::timestamptz AND t.inicio <= $2::timestamptz`
     - `NOT EXISTS (SELECT 1 FROM notificacion n WHERE n.clinica_id = t.clinica_id AND n.turno_id = t.id AND n.tipo = 'recordatorio')`
     - `ORDER BY t.inicio, t.id`
  4. Para cada `turnoId` candidato, invoca `servicioNotificaciones.encolar({ clinicaId, turnoId, tipo: 'recordatorio', claveIdempotencia: "turno:" + turnoId + ":recordatorio" })`.
  5. Cada clínica se procesa dentro de un `try/catch`: un error de lectura o configuración en una clínica registra `{ clinicaId, codigo }` en el logger y **no** interrumpe el ciclo para las restantes clínicas activas.
- *Alternativa descartada*: consultar `turno` globalmente sin RLS. Descartada porque violaría `RN-MT-01` y fallaría bajo `app` por `FORCE ROW LEVEL SECURITY`.

### D7. Job periódico sobre `pg-boss` y ciclo de vida del worker
- En `src/infrastructure/queue/cola-pg-boss.ts`:
  - Se amplía `OpcionesPgBossApp` con `readonly schedule?: boolean` (default `false` para preservar comportamiento existente donde no haga falta scheduler).
  - Se exporta `NOMBRE_COLA_RECORDATORIOS = 'notificaciones.recordatorios'` y `asegurarColaRecordatorios(boss)` con `partition: false, policy: 'standard', retryLimit: 1, retryDelay: 30`.
- En `src/infrastructure/queue/jobs/job-recordatorios.ts`:
  - `crearJobRecordatorios(deps)` expone `iniciar()`, `detener()` y `ejecutarAhora()` (útil para pruebas deterministas y operación):
    - `iniciar()` arranca `boss.start()`, asegura la cola `notificaciones.recordatorios`, registra `boss.schedule(NOMBRE_COLA_RECORDATORIOS, cron, {}, { tz: 'UTC' })` (con `cron` configurable, default `'*/15 * * * *'`) y registra `boss.work(NOMBRE_COLA_RECORDATORIOS, { includeMetadata: true, perJobResults: true, batchSize: 1, pollingIntervalSeconds }, ...)` ejecutando `planificador.ejecutarCiclo()`.
    - `detener()` llama `boss.offWork(NOMBRE_COLA_RECORDATORIOS, { id: workId, wait: true })` de forma idempotente (sin llamar `unschedule` para preservar el registro en `pgboss.schedule` entre reinicios).
- En `src/infrastructure/queue/worker-cli.ts`:
  - Habilita `schedule: true` en `crearPgBossApp`, usa `crearResolvedorContenidoTurno` respaldado por `crearLectorDatosTurnoPg()` cuando no se inyecte uno externo en tests, e inicia/detiene tanto el worker de emails como el job periódico de recordatorios en cierre ordenado (`SIGINT`/`SIGTERM`).

### D8. Frontera hexagonal, ubicación de archivos y estrategia de pruebas
- **Capa de aplicación (`src/application/notificaciones/turnos/`)** — sin `pg`, `pg-boss` ni `process.env`:
  - `puertos.ts`: `LectorDatosNotificacionTurno`, `ProveedorEnlacesTurno`, `CatalogoClinicasActivas`, `BuscadorTurnosRecordatorio`, `DatosNotificacionTurno`, etc.
  - `ventana-recordatorio.ts`: cálculo puro en zona IANA + tests con propiedades `fast-check`.
  - `suscriptor-turnos.ts`: `crearPublicadorEventosTurno`.
  - `resolvedor-turno.ts`: `crearResolvedorContenidoTurno`.
  - `planificador-recordatorios.ts`: `crearPlanificadorRecordatorios`.
  - `index.ts`: reexportaciones públicas del submódulo.
- **Capa de infraestructura (`src/infrastructure/queue/jobs/`)**:
  - `lector-turno-notificacion-pg.ts`: implementa `LectorDatosNotificacionTurno` sobre `withTenant`.
  - `repositorio-recordatorios-pg.ts`: implementa `CatalogoClinicasActivas` y `BuscadorTurnosRecordatorio` sobre `poolDeLaAplicacion` + `withTenant`.
  - `job-recordatorios.ts`: controlador del job periódico sobre `pg-boss`.
  - `index.ts`: reexportaciones.
- **Pruebas unitarias (`test/unit/notificaciones/`)**:
  - Ventana de recordatorio en zona IANA + propiedades `fast-check` (DST adelanto/atraso, exclusión de `<= ahora`, anticipación parametrizable).
  - Suscriptor de eventos de turno (4 eventos, idempotencia, aislamiento de fallos, logs sin PII).
  - Resolvedor de contenido (5 plantillas `C-04` en zona IANA, `reprogramacion`, enlaces opcionales, todos los casos de descarte defensivo).
  - Planificador multi-tenant (múltiples clínicas con zonas distintas, aislamiento de error por clínica).
- **Pruebas de integración real (`test/integration/notificaciones/`)** contra PostgreSQL real y `pg-boss` + `crearEmailSenderFalso`:
  - Migración `C14_001`: integridad referencial compuesta (`23503` si `turno_id` inexistente o de otra clínica, `tipo = 'codigo'` con `turno_id IS NULL` permitido).
  - Ciclo completo evento de turno → encolado → worker → `EmailSender` falso (creación, confirmación, cancelación, reprogramación con `inicioAnterior`).
  - Recordatorios periódicos: un único recordatorio ante múltiples corridas, exclusión de turnos cancelados/reprogramados/atendidos/ausentes, turno cancelado después de encolarse descartado en entrega, cálculo de ventana en zona horaria distinta de UTC (`America/Argentina/Buenos_Aires` vs `America/Mexico_City`), fallo de proveedor/cola no afecta al turno (`RN-NO-03`), aislamiento entre dos clínicas, `pg-boss` `schedule` bajo rol `app` sin `42501`, y verificación de cero PII en `pgboss.job` y `notificacion.error`.

## Risks / Trade-offs

- **[FK compuesta `notificacion_turno_fk` afecta 3 tests existentes de `C-11`]** → `cola-y-worker.test.ts:137` y `repositorio-pg.test.ts:41,57` insertan `turnoId: randomUUID()` sin fila previa en `turno`. Mitigación: actualizar esos 3 fixtures para crear antes un turno válido en el mismo tenant (precedente idéntico al ajuste de `C-12` con `bloqueo.creado_por`).
- **[Doble transacción corta al procesar email]** → `NotificacionService.procesarTrabajo` ya abre `withTenant` para leer/resolver y luego otra transacción corta tras `EmailSender.enviar` (por diseño de `C-11`, para no retener conexiones durante SMTP). Mitigación: aceptado; el resolvedor solo ejecuta un `SELECT` indexado por PK (`turno` + `paciente` + `profesional` + `prestacion` + `clinica`).
- **[Ventana *catch-up* `(ahora, ahora + 24h]` incluye turnos agendados con menos de 24h de anticipación]** → Si alguien agenda hoy para dentro de 3 horas, el cron de recordatorios lo tomará en la siguiente corrida salvo que se filtre. Mitigación: en una clínica odontológica, recibir un recordatorio próximo cuando un turno está confirmado dentro de las próximas 24 hs es el comportamiento esperado y `NOT EXISTS` garantiza máximo un recordatorio por turno.
- **[`TurnoEventPublisher` aún no conectado en `src/application/turnos/` / HTTP]** → `C-09` y `C-12` dejaron el puerto declarado pero sin parámetro en `agendarTurno`/`confirmarTurno`/`cancelarTurno`/`reprogramarTurno`. Mitigación: sujeto a `Q2`, inyectar un parámetro opcional con default `turnoEventPublisherNulo()` preserva 100% la compatibilidad de llamadas existentes.

## Migration Plan

1. Precondición verificada: `C03_001`, `C05_001`, `C09_001` y `C11_001`/`C11_002` presentes en `migrations/`.
2. Aplicar `migrations/C14_001_notificacion_turno_fk.sql` con `npm run db:migrate` (`DATABASE_MIGRATION_URL` / rol `migra`).
3. Verificar con `npm test` (unit + integration contra PostgreSQL real + api).
4. **Rollback** (solo antes de fusionar a `main`): bajo el rol `migra`, ejecutar `ALTER TABLE notificacion DROP CONSTRAINT IF EXISTS notificacion_turno_fk; ALTER TABLE turno DROP CONSTRAINT IF EXISTS turno_clinica_id_id_key;` y eliminar la fila `'C14_001_notificacion_turno_fk.sql'` de `schema_migrations`. Una vez fusionada a `main`, la migración es inmutable (Regla 6).

## Open Questions

Por gobernanza **ALTO** (`CHANGES.md`), la Líder debe revisar y aprobar estas decisiones antes de iniciar `/opsx:apply`:

1. **Q1 — FK compuesta `notificacion` → `turno` (`C14_001`) y ajuste de 3 fixtures de `C-11`**: ¿se aprueba agregar `UNIQUE (clinica_id, id)` en `turno` y la FK compuesta `(clinica_id, turno_id) REFERENCES turno (clinica_id, id)` (`MATCH SIMPLE` preservando `tipo = 'codigo'` con `turno_id IS NULL`), adaptando los 3 fixtures en `test/integration/notificaciones/{cola-y-worker,repositorio-pg}.test.ts` que usaban `turnoId: randomUUID()` sin turno real?
2. **Q2 — Cableado de `TurnoEventPublisher` fuera de la zona declarada de `C-14`**: `C-09` y `C-12` dejaron `src/application/turnos/{agendar,confirmar,cancelar,reprogramar}-turno.ts` y `src/interfaces/http/modules/turnos/index.ts` sin parámetro `TurnoEventPublisher`. ¿Se aprueba agregar el parámetro opcional retrocompatible `publicador: TurnoEventPublisher = turnoEventPublisherNulo()` en los 4 casos de uso de `src/application/turnos/` (y opcionalmente inyectarlo en `src/interfaces/http/modules/turnos/index.ts`), o se prefiere mantener `C-14` estrictamente en su zona (`src/application/notificaciones/turnos/**` y `src/infrastructure/queue/jobs/**`) dejando el cableado de rutas HTTP para un paso posterior?
3. **Q3 — Ventana de recordatorios en zona IANA y parametrización**: ¿se aprueba calcular la ventana *catch-up* `(ahora, limiteSuperior]` en la zona IANA de cada clínica con default `anticipacionHoras = 24` configurable por parámetro en servicio/job, **sin** agregar columnas a `clinica_config` ni nuevas variables obligatorias en `src/config/variables.ts`?
4. **Q4 — Semántica de `reprogramado` en `EventoDeTurno`**: `reprogramarTurno` crea un turno nuevo con `reprogramadoDe = original.id` y marca el original como `reprogramado`. ¿Se confirma que `{ tipo: 'reprogramado', turnoId }` transporta el `id` del **turno nuevo** (resolviendo `inicioAnterior` vía `reprogramado_de`) para enviar un único correo con ambos horarios sin duplicar un email de `creado`?
5. **Q5 — Cadencia cron, `crearPgBossApp` y `worker-cli.ts`**: ¿se aprueba habilitar `schedule?: boolean` en `crearPgBossApp`, registrar la cola `notificaciones.recordatorios` con `partition: false` y cron por defecto `'*/15 * * * *'` (configurable en fábrica/opciones), y cablear el resolvedor de turnos + job de recordatorios dentro de `src/infrastructure/queue/worker-cli.ts`?
6. **Q6 — Descarte defensivo en entrega y puente de enlaces para `C-15`**: ¿se aprueba que el resolvedor descarte (marcando `fallida` sin reintentos extra) cuando el turno haya pasado a `cancelado`/`reprogramado` (para `creacion`/`confirmacion`/`recordatorio`), cuando `inicio <= ahora` (para `recordatorio`), o cuando el paciente no tenga email (`PACIENTE_SIN_EMAIL`), exponiendo además el puerto opcional `ProveedorEnlacesTurno` listo para que `C-15` inyecte links de confirmación/cancelación?
