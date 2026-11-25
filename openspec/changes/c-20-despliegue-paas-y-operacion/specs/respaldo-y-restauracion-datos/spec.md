# Spec Delta — respaldo-y-restauracion-datos

## Purpose

Garantiza que la base de producción tenga copias de seguridad automáticas con retención definida y que la restauración esté probada sobre datos sintéticos, preservando el aislamiento entre clínicas y la inmutabilidad de la auditoría.

## ADDED Requirements

### Requirement: Copias de seguridad automáticas
La base de datos de producción SHALL tener copias de seguridad automáticas con recuperación a un punto en el tiempo, activas desde el primer despliegue con datos reales. El equipo MUST conocer y documentar la ventana de recuperación efectiva del plan contratado.

#### Scenario: Backups activos antes de operar con datos reales
- **WHEN** se prepara el primer alta de una clínica real en producción
- **THEN** las copias automáticas figuran activas y la ventana de recuperación está registrada en `docs/operacion/`

#### Scenario: Plan sin recuperación a un punto en el tiempo
- **WHEN** el plan de la base no ofrece recuperación a un punto en el tiempo ni copias automáticas
- **THEN** no se opera con datos reales hasta contratar un plan que las ofrezca

### Requirement: Política de retención de datos
La política de retención SHALL fijar por escrito cuánto se conservan los datos de una clínica dada de baja y cuánto las copias de seguridad, y SHALL estar validada por asesoría legal antes de operar con datos reales (`PO-10`).

#### Scenario: Política publicada
- **WHEN** se revisa `docs/operacion/`
- **THEN** existe la política con los plazos de retención en base activa y en copias, y el estado de su validación legal

#### Scenario: Baja de una clínica
- **WHEN** una clínica se da de baja
- **THEN** el runbook indica el plazo tras el cual sus datos se eliminan de la base activa y el plazo máximo en que desaparecen de las copias

### Requirement: Prueba de restauración sobre datos sintéticos
El equipo SHALL restaurar una copia de seguridad en un entorno separado con datos sintéticos y registrar la evidencia (fecha, procedimiento y resultado) antes de operar con datos reales. La prueba MUST NOT usar datos reales de pacientes.

#### Scenario: Restauración exitosa
- **WHEN** se restaura una copia de la base de `pruebas` en una base nueva
- **THEN** las migraciones registradas coinciden, las tablas de clínica conservan sus políticas de aislamiento y el rol `app` sigue sin `BYPASSRLS`

#### Scenario: Aislamiento tras restaurar
- **WHEN** se consultan datos de la clínica A con el contexto de la clínica B en la base restaurada
- **THEN** no se devuelve ninguna fila de la clínica A

#### Scenario: Auditoría append-only tras restaurar
- **WHEN** se intenta `UPDATE` o `DELETE` sobre `auditoria` con el rol `app` en la base restaurada
- **THEN** la base lo rechaza

### Requirement: Restauración sin exponer datos
Ningún procedimiento de respaldo o restauración SHALL escribir datos de pacientes en logs, tickets, repositorio ni canales de chat, y las copias exportadas fuera del PaaS MUST permanecer cifradas.

#### Scenario: Evidencia de la prueba
- **WHEN** se registra la evidencia de una restauración
- **THEN** contiene fechas, conteos y resultados de verificación, sin datos de pacientes
