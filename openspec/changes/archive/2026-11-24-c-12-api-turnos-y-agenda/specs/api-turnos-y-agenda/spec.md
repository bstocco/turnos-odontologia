# Spec Delta

## Purpose

API de turnos, agenda y bloqueos para el personal, con validación de esquemas, permisos por rol y auditoría.

## ADDED Requirements

### Requirement: Endpoints de turnos
The system SHALL provide `POST /turnos`, `GET /turnos/{id}` and `POST /turnos/{id}/{cancelar|reprogramar|confirmar|atendido|ausente}` for the personal users.

#### Scenario: Create turn
- **WHEN** a user sends `POST /turnos` with valid data
- **THEN** the API persists the turn (C-09) and responds `201`

#### Scenario: Get turn
- **WHEN** a user sends `GET /turnos/{id}`
- **THEN** the API returns the turn of the clinic; a turn of another clinic is `404`

#### Scenario: Change state
- **WHEN** a user sends `POST /turnos/{id}/{cancelar|reprogramar|confirmar|atendido|ausente}`
- **THEN** the API applies the transition (RN-TU) or responds `409`/`422`

### Requirement: Endpoint de agenda
The system SHALL provide `GET /agenda?desde&hasta&profesionalId&sillonId` returning the daily and weekly agenda with turns, blocks and holidays; the dentist sees only his own.

#### Scenario: Agenda of the professional
- **WHEN** the dentist asks `GET /agenda`
- **THEN** the response contains only turns of his professional id

### Requirement: Bloqueos con rechazo y lista de turnos en conflicto
The system SHALL provide `/bloqueos` (create and delete) with `409` rejection when the block overlaps active turns (RN-AG-08).

#### Scenario: Block with active turns
- **WHEN** a block is sent over active turns
- **THEN** the API responds `409` and includes the conflicting turns

### Requirement: Migración C12_001
The system SHALL create migration `C12_001` adding the foreign key `bloqueo.creado_por → usuario`.

#### Scenario: FK applied
- **WHEN** `C12_001` is applied
- **THEN** `bloqueo.creado_por` references `usuario.id`
