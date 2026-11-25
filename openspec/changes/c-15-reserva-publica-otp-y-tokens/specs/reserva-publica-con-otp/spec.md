# Spec Delta — reserva-publica-con-otp

## Purpose

Habilita al paciente sin cuenta solicitar un código de verificación por email y crear una reserva pública en la clínica elegida, garantizando validación OTP con persistencia de intentos fallidos, control anti-abuso (límite de tasa por IP y por email y tope `PO-09` de 2 reservas activas), alta/reutilización segura de paciente, asignación automática de sillón libre, estado inicial configurable, auditoría y notificación.

## ADDED Requirements

### Requirement: Rutas públicas de reserva sin sesión y cabeceras de caché
`POST /api/v1/publico/{slug}/codigo` and `POST /api/v1/publico/{slug}/reservas` SHALL operate without authentication (ignoring any `Authorization` header), MUST set `Cache-Control: no-store` on all responses, and MUST respond `404 RECURSO_NO_ENCONTRADO` with identical body for malformed, nonexistent, or inactive clinic slugs and inactive or foreign professionals or services.

#### Scenario: Acceso sin token ni revelación de clínicas inactivas
- **WHEN** se invoca `POST /api/v1/publico/{slug}/codigo` o `POST /api/v1/publico/{slug}/reservas` con `Authorization: Bearer invalido` sobre un slug inexistente y sobre el slug de una clínica inactiva
- **THEN** ambos pedidos responden `404` con código `RECURSO_NO_ENCONTRADO`, cuerpo idéntico y encabezado `Cache-Control: no-store`

### Requirement: Límite de tasa anti-abuso por IP y por email
Public OTP request and reservation endpoints SHALL enforce a per-IP rate limit in `onRequest` before validating the payload or touching the database (`429 DEMASIADOS_PEDIDOS` with `retry-after`, bounded LRU store) and a per-normalized-email rate limit on bounded memory (`429 DEMASIADOS_PEDIDOS` with `retry-after`) so distributed requests targeting the same email are also throttled.

#### Scenario: Exceso de pedidos por IP rechazado antes de tocar la base
- **WHEN** una misma IP supera el cupo configurado en `/publico/{slug}/codigo` o `/publico/{slug}/reservas`
- **THEN** la API responde `429` con código `DEMASIADOS_PEDIDOS` y encabezado `retry-after` sin ejecutar consultas a la base

#### Scenario: Exceso de pedidos por email desde distintas IPs
- **WHEN** múltiples IPs distintas solicitan códigos OTP o envían reservas para el mismo email normalizado superando el cupo por email
- **THEN** los pedidos excedentes reciben `429` `DEMASIADOS_PEDIDOS` sin afectar a otros emails ni agotar memoria no acotada

### Requirement: Solicitud de código de verificación por email
`POST /api/v1/publico/{slug}/codigo` SHALL normalize email, invalidate prior unconsumed OTPs for `(clinica_id, email)`, emit a 6-digit OTP (`C-04`), persist only `hash_codigo`, trace `notificacion` (`tipo = 'codigo'`, `turno_id = NULL`), send via `EmailSender` outside DB transactions with `plantillaCodigoVerificacion` without plaintext OTP or PII in `pg-boss` or logs, update `notificacion`, and return `202` without returning the OTP or email.

#### Scenario: Emisión y envío exitoso del código OTP
- **WHEN** se envía `POST /api/v1/publico/{slug}/codigo` con un email válido para una clínica activa
- **THEN** se persiste únicamente `hash_codigo` en `codigo_verificacion` y una fila `notificacion` (`tipo = 'codigo'`, `turno_id = NULL`, `estado = 'enviada'`)
- **AND** el `EmailSender` recibe el mensaje generado con `plantillaCodigoVerificacion` que contiene el código de 6 dígitos
- **AND** la API responde `202` sin incluir el código ni el email en el cuerpo ni en los logs

#### Scenario: Nueva solicitud invalida códigos previos sin consumir
- **WHEN** el mismo email solicita un segundo código OTP antes de consumir el primero
- **THEN** el código anterior deja de ser utilizable y solo el último código emitido puede verificar la reserva

#### Scenario: Fallo del proveedor de email no expone el código ni PII
- **WHEN** `EmailSender.enviar` falla al procesar una solicitud de código OTP
- **THEN** la fila `notificacion` queda marcada `fallida` con un código de error saneado sin datos personales ni el código en claro

### Requirement: Validación estricta de OTP con persistencia de intentos fallidos
`POST /api/v1/publico/{slug}/reservas` SHALL lock the latest OTP row `FOR UPDATE` and validate via `C-04`: wrong codes MUST commit incremented `intentos` before returning `422 CODIGO_VERIFICACION_INVALIDO`; exhausted (`CODIGO_VERIFICACION_AGOTADO`), expired (`CODIGO_VERIFICACION_VENCIDO`), consumed (`CODIGO_VERIFICACION_USADO`), or missing codes MUST reject `422` without side effects; valid codes MUST consume `consumido_en` atomically inside the reservation transaction.

#### Scenario: Código incorrecto persiste intentos y el quinto fallo agota el código
- **WHEN** se intenta reservar con un código incorrecto 5 veces consecutivas para un OTP vigente
- **THEN** cada uno de los primeros intentos responde `422` `CODIGO_VERIFICACION_INVALIDO` incrementando persistentemente `intentos` en base
- **AND** en el quinto fallo o posteriores intentos (incluso con el código correcto) responde `422` `CODIGO_VERIFICACION_AGOTADO`

#### Scenario: Código vencido o ya consumido rechazado
- **WHEN** se intenta reservar con un código con `ahora >= vence_en` o ya consumido por una reserva previa
- **THEN** la API responde `422` con código `CODIGO_VERIFICACION_VENCIDO` o `CODIGO_VERIFICACION_USADO` sin crear el turno

#### Scenario: Conflicto 409 en la reserva no quema un código válido
- **WHEN** se envía un código válido pero el turno falla con `409` por ocupación concurrente del hueco
- **THEN** la transacción se revierte manteniendo `consumido_en IS NULL` en `codigo_verificacion`

### Requirement: Tope de reservas públicas activas por paciente (PO-09)
`POST /api/v1/publico/{slug}/reservas` SHALL enforce a maximum of 2 simultaneous active public turns (`origen = 'enlace_web'`, `estado IN ('pendiente_confirmacion', 'confirmado')`, `inicio > ahora`) per clinic by either normalized DNI or normalized email, serializing concurrent reservations for the same identity via deterministic `pg_advisory_xact_lock`, and rejecting any third active reservation with `422 TOPE_RESERVAS_ACTIVAS_ALCANZADO`.

#### Scenario: Límite de dos reservas activas por mismo DNI o email
- **WHEN** un paciente ya posee 2 reservas públicas activas futuras en la clínica e intenta crear una tercera (con igual DNI o igual email)
- **THEN** la API rechaza la tercera solicitud con `422` `TOPE_RESERVAS_ACTIVAS_ALCANZADO` y no crea el turno

#### Scenario: Cancelar una reserva habilita una nueva y el tope es por clínica
- **WHEN** una de las 2 reservas activas pasa a `cancelado` (o las 2 existen en la clínica B) y el paciente reserva en la clínica A
- **THEN** la reserva se permite dentro de la clínica A

### Requirement: Alta o reutilización de paciente por DNI sin exposición (RN-RE-04)
`POST /api/v1/publico/{slug}/reservas` SHALL normalize DNI (7-8 digits), phone (`+549...`, `RN-PA-03`), and email; create a new `paciente` audited with `actor_tipo = 'paciente_enlace'` if none exists for that DNI in the clinic; or reuse the existing `paciente.id` without overwriting existing fields (filling `email` only if previously `NULL`, audited) and MUST NEVER return patient personal fields or whether the DNI pre-existed in the HTTP response.

#### Scenario: Paciente existente reutilizado sin sobrescribir ni exponer datos
- **WHEN** ya existe un paciente con DNI `30123456` en la clínica con teléfono y obra social cargados, y se realiza una reserva pública con ese DNI y otros datos de contacto
- **THEN** el turno se asocia al `paciente.id` existente sin modificar su nombre, apellido, teléfono ni obra social
- **AND** la respuesta `201` no contiene DNI, teléfono, email, nombre ni indicación de preexistencia

#### Scenario: Paciente nuevo creado y auditado bajo actor paciente_enlace
- **WHEN** se realiza una reserva pública con un DNI inexistente en la clínica
- **THEN** se crea la ficha en `paciente` con teléfono normalizado internacional (`+549...`) y se registra la creación en `auditoria` con `actor_tipo = 'paciente_enlace'`

### Requirement: Asignación automática de sillón, estado inicial, concurrencia y notificaciones
`POST /api/v1/publico/{slug}/reservas` SHALL validate active `profesional` and `prestacion` (`404`), agenda rules (`422`), and assignable chairs (`RN-RE-03`), retry chair insertion via `SAVEPOINT` on `23P01`, translate `23P01`/`40P01` to `409`, set initial status from `reserva_requiere_confirmacion` (`RN-RE-01`), audit fail-closed (`paciente_enlace`), publish `{ tipo: 'creado', turnoId }` post-commit fail-open, and return `201` without `sillonId` or PII.

#### Scenario: Estado inicial según reserva_requiere_confirmacion de la clínica
- **WHEN** una clínica tiene `reserva_requiere_confirmacion = true` y otra tiene `reserva_requiere_confirmacion = false`, y en ambas se realiza una reserva pública válida
- **THEN** el turno se crea en estado `pendiente_confirmacion` en la primera y en `confirmado` en la segunda

#### Scenario: Asignación automática del segundo sillón libre y concurrencia 201 vs 409
- **WHEN** existen dos sillones activos y el primer sillón está ocupado por otro turno (o por su buffer), o cuando dos solicitudes concurrentes reservan el último sillón disponible en el mismo horario
- **THEN** en el primer caso la reserva se asigna automáticamente al segundo sillón y responde `201`
- **AND** en el caso concurrente sobre el último sillón exactamente una solicitud responde `201` y la otra responde `409` (`TURNO_SOLAPADO_PROFESIONAL` o `TURNO_SOLAPADO_SILLON`)

#### Scenario: Fallo de cola o email no impide confirmar la reserva 201
- **WHEN** la publicación del evento `{ tipo: 'creado', turnoId }` falla por error de cola o proveedor de correo
- **THEN** el turno y su auditoría permanecen persistidos y la API responde `201`
