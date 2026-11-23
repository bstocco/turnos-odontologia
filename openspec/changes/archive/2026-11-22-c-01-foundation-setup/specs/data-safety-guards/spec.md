# Spec Delta

## Purpose

Impide que datos de prueba se carguen en una base de producción y obliga a habilitar los seeds de forma explícita, protegiendo los datos reales de pacientes y cumpliendo RN-DA-01 y RN-DA-02.

## ADDED Requirements

### Requirement: Seeds deshabilitados por defecto
Los scripts de seed SHALL ejecutarse solo cuando la configuración habilita los seeds de forma explícita. Sin esa habilitación SHALL terminar sin tocar la base e informar el motivo.

#### Scenario: Habilitación ausente
- **WHEN** se ejecuta un seed sin habilitarlo explícitamente
- **THEN** el script termina sin conectarse a la base de datos y explica que los seeds están deshabilitados

### Requirement: Negativa a ejecutar contra producción
Un seed SHALL negarse a ejecutarse cuando el entorno es de producción o cuando el host de la base no pertenece a la lista de hosts permitidos, aunque los seeds estén habilitados. Por defecto la lista contiene solo los hosts locales.

#### Scenario: Entorno de producción
- **WHEN** el entorno es de producción y los seeds están habilitados
- **THEN** el script se niega a ejecutar y no modifica la base

#### Scenario: Host fuera de la lista permitida
- **WHEN** los seeds están habilitados y el host de la base no está en la lista permitida
- **THEN** el script se niega a ejecutar y no modifica la base

#### Scenario: Entorno local
- **WHEN** los seeds están habilitados y la base está en un host local permitido
- **THEN** el script puede ejecutarse

### Requirement: Mensajes de rechazo sin credenciales
Los mensajes de la negativa SHALL indicar el motivo sin incluir la cadena de conexión completa, usuario ni contraseña.

#### Scenario: Rechazo por host
- **WHEN** un seed se niega a ejecutar por el host
- **THEN** el mensaje nombra el host rechazado y no contiene usuario ni contraseña
