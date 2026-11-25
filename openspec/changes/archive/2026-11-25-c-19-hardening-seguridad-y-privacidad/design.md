# Design

## Context

Motivación, alcance y requisitos verificables: ver [proposal.md](proposal.md) y las 5 delta specs en [specs/](specs/).

Estado observado en el repositorio al iniciar `C-19`:

1. **Dependencias HTTP ya instaladas en `package.json`**: `@fastify/helmet` (`^13.2.0`), `@fastify/cors` (`^11.4.3`) y `@fastify/rate-limit` (`^11.3.0`) ya figuran en `dependencies`, sin requerir cambios de dependencias npm (Regla 14). Ninguno está registrado aún en `src/interfaces/http/app.ts`.
2. **Interacción de `@fastify/cors` con OpenAPI (`C-18`)**: por inspección de `node_modules/@fastify/cors/index.js`, el plugin registra `fastify.options('*', { schema: { hide: hideOptionsRoute } })`. Si no se fija `hideOptionsRoute: true` o si no se verifica contra `app.swagger()`, podría alterar `docs/api/openapi.json` y romper las pruebas de contrato de `C-18`.
3. **Interacción de `@fastify/rate-limit` con módulos públicos (`C-13`, `C-15`)**: por inspección de `node_modules/@fastify/rate-limit/index.js`, el plugin protege el registro de decoradores con `if (!fastify.hasDecorator('rateLimit'))` y encapsula sus hooks por ámbito. Registrar un límite global en la raíz de `app.ts` convive de forma segura con los límites encapsulados más estrictos (`RATE_LIMIT_PUBLIC=30/min`) en `publico-disponibilidad` y `publico-reservas`. Además, `GET /salud` debe excluirse explícitamente (`config: { rateLimit: false }`) según la spec `limite-tasa-publica` y las necesidades de healthcheck del PaaS (`C-20`).
4. **Restricciones de `test/api/salud.test.ts`**: verifica que `GET /salud` no exponga `x-powered-by`, `server`, patrones de versión `\d+\.\d+\.\d+`, la cadena `fastify` ni rutas del servidor. Las cabeceras de `@fastify/helmet` cumplen estas restricciones.
5. **Paridad estricta de `test/unit/config.test.ts`**: exige igualdad exacta entre las claves de `EsquemaEntorno`, `VARIABLES` y `.env.example`, y exige que toda variable no sensible con `porDefecto` coincida literalmente con su valor en `.env.example`. Como `seleccionarEntorno` trata cadenas vacías como ausentes, `CORS_ALLOWED_ORIGINS` debe quedar sin `porDefecto` en `VARIABLES` (y vacía `CORS_ALLOWED_ORIGINS=` en `.env.example`), resolviendo a `[]` en `loadConfig`.
6. **Brechas puntuales en `src/infrastructure/logging/redactor.ts`**:
   - `PALABRAS_DE_CREDENCIAL` incluye `apikey`, pero no `internalkey` ni `privatekey` (`adminInternalKey` no queda cubierto si se registra como campo).
   - `limpiarTexto` enmascara emails, DNIs de 7-8 dígitos, credenciales en URL y `Bearer ...`, pero no teléfonos argentinos en formato internacional (`+54...`, de 10-13 dígitos luego de `+54`) ni tokens JWT sueltos (`eyJ...`) en mensajes de error o trazas.
7. **Defectos previos fuera de zona detectados en `C-18` (`test/e2e/permisos/matriz.ts`)**: siguen activos en `main`: `F1` (`C-06`, módulo `usuarios` sin autenticación → `401`), `F6` (`C-12`, módulos `turnos`/`agenda`/`bloqueos` sin autenticación → `401`), `F8` (`C-16`) y `F9` (`C-16`, `auditoria`/`ausentismo`/`exportaciones` responden `403` sin sesión en lugar de `401`). Adicionalmente, `matriz.ts` no marca `GET /api/v1/exportaciones/{id}` con `conId: true` y usa `it.fails` para `F1`/`F6`/`F9`.
8. **Estado de vulnerabilidades y CI**: `npm audit --omit=dev --audit-level=high` y `npm audit --audit-level=high` reportan actualmente `0 vulnerabilities`. `.github/workflows/ci.yml` ejecuta `calidad` (`lint`, `format:check`, `typecheck`) y `pruebas` (`unit`, `integration`, `api`, `e2e`, humo de build), sin auditoría de dependencias ni suite `test:security`.
9. **Estado de `PO-03`, `PO-14`, `PO-10`, `R-03` en `knowledge-base/10_preguntas_abiertas.md`**: `PO-03` quedó definida con región `sa-east-1` (São Paulo) bajo cláusulas contractuales modelo (Disposición DNPDP 60/2016 y Resolución AAIP 198/2023, sujeto a validación legal previa a producción); `PO-14` (registro ante la AAIP) y `PO-10` (retención de copias y bajas) continúan abiertas como tareas pre-lanzamiento.

## Goals / Non-Goals

**Goals:**
- Activar el endurecimiento HTTP transversal en `src/interfaces/http/app.ts` sin alterar el contrato OpenAPI ni los códigos de error de dominio existentes.
- Proveer verificación automatizada completa en `test/seguridad/**` (`npm run test:security`) que recorra el 100% de las rutas reales, verifique privacidad de logs en flujos reales, audite el catálogo PostgreSQL/RLS/privilegios y verifique las guardas anti-producción de seeds.
- Exponer una función reutilizable de verificación de postura de PostgreSQL (`src/infrastructure/db/verificar-seguridad-bd.ts`) utilizable tanto en pruebas de CI como en chequeos de despliegue (`C-20`).
- Formalizar en `docs/seguridad/` el checklist accionable de Ley 25.326 y la documentación técnica de hardening.

**Non-Goals:**
- Corregir defectos previos fuera de la zona de `C-19` (`F1` en `usuarios`, `F6` en `turnos`/`agenda`/`bloqueos`, `F8`/`F9` en `C-16`), salvo indicación explícita de la Líder en `Q1`.
- Instalar nuevas dependencias npm o modificar `package-lock.json`.
- Crear migraciones SQL o modificar contratos congelados (`RequestContext`, puertos de dominio, `TurnoEventPublisher`).
- Implementar el despliegue PaaS, `Dockerfile` o runbooks operativos (`C-20`).

## Decisions

### D1. Cabeceras de seguridad vía `@fastify/helmet` en `src/interfaces/http/app.ts`
- Registrar `@fastify/helmet` al construir la app con:
  - `contentSecurityPolicy`: `{ directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }` (adecuado para API REST sin HTML/scripts/assets).
  - `frameguard`: `{ action: 'deny' }` (`X-Frame-Options: DENY`).
  - `referrerPolicy`: `{ policy: 'no-referrer' }`.
  - `crossOriginResourcePolicy`: `{ policy: 'same-origin' }`.
  - `crossOriginOpenerPolicy`: `{ policy: 'same-origin' }`.
  - `hsts`: `{ maxAge: 15552000, includeSubDomains: true }` (sobre HTTPS en producción; cabecera inofensiva en HTTP local/tests).
  - `hidePoweredBy: true`, `noSniff: true`.
- *Alternativa descartada*: escribir un hook `onSend` manual por cabecera. Descartada porque `@fastify/helmet` ya está en `package.json`, mantiene defaults probados y evita omisiones ante respuestas tempranas o errores.

### D2. CORS restrictivo por lista blanca exacta (`CORS_ALLOWED_ORIGINS`)
- Nueva variable `CORS_ALLOWED_ORIGINS` en `src/config/variables.ts` y `src/config/index.ts` (opcional, sin `porDefecto` para mantener compatibilidad con `test/unit/config.test.ts`; parseada a `readonly string[]` normalizado sin barra final).
- Validación estricta en `loadConfig`: rechaza `*` y cualquier entrada que no sea un origen válido `http:` o `https:` sin path/query/hash ni credenciales embebidas, lanzando `ConfigError` con el nombre de la variable y sin volcar valores.
- Registro de `@fastify/cors` en `app.ts` con `hideOptionsRoute: true`, `credentials: false`, métodos `['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']`, cabeceras permitidas `['Content-Type', 'Authorization']`, y callback `origin` que compara contra el `Set` exacto de orígenes permitidos (si la lista está vacía, responde `false` para todo origen cruzado).
- *Alternativa descartada*: `origin: true` o `*` en desarrollo. Descartada para garantizar *default-deny* uniforme y evitar configuraciones inseguras accidentales.

### D3. Límite de tamaño de cuerpo (`HTTP_BODY_LIMIT_BYTES`)
- Nueva variable `HTTP_BODY_LIMIT_BYTES` en `src/config/variables.ts` y `src/config/index.ts` (`Type.Integer({ minimum: 1024, maximum: 1048576, default: 102400 })` — 100 KiB por defecto).
- Se pasa como `bodyLimit: config.httpBodyLimitBytes` en el constructor `Fastify({ ... })` de `app.ts` (configurable también en `OpcionesDeApp` para pruebas puntuales si hiciera falta, manteniendo el valor de `config` por defecto).
- El manejador de errores (`src/interfaces/http/errores.ts`) ya mapea `statusCode === 413` a `{ codigo: 'CUERPO_DEMASIADO_GRANDE', mensaje: '...' }`.
- *Alternativa descartada*: usar el valor por defecto de Fastify (`1 MiB`) sin variable explícita. Descartada porque 1 MiB es innecesariamente amplio para payloads JSON de turnos/pacientes y no cumple la trazabilidad de configuración explícita.

### D4. Límite de tasa global (`RATE_LIMIT_GLOBAL`) y coexistencia con límites públicos
- Nueva variable `RATE_LIMIT_GLOBAL` en `src/config/variables.ts` y `src/config/index.ts` (patrón `^[1-9][0-9]*/(s|min|h)$`, por defecto `'120/min'`).
- Se reutiliza `parsearLimiteDeTasa` (extraíble o compartible sin duplicar lógica desde `src/interfaces/http/modules/publico-disponibilidad/limite-de-tasa.ts` o un módulo compartido de configuración HTTP) para traducir `RATE_LIMIT_GLOBAL` a `{ max, ventanaMs }`.
- Registro de `@fastify/rate-limit` en `app.ts` con `global: true`, `hook: 'onRequest'`, `cache: 10_000` (memoria acotada), `errorResponseBuilder` generando error con `statusCode: 429` para unificar el formato `DEMASIADOS_PEDIDOS` + `retry-after`.
- `GET /salud` se declara con `{ config: { rateLimit: false } }` para no bloquear chequeos de salud del PaaS ni violar `limite-tasa-publica`.
- `OpcionesDeApp` puede aceptar un override opcional de límite/caché global (solo usado por tests de límite global para no disparar 121 pedidos en pruebas unitarias/API ni afectar suites con IP sintética por pedido).
- *Alternativa descartada*: excluir rutas públicas del límite global. No es necesario mientras `RATE_LIMIT_PUBLIC` (`30/min`) sea más estricto que `RATE_LIMIT_GLOBAL` (`120/min`), y tener el global en raíz protege también `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh` y rutas autenticadas contra abuso por IP.

### D5. Endurecimiento de `src/infrastructure/logging/redactor.ts`
- Agregar `'internalkey'` y `'privatekey'` a `PALABRAS_DE_CREDENCIAL` para cubrir `adminInternalKey` y claves privadas en objetos o errores serializados.
- En `limpiarTexto(texto)`:
  - Agregar `PATRON_TELEFONO_AR = /\+54(?:9)?\d{10,11}\b/g` (y variante con espacios/guiones acotada `(?:\+?54[\s-]?(?:9[\s-]?)?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{4})` solo cuando comienza con `+54`) para enmascarar teléfonos argentinos normalizados sin afectar timestamps ni números de otros formatos.
  - Agregar `PATRON_JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g` para enmascarar JWT sueltos aunque aparezcan sin el prefijo `Bearer `.
- Mantener intactos todos los casos existentes de `test/unit/log-redaction.test.ts` (incluidos `turno 12345 de 123456789012` y `codigo: 'TURNO_SOLAPADO_SILLON'`).

### D6. Suite `test/seguridad/**` y verificador reutilizable de postura PostgreSQL
- Nuevo proyecto Vitest `security` en `vitest.config.ts`:
  - `include: ['test/seguridad/**/*.test.ts']`
  - `globalSetup: ['test/e2e/soporte/global-setup.ts']`
  - `setupFiles: ['test/e2e/soporte/entorno-descartable.ts']`
  - `fileParallelism: false`, `sequence: { groupOrder: 2 }` (corre secuencialmente después de `integration` y `e2e` sobre `turnos_test`).
  - Nuevo script en `package.json`: `"test:security": "vitest run --project security"`.
- Archivos previstos en `test/seguridad/`:
  1. `test/seguridad/hardening-http.test.ts`: cabeceras Helmet en `/salud`, `/api/v1/*`, `4xx`; CORS default-deny, origen permitido, origen rechazado, preflight `OPTIONS` y verificación de que `app.swagger()` no cambia; `bodyLimit` `413 CUERPO_DEMASIADO_GRANDE`; `rateLimit` global `429 DEMASIADOS_PEDIDOS` + `retry-after` y exclusión de `/salud`.
  2. `test/seguridad/cross-tenant.test.ts`: inventario dinámico desde `app.swagger()` con prueba de completitud (falla si falta alguna operación). Para cada operación:
     - Recursos por ID (incluyendo `GET /api/v1/exportaciones/{id}`): credenciales de clínica B → `404`.
     - Colecciones (`GET /profesionales`, `/sillones`, `/prestaciones`, `/feriados`, `/pacientes`, `/auditoria`, `/ausentismo`, `/horarios`, `/agenda`, `/usuarios`): clínica B recibe solo los propios / 0 filas de A.
     - Inyección de referencias ajenas en cuerpo o query (p. ej. `POST /turnos` con `pacienteId`/`profesionalId`/`sillonId` de A, `GET /agenda?profesionalId=<A>`, `POST /bloqueos` con `profesionalId` de A, `POST /publico/{slugB}/reservas` con `profesionalId` de A, `POST /publico/turnos/accion` con token de A): rechazado (`404`/`422`) sin fugas ni efectos en A.
     - Login cross-tenant (`POST /auth/login` con usuario de A y slug de B → `401`).
     - Defectos previos fuera de zona (`F1`, `F6`, `F9`) registrados transparentemente con `it.fails` y documentados como bloqueantes previos a lanzamiento (sujeto a `Q1`).
  3. `test/seguridad/logs-sin-fugas.test.ts`: ejecuta flujos reales completos (login, alta/consulta de paciente, OTP/reserva pública, acción por token, exportación, error 400/500, `describirConfig`) capturando logs de Pino y validando 0 apariciones de PII sintética (DNI, teléfono, email, nombre, apellido, obra social) y 0 apariciones de secretos (`DATABASE_URL`, JWT secrets, `EMAIL_API_KEY`, `ADMIN_INTERNAL_KEY`, contraseñas, tokens, OTP en claro).
  4. `test/seguridad/postura-bd-y-seeds.test.ts`:
     - Invoca `verificarPosturaSeguridadBd(poolMigra)` (`src/infrastructure/db/verificar-seguridad-bd.ts`) contra `turnos_test` migrada:
       - Rol `app`: `rolsuper = false`, `rolbypassrls = false`, `rolcreatedb = false`, `rolcreaterole = false`.
       - Cero tablas en `public` con `tableowner = 'app'`.
       - Toda tabla base en `public` con columna `clinica_id` tiene `relrowsecurity = true`, `relforcerowsecurity = true` y al menos una política en `pg_policies` que referencia `app.clinica_id`.
       - Tabla `auditoria`: rol `app` tiene `SELECT` e `INSERT`, y carece de `UPDATE`, `DELETE` y `TRUNCATE`.
       - Toda función en `public` con `prosecdef = true` (`resolver_clinica_por_slug`, `resolver_clinica_por_hash_token`, y futuras) tiene `proconfig` fijando `search_path` y no otorga `EXECUTE` a `PUBLIC`.
     - Incluye test negativo (en transacción revertida o esquema auxiliar controlado bajo `migra`) comprobando que `verificarPosturaSeguridadBd` detecta una tabla con `clinica_id` sin RLS forzada.
     - Verifica `ALLOW_SEED=false` en `.env.example` y en `loadConfig('app')` por defecto, y verifica que `seeds/run.ts`, `seeds/demo-clinica.ts` y `seeds/primera-clinica.ts` llaman a `assertNoProduction()` antes de abrir pools y rechazan `NODE_ENV=production`, `ALLOW_SEED=false` y hosts externos.

### D7. Integración en `.github/workflows/ci.yml`
- En el job `calidad`: agregar paso `npm audit --omit=dev --audit-level=high` (sujeto a confirmación de alcance en `Q4`).
- En el job `pruebas`: agregar paso `npm run test:security` inmediatamente después de `npm run test:e2e`.

### D8. Documentación de cumplimiento y hardening (`docs/seguridad/`)
- `docs/seguridad/checklist-ley-25326.md`:
  - Matriz trazable de cumplimiento técnico y legal:
    - Controles técnicos verificados por `C-19` (`RN-MT-01/02/03`, `RN-AU-01/02/03`, `RN-DA-01/02/04`, `R-03`, cifrado de contraseñas/tokens, redacción de logs, hardening HTTP).
    - Obligaciones legales/operativas con estado, responsable, bloqueante de salida y referencia:
      - `PO-03`: Región `sa-east-1` (São Paulo); adopción de cláusulas contractuales modelo (Disposición DNPDP 60/2016 y Resolución AAIP 198/2023) — estado `Pendiente validación legal pre-producción`.
      - `PO-14`: Inscripción de la base de datos ante la AAIP — estado `Pendiente gestión legal/producto pre-producción`.
      - `PO-10`: Política de retención de copias de seguridad y datos tras baja de clínica (referencia 90 días) — estado `Pendiente definición en C-20 / asesoría legal`.
      - Bloqueantes técnicos previos a lanzamiento detectados fuera de zona (`F1`, `F6`, `F8`/`F9`).
- `docs/seguridad/hardening-http-y-bd.md`:
  - Resumen operativo de cabeceras HTTP, configuración de CORS en producción, límites de cuerpo y tasa, verificación de postura PostgreSQL y uso seguro de seeds.

## Risks / Trade-offs

- **[Límite de tasa global interfiriendo con pruebas existentes]** → *Mitigación*: umbral por defecto `120/min`, uso de `ipNueva()` en el soporte E2E/seguridad (que asigna una IP sintética distinta por pedido), y override opcional en `OpcionesDeApp` para las pruebas unitarias/API específicas del limitador.
- **[Contaminación del contrato OpenAPI por `@fastify/cors`]** → *Mitigación*: configurar `hideOptionsRoute: true` y verificar explícitamente en `test/seguridad/hardening-http.test.ts` y `npm run test:e2e` que `docs/api/openapi.json` no cambia.
- **[Falsos positivos de regex de teléfonos en `limpiarTexto`]** → *Mitigación*: anclar el patrón al prefijo internacional argentino `+54` (y opcional `9` móvil) de 10–11 dígitos locales, evitando tocar números internos, duraciones, códigos de error o los casos existentes de `test/unit/log-redaction.test.ts`.
- **[Contención en la base `turnos_test` al sumar el proyecto `security`]** → *Mitigación*: `sequence: { groupOrder: 2 }` y `fileParallelism: false` en `vitest.config.ts`, asegurando ejecución estrictamente secuencial tras `integration` (`0`) y `e2e` (`1`).

## Migration Plan

Este change **no** agrega migraciones SQL ni modifica las migraciones existentes (`C03_001` a `C15_001`).

Pasos de verificación tras la implementación:
1. `npm run lint` y `npm run format:check` y `npm run typecheck`.
2. `npm run test:unit`, `npm run test:integration`, `npm run test:api`, `npm run test:e2e`, `npm run test:security` (y corrida unificada `npm test`).
3. `npm audit --omit=dev --audit-level=high` (y `npm audit --audit-level=high`).
4. Prueba de humo de build (`npm run build` + `node dist/main.js` verificando cabeceras de seguridad en `GET /salud`).

## Open Questions

Por gobernanza **ALTO** (`CHANGES.md`), se requiere revisión y confirmación de la Líder sobre estos puntos antes de iniciar `/opsx:apply`:

1. **Q1 — Tratamiento de defectos previos fuera de zona (`F1`, `F6`, `F8`, `F9`) en `test/seguridad/cross-tenant.test.ts`**: actualmente `usuarios` (`C-06`) y `turnos`/`agenda`/`bloqueos` (`C-12`) no registran `pluginDeAutenticacion` (responden `401` incluso autenticados), y `auditoria`/`ausentismo`/`exportaciones` (`C-16`) responden `403` sin sesión en lugar de `401`. ¿Se aprueba mantener la política de `C-18` (marcarlos con `it.fails` en la suite cross-tenant y reportarlos como bloqueantes de lanzamiento en `checklist-ley-25326.md` sin editar módulos fuera de zona) o se autoriza algún ajuste puntual?
2. **Q2 — Política CORS por defecto (`CORS_ALLOWED_ORIGINS`)**: ¿se confirma política *default-deny* cuando `CORS_ALLOWED_ORIGINS` está vacía (acorde a un MVP API REST sin frontend propio) y rechazo en arranque (`ConfigError`) si se configura `*` o un origen sin esquema `http(s)://`?
3. **Q3 — Valores por defecto de límites transversales**: ¿se confirman `HTTP_BODY_LIMIT_BYTES=102400` (100 KiB) y `RATE_LIMIT_GLOBAL=120/min` (excluyendo `GET /salud`, y manteniendo `RATE_LIMIT_PUBLIC=30/min` en rutas públicas)?
4. **Q4 — Alcance de `npm audit` en CI**: ¿se configura la compuerta de CI con `npm audit --omit=dev --audit-level=high` (dependencias de producción) o `npm audit --audit-level=high` (incluyendo `devDependencies`)? *(Actualmente ambos devuelven `0` vulnerabilidades).*
5. **Q5 — Ajuste puntual en `src/infrastructure/logging/redactor.ts`**: ¿se aprueba extender `redactor.ts` para cubrir `internalkey`/`privatekey` (por `adminInternalKey`) y enmascarar teléfonos `+54...` y JWT sueltos (`eyJ...`) en mensajes de error/trazas?
6. **Q6 — Responsables en `docs/seguridad/checklist-ley-25326.md`**: dado que `PO-14` (registro ante la AAIP) y `PO-03` (validación legal de cláusulas contractuales modelo en `sa-east-1`) requieren acción externa al código, ¿se registran con responsables por rol funcional (`Líder técnico / Equipo de producto / Asesoría legal`) o con nombres concretos?

## Resoluciones del apply

Aprobadas por la Líder el `2026-11-25` (gobernanza tratada como Baja/Media para habilitar ejecución):

- **Q1**: Aprobado mantener el criterio de `C-18` sin editar módulos de `C-06`/`C-12`/`C-16` ni `test/e2e/permisos/matriz.ts`. En `test/seguridad/cross-tenant.test.ts`: usar `it.fails` únicamente donde el defecto impida ejecutar la aserción cross-tenant (`F1` en `usuarios` y `F6` en `turnos`/`agenda`/`bloqueos`, que devuelven `401` con sesión válida). En `C-16` (`auditoria`, `ausentismo`, `exportaciones`), las aserciones cross-tenant con administrador de clínica B corren como `it` normales en verde (`GET /api/v1/exportaciones/{id}` genera la exportación al vuelo bajo `withTenant(clinicaB)` sin tabla de exportaciones persistida, por lo que devuelve `200` con cero registros/PII de clínica A). Registrar `F1`, `F6`, `F8` y `F9` como bloqueantes obligatorios previos al despliegue (`C-20`) en `docs/seguridad/checklist-ley-25326.md`.
- **Q2**: Confirmado `CORS_ALLOWED_ORIGINS` *default-deny* (`[]`) cuando está vacía, coincidencia exacta contra orígenes normalizados cuando está poblada, `hideOptionsRoute: true` y fallo rápido al arrancar (`ConfigError` sin imprimir valores) ante `*`, esquemas distintos de `http:`/`https:`, credenciales embebidas o rutas/queries/hashes.
- **Q3**: Confirmados `HTTP_BODY_LIMIT_BYTES=102400` (`1024..1048576`, mapeado a `413 CUERPO_DEMASIADO_GRANDE`) y `RATE_LIMIT_GLOBAL=120/min` (caché LRU acotado, `GET /salud` excluido vía `config: { rateLimit: false }` y coexistencia con `RATE_LIMIT_PUBLIC=30/min` en `/api/v1/publico/*`).
- **Q4**: Confirmado `npm audit --omit=dev --audit-level=high` como compuerta bloqueante en `.github/workflows/ci.yml`.
- **Q5**: Aprobado extender `src/infrastructure/logging/redactor.ts` con `internalkey`/`privatekey` en `PALABRAS_DE_CREDENCIAL` y enmascaramiento de teléfonos argentinos (`+54...`) y JWT sueltos (`eyJ...`) en `limpiarTexto`, preservando en verde los casos de no sobre-enmascaramiento de `test/unit/log-redaction.test.ts`.
- **Q6**: Aprobado registrar responsables por rol funcional (`Líder técnico`, `Equipo de producto`, `Asesoría legal`, y `Agente A / Líder técnico` para bloqueantes técnicos previos a `C-20`).
