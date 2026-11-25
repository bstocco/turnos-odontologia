# api-pacientes Specification

## Purpose

API autenticada de la ficha básica del paciente (nombre, apellido, DNI, teléfono, email y obra social): alta, consulta de detalle auditada, modificación parcial y búsqueda por DNI o apellido, con mínimo acceso por rol y aislamiento por clínica. Cubre US-040, RN-PA-01 a RN-PA-03, RN-AU-02, RN-AU-03 y RN-MT-03.

## Requirements

### Requirement: Autenticación obligatoria
Toda ruta de `/api/v1/pacientes` SHALL exigir un token de acceso válido. Sin token MUST responder `401` con código `AUTENTICACION_REQUERIDA`, y con un token inválido `401` con código `TOKEN_INVALIDO`, sin leer, crear, modificar ni auditar nada.

#### Scenario: Pedido sin token
- **WHEN** se invoca `GET /api/v1/pacientes?apellido=Gom` sin cabecera `Authorization`
- **THEN** la API responde `401` con código `AUTENTICACION_REQUERIDA`

#### Scenario: Token mal firmado
- **WHEN** se invoca `POST /api/v1/pacientes` con un token firmado con otro secreto
- **THEN** la API responde `401` con código `TOKEN_INVALIDO` y no se crea ningún paciente

### Requirement: Alta de paciente
`POST /api/v1/pacientes` SHALL crear la ficha en la clínica del token con `nombre`, `apellido`, `dni` y `telefono` obligatorios y `email` y `obraSocial` opcionales, y MUST responder `201` con la ficha creada (`id`, `nombre`, `apellido`, `dni`, `telefono`, `email`, `obraSocial`, `creadoEn`). Solo administrador y recepcionista pueden crear.

#### Scenario: Recepcionista crea un paciente
- **WHEN** una recepcionista invoca `POST /api/v1/pacientes` con nombre, apellido, DNI `30.111.222`, teléfono `011 15 5555-1234` y sin obra social
- **THEN** la API responde `201` con `dni` `30111222`, `telefono` `+5491155551234`, `obraSocial` `null` y un `id` nuevo de la clínica del token

#### Scenario: Odontólogo intenta crear un paciente
- **WHEN** un odontólogo invoca `POST /api/v1/pacientes` con datos válidos
- **THEN** la API responde `403` con código `ACCESO_PROHIBIDO` y no se crea ningún paciente

### Requirement: Normalización y validación de datos
Al crear o modificar, el sistema SHALL recortar espacios de los textos, quitar puntos y espacios del DNI y normalizar el teléfono al formato internacional (RN-PA-03). Un DNI que no quede con 7 u 8 dígitos MUST responder `400` `DNI_INVALIDO`; un teléfono no normalizable, `400` `TELEFONO_INVALIDO`; un campo con forma inválida, `400` `SOLICITUD_INVALIDA`.

#### Scenario: Teléfono inválido
- **WHEN** se crea un paciente con teléfono `123`
- **THEN** la API responde `400` con código `TELEFONO_INVALIDO`, el cuerpo de error no contiene el valor recibido y no se crea ningún paciente

#### Scenario: DNI con letras
- **WHEN** se crea un paciente con DNI `30A11222`
- **THEN** la API responde `400` con código `DNI_INVALIDO` y no se crea ningún paciente

#### Scenario: Nombre en blanco
- **WHEN** se crea un paciente con `nombre` igual a `"   "`
- **THEN** la API responde `400` con código `SOLICITUD_INVALIDA` y la lista de campos inválidos no incluye valores

### Requirement: DNI único por clínica
Crear o modificar un paciente con un DNI que ya tiene otro paciente de la misma clínica SHALL responder `409` con código `PACIENTE_DNI_DUPLICADO`, sin el DNI en el mensaje y sin cambios ni auditoría. El mismo DNI en otra clínica MUST aceptarse (registros independientes).

#### Scenario: Alta con DNI repetido
- **WHEN** la clínica A ya tiene un paciente con DNI `30111222` y se crea otro con DNI `30.111.222`
- **THEN** la API responde `409` con código `PACIENTE_DNI_DUPLICADO` y la clínica A sigue con un solo paciente con ese DNI

#### Scenario: Modificación hacia un DNI existente
- **WHEN** se modifica el DNI de un paciente al DNI de otro paciente de la misma clínica
- **THEN** la API responde `409` con código `PACIENTE_DNI_DUPLICADO` y ninguno de los dos pacientes cambia

#### Scenario: Mismo DNI en otra clínica
- **WHEN** la clínica B crea un paciente con un DNI que ya existe en la clínica A
- **THEN** la API responde `201`

### Requirement: Detalle de la ficha
`GET /api/v1/pacientes/{id}` SHALL devolver `200` con la ficha completa a administrador y recepcionista para cualquier paciente de su clínica, y al odontólogo solo para pacientes en su alcance (ver requisito de alcance del odontólogo).

#### Scenario: Recepcionista lee una ficha
- **WHEN** una recepcionista invoca `GET /api/v1/pacientes/{id}` de un paciente de su clínica
- **THEN** la API responde `200` con `id`, `nombre`, `apellido`, `dni`, `telefono`, `email`, `obraSocial` y `creadoEn`

#### Scenario: Paciente de otra clínica
- **WHEN** el administrador de la clínica A invoca `GET /api/v1/pacientes/{id}` con el id de un paciente de la clínica B
- **THEN** la API responde `404` con código `RECURSO_NO_ENCONTRADO`

#### Scenario: Identificador mal formado
- **WHEN** se invoca `GET /api/v1/pacientes/no-es-un-uuid`
- **THEN** la API responde `404` con código `RECURSO_NO_ENCONTRADO`

### Requirement: Auditoría de la lectura de la ficha
Cada respuesta `200` de `GET /api/v1/pacientes/{id}` SHALL registrar en `auditoria`, en la misma transacción, un evento `lectura_ficha` con entidad `paciente`, el id del paciente, el actor, la clínica y la IP, sin datos de la ficha. Si el registro falla, la ficha MUST NOT entregarse. Las respuestas `403` y `404` no auditan.

#### Scenario: Lectura auditada
- **WHEN** una recepcionista lee con éxito la ficha de un paciente
- **THEN** existe en `auditoria` un registro `lectura_ficha` con `entidad` `paciente`, `entidad_id` igual al id del paciente, `actor_id` igual al usuario y `datos_antes` y `datos_despues` nulos

#### Scenario: Lectura de un paciente inexistente
- **WHEN** se invoca `GET /api/v1/pacientes/{id}` con un id que no existe en la clínica
- **THEN** la API responde `404` y no se agrega ningún registro a `auditoria`

#### Scenario: Falla la auditoría
- **WHEN** la inserción del registro `lectura_ficha` falla
- **THEN** la API responde `500` con código `ERROR_INTERNO` y el cuerpo no contiene datos de la ficha

### Requirement: Modificación parcial de la ficha
`PATCH /api/v1/pacientes/{id}` SHALL modificar solo los campos enviados (`email` y `obraSocial` admiten `null` para borrarse) con las mismas validaciones del alta, y MUST responder `200` con la ficha resultante. Solo administrador y recepcionista pueden modificar. Un cuerpo sin campos modificables MUST responder `400` `CAMBIOS_VACIOS`.

#### Scenario: Cambio de teléfono
- **WHEN** una recepcionista envía `PATCH /api/v1/pacientes/{id}` con `{ "telefono": "351 512-3456" }`
- **THEN** la API responde `200` con `telefono` `+5493515123456` y los demás campos sin cambios

#### Scenario: Borrar la obra social
- **WHEN** el administrador envía `PATCH` con `{ "obraSocial": null }`
- **THEN** la API responde `200` con `obraSocial` `null`

#### Scenario: Cuerpo vacío
- **WHEN** se envía `PATCH /api/v1/pacientes/{id}` con `{}` o solo con campos desconocidos
- **THEN** la API responde `400` con código `CAMBIOS_VACIOS` y no se audita nada

#### Scenario: Odontólogo intenta modificar
- **WHEN** un odontólogo envía `PATCH /api/v1/pacientes/{id}` sobre un paciente de sus turnos
- **THEN** la API responde `403` con código `ACCESO_PROHIBIDO` y el paciente no cambia

### Requirement: Auditoría de altas y modificaciones sin datos personales
Cada alta y modificación exitosa SHALL registrar en la misma transacción un evento `creacion` o `modificacion` con entidad `paciente`, el id, el actor y la IP, y la lista de campos informados o cambiados, sin valores de nombre, apellido, DNI, teléfono, email ni obra social. Si el registro falla, la operación MUST revertirse.

#### Scenario: Alta auditada
- **WHEN** se crea un paciente con email y sin obra social
- **THEN** existe un registro `creacion` de `paciente` con el id creado cuyo contenido nombra los campos informados y no contiene el DNI, el teléfono, el email ni el nombre del paciente

#### Scenario: Modificación auditada
- **WHEN** se modifica solo el teléfono de un paciente
- **THEN** existe un registro `modificacion` de `paciente` cuyo contenido indica que cambió `telefono` y no contiene el teléfono anterior ni el nuevo

#### Scenario: Falla la auditoría del alta
- **WHEN** la inserción del registro `creacion` falla
- **THEN** la API responde `500` y el paciente no queda creado

### Requirement: Búsqueda de pacientes de la clínica
`GET /api/v1/pacientes` SHALL aceptar exactamente uno de `dni` (coincidencia exacta tras normalizar) o `apellido` (prefijo de al menos 2 caracteres, sin distinguir mayúsculas ni tildes) y devolver `200` con una lista de `{ id, nombre, apellido, dni }` de la clínica del token, ordenada por apellido y nombre, con un máximo configurable por `limite` (por defecto 20, tope 50). Ningún criterio, ambos, o un apellido corto MUST responder `400` `BUSQUEDA_INVALIDA`.

#### Scenario: Búsqueda por apellido limitada a la clínica
- **WHEN** las clínicas A y B tienen pacientes de apellido `Gómez` y la recepcionista de A invoca `GET /api/v1/pacientes?apellido=gomez`
- **THEN** la API responde `200` solo con los pacientes de A, cada uno con `id`, `nombre`, `apellido` y `dni` y sin `telefono`, `email` ni `obraSocial`

#### Scenario: Búsqueda por DNI sin resultados
- **WHEN** se busca un DNI que solo existe en otra clínica
- **THEN** la API responde `200` con una lista vacía

#### Scenario: Sin criterio de búsqueda
- **WHEN** se invoca `GET /api/v1/pacientes` sin `dni` ni `apellido`
- **THEN** la API responde `400` con código `BUSQUEDA_INVALIDA`

#### Scenario: Ambos criterios
- **WHEN** se invoca `GET /api/v1/pacientes?dni=30111222&apellido=Gom`
- **THEN** la API responde `400` con código `BUSQUEDA_INVALIDA`

#### Scenario: Tope de resultados
- **WHEN** la clínica tiene 60 pacientes con apellido que empieza con `Ro` y se busca `apellido=Ro&limite=500`
- **THEN** la API responde `400` con código `SOLICITUD_INVALIDA`; con `limite` omitido responde como máximo 20 pacientes

### Requirement: Alcance del odontólogo por sus turnos
El odontólogo SHALL leer y encontrar solo pacientes con al menos un turno en estado `pendiente_confirmacion`, `confirmado`, `atendido` o `ausente` con el profesional vinculado a su usuario. Un paciente fuera de ese alcance MUST responder `404` en el detalle y no aparecer en búsquedas. Sin profesional vinculado o con usuario inactivo, MUST responder `403` `ACCESO_PROHIBIDO`.

#### Scenario: Paciente con turno propio
- **WHEN** un odontólogo vinculado al profesional P lee la ficha de un paciente con un turno confirmado con P
- **THEN** la API responde `200` con la ficha y se audita la lectura

#### Scenario: Paciente sin turnos con su profesional
- **WHEN** el mismo odontólogo lee la ficha de un paciente de su clínica que solo tiene turnos con otro profesional
- **THEN** la API responde `404` con código `RECURSO_NO_ENCONTRADO` y no se audita la lectura

#### Scenario: Turno cancelado no da acceso
- **WHEN** el único turno del paciente con P está `cancelado`
- **THEN** el detalle responde `404` y la búsqueda por su DNI devuelve una lista vacía

#### Scenario: Búsqueda filtrada del odontólogo
- **WHEN** el odontólogo busca `apellido=Gom` y la clínica tiene dos pacientes `Gómez`, uno solo con turno con P
- **THEN** la API responde `200` con únicamente ese paciente

#### Scenario: Odontólogo sin profesional vinculado
- **WHEN** un usuario con rol odontólogo sin profesional asociado busca o lee un paciente
- **THEN** la API responde `403` con código `ACCESO_PROHIBIDO`

### Requirement: Sin baja de pacientes en v1
La API SHALL NOT ofrecer borrado ni desactivación de pacientes: `DELETE /api/v1/pacientes/{id}` MUST responder `404` con código `RUTA_NO_ENCONTRADA` sin efectos.

#### Scenario: Intento de borrado
- **WHEN** el administrador invoca `DELETE /api/v1/pacientes/{id}`
- **THEN** la API responde `404` con código `RUTA_NO_ENCONTRADA` y el paciente sigue existiendo

### Requirement: Datos personales fuera de logs y errores
Ninguna respuesta de error, línea de log ni payload de auditoría producido por esta API SHALL contener nombre, apellido, DNI, teléfono, email u obra social del paciente (Ley 25.326), incluidos los valores recibidos en la ruta, la consulta o el cuerpo.

#### Scenario: Búsqueda por DNI no queda en los logs
- **WHEN** se invoca `GET /api/v1/pacientes?dni=30111222`
- **THEN** ninguna línea de log del pedido contiene `30111222`

#### Scenario: Conflicto sin datos
- **WHEN** un alta responde `409 PACIENTE_DNI_DUPLICADO`
- **THEN** ni el cuerpo de la respuesta ni los logs contienen el DNI, el nombre ni el teléfono enviados
