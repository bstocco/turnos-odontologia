# Tasks

## 1. Base de datos: migration C03_001

- [x] 1.1 Validar/ajustar `migrations/C03_001_tenant_rls.sql`: extensión `btree_gist`; helper `aplicar_rls(tabla)` idempotente (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` y `CREATE POLICY ... USING (clinica_id = NULLIF(current_setting('app.clinica_id', true), '')::uuid)`); tablas `clinica` y `clinica_config`; `GRANT USAGE ON SCHEMA public` y `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE clinica, clinica_config TO app`; propietario `migra`; `aplicar_rls('clinica_config')`. Verificar: nombre respeta el patrón `C{NN}_{seq}_{nombre}.sql` (regla 6 del database-migrations).
- [x] 1.2 Aplicar C03_001 con el runner de C-01 (rol `migra`; `npm run db:migrate`). Verificar: extension `btree_gist` presente; tablas `clinica` y `clinica_config` existen; `pg_policies` muestra la política de aislamiento sobre `clinica_config`; el rol `app` no es propietario de las tablas. (Verificado en `turnos` con consultas a la base: `btree_gist` presente, tablas existentes, política `clinica_config_clinica_id` con la forma validada, propietario `migra`. El runner `npm run db:migrate` devuelve error previo en `turnos` porque figura `C06_001_auth_personal.sql` aplicada pero no existe en `migrations/` — desincronización previa, no del change.)

## 2. Contexto de tenant por transacción

- [x] 2.1 Implementar `withTenant(clinicaId, fn)` en `src/infrastructure/db/tenant/with-tenant.ts`: ejecuta `SELECT set_config('app.clinica_id', $1, true)` (efecto termina con la transacción, como `SET LOCAL`) y luego `fn`; el pool (`src/infrastructure/db/pool/`) entrega clientes sin contexto de clínica. Verificar: arnés de aislamiento (4.1) demuestra que consultas dentro de `withTenant` solo ven filas de la clínica indicada.

## 3. Contrato compartido RequestContext

- [x] 3.1 Definir `RequestContext { clinicaId, actor: { tipo, id, rol } }` en `src/application/shared/request-context.ts`. Verificar: el archivo existe y `npm run typecheck` pasa.

## 4. Arnés y pruebas de aislamiento

- [x] 4.1 Escribir el arnés `test/support/aislamiento.ts`: dos clínicas sintéticas (A, B); fija el contexto de la clínica A con `withTenant` y verifica que A no lee ni escribe filas de B. Verificar: el arnés se ejecuta y pasa.
- [x] 4.2 Ejecutar las pruebas de integración cubriendo los escenarios del spec `db-tenant-rls`: sin contexto → 0 filas (falla cerrada); rol `app` sin `BYPASSRLS`; clínica A no escribe una fila de la B (42501). Verificar: `npm run test:integration` en verde (verificación del informe R-05).

## 5. Integración final

- [x] 5.1 Re-ejecutar `openspec validate 2026-11-24-c-03-db-tenant-rls` y `openspec status --change 2026-11-24-c-03-db-tenant-rls --json`. Verificar: proposal, specs, design y tasks presentes; los artefactos del spec-driven validan. (Resultado: valid ✓; proposal/specs/design/tasks = done.)
