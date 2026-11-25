# Spec Delta

## Purpose

Define el almacenamiento multi-tenant aislado por clínica para el estado e historial de notificaciones y la instalación idempotente de las estructuras internas de la cola durable sobre PostgreSQL sin requerir privilegios DDL en tiempo de ejecución.

## ADDED Requirements

### Requirement: Tabla de notificaciones multi-tenant con RLS y restricciones de integridad
The database schema SHALL provide a `notificacion` table with `id`, `clinica_id` referencing `clinica`, nullable `turno_id` (without foreign key to `turno` while `C-09` is unmerged), `canal`, `tipo`, `estado`, `clave_idempotencia` unique per clinic, `intentos`, UTC `timestamptz` timestamps, and sanitized `error` without personal data, enforcing `aplicar_rls('notificacion')` and granting only `SELECT`, `INSERT`, and `UPDATE` (no `DELETE`) to the application role.

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

### Requirement: Instalación idempotente del esquema de cola por el rol de migraciones
The migration suite SHALL install the queue schema (`pgboss`) owned by the migration role, grant minimum runtime privileges (`USAGE` on schema, `SELECT, INSERT, UPDATE, DELETE` on queue tables, `USAGE, SELECT` on sequences, and `EXECUTE` on schema functions) to the application role, and remain idempotent when `public` migrations are re-run against a database where the queue schema already exists, so the application runtime never executes DDL.

#### Scenario: Instalación limpia del esquema de cola bajo el rol de migraciones
- **WHEN** se ejecutan todas las migraciones sobre una base limpia usando el rol de migraciones
- **THEN** el esquema `pgboss` queda creado en la versión esperada por el motor de cola, bajo propiedad del rol de migraciones y con los permisos necesarios otorgados al rol de la aplicación
- **AND** el rol de la aplicación puede iniciar el cliente de cola con migración automática deshabilitada, crear la cola configurada, encolar y procesar trabajos sin requerir permisos DDL

#### Scenario: Re-ejecución idempotente tras reiniciar únicamente el esquema público
- **WHEN** el esquema `public` se reinicia y se vuelven a aplicar las migraciones mientras el esquema `pgboss` ya existe en la base
- **THEN** la migración del esquema de cola finaliza sin error, sin destruir el esquema existente ni requerir intervención manual, y reafirma los privilegios del rol de la aplicación
