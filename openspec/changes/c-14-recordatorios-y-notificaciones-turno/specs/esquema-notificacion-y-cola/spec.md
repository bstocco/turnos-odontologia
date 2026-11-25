# Spec Delta — esquema-notificacion-y-cola

## MODIFIED Requirements

### Requirement: Tabla de notificaciones multi-tenant con RLS y restricciones de integridad
The database schema SHALL provide a `notificacion` table with `id`, `clinica_id` referencing `clinica`, nullable `turno_id` enforcing a composite foreign key `(clinica_id, turno_id)` referencing `turno (clinica_id, id)` (`MATCH SIMPLE` via `turno_clinica_id_id_key` so `turno_id` remains nullable when `tipo = 'codigo'`), `canal`, `tipo`, `estado`, `clave_idempotencia` unique per clinic, `intentos`, UTC `timestamptz` timestamps, and sanitized `error` without personal data, enforcing `aplicar_rls('notificacion')` and granting only `SELECT`, `INSERT`, and `UPDATE` (no `DELETE`) to the application role.

#### Scenario: Creación de tabla, índices operativos y privilegios mínimos para la aplicación
- **WHEN** se aplican las migraciones del proyecto con el rol de migraciones sobre un esquema limpio
- **THEN** existe la tabla `notificacion` propiedad del rol de migraciones, con sus índices por clínica/estado y clave de idempotencia y con RLS habilitada y forzada
- **AND** el rol de la aplicación posee únicamente permisos `SELECT`, `INSERT` y `UPDATE` sobre `notificacion`, sin `DELETE` ni `TRUNCATE`

#### Scenario: Aislamiento multi-tenant y falla cerrada sin contexto de clínica
- **WHEN** la clínica A y la clínica B registran notificaciones con sus respectivos contextos de tenant, o el rol de la aplicación consulta sin `app.clinica_id` definido
- **THEN** cada clínica lee y actualiza exclusivamente sus propias notificaciones
- **AND** una consulta sin contexto de clínica devuelve cero filas

#### Scenario: Rechazo ante inserción o actualización cruzada entre clínicas
- **WHEN** bajo contexto de la clínica A se intenta insertar o modificar una fila de `notificacion` con `clinica_id` perteneciente a la clínica B
- **THEN** PostgreSQL rechaza la operación por violación de la política RLS (`42501`)

#### Scenario: Rechazo de borrado directo desde el rol de la aplicación
- **WHEN** el rol de la aplicación ejecuta `DELETE` sobre `notificacion` dentro de un contexto de clínica válido
- **THEN** PostgreSQL rechaza la operación por falta de privilegios (`42501`)

#### Scenario: Unicidad de clave de idempotencia acotada por clínica
- **WHEN** se intenta insertar dos filas en `notificacion` con la misma `clave_idempotencia` dentro de la misma clínica, frente a usar esa misma clave en dos clínicas distintas
- **THEN** la segunda inserción en la misma clínica falla por violación de unicidad (`23505`)
- **AND** la inserción con igual `clave_idempotencia` en otra clínica se permite sin conflicto

#### Scenario: Coherencia entre tipo, turno_id y estado de envío
- **WHEN** se intenta insertar una fila en `notificacion` con `tipo = 'codigo'` y `turno_id` no nulo, con `estado = 'enviada'` y `enviada_en` nulo, o con `intentos < 0`
- **THEN** PostgreSQL rechaza la fila por violación de restricción `CHECK` (`23514`)

#### Scenario: Rechazo de turno_id inexistente o perteneciente a otra clínica
- **WHEN** bajo contexto de la clínica A se intenta insertar una fila en `notificacion` con `turno_id` inexistente o perteneciente a un turno de la clínica B
- **THEN** PostgreSQL rechaza la inserción por violación de la clave foránea compuesta `(clinica_id, turno_id)` (`23503`)

#### Scenario: Preservación de turno_id nulo para códigos de verificación
- **WHEN** se inserta una fila en `notificacion` con `tipo = 'codigo'` y `turno_id IS NULL`
- **THEN** la inserción es aceptada por `MATCH SIMPLE` de la clave foránea compuesta sin requerir una fila en `turno`
