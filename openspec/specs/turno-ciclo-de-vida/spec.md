# turno-ciclo-de-vida Specification

## Purpose

Define la entidad turno, sus estados, las transiciones permitidas entre ellos y qué estados ocupan la agenda, como reglas puras reutilizables por los casos de uso (RN-TU-01, RN-TU-04, RN-AG-09).

## Requirements

### Requirement: Estados del turno
Un turno SHALL estar siempre en exactamente uno de estos estados: `pendiente_confirmacion`, `confirmado`, `cancelado`, `reprogramado`, `atendido`, `ausente`. Un valor fuera de esa lista MUST rechazarse con `ESTADO_TURNO_INVALIDO` (tipo `solicitud_invalida`).

#### Scenario: Estado desconocido
- **WHEN** se reconstruye un turno con estado `en_curso`
- **THEN** se rechaza con `ESTADO_TURNO_INVALIDO`

### Requirement: Turno activo
Un turno SHALL considerarse activo, y por lo tanto ocupar al profesional y al sillón, si su estado es `pendiente_confirmacion`, `confirmado`, `atendido` o `ausente`. Los estados `cancelado` y `reprogramado` MUST NOT ocupar la agenda (RN-AG-09, RN-TU-03).

#### Scenario: Estados que liberan
- **WHEN** se consulta si un turno `cancelado` o `reprogramado` está activo
- **THEN** la respuesta es no

#### Scenario: Estados que ocupan
- **WHEN** se consulta si un turno `atendido` o `ausente` está activo
- **THEN** la respuesta es sí

### Requirement: Creación de un turno
Un turno nuevo SHALL crearse con `fin = inicio + duración de la prestación`, `fin_sillon = fin + buffer` (buffer copiado del sillón), un origen `recepcion` o `enlace_web` y un estado inicial `pendiente_confirmacion` o `confirmado` (RN-AG-04, RN-AG-05). Cambiar después el buffer del sillón MUST NOT alterar un turno ya creado.

#### Scenario: Turno con buffer copiado
- **WHEN** se crea un turno a las 09:00 con prestación de 45 minutos y un sillón con buffer 15
- **THEN** el turno queda con `fin` 09:45, `buffer_minutos` 15 y `fin_sillon` 10:00

#### Scenario: Estado inicial no permitido
- **WHEN** se intenta crear un turno directamente en `atendido`
- **THEN** se rechaza con `ESTADO_TURNO_INVALIDO`

### Requirement: Transiciones permitidas
Las transiciones SHALL ser exactamente las de RN-TU-01: `pendiente_confirmacion` → `confirmado`, `cancelado`, `reprogramado`; `confirmado` → `cancelado`, `reprogramado`, `atendido`, `ausente`. `atendido`, `ausente`, `cancelado` y `reprogramado` son finales. Cualquier otra transición, incluida la de un estado a sí mismo, MUST rechazarse con `TRANSICION_TURNO_INVALIDA` (tipo `regla_de_negocio`). Una transición válida MUST devolver un turno nuevo sin modificar el original.

#### Scenario: Confirmar un turno pendiente
- **WHEN** un turno `pendiente_confirmacion` pasa a `confirmado`
- **THEN** se obtiene un turno en `confirmado` y el original sigue en `pendiente_confirmacion`

#### Scenario: Salir de un estado final
- **WHEN** un turno `cancelado` intenta pasar a `confirmado`
- **THEN** se rechaza con `TRANSICION_TURNO_INVALIDA`

#### Scenario: Atender sin confirmar
- **WHEN** un turno `pendiente_confirmacion` intenta pasar a `atendido`
- **THEN** se rechaza con `TRANSICION_TURNO_INVALIDA`

#### Scenario: Tabla completa
- **WHEN** se evalúan los 36 pares (desde, hacia) posibles
- **THEN** exactamente los 7 pares de RN-TU-01 son aceptados

### Requirement: Atendido o ausente solo desde el inicio
Un turno MUST NOT pasar a `atendido` ni a `ausente` si el instante actual es anterior a su `inicio`; en ese caso SHALL rechazarse con `TURNO_AUN_NO_INICIADO` (tipo `regla_de_negocio`) (RN-TU-04). El instante actual MUST recibirse como parámetro; el dominio no lee el reloj.

#### Scenario: Marcar ausente antes de la hora
- **WHEN** un turno confirmado de las 10:00 se marca `ausente` a las 09:59
- **THEN** se rechaza con `TURNO_AUN_NO_INICIADO`

#### Scenario: Marcar atendido justo a la hora
- **WHEN** un turno confirmado de las 10:00 se marca `atendido` a las 10:00
- **THEN** la transición se acepta
