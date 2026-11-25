# Spec Delta — respaldo-y-restauracion-datos

## Purpose

Garantiza que la capacidad de recuperación de cada plan de base de datos evaluado esté documentada, que exista una política de retención y que la evidencia de los procedimientos no exponga datos de pacientes. La prueba de restauración sobre datos sintéticos y la verificación de copias activas en producción quedan como trabajo posterior (ver `design.md`, "Trabajo posterior").

## ADDED Requirements

### Requirement: Copias de seguridad automáticas
El equipo SHALL documentar la ventana de recuperación efectiva y el tipo de copias de cada plan de base de datos evaluado, y MUST NOT operar con datos reales sobre un plan sin recuperación a un punto en el tiempo.

#### Scenario: Plan sin recuperación a un punto en el tiempo
- **WHEN** el plan de la base no ofrece recuperación a un punto en el tiempo ni copias automáticas
- **THEN** no se opera con datos reales hasta contratar un plan que las ofrezca

### Requirement: Política de retención de datos
La política de retención SHALL fijar por escrito cuánto se conservan los datos de una clínica dada de baja y cuánto las copias de seguridad, y SHALL estar validada por asesoría legal antes de operar con datos reales (`PO-10`).

#### Scenario: Política publicada
- **WHEN** se revisa `docs/operacion/`
- **THEN** existe la política con los plazos de retención en base activa y en copias, y el estado de su validación legal

### Requirement: Procedimientos sin exponer datos
Ningún procedimiento de respaldo, restauración o aprovisionamiento SHALL escribir datos de pacientes en logs, tickets, repositorio ni canales de chat, y las copias exportadas fuera del PaaS MUST permanecer cifradas.

#### Scenario: Evidencia registrada
- **WHEN** se registra evidencia de un procedimiento de respaldo, restauración o aprovisionamiento
- **THEN** contiene fechas, conteos y resultados de verificación, sin datos de pacientes
