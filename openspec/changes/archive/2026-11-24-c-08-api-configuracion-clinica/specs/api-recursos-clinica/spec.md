# Spec Delta

## Purpose

API autenticada para administrar los recursos de la clínica que consume la agenda: profesionales, sillones (con su buffer de limpieza) y prestaciones (con su duración). Cubre US-001, US-002 y US-003 y la matriz RBAC de `03 §RBAC`.

## ADDED Requirements

### Requirement: Lectura de recursos por todo el personal
`GET /api/v1/profesionales`, `GET /api/v1/sillones` y `GET /api/v1/prestaciones` y sus variantes `/{id}` SHALL estar disponibles para administrador, recepcionista y odontólogo, y MUST devolver solo recursos de la clínica del token. Las listas SHALL aceptar el filtro opcional `activo=true|false` y devolverse ordenadas de forma estable.

#### Scenario: Listado filtrado por activos
- **WHEN** la clínica tiene dos sillones activos y uno inactivo y una recepcionista invoca `GET /api/v1/sillones?activo=true`
- **THEN** la API responde `200` con los dos sillones activos, cada uno con `id`, `nombre`, `bufferMinutos` y `activo`

#### Scenario: Listado sin filtro
- **WHEN** un odontólogo invoca `GET /api/v1/prestaciones`
- **THEN** la API responde `200` con todas las prestaciones de su clínica, activas e inactivas, cada una con `id`, `nombre`, `duracionMinutos` y `activa`

### Requirement: Recurso de otra clínica o inexistente
Cualquier operación sobre `/profesionales/{id}`, `/sillones/{id}` o `/prestaciones/{id}` cuyo `id` no exista, no sea un UUID o pertenezca a otra clínica SHALL responder `404` con código `RECURSO_NO_ENCONTRADO`, sin revelar si el recurso existe en otra clínica (regla 12) y sin modificar ni auditar nada.

#### Scenario: Profesional de otra clínica
- **WHEN** el administrador de la clínica A invoca `PATCH /api/v1/profesionales/{id}` con el id de un profesional de la clínica B
- **THEN** la API responde `404` con código `RECURSO_NO_ENCONTRADO` y el profesional de B no cambia

#### Scenario: Identificador mal formado
- **WHEN** se invoca `GET /api/v1/sillones/no-es-un-uuid`
- **THEN** la API responde `404` con código `RECURSO_NO_ENCONTRADO`

### Requirement: Escritura de recursos solo por el administrador
`POST` y `PATCH` sobre profesionales, sillones y prestaciones SHALL estar permitidos solo al rol administrador; recepcionista y odontólogo MUST recibir `403` con código `ACCESO_PROHIBIDO` sin efectos.

#### Scenario: Recepcionista intenta crear un sillón
- **WHEN** una recepcionista invoca `POST /api/v1/sillones`
- **THEN** la API responde `403` con código `ACCESO_PROHIBIDO` y no se crea ningún sillón

#### Scenario: Odontólogo intenta desactivar una prestación
- **WHEN** un odontólogo invoca `PATCH /api/v1/prestaciones/{id}` con `{ "activa": false }`
- **THEN** la API responde `403` y la prestación sigue activa

### Requirement: Alta y modificación de profesionales
El administrador SHALL poder crear un profesional con `nombre`, `apellido` y `matricula` opcional (nace activo) y modificar parcialmente esos campos y `activo` (US-001). Los textos MUST tener al menos un carácter no blanco; un `PATCH` sin campos modificables MUST responder `400` con código `CAMBIOS_VACIOS`.

#### Scenario: Alta de profesional
- **WHEN** el administrador envía `POST /api/v1/profesionales` con `nombre` y `apellido`
- **THEN** la API responde `201` con el profesional creado, `activo = true` y `matricula = null`

#### Scenario: Nombre en blanco
- **WHEN** el administrador envía un `nombre` compuesto solo de espacios
- **THEN** la API responde `400` y no se crea el profesional

### Requirement: Sillones con buffer no negativo
El administrador SHALL poder crear un sillón con `nombre` y `bufferMinutos` opcional (entero de 0 a 240, por defecto 0) y modificar `nombre`, `bufferMinutos` y `activo` (US-002, RN-AG-05). Un buffer negativo o no entero MUST rechazarse con `400`. Cambiar el buffer MUST NOT alterar turnos ya creados (el turno copia el buffer al reservar).

#### Scenario: Buffer negativo
- **WHEN** el administrador envía `POST /api/v1/sillones` con `bufferMinutos = -5`
- **THEN** la API responde `400` con código `SOLICITUD_INVALIDA`

#### Scenario: Buffer por defecto
- **WHEN** el administrador crea un sillón sin indicar `bufferMinutos`
- **THEN** el sillón se crea con `bufferMinutos = 0`

### Requirement: Prestaciones con duración positiva
El administrador SHALL poder crear una prestación con `nombre` y `duracionMinutos` (entero de 1 a 480) y modificar `nombre`, `duracionMinutos` y `activa` (US-003, RN-AG-04). Una duración cero, negativa o no entera MUST rechazarse con `400`.

#### Scenario: Duración cero
- **WHEN** el administrador envía `POST /api/v1/prestaciones` con `duracionMinutos = 0`
- **THEN** la API responde `400` con código `SOLICITUD_INVALIDA`

#### Scenario: Cambio de duración
- **WHEN** el administrador cambia la duración de una prestación de 30 a 45
- **THEN** la API responde `200` con `duracionMinutos = 45`

### Requirement: Desactivación en lugar de borrado
Profesionales, sillones y prestaciones MUST NOT borrarse físicamente: la API SHALL ofrecer solo la desactivación (`activo`/`activa = false` por `PATCH`) y la reactivación, y MUST NOT exponer `DELETE` sobre esos recursos, para conservar los turnos asociados (US-003, D6 de C-05).

#### Scenario: Desactivar un profesional
- **WHEN** el administrador envía `PATCH /api/v1/profesionales/{id}` con `{ "activo": false }`
- **THEN** la API responde `200` con `activo = false` y la fila del profesional, sus horarios y sus referencias se conservan

#### Scenario: No existe borrado físico
- **WHEN** cualquier usuario invoca `DELETE /api/v1/prestaciones/{id}`
- **THEN** la API responde `404` con código `RUTA_NO_ENCONTRADA` y la prestación no se borra

### Requirement: Auditoría de las mutaciones de recursos
Cada alta o modificación exitosa de un profesional, sillón o prestación SHALL registrar en `auditoria`, en la misma transacción, `accion` `creacion` o `modificacion`, `entidad` `profesional`, `sillon` o `prestacion`, el `entidad_id` del recurso, el actor y los valores antes y después enmascarados por C-07 (RN-AU-02). Si la auditoría falla, la mutación MUST revertirse.

#### Scenario: Alta auditada
- **WHEN** el administrador crea una prestación
- **THEN** existe un registro con `accion = 'creacion'`, `entidad = 'prestacion'`, `entidad_id` de la prestación, `datos_antes` nulo y `datos_despues` con su duración

#### Scenario: Operación rechazada no se audita
- **WHEN** una mutación responde `400`, `403`, `404` o `422`
- **THEN** no se registra ningún evento de auditoría
