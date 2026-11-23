# Design

## Context

Punto de partida (ver `specs/db-tenant-rls/spec.md` para el contrato):

- C-01 (`c-01-foundation-setup`) ya fusionado: entorno PostgreSQL real (CI con imagen `postgres:17`, embebido local); los roles `app` y `migra` creados por `docker/postgres/init/01-roles.sql`. Los spikes R-04/R-05 del informe (`docs/plataforma/informe-validacion-postgres.md`) verificaron capacidades, pero no su aplicación.
- KB: DD-01 (aislamiento: una base, `clinica_id` y RLS forzada), DD-06 (prioridad: aislamiento de datos primero), `04_modelo_de_datos.md` §clinica/§clinica_config y §RN-MT, `08_arquitectura_propuesta.md` §Seguridad, `09_decisiones_y_supuestos.md`.
- Restricciones del proyecto: los dos roles existentes (`app`: sin superusuario, sin `BYPASSRLS`, sin propiedad de tablas; `migra`: de migraciones), SQL explícito, migraciones versionadas `C{NN}_{seq}_{nombre}.sql` (reglas de `database-migrations`), hexagonal sin lógica de negocio en rutas, zona del change: `src/infrastructure/db/{pool,tenant}/**`, `src/application/shared/**`, `migrations/C03_*`, `test/support/**`.

## Goals

- Cumplir los escenarios de `specs/db-tenant-rls/spec.md`: RLS forzada sobre tablas con `clinica_id`; falla cerrada sin contexto; aislamiento de escritura (42501); contexto por transacción (`SET LOCAL`); contrato `RequestContext` compartido; `C03_001` (extensión `btree_gist`, tablas `clinica` y `clinica_config`, privilegios de `app`); política validada; helper `aplicar_rls`; función `resolver_clinica_por_slug`; arnés de aislamiento.
- El aislamiento debe quedar garantizado por la base, no solo por el código (DD-01).

## Non-Goals

- No implementar auth personal (JWT) ni rutas públicas: fuera del alcance del change; el punto de entrada a las rutas es `resolver_clinica_por_slug`.
- No modificar contratos congelados (regla 14): `RequestContext`, los puertos de dominio y `TurnoEventPublisher` no cambian.
- No editar migration ya fusionada (regla 6) ni cambiar una clínica existente (DD-11).
- No desplegar a PaaS gestionado sin la aprobación del líder (informe; PO-03).
- No aplicar RLS a tablas sin `clinica_id` (modelo de datos: `clinica` es el directorio de clínicas, consultado por slug, sin RLS).
- Todo dato en ambientes de desarrollo, prueba y CI sin datos reales (RN-DA).

## Decisions

1. **Política de aislamiento**: `clinica_id = NULLIF(current_setting('app.clinica_id', true), '')::uuid`.
   - Justificación: informe de validación de PostgreSQL, "Hallazgos que afectan a otros changes": con `missing_ok = true` + `NULLIF` y sin contexto devuelve 0 filas (falla cerrada); sin `NULLIF`, una conexión que ya ejecutó un `SET LOCAL` queda con el parámetro vacío y la conversión a `uuid` falla.
   - Alternativa descartada: la forma `clinica_id = current_setting('app.clinica_id')::uuid` de la hoja de C-03: sin `missing_ok`, una consulta sin contexto falla con error en vez de devolver cero filas.
2. **Contexto fijado por transacción**: `withTenant(clinicaId, fn)` en `src/infrastructure/db/tenant/` ejecuta `SELECT set_config('app.clinica_id', $1, true)` y luego `fn()`; efecto termina con la transacción (equivale a `SET LOCAL`). El pool (`src/infrastructure/db/pool/`) entrega clientes sin contexto de clínica.
3. **Helper SQL `aplicar_rls(tabla)`** (plpgsql, definido en C03_001): `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` y `CREATE POLICY ... USING (<política validada>)`. Reutilizable por las migraciones de C-05+ (regla 6: "Cada migración aplica `aplicar_rls('tabla')`"); C03_001 lo aplica a `clinica_config`.
4. **`resolver_clinica_por_slug(slug)`**: `SECURITY DEFINER`, alcance mínimo (SELECT sobre `clinica`), devuelve el `id` de la clínica o NULL; definida en C03_001 para rutas públicas.
5. **Contrato compartido `RequestContext`**: `{ clinicaId: uuid; actor: { tipo, id, rol } }` en `src/application/shared/`. `tipo`/`id` corresponden a `actor_tipo`/`actor_id` de `auditoria`; `rol` según el modelo de autenticación (`03_actores_y_roles.md`).
6. **Migración `C03_001_tenant_rls.sql`**: `CREATE EXTENSION IF NOT EXISTS btree_gist`; `CREATE TABLE clinica` y `CREATE TABLE clinica_config` (columnas según `04_modelo_de_datos.md`); `GRANT USAGE ON SCHEMA public` y `GRANT SELECT, INSERT, UPDATE, DELETE` sobre las tablas a `app`. El propietario de las tablas es `migra`.
7. **Arnés de pruebas**: `test/support/aislamiento.ts` con dos clínicas sintéticas; fija el contexto con `withTenant` y verifica que la clínica A no lee ni escribe filas de la clínica B.

## Risks / Trade-offs

- **PaaS gestionado sin `btree_gist`** (PO-05, informe): verificar antes de despliegue.
- **FORCE RLS también alcanza al propietario**: migraciones de datos que carguen o transformen tablas con RLS deben fijar `app.clinica_id` (informe, finding 3).
- **Falla cerrada por defecto**: código que consulta datos fuera de `withTenant` ve 0 filas en tablas con RLS — debe quedar fijado al contexto del change (comprobación en el arnés de aislamiento).
- **Dependencia de SQL propio y extensión** (DD-02): aceptable; `btree_gist` es innocuous y necesaria por los constraints de exclusión futuros (C-09).
- **La tabla `clinica` queda sin RLS** (modelo de datos): es el directorio de clínicas — por diseño.

## Migration Plan

1. Escribir `migrations/C03_001_tenant_rls.sql`.
2. Aplicar con el runner de C-01 (rol `migra`, conexión de migraciones).
3. Ejecutar el arnés de aislamiento y las pruebas de plataforma (verificación según el informe R-05).
4. Rollback: `ALTER TABLE clinica_config DISABLE ROW LEVEL SECURITY; DROP POLICY ...; DROP FUNCTION resolver_clinica_por_slug; REVOKE ...; DROP TABLE clinica_config, clinica;`. La extensión `btree_gist` puede dejarse habilitada.
