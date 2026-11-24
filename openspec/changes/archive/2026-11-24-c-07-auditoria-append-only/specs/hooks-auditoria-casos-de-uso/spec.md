# Spec Delta

## Purpose

Provee hooks reutilizables de auditoría en la capa de aplicación para que los casos de uso registren cambios de estado, lecturas de fichas de pacientes y exportaciones de forma uniforme y *fail-closed*.

## ADDED Requirements

### Requirement: Hook de auditoría para cambios de estado
The system SHALL provide a reusable change-audit hook that executes a state-changing use case and, only if it succeeds, records an audit event with the configured `accion`, `entidad`, `entidadId`, `antes`, `despues`, and optional `ip` in fail-closed mode.

#### Scenario: Operación exitosa audita el cambio y devuelve el resultado
- **WHEN** el caso de uso envuelto finaliza con éxito produciendo `entidadId`, estado anterior y estado posterior
- **THEN** el hook invoca la auditoría con los datos configurados y retorna el resultado original del caso de uso

#### Scenario: Fallo del caso de uso no registra auditoría
- **WHEN** el caso de uso envuelto lanza un error
- **THEN** el hook no registra ningún evento de auditoría y propaga el error original

#### Scenario: Fallo de auditoría aborta el resultado de forma fail-closed
- **WHEN** el caso de uso finaliza pero el registro de auditoría falla
- **THEN** el hook propaga el error de auditoría para que la transacción asociada se revierta y el resultado no se considere confirmado

### Requirement: Hook de auditoría para lectura de ficha de paciente
The system SHALL provide a reusable patient-record-read hook that executes the lookup and, when a patient record is found, records an audit event with `accion` equal to `lectura_ficha`, `entidad` equal to `paciente`, `entidadId` equal to the patient identifier, and null `antes` and `despues` payloads in fail-closed mode.

#### Scenario: Lectura de paciente existente audita lectura_ficha sin datos de la ficha
- **WHEN** el hook consulta un paciente por identificador y obtiene una ficha existente
- **THEN** registra un evento de auditoría con `accion = 'lectura_ficha'`, `entidad = 'paciente'`, `entidadId` del paciente y `antes`/`despues` nulos
- **AND** retorna la ficha obtenida al llamador

#### Scenario: Lectura de paciente inexistente no registra auditoría
- **WHEN** el hook consulta un identificador de paciente que no existe o pertenece a otra clínica y recibe `null` o `undefined`
- **THEN** no registra ningún evento de auditoría y devuelve el resultado ausente

#### Scenario: Fallo de auditoría impide entregar la ficha leída
- **WHEN** la consulta encuentra al paciente pero falla el registro en auditoría
- **THEN** el hook propaga el error de auditoría y no retorna la ficha del paciente

### Requirement: Hook de auditoría para exportaciones de datos
The system SHALL provide a reusable export-audit hook that executes the export operation and, on success, records an audit event with `accion` equal to `exportacion`, `entidad` equal to `exportacion`, optional `entidadId`, and safe metadata (such as format, included entities, and counts) in `datos_despues` in fail-closed mode.

#### Scenario: Exportación exitosa audita metadatos enmascarados y devuelve el resultado
- **WHEN** el caso de uso de exportación finaliza con éxito generando un artefacto con metadatos de formato, entidades y conteos
- **THEN** el hook registra la auditoría con `accion = 'exportacion'`, `entidad = 'exportacion'` y metadatos saneados sin datos personales de pacientes
- **AND** retorna el resultado original de la exportación

#### Scenario: Fallo en la exportación no registra auditoría
- **WHEN** la operación de exportación lanza un error
- **THEN** el hook no registra auditoría y propaga el error original

#### Scenario: Fallo de auditoría impide entregar la exportación
- **WHEN** la exportación se genera pero falla el registro de auditoría
- **THEN** el hook propaga el error de auditoría y no entrega la exportación al llamador
