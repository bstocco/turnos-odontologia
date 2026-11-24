# Spec Delta

## Purpose

API autenticada para administrar los feriados de la clínica y copiar una plantilla de feriados nacionales de Argentina versionada en el repositorio (US-004, RN-AG-07, PO-15).

## ADDED Requirements

### Requirement: Consulta de feriados de la clínica
`GET /api/v1/feriados` SHALL devolver los feriados de la clínica del token (`id`, `fecha` en formato `YYYY-MM-DD` y `descripcion`) ordenados por fecha, con el filtro opcional `anio` (entero de 2000 a 2100). Pueden leerlo administrador, recepcionista y odontólogo.

#### Scenario: Filtro por año
- **WHEN** la clínica tiene feriados en 2026 y 2027 y una recepcionista invoca `GET /api/v1/feriados?anio=2027`
- **THEN** la API responde `200` solo con los feriados de 2027, ordenados por fecha

#### Scenario: Aislamiento entre clínicas
- **WHEN** el administrador de la clínica A lista feriados
- **THEN** la respuesta no contiene feriados de la clínica B

### Requirement: Alta de feriado único por fecha
El administrador SHALL poder crear un feriado con `fecha` (fecha de calendario válida) y `descripcion` (1 a 200 caracteres con al menos uno no blanco). Una fecha ya cargada en la clínica MUST rechazarse con `409` y código `FERIADO_DUPLICADO`; una fecha inexistente (por ejemplo `2026-02-30`), con `400`.

#### Scenario: Alta de feriado
- **WHEN** el administrador envía `POST /api/v1/feriados` con `fecha = "2026-12-24"` y una descripción
- **THEN** la API responde `201` con el feriado creado

#### Scenario: Fecha repetida
- **WHEN** el administrador crea un feriado en una fecha que la clínica ya tiene
- **THEN** la API responde `409` con código `FERIADO_DUPLICADO`

#### Scenario: Misma fecha en otra clínica
- **WHEN** la clínica B ya tiene un feriado el `2026-12-24` y el administrador de la clínica A lo crea en su clínica
- **THEN** la API responde `201`

#### Scenario: Fecha inexistente
- **WHEN** el administrador envía `fecha = "2026-02-30"`
- **THEN** la API responde `400` y no se crea nada

### Requirement: Borrado de feriado
El administrador SHALL poder borrar un feriado de su clínica con `DELETE /api/v1/feriados/{id}` (respuesta `204`). Un id inexistente, mal formado o de otra clínica MUST responder `404` con código `RECURSO_NO_ENCONTRADO`.

#### Scenario: Borrado
- **WHEN** el administrador borra un feriado propio
- **THEN** la API responde `204` y el feriado ya no se lista

#### Scenario: Feriado de otra clínica
- **WHEN** el administrador de la clínica A intenta borrar un feriado de la clínica B
- **THEN** la API responde `404` y el feriado de B se conserva

### Requirement: Escritura de feriados solo por el administrador
`POST /feriados`, `DELETE /feriados/{id}` y `POST /feriados/plantilla-nacional` SHALL estar permitidos solo al administrador; los demás roles MUST recibir `403` con código `ACCESO_PROHIBIDO`.

#### Scenario: Odontólogo intenta cargar un feriado
- **WHEN** un odontólogo invoca `POST /api/v1/feriados`
- **THEN** la API responde `403` y no se crea nada

### Requirement: Plantilla de feriados nacionales
El sistema SHALL incluir una plantilla de feriados nacionales de Argentina por año (al menos el año en curso y el siguiente), sin llamadas a servicios externos. `GET /api/v1/feriados/plantilla-nacional?anio=` SHALL devolverla para previsualizar (todos los roles del personal). Un año sin plantilla MUST responder `422` con código `PLANTILLA_FERIADOS_NO_DISPONIBLE`.

#### Scenario: Previsualizar la plantilla
- **WHEN** una recepcionista invoca `GET /api/v1/feriados/plantilla-nacional?anio=2026`
- **THEN** la API responde `200` con las fechas y descripciones de la plantilla 2026, que incluyen `2026-05-25` y `2026-07-09`

#### Scenario: Año sin plantilla
- **WHEN** se pide la plantilla de un año que el repositorio no incluye
- **THEN** la API responde `422` con código `PLANTILLA_FERIADOS_NO_DISPONIBLE`

### Requirement: Copia idempotente de la plantilla
`POST /api/v1/feriados/plantilla-nacional` con `{ "anio": N }` SHALL crear en la clínica las fechas de la plantilla que aún no tiene y omitir las que ya existen sin modificar su descripción, respondiendo `200` con los feriados creados y las fechas omitidas. Repetir la copia MUST NOT crear duplicados ni fallar.

#### Scenario: Primera copia
- **WHEN** el administrador copia la plantilla 2026 en una clínica sin feriados
- **THEN** la API responde `200`, todas las fechas de la plantilla quedan creadas y la lista de omitidas está vacía

#### Scenario: Copia repetida
- **WHEN** el administrador copia la plantilla 2026 por segunda vez
- **THEN** la API responde `200` con cero creados, todas las fechas en omitidas, y la cantidad de feriados de la clínica no cambia

#### Scenario: Ajuste previo de la clínica
- **WHEN** la clínica ya tiene `2026-12-08` con una descripción propia y copia la plantilla 2026
- **THEN** `2026-12-08` se informa como omitida y conserva la descripción de la clínica

### Requirement: Auditoría de las mutaciones de feriados
Cada feriado creado (individualmente o por la plantilla) SHALL registrar `accion = 'creacion'`, `entidad = 'feriado'` y su `entidad_id`; cada borrado, `accion = 'eliminacion'` con los datos previos. Los registros SHALL escribirse en la misma transacción que la mutación y, si fallan, la mutación MUST revertirse (RN-AU-02).

#### Scenario: Copia de plantilla auditada por feriado
- **WHEN** la copia de la plantilla crea N feriados
- **THEN** existen N registros de auditoría `creacion`/`feriado`, uno por cada feriado creado, y ninguno por las fechas omitidas

#### Scenario: Borrado auditado
- **WHEN** el administrador borra un feriado
- **THEN** existe un registro con `accion = 'eliminacion'`, `entidad = 'feriado'`, `entidad_id` del feriado y `datos_antes` con su fecha
