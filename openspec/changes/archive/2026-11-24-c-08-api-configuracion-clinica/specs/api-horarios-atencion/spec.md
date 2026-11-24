# Spec Delta

## Purpose

API autenticada para consultar y definir las franjas semanales de atención de cada profesional, interpretadas en la zona horaria de la clínica (US-001, RN-AG-06, RN-AG-03, RN-DA-03).

## ADDED Requirements

### Requirement: Consulta de las franjas de un profesional
`GET /api/v1/profesionales/{id}/horarios` SHALL devolver `profesionalId` y la lista de franjas (`diaSemana` 0 a 6 con 0 = domingo, `horaDesde` y `horaHasta` en formato `HH:MM` local, `24:00` admitido como fin) ordenadas por día y hora. Administrador y recepcionista pueden leer cualquier profesional de su clínica; el odontólogo, solo el profesional vinculado a su usuario.

#### Scenario: Recepcionista consulta horarios
- **WHEN** una recepcionista consulta los horarios de un profesional con franjas lunes 09:00-13:00 y lunes 14:00-18:00
- **THEN** la API responde `200` con ambas franjas, ordenadas, con `diaSemana = 1`

#### Scenario: Odontólogo consulta sus propios horarios
- **WHEN** un odontólogo cuyo usuario está vinculado al profesional P consulta los horarios de P
- **THEN** la API responde `200` con las franjas de P

#### Scenario: Odontólogo consulta horarios ajenos
- **WHEN** un odontólogo consulta los horarios de otro profesional de su clínica, o no tiene profesional vinculado
- **THEN** la API responde `403` con código `ACCESO_PROHIBIDO`

#### Scenario: Profesional sin franjas
- **WHEN** se consultan los horarios de un profesional existente sin franjas cargadas
- **THEN** la API responde `200` con una lista vacía

### Requirement: Reemplazo atómico de las franjas
`PUT /api/v1/profesionales/{id}/horarios` SHALL reemplazar todas las franjas del profesional por las enviadas (hasta 50; lista vacía borra todas) y responder con el resultado. Solo el administrador puede invocarlo. Si alguna franja es inválida, MUST NOT quedar ningún cambio parcial.

#### Scenario: Reemplazo exitoso
- **WHEN** el administrador envía dos franjas válidas para un profesional que tenía otras tres
- **THEN** la API responde `200` con exactamente las dos franjas nuevas

#### Scenario: Recepcionista intenta reemplazar
- **WHEN** una recepcionista invoca `PUT /api/v1/profesionales/{id}/horarios`
- **THEN** la API responde `403` y las franjas no cambian

#### Scenario: Profesional de otra clínica
- **WHEN** el administrador de la clínica A envía franjas para un profesional de la clínica B, o para un id inexistente
- **THEN** la API responde `404` con código `RECURSO_NO_ENCONTRADO` y nada cambia en ninguna clínica

### Requirement: Validación de la forma de cada franja
Cada franja SHALL tener `diaSemana` entero de 0 a 6 y horas `HH:MM` con minutos de 00 a 59 entre `00:00` y `24:00`. Una franja con `horaDesde >= horaHasta` MUST rechazarse con `400` y código `FRANJA_INVALIDA`; una hora mal formada, con `400` y código `SOLICITUD_INVALIDA`.

#### Scenario: Inicio no anterior al fin
- **WHEN** el administrador envía una franja 13:00-09:00 o 10:00-10:00
- **THEN** la API responde `400` con código `FRANJA_INVALIDA` y las franjas anteriores se conservan

#### Scenario: Fin del día
- **WHEN** el administrador envía una franja 20:00-24:00
- **THEN** la API la acepta y la devuelve con `horaHasta = "24:00"`

### Requirement: Franjas sin solape
Las franjas de un mismo profesional y día MUST NOT solaparse, con intervalos semiabiertos `[horaDesde, horaHasta)`: dos franjas contiguas (09:00-13:00 y 13:00-17:00) son válidas. Un solape SHALL rechazarse con `409` y código `FRANJA_SOLAPADA`, tanto si lo detecta la aplicación como el constraint de exclusión de la base.

#### Scenario: Franjas solapadas en el pedido
- **WHEN** el administrador envía lunes 09:00-13:00 y lunes 12:00-15:00
- **THEN** la API responde `409` con código `FRANJA_SOLAPADA` y las franjas anteriores se conservan

#### Scenario: Franjas contiguas
- **WHEN** el administrador envía lunes 09:00-13:00 y lunes 13:00-17:00
- **THEN** la API responde `200` con ambas franjas

#### Scenario: Mismo horario en días distintos
- **WHEN** el administrador envía lunes 09:00-13:00 y martes 09:00-13:00
- **THEN** la API responde `200`

### Requirement: Auditoría del reemplazo de franjas
Cada reemplazo exitoso SHALL registrar en la misma transacción un evento con `accion = 'modificacion'`, `entidad = 'horario_atencion'`, `entidad_id` igual al id del profesional y las listas de franjas antes y después (RN-AU-02). Si la auditoría falla, las franjas MUST conservar su estado anterior.

#### Scenario: Reemplazo auditado
- **WHEN** el administrador reemplaza las franjas de un profesional
- **THEN** existe un registro con `entidad = 'horario_atencion'`, `entidad_id` del profesional, `datos_antes.franjas` con las franjas previas y `datos_despues.franjas` con las nuevas
