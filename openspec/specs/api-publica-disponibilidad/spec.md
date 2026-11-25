# api-publica-disponibilidad Specification

## Purpose

Consulta pública, sin cuenta, del catálogo y de los horarios libres de una clínica identificada por su slug, para que el paciente elija profesional, prestación y horario antes de reservar (US-030, Flujo 3 paso 1, RN-AG-01 a RN-AG-07, RN-AG-12, RN-RE-03, RN-RE-05).

## Requirements

### Requirement: Rutas públicas sin sesión
`GET /api/v1/publico/{slug}/prestaciones`, `GET /api/v1/publico/{slug}/profesionales` y `GET /api/v1/publico/{slug}/disponibilidad` SHALL responder sin token de acceso. Un encabezado `Authorization` presente, válido o no, MUST ignorarse y no cambiar la respuesta.

#### Scenario: Consulta sin token
- **WHEN** se invoca `GET /api/v1/publico/{slug}/prestaciones` sin encabezado `Authorization` con el slug de una clínica activa
- **THEN** la API responde `200`

#### Scenario: Token inválido ignorado
- **WHEN** se invoca la misma ruta con `Authorization: Bearer basura`
- **THEN** la API responde `200` con el mismo cuerpo que sin el encabezado

### Requirement: Catálogo público de prestaciones
`GET /api/v1/publico/{slug}/prestaciones` SHALL devolver `200` con las prestaciones **activas** de la clínica, cada una con exactamente `id`, `nombre` y `duracionMinutos`, ordenadas por `nombre` y luego por `id`. Las prestaciones inactivas y las de otras clínicas MUST NOT aparecer.

#### Scenario: Solo prestaciones activas
- **WHEN** la clínica A tiene las prestaciones activas "Consulta" (30) y "Limpieza" (45) y la inactiva "Blanqueamiento"
- **THEN** la respuesta lista "Consulta" y "Limpieza" con sus duraciones y no lista "Blanqueamiento"

#### Scenario: Sin prestaciones de otra clínica
- **WHEN** la clínica B tiene la prestación activa "Ortodoncia" y se consulta el slug de la clínica A
- **THEN** "Ortodoncia" no aparece en la respuesta

### Requirement: Catálogo público de profesionales
`GET /api/v1/publico/{slug}/profesionales` SHALL devolver `200` con los profesionales **activos** de la clínica, cada uno con exactamente `id`, `nombre` y `apellido`, ordenados por `apellido`, `nombre` e `id`. La matrícula, el estado y cualquier vínculo con usuarios del personal MUST NOT exponerse.

#### Scenario: Profesional activo sin matrícula
- **WHEN** la clínica tiene un profesional activo con matrícula cargada y uno inactivo
- **THEN** la respuesta lista solo al activo con `id`, `nombre` y `apellido`, sin `matricula`

### Requirement: Disponibilidad pública de un profesional para una prestación
`GET /api/v1/publico/{slug}/disponibilidad` SHALL exigir `profesionalId`, `prestacionId`, `desde` y `hasta` (fechas locales `AAAA-MM-DD` de la clínica, rango `[desde, hasta)`) y responder `200` con `zonaHoraria`, `profesionalId`, `prestacionId`, `desde`, `hasta` y `huecos`, cada hueco con exactamente `inicio` y `fin` en ISO 8601 UTC (`Z`), ordenados por `inicio`.

#### Scenario: Día libre completo
- **WHEN** el profesional atiende de 08:00 a 10:00 locales, la prestación dura 30, la granularidad es 15, hay un sillón activo sin turnos y se consulta ese día
- **THEN** la respuesta tiene 7 huecos, de 08:00 a 09:30 locales, expresados en UTC, y el último termina a las 10:00 locales

#### Scenario: Sin franjas de atención
- **WHEN** el profesional activo no tiene horarios de atención en el rango
- **THEN** la API responde `200` con `huecos` vacío

### Requirement: Coincidencia con las reglas de agenda
Los huecos públicos SHALL ser exactamente los que devuelve el cálculo de disponibilidad del dominio con los datos de la clínica: excluyen feriados, bloqueos del profesional, turnos activos del profesional, sillones ocupados con su buffer e inicios en el pasado, y MUST NOT ofrecer un hueco sin sillón activo libre (RN-AG-01 a RN-AG-07).

#### Scenario: Feriado
- **WHEN** el rango incluye un feriado de la clínica
- **THEN** no hay huecos con fecha local en ese feriado

#### Scenario: Bloqueo del profesional
- **WHEN** el profesional tiene un bloqueo de 09:00 a 10:00 locales
- **THEN** no hay huecos cuyo intervalo se solape con el bloqueo

#### Scenario: Buffer del sillón
- **WHEN** hay un solo sillón con buffer 15, la prestación dura 30 y otro profesional tiene un turno activo en ese sillón de 09:00 a 09:30
- **THEN** no se ofrece el hueco de las 09:30 y sí el de las 09:45

#### Scenario: Turno cancelado libera el horario
- **WHEN** el único turno del profesional a las 09:00 pasa a `cancelado`
- **THEN** el hueco de las 09:00 vuelve a ofrecerse

#### Scenario: Inicios pasados
- **WHEN** el instante actual es las 09:10 locales del día consultado
- **THEN** ningún hueco empieza antes de las 09:10

### Requirement: Todo hueco ofrecido es reservable
Todo hueco publicado SHALL poder reservarse, con los mismos datos y en el mismo instante, con al menos uno de sus sillones asignables sin violar las validaciones previas ni los constraints de exclusión de la base. Esta propiedad MUST verificarse con pruebas basadas en propiedades contra PostgreSQL real.

#### Scenario: Reserva de un hueco ofrecido
- **WHEN** se genera al azar una agenda (franjas, feriados, bloqueos, turnos, sillones con buffer) y se elige cualquier hueco devuelto
- **THEN** insertar un turno en ese hueco con un sillón asignable no produce error de validación ni de exclusión

### Requirement: Verificación de un hueco concreto para la reserva
El sistema SHALL ofrecer a la reserva pública una verificación de que un inicio concreto, para un profesional y una prestación de la clínica, sigue siendo un hueco ofrecido, y devolver sus sillones asignables; si no lo es, MUST indicarlo sin efectos.

#### Scenario: Inicio todavía libre
- **WHEN** se verifica un inicio que el cálculo ofrece con los sillones S1 y S2 libres
- **THEN** la verificación devuelve el hueco con S1 y S2 como asignables

#### Scenario: Inicio ocupado después de la consulta
- **WHEN** entre la consulta y la verificación otro turno ocupa al profesional en ese inicio
- **THEN** la verificación indica que el hueco ya no se ofrece

### Requirement: Respuestas sin datos ajenos
Las respuestas públicas MUST NOT contener datos de pacientes (ids, nombres, DNI, teléfono, email, obra social), identificadores o nombres de sillones, cantidad de sillones libres, ids o estados de turnos, ni motivos de bloqueos. Cualquier campo no declarado en el contrato de respuesta MUST descartarse.

#### Scenario: Agenda con turnos de pacientes
- **WHEN** la clínica tiene turnos activos de pacientes sintéticos y se consulta la disponibilidad del día
- **THEN** el cuerpo de la respuesta no contiene ningún id de paciente, de turno ni de sillón, ni el nombre de ningún paciente o sillón

### Requirement: Recurso público inexistente indistinguible
Un slug inexistente, mal formado o de una clínica inactiva, y un `profesionalId` o `prestacionId` inexistente, mal formado, inactivo o de otra clínica, SHALL responder `404` con el mismo código `RECURSO_NO_ENCONTRADO` y el mismo mensaje, sin revelar cuál de los casos ocurrió (regla 12).

#### Scenario: Clínica inactiva igual a inexistente
- **WHEN** se consulta `/publico/{slug}/prestaciones` con el slug de una clínica inactiva y con un slug que no existe
- **THEN** ambas respuestas son `404` con cuerpos idénticos

#### Scenario: Profesional de otra clínica
- **WHEN** se consulta la disponibilidad con el slug de la clínica A y el id de un profesional de la clínica B
- **THEN** la API responde `404` `RECURSO_NO_ENCONTRADO`, idéntico al de un id inexistente

#### Scenario: Prestación inactiva
- **WHEN** se consulta la disponibilidad con una prestación desactivada de la clínica
- **THEN** la API responde `404` `RECURSO_NO_ENCONTRADO`

### Requirement: Rango de fechas acotado
La disponibilidad SHALL rechazar con `400` y código `RANGO_FECHAS_INVALIDO` un `desde` o `hasta` que no sea una fecha de calendario válida, un `hasta` menor o igual que `desde`, un rango de más de 14 días y un `hasta` posterior a 90 días desde la fecha local actual de la clínica. Un `desde` pasado MUST aceptarse y sus inicios pasados no se ofrecen.

#### Scenario: Rango invertido
- **WHEN** `desde=2026-12-10` y `hasta=2026-12-10`
- **THEN** la API responde `400` `RANGO_FECHAS_INVALIDO`

#### Scenario: Rango demasiado amplio
- **WHEN** `desde=2026-12-01` y `hasta=2026-12-16`
- **THEN** la API responde `400` `RANGO_FECHAS_INVALIDO`

#### Scenario: Fecha inexistente
- **WHEN** `desde=2026-02-30`
- **THEN** la API responde `400` `RANGO_FECHAS_INVALIDO`

### Requirement: Validación de forma previa a la base
Un parámetro de consulta faltante o de forma inválida SHALL responder `400` `SOLICITUD_INVALIDA` con la lista de campos y sin los valores recibidos, antes de resolver la clínica.

#### Scenario: Falta la prestación
- **WHEN** se consulta la disponibilidad sin `prestacionId`
- **THEN** la API responde `400` `SOLICITUD_INVALIDA` y el campo `prestacionId` figura en `campos`

### Requirement: Solo lectura, sin auditoría y sin datos personales en logs
Las consultas públicas MUST NOT modificar ningún dato, MUST NOT escribir en `auditoria` y MUST NOT registrar en los logs parámetros de consulta ni datos de pacientes; el registro de acceso SHALL limitarse a método, ruta sin consulta, estado y duración.

#### Scenario: Consulta auditada nunca
- **WHEN** se realizan consultas públicas exitosas y fallidas
- **THEN** la tabla `auditoria` no cambia y los logs no contienen `profesionalId`, `prestacionId`, `desde` ni `hasta`

### Requirement: Encabezados de caché
La disponibilidad SHALL responder con `Cache-Control: no-store`; los catálogos con `200` SHALL responder con `Cache-Control: private, max-age=60`; las respuestas de error MUST NOT ser almacenables.

#### Scenario: Disponibilidad no cacheable
- **WHEN** se consulta la disponibilidad
- **THEN** la respuesta lleva `Cache-Control: no-store`
