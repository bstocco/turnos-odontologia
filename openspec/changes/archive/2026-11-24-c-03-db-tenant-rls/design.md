# Design

## Context

Punto de partida (ver `specs/db-tenant-rls/spec.md` para el contrato):

- C-01 (`c-01-foundation-setup`) ya fusionado: entorno PostgreSQL real (CI con imagen `postgres:17`, embebido local); los roles `app` y `migra` creados por `docker/postgres/init/01-roles.sql`. En `migrations/` ya existe `C03_001_tenant_rls.sql` con los objetos base del change (extensión `btree_gist`, tablas `clinica`/`clinica_config`, helper `aplicar_rls` y política validada); este change revisa y aplica esa configuración verificada.
- KB: DD-01 (aislamiento: una base, `clinica_id` y RLS forzada), `04_modelo_de_datos.md` §clinica/§clinica_config y RN-MT, `08_arquitectura_propuesta.md` §Seguridad, `09_decisiones_y_supuestos.md`.
- Informe de validación de PostgreSQL (`docs/plataforma/informe-validacion-postgres.md`): spikes R-05 (role sin `BYPASSRLS`, falla cerrada sin contexto, rol sin ser propietario) y R-04 (hallazgos que afectan a otros changes).
- Restricciones del proyecto: dos roles existentes (`app`: sin superusuario, sin `BYPASSRLS`, sin propiedad de tablas; `migra`: de migraciones), SQL explícito, migraciones versionadas `C{NN}_{seq}_{nombre}.sql` (regla 6), zona del change: `src/infrastructure/db/{pool,tenant}/**`, `src/application/shared/**`, `migrations/C03_*`, `test/support/**`.

## Goals

- Cumplir los escenarios de `specs/db-tenant-rls/spec.md`: RLS forzada sobre tablas con `clinica_id`; falla cerrada sin contexto; aislamiento de escritura (42501); contexto por transacción (`SET LOCAL`); contrato `RequestContext` compartido; política validada; helper `aplicar_rls`; función `resolver_clinica_por_slug`; arnés de aislamiento.
- El aislamiento debe quedar garantizado por la base, no solo por el código (DD-01).

## Non-Goals

- No implementar auth personal (JWT) ni rutas públicas: fuera del alcance del change; el punto de entrada a las rutas es `resolver_clinica_por_slug`.
- No modificar contratos congelados (regla 14): `RequestContext`, los puertos de dominio y `TurnoEventPublisher` no cambian.
- No editar migration ya fusionada (regla 6) ni cambiar una clínica existente (DD-11).
- No mockear PostgreSQL en pruebas de aislamiento (regla 8); el arnés usa base real.
- No desplegar a PaaS gestionado sin la aprobación del líder (informe; PO-03).
- No aplicar RLS a tablas sin `clinica_id` (modelo de datos: `clinica` es el directorio de clínicas, consultado por slug).

## Decisions

1. **Política de aislamiento**: `clinica_id = NULLIF(current_setting('app.clinica_id', true), '')::uuid`.
   - Validado por el informe de 2026-11-22 ("Hallazgos que afectan a otros changes", finding 1): con `missing_ok = true` + `NULLIF`, una consulta sin contexto devuelve 0 filas; sin `NULLIF`, una conexión que ya ejecutó un `SET LOCAL` queda con el parámetro vacío y la conversión a `uuid` falla.
   - Alternativa descartada: la forma sin `missing_ok` (`current_setting('app.clinica_id')::uuid`): una consulta sin contexto falla con error en vez de devolver cero filas.
2. **Contexto fijado por transacción**: `withTenant(clinicaId, fn)` en `src/infrastructure/db/tenant/` ejecuta `SELECT set_config('app.clinica_id', $1, true)` y luego `fn()`; efecto termina con la transacción (equivale a `SET LOCAL`). El pool entrega clientes sin contexto de clínica.
3. **Helper SQL `aplicar_rls(tabla)`** (plpgsql, definido en C03_001): `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` y `CREATE POLICY ... USING (<política validada>)`. Idempotente. Reutilizable por las migraciones de C-05+ (regla 6); C03_001 lo aplica a `clinica_config`.
4. **`resolver_clinica_por_slug(slug)`**: `SECURITY DEFINER`, alcance mínimo (SELECT sobre `clinica`), devuelve el `id` de la clínica o NULL; definida en C03_001 para rutas públicas.
5. **Contrato compartido `RequestContext`**: `{ clinicaId: uuid; actor: { tipo, id, rol } }` en `src/application/shared/`. `tipo`/`id` corresponden a `actor_tipo`/`actor_id` de `auditoria`; `rol` según el modelo de autenticación (`03_actores_y_roles.md`).
6. **Migración `C03_001_tenant_rls.sql`**: extensión `btree_gist`; tablas `clinica` (`id`, `nombre`, `slug` único global, `zona_horaria` IANA default `America/Argentina/Buenos_Aires`, `activa`, `creada_en`) y `clinica_config` (`clinica_id` PK y FK, `reserva_requiere_confirmacion`, `cancelacion_anticipacion_horas` default 24, `granularidad_minutos` default 15) — columnas según `04_modelo_de_datos.md`; `GRANT USAGE ON SCHEMA public` y `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE clinica, clinica_config TO app`; propietario `migra`; `aplicar_rls('clinica_config')`.
7. **Arnés de pruebas**: `test/support/aislamiento.ts` con dos clínicas sintéticas; fija el contexto con `withTenant` y verifica que la clínica A no lee ni escribe filas de la clínica B.

## Risks / Trade-offs

- **FORCE RLS también alcanza al propietario** (informe, finding 3): migraciones de datos que carguen o transformen tablas con RLS deben fijar `app.clinica_id`.
- **Falla cerrada por defecto**: código que consulta datos fuera de `withTenant` ve 0 filas en tablas con RLS — debe quedar fijado al contexto del change (comprobación en el arnés de aislamiento).
- **Dependencia de extensión `btree_gist`** (DD-02): innocuousa y necesaria por los constraints de exclusión futuros (C-09).
- **La tabla `clinica` queda sin RLS** (modelo de datos): es el directorio de clínicas — por diseño.
- **Dependencia de un PaaS gestionado**: `btree_gist` y los roles sin `BYPASSRLS` deben comprobarse en el entorno destino (informe, pending; bloqueado por aprobación del líder).

## Migration Plan

1. Validar `migrations/C03_001_tenant_rls.sql` contra los scenarios del spec.
2. Aplicar con el runner de C-01 (rol `migra`, conexión de migraciones).
3. Ejecutar el arnés de aislamiento y las pruebas de plataforma (verificación según el informe R-05).
4. Rollback: `ALTER TABLE clinica_config DISABLE ROW LEVEL SECURITY; DROP POLICY clinica_config_clinica_id; DROP FUNCTION resolver_clinica_por_slug; REVOKE ...; DROP TABLE clinica_config, clinica;`. La extensión `btree_gist` puede dejarse habilitada.
