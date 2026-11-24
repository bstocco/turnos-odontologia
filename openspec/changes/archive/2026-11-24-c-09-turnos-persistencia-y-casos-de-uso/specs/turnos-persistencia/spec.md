# Spec Delta

## Purpose

Persistencia de los turnos del modelo y de los casos de uso de agenda, sin HTTP.

## ADDED Requirements

### Requirement: Migración C09_001
The system SHALL create migration `C09_001` with the `turno` table (`clinica_id`, `paciente_id`, `profesional_id`, `sillon_id`, `prestacion_id`, `inicio`, `fin`, `buffer_minutos`, `estado`, `origen`, `reprogramado_de`, `duracion_real_minutos`), `rango_profesional` and `rango_sillon` generated columns, and `fin_sillon` as a common column; and SHALL validate the coherence of `fin`, `buffer_minutos` and `fin_sillon` with a `CHECK`.

#### Scenario: Exclusion constraints
- **WHEN** `C09_001` is applied
- **THEN** the table has `EXCLUDE USING gist` constraints over `clinica_id + profesional_id + rango_profesional` and `clinica_id + sillon_id + rango_sillon` (WHERE `estado NOT IN ('cancelado','reprogramado')`)

### Requirement: Repositorio y AgendaReader de turnos
The system SHALL have a repository and `AgendaReader` (occupation queries) implementing the C-02 ports, executed within `withTenant`.

#### Scenario: Occupancy queries
- **WHEN** `AgendaReader` runs a query for a clinic
- **THEN** only the rows of that clinic are returned

### Requirement: Casos de uso de agenda
The system SHALL provide the use cases `agendarTurno`, `reprogramarTurno` (one transaction, RN-TU-02), `cancelarTurno`, `confirmarTurno`, `marcarAtendido` and `marcarAusente`, translated into domain errors.

#### Scenario: Overlap translated
- **WHEN** a use case fails with `23P01` (exclusion violation)
- **THEN** the error is `TURNO_SOLAPADO_PROFESIONAL` or `TURNO_SOLAPADO_SILLON` (409)

#### Scenario: Concurrent reservation
- **WHEN** a concurrent reservation takes the same slot
- **THEN** one wins; the other receives the conflict error

### Requirement: Asignación automática de sillón libre
The system SHALL automatically assign a free clinic chair with retries before concurrency conflicts.

#### Scenario: Free chair
- **WHEN** a turn is booked and a free chair matches
- **THEN** the chair is assigned to the turn

### Requirement: Puerto TurnoEventPublisher
The system SHALL provide a `TurnoEventPublisher` port with domain events (creado, confirmado, cancelado, reprogramado) implemented as a null implementation by default, consumed by C-14.

#### Scenario: Events published
- **WHEN** a turn changes state
- **THEN** the publisher is invoked with the corresponding domain event
