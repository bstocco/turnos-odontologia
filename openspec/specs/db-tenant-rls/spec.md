# db-tenant-rls Specification

## Purpose

El aislamiento entre clínicas se garantiza a nivel de base de datos con Row-Level Security forzada y el contexto de tenant se fija por transacción, para que ninguna clínica pueda leer ni escribir los datos de otra.

## Requirements

### Requirement: Aislamiento multi-tenant por Row-Level Security
The system SHALL enforce tenant isolation at the database level: every table with a `clinica_id` column SHALL have row-level security enabled and forced, so that queries without clinic context see no rows, and queries with the clinic context of clinic A see only the rows of clinic A.

#### Scenario: Reads and writes of clinic A
- **WHEN** the connection context is set to clinic A
- **THEN** queries return only the rows whose clinic identifier is clinic A, and inserts with clinic B's identifier are rejected with error 42501 (violación de política)

#### Scenario: No clinic context
- **WHEN** a query runs against a table with forced row-level security and no clinic context is set
- **THEN** no rows are visible (fail-closed)

#### Scenario: Owner without context
- **WHEN** the table owner queries a table with `FORCE ROW LEVEL SECURITY` without clinic context
- **THEN** the owner sees no rows

### Requirement: Contexto de tenant fijado por transacción
The system SHALL set the clinic context per transaction: `withTenant(clinicaId, fn)` SHALL set `app.clinica_id` with `SET LOCAL` for the duration of the transaction, the context SHALL NOT apply outside that transaction.

#### Scenario: Context of a transaction
- **WHEN** `withTenant` runs a transaction for clinic A
- **THEN** every query inside the transaction sees only the rows of clinic A

#### Scenario: Context of a previous transaction
- **WHEN** a transaction with clinic context has ended and a query runs in a new transaction without context
- **THEN** the query sees no rows for tables with forced row-level security

### Requirement: Contrato compartido RequestContext
The system SHALL define the shared context contract `RequestContext { clinicaId, actor: { tipo, id, rol } }` in `src/application/shared/`, carrying the clinic identifier and the actor identifier, type and role, shared by auth, audit and use cases.

#### Scenario: Delivery of the context
- **WHEN** a use case is invoked
- **THEN** it receives the clinic identifier and the actor's type, id and role through the shared context

### Requirement: Política de aislamiento
The system SHALL apply the row-level security policy `clinica_id = NULLIF(current_setting('app.clinica_id', true), '')::uuid`, so that access is allowed only when the clinic identifier of the row equals the clinic identifier of the connection context.

#### Scenario: Policy evaluation
- **WHEN** the context is set to clinic A and a query against an isolated table runs
- **THEN** only the rows of clinic A match the policy

### Requirement: Helper aplicar_rls
The system SHALL provide the SQL helper `aplicar_rls(tabla)` that enables and forces row-level security on the given table with the isolation policy described above.

#### Scenario: Applying RLS to a table
- **WHEN** `aplicar_rls('tabla')` is applied to a table with a `clinica_id` column
- **THEN** row-level security is enabled and forced on the table

### Requirement: Función resolver_clinica_por_slug
The system SHALL provide the `SECURITY DEFINER` function `resolver_clinica_por_slug(slug)` of minimum scope, for the public routes that query the clinic by slug. The function MUST return only the identifier of an **active** clinic whose slug matches exactly, MUST run with a fixed `search_path`, and `EXECUTE` on it MUST be revoked from `PUBLIC` and granted only to the application role.

#### Scenario: Resolving a clinic by slug
- **WHEN** the function is called with a clinic slug
- **THEN** it returns the clinic identifier, or nothing if no clinic matches

#### Scenario: Inactive clinic
- **WHEN** the function is called with the slug of an inactive clinic
- **THEN** it returns nothing, exactly as for a nonexistent slug

#### Scenario: Only the identifier
- **WHEN** the application role calls the function
- **THEN** the result has a single `uuid` value and no other clinic column

#### Scenario: Restricted execution
- **WHEN** the function's privileges are inspected in the catalog
- **THEN** `PUBLIC` holds no `EXECUTE` privilege and the application role does

### Requirement: Arnés de pruebas de aislamiento
The project SHALL include the integration test harness (`test/support/aislamiento.ts`) with two synthetic clinics that verifies that clinic A neither reads nor writes rows of clinic B.

#### Scenario: Isolation harness
- **WHEN** the harness runs the isolation tests
- **THEN** clinic A sees no rows of clinic B and cannot insert a row of clinic B

### Requirement: Rol de la aplicación sin BYPASSRLS
The application role SHALL NOT be a superuser, SHALL NOT have `BYPASSRLS`, and SHALL NOT own tables with row-level security.

#### Scenario: App privileges
- **WHEN** the application role queries an isolated table with clinic context set
- **THEN** it only sees rows of that clinic (the policy is not bypassed)
