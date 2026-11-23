# Proposal

## Why

El change C-03 `db-tenant-rls` establece la base del modelo multi-tenant: el aislamiento entre clínicas a nivel de base con Row-Level Security (RN-MT-01, DD-01), el pool de PostgreSQL con contexto de tenant fijado por transacción y el contrato `RequestContext` compartido. Sin él, ninguna otra change puede reutilizar la arnés de pruebas de aislamiento ni la función `aplicar_rls`, y no existe un camino verificable para que el rol de la app no vea datos de otras clínicas. Es `CRITICO`, depende solo de C-01 y es el primer bloque del camino crítico: `C-01 → C-03 → C-05 → C-09 → C-13 → C-15 → C-18 → C-20`.

## What Changes

- Pool de PostgreSQL con `withTenant(clinicaId, fn)`: cada transacción fija `SET LOCAL app.clinica_id`, nunca una variable de conexión.
- `RequestContext { clinicaId, actor: { tipo, id, rol } }` en `src/application/shared/`: contrato compartido por auth, auditoría y casos de uso.
- Migración `C03_001`: extensión `btree_gist`; tablas `clinica` y `clinica_config`; privilegios del rol `app` sobre ellas. El rol `app` no será superusuario, no tendrá `BYPASSRLS` y no será propietario de las tablas.
- Helper SQL `aplicar_rls(tabla)`: `ENABLE` + `FORCE ROW LEVEL SECURITY` con una política por `clinica_id`.
- Función `SECURITY DEFINER` `resolver_clinica_por_slug(slug)` de alcance mínimo, para las rutas públicas que consultan la clínica por slug.
- Arnés de pruebas de integración multi-tenant (`test/support/aislamiento.ts`): dos clínicas sintéticas, la A no lee ni escribe datos de la B.
- Tests: sin contexto no se ve ninguna fila (falla cerrada), `SET LOCAL` no se filtra entre transacciones, el rol de la app no tiene `BYPASSRLS`.

## Capabilities

### New Capabilities

- `db-tenant-rls`: aislamiento multi-tenant del modelo de datos por Row-Level Security, el pool con contexto de tenant fijado por transacción y el contrato `RequestContext` compartido.

### Modified Capabilities

- (none)

## Impact

- Código: `src/infrastructure/db/{pool,tenant}/**`, `src/application/shared/**`, `migrations/C03_*`, `test/support/**`.
- Sistemas: PostgreSQL (RLS forzada, extensiones, roles, políticas de exclusión); bases de datos existentes aisladas por clínica (`clinica_id`).
