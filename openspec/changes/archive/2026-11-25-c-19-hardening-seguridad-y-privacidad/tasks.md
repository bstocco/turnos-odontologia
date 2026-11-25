# Tasks

> **Nota de gobernanza (ALTO):** Las tareas de implementación inician únicamente tras la aprobación explícita de `Q1`–`Q6` (`design.md` §Open Questions) por la Líder, siguiendo Strict TDD (RED → GREEN → TRIANGULATE → REFACTOR).

## 1. Configuración transversal de hardening HTTP

- [x] 1.1 Agregar `CORS_ALLOWED_ORIGINS`, `HTTP_BODY_LIMIT_BYTES` y `RATE_LIMIT_GLOBAL` en `src/config/variables.ts`, validarlas en `src/config/index.ts` (rechazando `*`, esquemas distintos de `http(s)://`, paths/credenciales en orígenes CORS, enteros fuera de `1024..1048576` y formatos inválidos de tasa; incluyendo sus valores en `describirConfig`) y documentarlas en `.env.example`, verificando con pruebas nuevas en `test/unit/config.test.ts` que `npm run test:unit` pasa al 100%.

## 2. Refuerzo de redacción de logs

- [x] 2.1 Incorporar `internalkey` y `privatekey` en `PALABRAS_DE_CREDENCIAL` y agregar enmascaramiento de teléfonos argentinos (`+54...`) y JWT sueltos (`eyJ...`) en `limpiarTexto` de `src/infrastructure/logging/redactor.ts`, verificando con pruebas unitarias nuevas en `test/unit/log-redaction.test.ts` (incluyendo casos negativos para no sobre-enmascarar IDs ni números ajenos) que `npm run test:unit` pasa sin regresiones.

## 3. Hardening HTTP en `app.ts` y pruebas de cabeceras/CORS/límites

- [x] 3.1 Registrar `@fastify/helmet`, `@fastify/cors` (`hideOptionsRoute: true`, *default-deny* cuando `CORS_ALLOWED_ORIGINS` está vacía, coincidencia exacta de origen cuando está poblada), `bodyLimit: config.httpBodyLimitBytes` y `@fastify/rate-limit` global (`RATE_LIMIT_GLOBAL`, caché LRU acotado, `GET /salud` excluido vía `config: { rateLimit: false }`, traducción `429 DEMASIADOS_PEDIDOS` + `retry-after`) en `src/interfaces/http/app.ts`.
- [x] 3.2 Crear `test/seguridad/hardening-http.test.ts` verificando cabeceras de seguridad en `/salud`, `/api/v1/*` y errores `4xx`, rechazo CORS por defecto y por origen no autorizado, habilitación de origen en lista blanca, no alteración de `app.swagger()`, rechazo `413 CUERPO_DEMASIADO_GRANDE`, `429` global con exclusión de `/salud` y coexistencia con `RATE_LIMIT_PUBLIC`; confirmar además que `npm run test:api` (`test/api/salud.test.ts`) y la comparación OpenAPI de `C-18` siguen en verde.

## 4. Verificador de postura PostgreSQL y guardas de seeds

- [x] 4.1 Implementar `verificarPosturaSeguridadBd` en `src/infrastructure/db/verificar-seguridad-bd.ts` consultando los catálogos reales de PostgreSQL (`pg_roles`, `pg_tables`, `pg_class`, `pg_policies`, `information_schema.role_table_grants`, `pg_proc`) para validar privilegios del rol `app`, cero tablas propiedad de `app` en `public`, RLS habilitada/forzada/con política en toda tabla con `clinica_id`, privilegios append-only de `auditoria` y funciones `SECURITY DEFINER` con `search_path` fijo y sin `EXECUTE` para `PUBLIC`.
- [x] 4.2 Crear `test/seguridad/postura-bd-y-seeds.test.ts` ejecutando `verificarPosturaSeguridadBd` contra `turnos_test` (incluyendo escenario negativo controlado que detecte una tabla sin RLS forzada) y verificando que `ALLOW_SEED=false` por defecto en `.env.example` y `loadConfig`, y que `seeds/run.ts`, `seeds/demo-clinica.ts` y `seeds/primera-clinica.ts` aplican `assertNoProduction()` rechazando `NODE_ENV=production` y hosts externos antes de abrir conexiones.

## 5. Prueba cross-tenant completa sobre todos los endpoints

- [x] 5.1 Crear `test/seguridad/cross-tenant.test.ts` con un inventario completo derivado de `app.swagger()` y una aserción de completitud que falle ante cualquier endpoint sin cobertura; probar con credenciales de clínica B que todo recurso por ID (incluyendo `GET /api/v1/exportaciones/{id}`) responde `404`, que las colecciones devuelven cero datos de clínica A, que el envío de IDs ajenos en body/query se rechaza sin efectos en A, que las rutas públicas y de login están aisladas, y que `F1`/`F6`/`F9` quedan explícitamente trazados según lo resuelto en `Q1`.

## 6. Verificación end-to-end de ausencia de PII y secretos en logs

- [x] 6.1 Crear `test/seguridad/logs-sin-fugas.test.ts` ejecutando flujos reales sobre la API y PostgreSQL (login, alta y consulta de paciente, solicitud OTP, reserva pública, acción por token, exportación y errores 400/500) más `describirConfig`, verificando cero apariciones de PII sintética (DNI, teléfono, email, nombre, apellido, obra social) y cero apariciones de secretos, contraseñas, tokens, claves internas o OTP en claro en los logs emitidos.

## 7. Integración en Vitest, npm scripts y CI

- [x] 7.1 Agregar el proyecto `security` en `vitest.config.ts` (`include: ['test/seguridad/**/*.test.ts']`, `groupOrder: 2`, `fileParallelism: false`), agregar `"test:security": "vitest run --project security"` en `package.json` (sin modificar dependencias) y actualizar `.github/workflows/ci.yml` para ejecutar la auditoría de dependencias (`npm audit` según `Q4`) y `npm run test:security` tras `npm run test:e2e`; verificar localmente `npm run test:security`.

## 8. Documentación de cumplimiento Ley 25.326 y hardening

- [x] 8.1 Crear `docs/seguridad/checklist-ley-25326.md` (con estado, responsables según `Q6`, evidencia técnica automatizada, cláusulas contractuales modelo por región `sa-east-1` de `PO-03`, registro ante la AAIP `PO-14`, retención `PO-10`, mitigación multi-tenant `R-03` y bloqueantes previos a producción `F1`/`F6`/`F8`/`F9`) y `docs/seguridad/hardening-http-y-bd.md`, verificando que toda ruta y comando citado coincide exactamente con el código implementado.

## 9. Verificación integral final

- [x] 9.1 Ejecutar en una pasada limpia sobre los cambios finales: `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test` (`unit`, `integration`, `api`, `e2e`, `security`), `npm audit --omit=dev --audit-level=high` (y el comando acordado en `Q4`) y la prueba de humo de `npm run build` + `GET /salud` verificando estado `200` y cabeceras de seguridad.

## Workflow follow-up

- Obtener aprobación explícita de la Líder sobre `Q1`–`Q6` antes de iniciar `/opsx:apply`.
- Al finalizar la implementación y verificación, sincronizar delta specs y archivar el change con `openspec-archive-change` tras autorización explícita del usuario.
