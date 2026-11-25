# Spec Delta

## Purpose

Agrega la referencia de `usuario.profesional_id` a `profesional`, pendiente desde C-05 (las claves cruzadas se agregan en el change que depende de ambas tablas: C-05 y C-06).

## ADDED Requirements

### Requirement: Usuario vinculado a un profesional de su clínica
`usuario.profesional_id`, cuando no es nulo, SHALL referenciar a un profesional existente de la misma clínica mediante una clave foránea compuesta `(clinica_id, profesional_id) → profesional (clinica_id, id)`. Un `profesional_id` nulo SHALL seguir permitido (administradores y recepcionistas sin profesional).

#### Scenario: Usuario con profesional de otra clínica
- **WHEN** con el contexto de la clínica A se inserta o actualiza un usuario cuyo `profesional_id` pertenece a la clínica B
- **THEN** la base rechaza la operación por clave foránea

#### Scenario: Usuario con profesional inexistente
- **WHEN** se asigna a un usuario un `profesional_id` que no existe
- **THEN** la base rechaza la operación por clave foránea

#### Scenario: Usuario sin profesional
- **WHEN** se inserta un usuario administrador con `profesional_id` nulo
- **THEN** la base lo acepta

#### Scenario: Usuario con profesional propio
- **WHEN** se vincula un usuario odontólogo a un profesional de su misma clínica
- **THEN** la base lo acepta
