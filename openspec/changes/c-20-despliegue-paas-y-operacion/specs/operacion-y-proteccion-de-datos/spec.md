# Spec Delta — operacion-y-proteccion-de-datos

## Purpose

Establece la operación mínima del servicio en producción (monitoreo, alertas, runbook) y las condiciones de protección de datos personales bajo la Ley 25.326 que deben cumplirse antes de operar con datos reales, incluida la transferencia internacional a São Paulo.

## ADDED Requirements

### Requirement: Monitoreo del servicio y del worker
El servicio SHALL ser monitoreado externamente mediante `GET /salud`, y el worker de `pg-boss` SHALL tener un chequeo de vida propio. La caída de cualquiera MUST generar una alerta a una persona responsable.

#### Scenario: API caída
- **WHEN** `GET /salud` deja de responder `200` durante el umbral definido
- **THEN** se envía una alerta a la persona de guardia

#### Scenario: Worker detenido
- **WHEN** el proceso del worker no está activo durante el umbral definido
- **THEN** se envía una alerta, porque los recordatorios y emails dejan de procesarse

### Requirement: Alertas básicas sin datos de pacientes
Las alertas y los logs de producción SHALL contener solo identificadores y contadores, nunca DNI, teléfono, email ni obra social de pacientes.

#### Scenario: Alerta de error
- **WHEN** se dispara una alerta por errores del servicio
- **THEN** su contenido incluye el identificador del pedido y el código de error, sin datos personales

### Requirement: Runbook operativo versionado
`docs/operacion/` SHALL contener un runbook con los procedimientos de alta de la primera clínica (`C-17`), rotación de secretos, restauración de una copia, despliegue con reversión y retiro de una clínica, cada uno ejecutable por una persona del equipo que no lo escribió.

#### Scenario: Alta de la primera clínica
- **WHEN** se sigue el runbook de alta
- **THEN** la clínica y su primer administrador quedan creados por el endpoint interno protegido, y la clave de servicio no queda registrada en ningún log

#### Scenario: Rotación de un secreto
- **WHEN** se sigue el runbook para rotar `JWT_ACCESS_SECRET` o `ADMIN_INTERNAL_KEY`
- **THEN** el procedimiento indica el orden, el impacto sobre sesiones activas y cómo verificar el servicio después

### Requirement: Condiciones legales previas a operar con datos reales
Antes de cargar datos reales de pacientes en producción, el equipo SHALL registrar el cumplimiento de: las cláusulas contractuales modelo de transferencia internacional (Disposición DNPDP 60/2016 y Resolución AAIP 198/2023) con el proveedor del PaaS y con el proveedor de email, la validación legal de `PO-03` y `PO-10`, y el análisis del registro de la base ante la AAIP (`PO-14`).

#### Scenario: Checklist incompleto
- **WHEN** falta alguna de las condiciones del checklist
- **THEN** no se da de alta ninguna clínica real y solo se opera con datos sintéticos

#### Scenario: Checklist completo
- **WHEN** todas las condiciones figuran cumplidas, con fecha y responsable
- **THEN** el runbook de alta de la primera clínica real puede ejecutarse

### Requirement: Inventario de transferencias de datos
La documentación SHALL listar cada proveedor que recibe datos personales (hosting y base en `gru`, email transaccional), el país de tratamiento, qué datos recibe y la base legal aplicable.

#### Scenario: Inventario publicado
- **WHEN** se revisa `docs/operacion/`
- **THEN** cada proveedor figura con país, tipo de datos, base legal y estado de la firma contractual
