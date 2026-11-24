# Spec Delta

## Purpose

Aprovisionamiento de clínicas nuevas por endpoint interno protegido por clave de servicio.

## ADDED Requirements

### Requirement: Endpoint interno de alta de clínicas
The system SHALL provide `POST /interno/clinicas` guarded by a service key (`ADMIN_INTERNAL_KEY`, constant-time comparison, disable-able by environment), and SHALL NOT require a clinic context (it is outside the clinic RBAC).

#### Scenario: Request without service key
- **WHEN** `POST /interno/clinicas` arrives without the service key
- **THEN** it returns 401

#### Scenario: Request with wrong service key
- **WHEN** the service key is incorrect
- **THEN** it returns 401

### Requirement: Creación de clínica, configuración y primer usuario
The system SHALL create the clinic, its default `clinica_config`, and the first administrator user with a temporary password.

#### Scenario: Creation of a new clinic
- **WHEN** the request carries the clinic data
- **THEN** the clinic, its `clinica_config` and the first administrator are created

### Requirement: Seed inicial equivalente
The system SHALL provide an initial-clinic seed script or equivalent, blocked in production unless an explicit flag is set.

#### Scenario: Seed in production
- **WHEN** the seed runs in production without the explicit flag
- **THEN** it is blocked

### Requirement: Slug único y validado
The system SHALL validate the clinic slug as unique and valid.

#### Scenario: Duplicated slug
- **WHEN** the slug already exists
- **THEN** the creation is rejected

### Requirement: Auditoría con actor sistema
The system SHALL audit the creation with actor `sistema`.

#### Scenario: Audit of the creation
- **WHEN** the clinic is created
- **THEN** an audit record with actor `sistema` is written
