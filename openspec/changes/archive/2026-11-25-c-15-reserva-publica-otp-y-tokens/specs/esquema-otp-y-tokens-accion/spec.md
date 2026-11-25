# Spec Delta — esquema-otp-y-tokens-accion

## Purpose

Define el esquema multi-tenant en PostgreSQL para códigos OTP de verificación por email (`codigo_verificacion`), tokens firmados de un solo uso (`token_accion`) y la función `SECURITY DEFINER` de mínimo alcance `resolver_clinica_por_hash_token` que habilita resolver el tenant sin `BYPASSRLS`.

## ADDED Requirements

### Requirement: Tabla codigo_verificacion multi-tenant con RLS y solo hash
The system SHALL provide `codigo_verificacion` (`id`, `clinica_id`, `email`, `hash_codigo`, `vence_en`, `intentos`, `consumido_en`, `creado_en`) enforced by `aplicar_rls('codigo_verificacion')`, storing only 64-char lowercase hex SHA-256 hashes (`^[0-9a-f]{64}$`), enforcing `intentos >= 0`, indexed by `(clinica_id, email, creado_en DESC)`, and granting only `SELECT`, `INSERT`, and `UPDATE` to role `app`.

#### Scenario: Inserción válida de hash SHA-256 de código OTP
- **WHEN** se inserta una fila en `codigo_verificacion` dentro de `withTenant(clinicaA)` con un `hash_codigo` hexadecimal minúscula de 64 caracteres e `intentos = 0`
- **THEN** la fila se persiste correctamente asociada a `clinicaA`

#### Scenario: Rechazo de código en claro o hash mal formado
- **WHEN** se intenta insertar o actualizar `hash_codigo` con un código de 6 dígitos en claro o una cadena que no sea SHA-256 hexadecimal minúscula de 64 caracteres
- **THEN** PostgreSQL rechaza la operación por violación de `CHECK` (`23514`)

#### Scenario: Aislamiento RLS y restricción de privilegios para rol app
- **WHEN** el rol `app` consulta o intenta eliminar filas de `codigo_verificacion` bajo `withTenant(clinicaB)` existiendo registros de `clinicaA`
- **THEN** la consulta no devuelve ningún registro de `clinicaA`
- **AND** cualquier `DELETE` es rechazado por permisos insuficientes (`42501`)

### Requirement: Tabla token_accion multi-tenant con RLS, unicidad de hash y FK compuesta a turno
The system SHALL provide `token_accion` (`id`, `clinica_id`, `turno_id`, `proposito`, `hash_token`, `vence_en`, `usado_en`, `creado_en`) enforced by `aplicar_rls('token_accion')`, allowing `'confirmar' | 'cancelar'`, enforcing lowercase SHA-256 `hash_token` with global `UNIQUE (hash_token)`, composite FK `(clinica_id, turno_id) -> turno (clinica_id, id)`, index `(clinica_id, turno_id)`, and granting only `SELECT`, `INSERT`, `UPDATE` to `app`.

#### Scenario: Inserción válida y unicidad de hash_token
- **WHEN** se inserta en `token_accion` un token para un turno existente en la misma clínica y propósito `'confirmar'` o `'cancelar'`
- **THEN** el registro se persiste correctamente
- **AND** intentar insertar un segundo registro con el mismo `hash_token` falla por unicidad (`23505`)

#### Scenario: Rechazo de referencia a turno de otra clínica
- **WHEN** se intenta insertar en `token_accion` un registro con `clinica_id = clinicaA` y el `turno_id` de un turno perteneciente a `clinicaB`
- **THEN** PostgreSQL rechaza la operación por violación de clave foránea compuesta (`23503`)

#### Scenario: Aislamiento RLS entre clínicas en token_accion
- **WHEN** el rol `app` consulta o actualiza `token_accion` bajo `withTenant(clinicaB)` sobre tokens pertenecientes a `clinicaA`
- **THEN** no accede ni modifica ningún registro de `clinicaA`

### Requirement: Función resolver_clinica_por_hash_token de mínimo alcance
The system SHALL expose `resolver_clinica_por_hash_token(p_hash_token text) RETURNS uuid` as `SECURITY DEFINER` with `search_path = pg_catalog, public`, granted only to `app`, returning `clinica_id` only if `hash_token` exists and `clinica.activa = TRUE`, and `NULL` otherwise.

#### Scenario: Token de clínica activa resuelve su clinica_id
- **WHEN** el rol `app` ejecuta `resolver_clinica_por_hash_token` con el hash de un token perteneciente a una clínica con `activa = TRUE`
- **THEN** la función devuelve exclusivamente el `uuid` de esa clínica

#### Scenario: Token inexistente o de clínica inactiva devuelve NULL
- **WHEN** el rol `app` ejecuta `resolver_clinica_por_hash_token` con un hash inexistente o con el hash de un token cuya clínica tiene `activa = FALSE`
- **THEN** la función devuelve `NULL` en ambos casos de manera indistinguible
