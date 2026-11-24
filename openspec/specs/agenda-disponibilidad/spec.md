# agenda-disponibilidad Specification

## Purpose

Define las validaciones previas a crear un turno y el cálculo de huecos libres de un profesional para una prestación, con sillón asignable, como funciones puras sin acceso a datos (RN-AG-06, RN-AG-07, RN-AG-10, RN-AG-11, SU-05).

## Requirements

### Requirement: Validaciones previas como resultado tipado
Las validaciones previas a persistir un turno SHALL ser funciones puras que reciben todos sus datos como parámetros (franjas, feriados, bloqueos, configuración, instante actual) y devuelven éxito o un único error de dominio tipado, sin lanzar excepciones ni leer reloj, base o red. Ante varias fallas MUST informarse la primera en este orden: pasado, granularidad, feriado, horario, bloqueo.

#### Scenario: Turno válido
- **WHEN** se valida un turno alineado, futuro, en día hábil, dentro de una franja y sin bloqueos
- **THEN** el resultado es éxito

#### Scenario: Varias fallas a la vez
- **WHEN** se valida un turno en el pasado que además cae en feriado
- **THEN** el resultado es el error `TURNO_INICIO_EN_PASADO`

### Requirement: Inicio no pasado
Un turno con `inicio` anterior al instante actual MUST rechazarse con `TURNO_INICIO_EN_PASADO` (tipo `regla_de_negocio`). Un inicio igual al instante actual SHALL aceptarse (RN-AG-10).

#### Scenario: Inicio un minuto antes de ahora
- **WHEN** el instante actual es 10:00 y el turno empieza a las 09:59
- **THEN** se rechaza con `TURNO_INICIO_EN_PASADO`

### Requirement: Alineación a la granularidad
El inicio de un turno, expresado en minutos desde la medianoche local de la clínica, MUST ser múltiplo de la granularidad configurada (por defecto 15) y no tener segundos; si no, SHALL rechazarse con `TURNO_NO_ALINEADO` (tipo `regla_de_negocio`) (RN-AG-11). La granularidad MUST ser un entero positivo que divida 1440.

#### Scenario: Inicio alineado
- **WHEN** la granularidad es 15 y el turno empieza a las 09:45 locales
- **THEN** la validación de granularidad pasa

#### Scenario: Inicio desalineado
- **WHEN** la granularidad es 15 y el turno empieza a las 09:50 locales
- **THEN** se rechaza con `TURNO_NO_ALINEADO`

### Requirement: Sin turnos en feriado
Un turno cuya fecha local de inicio, en la zona de la clínica, sea un feriado de la clínica MUST rechazarse con `TURNO_EN_FERIADO` (tipo `regla_de_negocio`) (RN-AG-07). La recepción MUST NOT poder forzar la excepción en v1.

#### Scenario: Feriado en hora local
- **WHEN** `2026-05-25` es feriado y el turno empieza `2026-05-25T13:00:00Z` en `America/Argentina/Buenos_Aires` (10:00 local)
- **THEN** se rechaza con `TURNO_EN_FERIADO`

#### Scenario: Día UTC distinto del día local
- **WHEN** `2026-05-25` es feriado y el turno empieza `2026-05-25T01:00:00Z` (22:00 local del 24)
- **THEN** la validación de feriado pasa

### Requirement: Dentro del horario de atención
El rango del profesional `[inicio, fin)` de un turno MUST quedar contenido en una única franja de atención del profesional para el día de semana local, interpretada en la zona de la clínica; si no, SHALL rechazarse con `TURNO_FUERA_DE_HORARIO` (tipo `regla_de_negocio`) (RN-AG-06). El buffer del sillón MUST NOT tenerse en cuenta para esta validación.

#### Scenario: Turno que termina al cierre
- **WHEN** la franja es 08:00 a 12:00 y el turno ocupa `[11:30, 12:00)` locales
- **THEN** la validación de horario pasa

#### Scenario: Turno que excede la franja
- **WHEN** la franja es 08:00 a 12:00 y el turno ocupa `[11:45, 12:15)` locales
- **THEN** se rechaza con `TURNO_FUERA_DE_HORARIO`

#### Scenario: Día sin franja
- **WHEN** el profesional no tiene franjas el día de semana local del turno
- **THEN** se rechaza con `TURNO_FUERA_DE_HORARIO`

### Requirement: Sin turnos en un bloqueo
Un turno cuyo rango de profesional se solape con un bloqueo del profesional MUST rechazarse con `TURNO_EN_BLOQUEO` (tipo `regla_de_negocio`) (RN-AG-07). Un bloqueo adyacente (fin del bloqueo = inicio del turno, o al revés) MUST NOT bloquear.

#### Scenario: Bloqueo superpuesto
- **WHEN** hay un bloqueo `[10:00, 11:00)` y el turno ocupa `[10:30, 11:00)`
- **THEN** se rechaza con `TURNO_EN_BLOQUEO`

#### Scenario: Bloqueo adyacente
- **WHEN** hay un bloqueo `[10:00, 11:00)` y el turno empieza a las 11:00
- **THEN** la validación de bloqueo pasa

### Requirement: Cálculo de huecos disponibles
Dados un profesional, una prestación, un rango de fechas locales `[desde, hasta)`, sus franjas, feriados, bloqueos, los turnos activos relevantes, los sillones activos, la configuración y el instante actual, el dominio SHALL devolver, ordenados por inicio, todos los huecos `[inicio, inicio + duración)` que pasarían las validaciones previas y la detección de solapes, cada uno con los sillones asignables. Un hueco sin sillón asignable MUST NOT ofrecerse.

#### Scenario: Día libre completo
- **WHEN** la franja es 08:00 a 10:00, la prestación dura 30, la granularidad es 15 y no hay turnos ni bloqueos
- **THEN** los huecos empiezan 08:00, 08:15, …, 09:30 (7 huecos) y el último termina 10:00

#### Scenario: Feriado
- **WHEN** el rango incluye un feriado de la clínica
- **THEN** no se ofrecen huecos en esa fecha local

#### Scenario: Huecos en el pasado
- **WHEN** el instante actual es 09:10 del mismo día
- **THEN** no se ofrecen huecos con inicio anterior a 09:10

#### Scenario: Turno del profesional ocupa parte de la franja
- **WHEN** el profesional tiene un turno activo en `[09:00, 09:30)` y la prestación dura 30
- **THEN** no se ofrecen huecos con inicio 08:45, 09:00 ni 09:15, y sí 08:30 y 09:30

### Requirement: Sillones asignables con buffer
Un sillón SHALL ser asignable a un hueco si está activo y el rango `[inicio, fin + buffer del sillón)` no se solapa con el rango de sillón de ningún turno activo en ese sillón, sea del profesional que sea (RN-AG-02, RN-AG-05, SU-05). Esta regla MUST NOT exigir que el buffer quede dentro de la franja del profesional.

#### Scenario: Un sillón ocupado por otro profesional
- **WHEN** hay dos sillones S1 y S2 y otro profesional tiene un turno activo en S1 a la misma hora
- **THEN** el hueco se ofrece solo con S2 asignable

#### Scenario: Buffer impide el hueco siguiente
- **WHEN** hay un solo sillón con buffer 15, la prestación dura 30 y existe un turno activo en ese sillón en `[09:00, 09:30)`
- **THEN** el hueco de las 09:30 no se ofrece y el de las 09:45 sí

#### Scenario: Ningún sillón activo
- **WHEN** la clínica no tiene sillones activos
- **THEN** no se ofrece ningún hueco

### Requirement: Coherencia entre disponibilidad y validación
Todo hueco ofrecido por el cálculo de disponibilidad, reservado con cualquiera de sus sillones asignables, MUST pasar las validaciones previas y la detección de solapes con los mismos datos de entrada. Esta propiedad SHALL verificarse con pruebas basadas en propiedades.

#### Scenario: Huecos generados al azar
- **WHEN** se generan al azar franjas, feriados, bloqueos, turnos, sillones con buffer y duraciones, y se calcula la disponibilidad
- **THEN** cada hueco ofrecido es aceptado por las validaciones y no produce `TURNO_SOLAPADO_PROFESIONAL` ni `TURNO_SOLAPADO_SILLON`
