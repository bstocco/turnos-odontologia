# Tasks

## 1. Base de datos: migration C03_001

- [x] 1.1 Escribir `migrations/C03_001_tenant_rls.sql`: `CREATE EXTENSION IF NOT EXISTS btree_gist`; definición del helper `aplicar_rls(tabla)` (plpgsql: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` y `CREATE POLICY ... USING (clinica_id = NULLIF(current_setting('app.clinica_id', true), '')::uuid)`); tabla `clinica` (`id`, `nombre`, `slug` único global, `zona_horaria` IANA con default `America/Argentina/Buenos_Aires`, `activa`, `creada_en`); tabla `clinica_config` (`clinica_id` PK y FK, `reserva_requiere_confirmacion`, `cancelacion_anticipacion_horas` default 24, `granularidad_minutos` default 15); `GRANT USAGE ON SCHEMA public` y `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE clinica, clinica_config TO app`; ejecutar `aplicar_rls('clinica_config')`. Verificar: el archivo existe y su nombre respeta el patrón `C{NN}_{seq}_{nombre}.sql` (regla 6 del database-migrations).
- [ ] 1.2 Aplicar C03_001 con el runner de C-01 (rol `migra`; `npm run db:migrate`). Verificar: extension `btree_gist` presente; tablas `clinica` y `clinica_config` existen; `pg_policies` muestra la política de aislamiento sobre `clinica_config`; el rol `app` no es propietario de las tablas.

## 2. Contexto de tenant por transacción

- [ ] 2.1 Implementar `withTenant(clinicaId, fn)` en `src/infrastructure/db/tenant/with-tenant.ts`: ejecuta `SELECT set_config('app.clinica_id', $1, true)` (efecto termina con la transacción, como `SET LOCAL`) y luego `fn`; el pool (`src/infrastructure/db/pool/`) entrega clientes sin contexto de clínica. Verificar: `npm run typecheck` pasa y el arnés de aislamiento (4.1) demuestra que consultas dentro de `withTenant` solo ven filas de la clínica indicada.

## 3. Contrato compartido RequestContext

- [ ] 3.1 Definir `RequestContext { clinicaId, actor: { tipo, id, rol } }` en `src/application/shared/request-context.ts` (`clinicaId` UUID; `tipo`: `'usuario' | 'paciente_enlace' | 'sistema'` según `auditoria`; `rol` según `03_actores_y_roles.md`). Verificar: el archivo existe y `npm run typecheck` pasa.

## 4. Arnés y pruebas de aislamiento

- [ ] 4.1 Escribir el arnés `test/support/aislamiento.ts`: dos clínicas sintéticas (A, B); fija el contexto de la clínica A con `withTenant` y verifica que A no lee ni escribe filas de B. Verificar: el arnés se ejecuta y pasa.
- [ ] 4.2 Ejecutar las pruebas de integración cubriendo los escenarios del spec `db-tenant-rls`: sin contexto → 0 filas (falla cerrada); el rol de la app no tiene `BYPASSRLS`; la clínica A no escribe una fila de la B (42501). Verificar: `npm run test:integration` en verde, incluyendo estos casos (verificación del informe R-05).

## 5. Integración final

- [ ] 5.1 Re-ejecutar `openspec status --change c-03-db-tenant-rls --json`. Verificar: proposal, specs, design y tasks en `done`; `applyRequires` (`[tasks]`) cerrado.
