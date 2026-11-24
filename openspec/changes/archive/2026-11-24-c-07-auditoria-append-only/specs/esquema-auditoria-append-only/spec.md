# Spec Delta

## Purpose

Define el esquema PostgreSQL inmutable y aislado por clínica para registrar eventos de auditoría de forma append-only, garantizando compatibilidad con los tres tipos de actor y con el aprovisionamiento de clínicas existente.

## ADDED Requirements

### Requirement: Tabla auditoria e índices de consulta
The system SHALL persist audit events in table `auditoria` with sequential identity `id`, mandatory `clinica_id` referencing `clinica`, `ocurrio_en` (`timestamptz` UTC defaulting to `now()`), `actor_tipo`, nullable `actor_id`, `accion`, `entidad`, nullable `uuid` `entidad_id`, `datos_antes` (`jsonb`), `datos_despues` (`jsonb`), and `ip` (`inet`), indexed by clinic, timestamp, entity, and actor.

#### Scenario: Inserción completa con identificador secuencial e instante UTC
- **WHEN** se inserta un registro de auditoría completo dentro del contexto de la clínica A
- **THEN** la base asigna un `id` secuencial creciente generado automáticamente y un instante `ocurrio_en` en UTC
- **AND** conserva los valores de `actor_tipo`, `actor_id`, `accion`, `entidad`, `entidad_id`, `datos_antes`, `datos_despues` e `ip`

#### Scenario: Inserción compatible con aprovisionamiento de clínica existente
- **WHEN** se ejecuta la sentencia literal de `C-17` `INSERT INTO auditoria (clinica_id, ocurrio_en, actor_tipo, accion, entidad, entidad_id) VALUES ($1, now(), 'sistema', 'creacion', 'clinica', $1)` con un UUID válido en `$1`
- **THEN** la base acepta la inserción sin requerir `actor_id`, `datos_antes`, `datos_despues` ni `ip`
- **AND** almacena ese UUID en `entidad_id`

### Requirement: Integridad de actores, acciones y entidades en la base
The system SHALL enforce check constraints on `auditoria` restricting `actor_tipo` to `usuario`, `paciente_enlace`, or `sistema`, requiring non-empty `actor_id` when `actor_tipo` is `usuario` or `paciente_enlace`, permitting nullable non-empty `actor_id` for `sistema`, and requiring non-empty snake_case identifiers for `accion` and `entidad` plus valid UUID syntax when `entidad_id` is provided.

#### Scenario: Aceptación de los tres tipos de actor válidos
- **WHEN** se insertan registros con `actor_tipo` igual a `usuario` (con `actor_id`), `paciente_enlace` (con `actor_id`) y `sistema` (con `actor_id` nulo o no vacío)
- **THEN** la base acepta las tres inserciones válidas

#### Scenario: Rechazo de tipo de actor inválido
- **WHEN** se intenta insertar un registro con un `actor_tipo` distinto de `usuario`, `paciente_enlace` o `sistema`
- **THEN** la base rechaza la inserción con violación de constraint `23514`

#### Scenario: Rechazo de actor de usuario o paciente sin identificador
- **WHEN** se intenta insertar un registro con `actor_tipo` igual a `usuario` o `paciente_enlace` y `actor_id` nulo o compuesto solo por espacios
- **THEN** la base rechaza la inserción con violación de constraint `23514`

#### Scenario: Rechazo de acción, entidad o identificador de entidad inválidos
- **WHEN** se intenta insertar una `accion` o `entidad` vacía o fuera del formato snake_case minúscula, o un `entidad_id` con formato distinto de UUID
- **THEN** la base rechaza la inserción con violación de constraint `23514` para `accion`/`entidad` o error `22P02` para `entidad_id` no-UUID

### Requirement: Inmutabilidad append-only en doble barrera
The system SHALL enforce append-only immutability on `auditoria` through a double barrier: granting only `SELECT` and `INSERT` privileges to the application role (with table ownership retained by the migration role) and attaching a statement-level trigger before `UPDATE`, `DELETE`, or `TRUNCATE` that raises an error.

#### Scenario: El rol de la aplicación no puede actualizar, borrar ni vaciar la tabla
- **WHEN** el rol de la aplicación intenta ejecutar `UPDATE`, `DELETE` o `TRUNCATE` sobre `auditoria`
- **THEN** PostgreSQL rechaza la operación por falta de privilegios (`42501`)
- **AND** todos los registros previos permanecen intactos

#### Scenario: El propietario tampoco puede actualizar ni borrar filas existentes o inexistentes
- **WHEN** el rol propietario de migraciones intenta ejecutar `UPDATE` o `DELETE` sobre `auditoria`, incluso cuando ninguna fila coincide con el filtro `WHERE`
- **THEN** el trigger de inmutabilidad aborta la sentencia con error (`P0001`)
- **AND** ningún registro existente es modificado ni eliminado

#### Scenario: El propietario tampoco puede vaciar la tabla
- **WHEN** el rol propietario de migraciones intenta ejecutar `TRUNCATE TABLE auditoria`
- **THEN** el trigger de inmutabilidad aborta la sentencia con error (`P0001`)
- **AND** los registros previos permanecen intactos

### Requirement: Aislamiento multi-tenant por Row-Level Security
The system SHALL enable and force Row-Level Security on `auditoria` using `aplicar_rls('auditoria')`, so each clinic only reads and inserts its own audit records and queries without clinic context fail closed.

#### Scenario: Aislamiento de lectura entre clínicas
- **WHEN** la clínica A y la clínica B insertan registros en `auditoria`
- **THEN** al consultar con el contexto de la clínica A se devuelven únicamente los registros de la clínica A, y con el contexto de la clínica B únicamente los de la clínica B

#### Scenario: Rechazo de escritura cruzada entre clínicas
- **WHEN** una transacción con contexto de la clínica A intenta insertar en `auditoria` un registro con `clinica_id` de la clínica B
- **THEN** PostgreSQL rechaza la inserción con error `42501` por violación de política RLS

#### Scenario: Falla cerrada sin contexto de clínica
- **WHEN** el rol de la aplicación o el propietario consulta o intenta insertar en `auditoria` sin fijar `app.clinica_id`
- **THEN** la consulta devuelve cero filas y la inserción es rechazada
