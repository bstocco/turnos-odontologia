# Hardening HTTP, Redacción de Logs y Postura de Base de Datos

> Documentación técnica de los controles transversales incorporados en `C-19` (`hardening-seguridad-y-privacidad`).

## 1. Controles HTTP transversales

Configurados en [app.ts](../../src/interfaces/http/app.ts) y [hardening.ts](../../src/interfaces/http/hardening.ts), alimentados desde [src/config/index.ts](../../src/config/index.ts):

- **Cabeceras de seguridad (`@fastify/helmet`)**:
  - `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
  - `Cross-Origin-Resource-Policy: same-origin`
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Strict-Transport-Security: max-age=15552000; includeSubDomains`
  - Sin `X-Powered-By` ni cabecera `Server`.
- **Política CORS restrictiva (`@fastify/cors`)**:
  - Variable `CORS_ALLOWED_ORIGINS`: vacía por defecto (**denegación por defecto** de todo origen cruzado).
  - Cuando se configuran orígenes, se validan al arrancar (`http:` o `https:` sin `*`, sin credenciales embebidas, sin path/query/hash) y se comparan por coincidencia exacta.
  - `hideOptionsRoute: true` para mantener intacto el contrato OpenAPI ([openapi.json](../api/openapi.json)).
- **Límite de tamaño de cuerpo (`bodyLimit`)**:
  - Variable `HTTP_BODY_LIMIT_BYTES` (entero en `[1024, 1048576]`, por defecto `102400` bytes / 100 KiB).
  - El excedente responde `413` con código `CUERPO_DEMASIADO_GRANDE`.
- **Límite de tasa global (`@fastify/rate-limit`)**:
  - Variable `RATE_LIMIT_GLOBAL` (formato `<n>/<s|min|h>`, por defecto `120/min`, caché LRU acotado a `10_000` entradas).
  - Responde `429` con código `DEMASIADOS_PEDIDOS` y cabecera `retry-after`.
  - `GET /salud` queda excluido (`config: { rateLimit: false }`) para chequeos de salud del PaaS.
  - Coexiste con `RATE_LIMIT_PUBLIC` (`30/min` por defecto) y los límites por email en `/api/v1/publico/*`.

## 2. Redacción de logs y secretos

Implementada en [redactor.ts](../../src/infrastructure/logging/redactor.ts) y [logger.ts](../../src/infrastructure/logging/logger.ts):

- Enmascara por nombre de campo (en cualquier profundidad): `dni`, `telefono`, `email`, `nombre`, `apellido`, `obraSocial` y credenciales (`password`, `contrasena`, `token`, `codigoVerificacion`, `authorization`, `cookie`, `secret`, `apikey`, `internalkey`, `privatekey`).
- Enmascara en texto libre (mensajes y trazas de error): credenciales en URLs, cabeceras `Bearer`, tokens JWT sueltos (`eyJ...`), teléfonos argentinos (`+54...`), correos electrónicos y DNIs de 7 u 8 dígitos.
- `describirConfig(config)` reemplaza todas las variables sensibles por `[REDACTADO]` y nunca registra valores de secretos en `ConfigError`.

## 3. Verificación de postura de PostgreSQL y guardas de seeds

- Función reutilizable [verificarPosturaSeguridadBd](../../src/infrastructure/db/verificar-seguridad-bd.ts): audita los catálogos reales (`pg_roles`, `pg_tables`, `pg_class`, `pg_policies`, `information_schema.role_table_grants`, `pg_proc`) verificando:
  1. Rol `app` sin `SUPERUSER`, `BYPASSRLS`, `CREATEDB` ni `CREATEROLE`.
  2. Cero tablas en `public` propiedad de `app`.
  3. Toda tabla en `public` con columna `clinica_id` tiene RLS habilitada, forzada (`FORCE ROW LEVEL SECURITY`) y política basada en `app.clinica_id`.
  4. `auditoria` otorga únicamente `SELECT` e `INSERT` a `app` (sin `UPDATE`, `DELETE` ni `TRUNCATE`).
  5. Toda función `SECURITY DEFINER` en `public` fija `search_path`, revoca `EXECUTE` de `PUBLIC` y lo otorga a `app`.
- Guardas anti-producción en seeds: `ALLOW_SEED=false` por defecto y `assertNoProduction()` obligatorio al inicio de `seeds/run.ts`, `seeds/demo-clinica.ts` y `seeds/primera-clinica.ts`.

## 4. Comandos de verificación

```bash
npm run test:security
npm audit --omit=dev --audit-level=high
```
