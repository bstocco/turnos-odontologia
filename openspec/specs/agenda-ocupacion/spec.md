# agenda-ocupacion Specification

## Purpose

Define cómo se representan los intervalos de tiempo de la agenda y cuánto ocupa un turno al profesional y al sillón, para detectar solapamientos sin depender de la base de datos (RN-AG-01 a RN-AG-05, RN-AG-09).

## Requirements

### Requirement: Intervalo semiabierto
Todo intervalo de agenda SHALL ser semiabierto `[inicio, fin)`: incluye su inicio y excluye su fin. Un intervalo con `fin <= inicio` MUST rechazarse con el error de dominio `INTERVALO_INVALIDO` (tipo `solicitud_invalida`). Un intervalo creado MUST ser inmutable (RN-AG-03).

#### Scenario: Intervalo válido
- **WHEN** se crea un intervalo de 09:00 a 09:30 UTC
- **THEN** se obtiene un intervalo con esos extremos que no puede modificarse

#### Scenario: Intervalo vacío o invertido
- **WHEN** se crea un intervalo con `fin` igual o anterior a `inicio`
- **THEN** se rechaza con `INTERVALO_INVALIDO`

### Requirement: Solapamiento, contención y adyacencia
Dos intervalos SHALL solaparse si y solo si `a.inicio < b.fin` y `b.inicio < a.fin`. Un intervalo SHALL ser adyacente a otro cuando el fin de uno es igual al inicio del otro; dos intervalos adyacentes MUST NOT solaparse (RN-AG-03). Un intervalo SHALL contener a otro cuando `externo.inicio <= interno.inicio` y `interno.fin <= externo.fin`. Las tres relaciones MUST ser simétricas donde corresponda (solape, adyacencia).

#### Scenario: Turno que termina cuando empieza otro
- **WHEN** se comparan `[09:00, 10:00)` y `[10:00, 10:30)`
- **THEN** no se solapan y son adyacentes

#### Scenario: Solape parcial
- **WHEN** se comparan `[09:00, 10:00)` y `[09:45, 10:15)`
- **THEN** se solapan, en cualquier orden de comparación

#### Scenario: Contención con extremos iguales
- **WHEN** se pregunta si `[08:00, 12:00)` contiene a `[11:30, 12:00)`
- **THEN** la respuesta es sí
- **AND** `[08:00, 12:00)` no contiene a `[11:30, 12:15)`

### Requirement: Ocupación del profesional y del sillón
La ocupación de un turno SHALL calcularse como: rango del profesional `[inicio, fin)` con `fin = inicio + duración de la prestación` (RN-AG-04), y rango del sillón `[inicio, fin + buffer)` con el buffer copiado del sillón al reservar (RN-AG-05). El buffer MUST ser un entero de minutos `>= 0` y MUST NOT extender el rango del profesional (RN-AG-02).

#### Scenario: Buffer cero
- **WHEN** un turno empieza 09:00 con una prestación de 30 minutos en un sillón con buffer 0
- **THEN** el rango del profesional y el del sillón son ambos `[09:00, 09:30)`

#### Scenario: Buffer positivo
- **WHEN** un turno empieza 09:00 con una prestación de 30 minutos en un sillón con buffer 10
- **THEN** el rango del profesional es `[09:00, 09:30)` y el del sillón `[09:00, 09:40)`

#### Scenario: Buffer o duración inválidos
- **WHEN** la duración no es un entero positivo o el buffer es negativo o no entero
- **THEN** el cálculo se rechaza con `OCUPACION_INVALIDA` (tipo `solicitud_invalida`)

### Requirement: Detección de solape de profesional
Dado un turno candidato y un conjunto de turnos existentes, el dominio SHALL rechazar el candidato con `TURNO_SOLAPADO_PROFESIONAL` (tipo `conflicto`) si su rango de profesional se solapa con el de algún turno **activo** del mismo profesional (RN-AG-01, RN-AG-09). Los turnos `cancelado` y `reprogramado` MUST ignorarse.

#### Scenario: Mismo profesional, horario superpuesto
- **WHEN** existe un turno confirmado del profesional P en `[09:00, 09:30)` y se evalúa otro de P en `[09:15, 09:45)` en otro sillón
- **THEN** se rechaza con `TURNO_SOLAPADO_PROFESIONAL`

#### Scenario: Turno existente cancelado
- **WHEN** el único turno de P en `[09:00, 09:30)` está `cancelado` y se evalúa otro de P en el mismo horario
- **THEN** no hay conflicto

#### Scenario: Buffer no bloquea al profesional
- **WHEN** existe un turno de P en `[09:00, 09:30)` en un sillón con buffer 15 y se evalúa otro de P a las 09:30 en un sillón distinto
- **THEN** no hay conflicto

### Requirement: Detección de solape de sillón
El dominio SHALL rechazar un candidato con `TURNO_SOLAPADO_SILLON` (tipo `conflicto`) si su rango de sillón se solapa con el rango de sillón de algún turno activo en el mismo sillón, sin importar el profesional (RN-AG-02, RN-AG-09). Si hay solape de profesional y de sillón a la vez, MUST informarse primero el del profesional.

#### Scenario: Buffer ocupa el sillón
- **WHEN** existe un turno activo en el sillón S en `[09:00, 09:30)` con buffer 10 y se evalúa otro en S a las 09:30
- **THEN** se rechaza con `TURNO_SOLAPADO_SILLON`

#### Scenario: Sillón libre al terminar el buffer
- **WHEN** existe un turno activo en S en `[09:00, 09:30)` con buffer 10 y se evalúa otro en S a las 09:40
- **THEN** no hay conflicto

#### Scenario: Ambos conflictos
- **WHEN** el candidato choca con un turno del mismo profesional y del mismo sillón
- **THEN** se rechaza con `TURNO_SOLAPADO_PROFESIONAL`

### Requirement: Invariante de no solapamiento
Para cualquier secuencia de turnos candidatos, el conjunto de turnos aceptados uno a uno por la detección de solapes MUST NOT contener dos turnos activos que compartan profesional con rangos de profesional solapados, ni dos que compartan sillón con rangos de sillón solapados. Esta propiedad SHALL verificarse con pruebas basadas en propiedades.

#### Scenario: Secuencia arbitraria de candidatos
- **WHEN** se procesan candidatos generados al azar (profesionales, sillones, inicios, duraciones y buffers arbitrarios, incluidos bordes `fin = inicio` y buffer 0)
- **THEN** ningún par de turnos aceptados viola RN-AG-01 ni RN-AG-02
