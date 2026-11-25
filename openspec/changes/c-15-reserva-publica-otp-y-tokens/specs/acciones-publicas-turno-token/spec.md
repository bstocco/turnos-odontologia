# Spec Delta — acciones-publicas-turno-token

## Purpose

Provee la emisión diferida de enlaces públicos de un solo uso para confirmación y cancelación de turnos (`ProveedorEnlacesTurno`) y el endpoint `POST /api/v1/publico/turnos/accion` que los valida y ejecuta respetando unicidad de uso, vencimiento, regla de anticipación mínima (`RN-RE-02`), aislamiento multi-tenant y trazabilidad en auditoría.

## ADDED Requirements

### Requirement: Emisión diferida de enlaces de acción de un solo uso (ProveedorEnlacesTurno)
The system SHALL implement `ProveedorEnlacesTurno` (`C-14`) for future turns (`turno.inicio > ahora`) on turn emails (`creacion`, `confirmacion`, `reprogramacion`, `recordatorio`): emitting 256-bit tokens (`C-04`), persisting only `hash_token` in `token_accion` with `vence_en = min(ahora + 48h, turno.inicio)`, returning `confirmar`/`cancelar` links per `estadoTurno`, using `PUBLIC_BASE_URL`, and never storing plaintext tokens.

#### Scenario: Emisión de enlaces según estado del turno y almacenamiento solo de hash
- **WHEN** `ResolvedorContenidoTurno` solicita enlaces para un turno futuro en estado `pendiente_confirmacion` (`tipo = 'creacion'`) y otro en estado `confirmado` (`tipo = 'confirmacion'`)
- **THEN** para el pendiente se devuelven `enlaceConfirmar` y `enlaceCancelar` con tokens de 256 bits distintos, y para el confirmado solo `enlaceCancelar`
- **AND** en `token_accion` se almacenan únicamente sus `hash_token` SHA-256 con `vence_en <= turno.inicio`

#### Scenario: Notificación de cancelación no emite tokens
- **WHEN** se procesa una notificación de tipo `cancelacion` o un turno cuyo inicio ya no es futuro
- **THEN** no se crean nuevos registros en `token_accion`

### Requirement: Validación, aislamiento y consumo atómico en POST /api/v1/publico/turnos/accion
`POST /api/v1/publico/turnos/accion` SHALL run unauthenticated under IP rate limit (`onRequest`) and `Cache-Control: no-store`, resolve `clinica_id` via `resolver_clinica_por_hash_token`, lock `token_accion FOR UPDATE` in `withTenant`, validate via `C-04` (`validarTokenAccion`), reject invalid/used/expired/mismatched/inactive tokens uniformly with `404 TOKEN_ACCION_INVALIDO`, and consume `usado_en` atomically.

#### Scenario: Rechazo uniforme 404 para token inexistente, usado, vencido, propósito cruzado o clínica inactiva
- **WHEN** se invoca `POST /api/v1/publico/turnos/accion` con un token inexistente, uno ya usado, uno vencido (`ahora >= vence_en`), uno de `confirmar` enviado con `accion: 'cancelar'`, o uno de una clínica inactiva
- **THEN** todos los casos responden `404` con el mismo código `TOKEN_ACCION_INVALIDO` y cuerpo indistinguible

#### Scenario: Concurrencia con el mismo token
- **WHEN** dos solicitudes concurrentes envían exactamente el mismo token válido de acción
- **THEN** exactamente una solicitud ejecuta la acción (`200`) marcando `usado_en` y la otra responde `404` `TOKEN_ACCION_INVALIDO`

### Requirement: Confirmación online de turno por token
When executing `confirmar` with a valid token, `POST /api/v1/publico/turnos/accion` SHALL transition `pendiente_confirmacion` to `confirmado`, set `usado_en = ahora`, audit fail-closed (`paciente_enlace`), publish `{ tipo: 'confirmado', turnoId }` post-commit fail-open, and return `200` (`{ turnoId, accion, estado, inicio, fin }`) without PII, or reject `422 TRANSICION_TURNO_INVALIDA` if disallowed.

#### Scenario: Confirmación exitosa por enlace de un solo uso
- **WHEN** se invoca `POST /api/v1/publico/turnos/accion` con un token vigente de propósito `confirmar` sobre un turno `pendiente_confirmacion`
- **THEN** el turno pasa a `confirmado`, el token queda con `usado_en` poblado, se registra auditoría con `actor_tipo = 'paciente_enlace'` y se responde `200` sin datos personales

#### Scenario: Confirmación sobre turno ya cancelado
- **WHEN** se invoca la confirmación por token sobre un turno que ya fue cancelado por recepción
- **THEN** la API responde `422` `TRANSICION_TURNO_INVALIDA` sin cambiar el estado `cancelado`

### Requirement: Cancelación online con anticipación mínima configurable (RN-RE-02)
When executing `cancelar` with a valid token, `POST /api/v1/publico/turnos/accion` SHALL enforce `turno.inicio - ahora >= clinica_config.cancelacion_anticipacion_horas` (default 24h): if insufficient, reject `409 CANCELACION_FUERA_DE_PLAZO` instructing to contact the clinic without consuming the token; if met, transition to `cancelado`, set `usado_en`, audit fail-closed, publish post-commit fail-open, and return `200` without PII.

#### Scenario: Cancelación aceptada en el límite exacto o superior de 24 horas y liberación inmediata del hueco
- **WHEN** faltan exactamente 24 horas (o más, según `clinica_config.cancelacion_anticipacion_horas`) para el inicio del turno y se invoca `POST /api/v1/publico/turnos/accion` con un token de `cancelar`
- **THEN** el turno pasa a `cancelado`, el token queda marcado como usado, la disponibilidad pública vuelve a ofrecer el horario inmediatamente y la respuesta es `200`

#### Scenario: Cancelación rechazada con menos de 24 horas sin quemar el token
- **WHEN** faltan 23 horas y 59 minutos para el inicio (o menos de `cancelacion_anticipacion_horas` configurado en la clínica) y se invoca la cancelación por token
- **THEN** la API responde `409` con código `CANCELACION_FUERA_DE_PLAZO` y un mensaje indicando contactar a la clínica
- **AND** el turno permanece en su estado original y el token conserva `usado_en IS NULL`
