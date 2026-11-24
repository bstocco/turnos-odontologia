# api-configuracion-clinica Specification

## Purpose

API autenticada para consultar y modificar los parámetros de la clínica del usuario: datos de la clínica y su configuración de reservas, cancelación y grilla de turnos (US-004, PO-06).

## Requirements


### Requirement: Autenticación obligatoria en la API de configuración
Todas las rutas de configuración (`/clinica`, `/profesionales`, `/sillones`, `/prestaciones`, `/feriados` y sus subrutas) SHALL exigir un token de acceso válido del personal y MUST responder `401` sin token o con un token inválido o vencido, antes de leer o escribir datos.

#### Scenario: Pedido sin token
- **WHEN** se invoca `GET /api/v1/clinica` sin encabezado `Authorization`
- **THEN** la API responde `401` con código `AUTENTICACION_REQUERIDA`

#### Scenario: Token inválido
- **WHEN** se invoca `PATCH /api/v1/clinica` con un token mal firmado o vencido
- **THEN** la API responde `401` con código `TOKEN_INVALIDO` y no modifica nada

### Requirement: Consulta de la configuración de la clínica
`GET /api/v1/clinica` SHALL devolver, solo para la clínica del token, `id`, `nombre`, `slug`, `zonaHoraria`, `reservaRequiereConfirmacion`, `cancelacionAnticipacionHoras` y `granularidadMinutos`. Lo pueden leer los roles administrador, recepcionista y odontólogo (matriz RBAC `03 §RBAC`).

#### Scenario: Recepcionista lee la configuración
- **WHEN** una recepcionista de la clínica A invoca `GET /api/v1/clinica`
- **THEN** la API responde `200` con los datos y la configuración de la clínica A, con los valores por defecto `reservaRequiereConfirmacion = false`, `cancelacionAnticipacionHoras = 24` y `granularidadMinutos = 15` si nunca se modificaron

#### Scenario: Aislamiento entre clínicas
- **WHEN** el administrador de la clínica A invoca `GET /api/v1/clinica`
- **THEN** la respuesta nunca contiene datos de la clínica B

### Requirement: Modificación parcial de la configuración
`PATCH /api/v1/clinica` SHALL permitir solo al administrador modificar `reservaRequiereConfirmacion` (booleano), `cancelacionAnticipacionHoras` (entero de 0 a 720) y `granularidadMinutos` (entero de 5 a 240); los campos omitidos MUST conservar su valor. La respuesta SHALL ser la configuración completa resultante.

#### Scenario: Administrador cambia la confirmación de reservas
- **WHEN** el administrador envía `{ "reservaRequiereConfirmacion": true }`
- **THEN** la API responde `200` con `reservaRequiereConfirmacion = true` y los demás valores sin cambios

#### Scenario: Recepcionista intenta modificar
- **WHEN** una recepcionista o un odontólogo invocan `PATCH /api/v1/clinica`
- **THEN** la API responde `403` con código `ACCESO_PROHIBIDO` y la configuración no cambia

#### Scenario: Cuerpo sin campos modificables
- **WHEN** el administrador envía un cuerpo vacío o solo con campos no modificables (por ejemplo `zonaHoraria` o `slug`)
- **THEN** la API responde `400` con código `CAMBIOS_VACIOS` y no audita nada

#### Scenario: Anticipación fuera de rango
- **WHEN** el administrador envía `cancelacionAnticipacionHoras = -1` o `721`
- **THEN** la API responde `400` con código `SOLICITUD_INVALIDA`

### Requirement: Granularidad compatible con la grilla diaria
La granularidad SHALL ser un divisor exacto de 1440 minutos, la misma regla con la que el dominio de agenda valida la alineación de turnos (RN-AG-11, PO-06). Un valor dentro de rango que no divide 1440 MUST rechazarse con `422`.

#### Scenario: Granularidad que no divide el día
- **WHEN** el administrador envía `granularidadMinutos = 7`
- **THEN** la API responde `422` con código `GRANULARIDAD_INVALIDA` y la configuración no cambia

#### Scenario: Granularidad válida
- **WHEN** el administrador envía `granularidadMinutos = 30`
- **THEN** la API responde `200` y la configuración de agenda leída después devuelve 30

### Requirement: Auditoría de los cambios de configuración
Cada `PATCH /clinica` exitoso SHALL registrar en `auditoria`, dentro de la misma transacción, un evento con `accion = 'modificacion'`, `entidad = 'clinica_config'`, `entidad_id` igual al id de la clínica, el actor del token y los valores antes y después (RN-AU-02). Si la auditoría falla, el cambio MUST revertirse.

#### Scenario: Cambio auditado
- **WHEN** el administrador cambia la anticipación de 24 a 48 horas
- **THEN** existe un registro de auditoría con `datos_antes.cancelacionAnticipacionHoras = 24` y `datos_despues.cancelacionAnticipacionHoras = 48`, `actor_tipo = 'usuario'` y `actor_id` del administrador

#### Scenario: Fallo de la auditoría revierte el cambio
- **WHEN** la inserción en `auditoria` falla durante un `PATCH /clinica`
- **THEN** la API responde con error y la configuración conserva sus valores anteriores
