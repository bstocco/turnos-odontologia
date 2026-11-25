# operacion-y-proteccion-de-datos Specification

## Purpose

Establece los logs sin datos de pacientes, el runbook operativo y las condiciones de protección de datos personales bajo la Ley 25.326 que deben cumplirse antes de operar con datos reales, incluida la transferencia internacional a Brasil. El monitoreo y las alertas externas, el alta de la primera clínica ejecutada y el retiro de una clínica quedan como trabajo posterior (ver `design.md`, "Trabajo posterior").

## Requirements

### Requirement: Logs sin datos de pacientes
Los logs del servicio SHALL contener solo identificadores y contadores, nunca DNI, teléfono, email ni obra social de pacientes.

#### Scenario: Error del servicio
- **WHEN** se produce un error del servicio
- **THEN** el log incluye el identificador del pedido y el código de error, sin datos personales

### Requirement: Runbook operativo versionado
`docs/operacion/` SHALL contener un runbook con los procedimientos de rotación de secretos, restauración de una copia y despliegue con reversión. El alta de la primera clínica (`C-17`) y el retiro de una clínica se documentan cuando se cierren los defectos que los bloquean.

#### Scenario: Rotación de un secreto
- **WHEN** se revisa el runbook para rotar `JWT_ACCESS_SECRET` o `ADMIN_INTERNAL_KEY`
- **THEN** el procedimiento indica el orden, el impacto sobre sesiones activas y cómo verificar el servicio después

### Requirement: Condiciones legales previas a operar con datos reales
Antes de cargar datos reales de pacientes en producción, el equipo SHALL registrar el cumplimiento de: las cláusulas contractuales modelo de transferencia internacional (Disposición DNPDP 60/2016 y Resolución AAIP 198/2023) con los proveedores de hosting, base de datos y email, la validación legal de `PO-03` y `PO-10`, y el análisis del registro de la base ante la AAIP (`PO-14`).

#### Scenario: Checklist incompleto
- **WHEN** falta alguna de las condiciones del checklist
- **THEN** no se da de alta ninguna clínica real y solo se opera con datos sintéticos

### Requirement: Inventario de transferencias de datos
La documentación SHALL listar cada proveedor que recibe datos personales (aplicación en Fly.io, base de datos en Neon, email transaccional con Resend), el país de tratamiento, qué datos recibe y la base legal aplicable.

#### Scenario: Inventario publicado
- **WHEN** se revisa `docs/operacion/`
- **THEN** cada proveedor figura con país, tipo de datos, base legal y estado de la firma contractual
