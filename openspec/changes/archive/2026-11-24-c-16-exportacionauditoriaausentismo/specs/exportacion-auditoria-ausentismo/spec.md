# Spec Delta

## Purpose

Consulta de auditoría, exportación de datos de la clínica y registro de ausentismo, por el rol `administrador`.

## ADDED Requirements

### Requirement: Consulta de la auditoría
The system SHALL allow the role `administrador` to list audit records with filters by entity and actor and by date range (`desde`/`hasta`).

#### Scenario: Filtering by entity and actor
- **WHEN** `GET /auditoria` is called with `entidad` and `actor` query params
- **THEN** the response contains only records of that entity and actor, ordered by date

#### Scenario: Filtering by date range
- **WHEN** `GET /auditoria` is called with `desde` and `hasta` params
- **THEN** the response contains only records dated within the range

### Requirement: Exportación de datos de la clínica
The system SHALL let the `administrador` request an export of the data of its own clinic: patients, turns, professionals, chairs, services, and audit records, in an open format, and SHALL audit the export.

#### Scenario: Requesting an export
- **WHEN** `POST /exportaciones` is called
- **THEN** it returns 201 with the export id and the action is audited

#### Scenario: Downloading the export
- **WHEN** `GET /exportaciones/{id}` is called
- **THEN** it returns the file with the data of the own clinic only (RLS, C-03)

#### Scenario: No real personal data
- **WHEN** the export is generated
- **THEN** it does not contain real hashes of passwords (RN-DA-01)

### Requirement: Auditoría de la exportación
The system SHALL append an audit record of the export (actor, date, entity).

#### Scenario: Export audited
- **WHEN** an export is created
- **THEN** an audit record with entity `exportacion` is written (RN-AU-03)

### Requirement: Registro de ausentismo
The system SHALL let the `administrador` query the absentism record of the clinic, with counts by period, patient and professional.

#### Scenario: Consulting the absentism record
- **WHEN** `GET /ausentismo` is called
- **THEN** it returns the absent counts filtered by period, patient and/or professional

### Requirement: Permisos
The system SHALL deny these endpoints to any role other than `administrador`.

#### Scenario: Other roles
- **WHEN** any endpoint of `GET /auditoria`, `POST /exportaciones`, `GET /exportaciones/{id}` or `GET /ausentismo` is called without the `administrador` role
- **THEN** it returns 403
