# Proposal

## Why

El change `C-19` (`hardening-seguridad-y-privacidad`, gobernanza **ALTO**) es el último umbral de seguridad y privacidad previo al despliegue en producción (`C-20`). Aunque la base técnica ya cuenta con aislamiento RLS, redacción de logs y límite de tasa en rutas públicas, la inspección del código actual muestra brechas concretas que deben cerrarse antes del lanzamiento:

1. `src/interfaces/http/app.ts` aún no registra cabeceras de seguridad (`@fastify/helmet`), política CORS restrictiva (`@fastify/cors`), límite explícito de tamaño de cuerpo (`bodyLimit`) ni límite de tasa global (`@fastify/rate-limit`), pese a que esos paquetes ya están instalados en `package.json`.
2. `src/infrastructure/logging/redactor.ts` no enmascara `adminInternalKey` (`internalkey`) ni teléfonos argentinos (`+54...`) o JWT sueltos (`eyJ...`) presentes en mensajes de error o trazas.
3. Las pruebas cross-tenant existentes en `C-18` (`test/e2e/permisos/matriz.test.ts`) cubren únicamente operaciones marcadas con `conId: true` y no verifican colecciones (`GET`), inyección de IDs ajenos en cuerpos o parámetros de consulta, `GET /exportaciones/{id}` ni intentos cross-tenant en rutas públicas o de autenticación.
4. Las verificaciones de postura en PostgreSQL (`test/integration/platform/aisolamiento.test.ts`) no auditan sistemáticamente que el rol `app` carezca de propiedad sobre tablas en `public`, que todas las tablas con `clinica_id` tengan RLS habilitada y forzada, que `auditoria` carezca de privilegios mutantes y que todas las funciones `SECURITY DEFINER` fijen `search_path` y revoquen `EXECUTE` a `PUBLIC`.
5. La canalización de CI (`.github/workflows/ci.yml`) no ejecuta aún auditoría automática de vulnerabilidades de dependencias (`npm audit`) ni una suite dedicada de seguridad (`test:security`), y falta formalizar en `docs/seguridad/` el checklist de cumplimiento de la Ley 25.326 (`PO-03`, `PO-14`, `PO-10`, `R-03`) con estados, responsables y evidencia.

## What Changes

- **Hardening HTTP transversal (`src/interfaces/http/app.ts`, `src/config/`)**:
  - Registrar `@fastify/helmet` con política restrictiva para API REST (CSP `default-src 'none'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-origin`, `Cross-Origin-Opener-Policy: same-origin`, HSTS y sin `x-powered-by`/`server`).
  - Registrar `@fastify/cors` con política *default-deny* por defecto y lista blanca exacta vía `CORS_ALLOWED_ORIGINS` (rechazando `*` en el arranque y ocultando rutas `OPTIONS` de OpenAPI con `hideOptionsRoute: true`).
  - Configurar `bodyLimit` explícito vía `HTTP_BODY_LIMIT_BYTES` (por defecto `102400` bytes / 100 KiB), reutilizando la traducción a `413 CUERPO_DEMASIADO_GRANDE`.
  - Registrar `@fastify/rate-limit` global por IP vía `RATE_LIMIT_GLOBAL` (por defecto `120/min`, almacén LRU acotado), excluyendo `GET /salud` (`rateLimit: false`) y coexistiendo con los límites más estrictos de `/api/v1/publico/*` (`RATE_LIMIT_PUBLIC=30/min`).
- **Configuración de entorno (`src/config/variables.ts`, `src/config/index.ts`, `.env.example`)**:
  - Incorporar y validar las 3 variables no sensibles `CORS_ALLOWED_ORIGINS`, `HTTP_BODY_LIMIT_BYTES` y `RATE_LIMIT_GLOBAL`, sincronizadas con `.env.example`.
- **Refuerzo de redacción de logs (`src/infrastructure/logging/redactor.ts`)**:
  - Incluir `internalkey` y `privatekey` en `PALABRAS_DE_CREDENCIAL` para cubrir `adminInternalKey` y claves privadas.
  - Ampliar `limpiarTexto` para enmascarar teléfonos en formato internacional argentino (`+54...`) y JWT sueltos (`eyJ...`) en mensajes de error y trazas, sin falsos positivos sobre identificadores o números cortos.
- **Suite automatizada de seguridad y privacidad (`test/seguridad/**`, `vitest.config.ts`, `package.json`, `src/infrastructure/db/verificar-seguridad-bd.ts`)**:
  - Agregar el proyecto Vitest `security` (`npm run test:security`, `groupOrder: 2` secuencial tras `integration` y `e2e`) con cobertura sobre:
    - Prueba cross-tenant completa derivada del contrato `app.swagger()` (verificación de completitud, `404` en recursos por ID, 0 fugas en listados/colecciones, rechazo de referencias cruzadas en cuerpo/query, aislamiento en auth y rutas públicas, y seguimiento explícito mediante `it.fails` de los defectos previos fuera de zona `F1`/`F6`/`F9`).
    - Verificación end-to-end de ausencia de PII de pacientes y secretos en logs JSON de Pino y en `describirConfig` ante flujos reales (altas, lecturas, errores, login/refresh, OTP/reserva pública, exportación).
    - Verificador reutilizable de postura de PostgreSQL (`rolsuper = false`, `rolbypassrls = false`, `rolcreatedb = false`, `rolcreaterole = false`, 0 tablas propiedad de `app`, RLS habilitada y forzada con política en toda tabla con `clinica_id`, `auditoria` sin `UPDATE`/`DELETE`/`TRUNCATE` para `app`, funciones `SECURITY DEFINER` endurecidas) y verificación de `ALLOW_SEED=false` + guardas `assertNoProduction()` en todos los puntos de entrada de `seeds/`.
    - Pruebas dedicadas de cabeceras de seguridad, CORS restrictivo, `413` por `bodyLimit` y `429` del límite global con exclusión de `/salud`.
- **Integración continua (`.github/workflows/ci.yml`)**:
  - Incorporar auditoría de dependencias (`npm audit`) y ejecución de `npm run test:security` como compuertas obligatorias de CI.
- **Documentación de cumplimiento y hardening (`docs/seguridad/`)**:
  - Crear `docs/seguridad/checklist-ley-25326.md` con estado, responsables, evidencia técnica, cláusulas contractuales modelo por región `sa-east-1` (`PO-03`), registro ante la AAIP (`PO-14`), retención (`PO-10`), mitigación de riesgo multi-tenant (`R-03`) y bloqueantes de lanzamiento (`F1`/`F6`/`F9`).
  - Crear `docs/seguridad/hardening-http-y-bd.md` documentando cabeceras, CORS, límites de cuerpo/tasa, verificación de postura PostgreSQL y guardas de seeds.

## Capabilities

### New Capabilities
- `hardening-http`: Cabeceras de seguridad HTTP, política CORS restrictiva sin comodín, límite explícito de tamaño de cuerpo y límite de tasa global con exclusión del chequeo de salud.
- `verificacion-seguridad-y-privacidad`: Suite automatizada de aislamiento cross-tenant sobre todos los endpoints registrados, verificación end-to-end de ausencia de PII/secretos en logs, auditoría de postura PostgreSQL/RLS y guardas `ALLOW_SEED`/`assertNoProduction()`, y checklist formal de cumplimiento Ley 25.326.

### Modified Capabilities
- `log-redaction`: Ampliar la redacción de credenciales a `internalkey`/`privatekey` y el saneamiento de texto libre a teléfonos argentinos (`+54...`) y JWT sueltos (`eyJ...`).
- `runtime-configuration`: Incorporar, validar y documentar en `.env.example` las variables `CORS_ALLOWED_ORIGINS`, `HTTP_BODY_LIMIT_BYTES` y `RATE_LIMIT_GLOBAL`.
- `quality-gates`: Incorporar la ejecución obligatoria de `npm run test:security` y la auditoría de vulnerabilidades de dependencias (`npm audit`) en la integración continua.

## Impact

- **Código de aplicación e infraestructura**: `src/interfaces/http/app.ts`, `src/config/variables.ts`, `src/config/index.ts`, `src/infrastructure/logging/redactor.ts`, `src/infrastructure/db/verificar-seguridad-bd.ts` (nuevo).
- **Configuración y tooling**: `.env.example`, `vitest.config.ts`, `package.json` (solo script `test:security`; sin cambios en `dependencies` ni `devDependencies`), `.github/workflows/ci.yml`.
- **Pruebas y documentación**: `test/seguridad/**` (nuevo), `test/unit/config.test.ts`, `test/unit/log-redaction.test.ts`, `docs/seguridad/checklist-ley-25326.md`, `docs/seguridad/hardening-http-y-bd.md`.
- **Sin impacto en**: esquema SQL / migraciones, contratos congelados (`RequestContext`, puertos de dominio, `TurnoEventPublisher`), ni `CHANGES.md`.
