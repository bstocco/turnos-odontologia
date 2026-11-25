# cola-y-servicio-notificaciones Specification

## Purpose

Define la orquestación de encolado idempotente, la garantía de payloads estrictamente basados en identificadores conforme a la Ley 25.326, la resolución diferida de destinatario y contenido, el procesamiento con reintentos exponenciales y el ciclo de vida del worker embebido o independiente.

## Requirements

### Requirement: Payloads de cola exclusivamente con identificadores y cero PII en base de cola
Every job payload enqueued in `pg-boss` MUST contain strictly `{ clinicaId, notificacionId }` (validated UUIDs with no extra properties), rejecting any payload containing additional fields or personal data before enqueueing; recipient address and message content SHALL be resolved on demand at processing time through an application port, and persisted errors or job outputs MUST NOT contain personal patient data or secrets.

#### Scenario: Rechazo de payload con propiedades adicionales o datos personales
- **WHEN** se intenta validar o enviar a la cola un payload que incluye propiedades distintas de `clinicaId` y `notificacionId` (como `email`, `nombre`, `dni`, `asunto`, `cuerpo` o `codigo`) o UUIDs inválidos
- **THEN** la validación rechaza la carga útil con error tipado de solicitud inválida antes de interactuar con la cola

#### Scenario: Verificación de cero PII en tabla de cola, salidas y errores persistidos
- **WHEN** una notificación es encolada y procesada o falla en PostgreSQL
- **THEN** la fila en `pgboss.job` contiene exclusivamente `{ clinicaId, notificacionId }` en `data` y ningún email, nombre, DNI, teléfono ni cuerpo en `output`
- **AND** `notificacion.error` almacena únicamente códigos estables o mensajes redactados sin direcciones de correo ni datos personales

### Requirement: Encolado idempotente y aislamiento de fallos para el flujo llamador
`NotificacionService.encolar` SHALL persist the notification as `pendiente` (or return the existing notification on duplicate `(clinicaId, claveIdempotencia)`), enqueue the job with deduplication key and optional `programadaPara` deferral without invoking `EmailSender`, and guarantee (`RN-NO-03`) that any email provider failure or queue dispatch failure never throws an unhandled error that aborts the calling business flow.

#### Scenario: Encolado inicial crea notificación pendiente y trabajo diferido
- **WHEN** se invoca `NotificacionService.encolar` con `clinicaId`, `tipo`, `claveIdempotencia` y `programadaPara` opcional válidos
- **THEN** se persiste una notificación en estado `pendiente` con `intentos = 0` y se encola el trabajo correspondiente en la cola con los identificadores de clínica y notificación
- **AND** nunca se invoca al puerto `EmailSender` durante el encolado

#### Scenario: Deduplicación por clave de idempotencia dentro de la clínica
- **WHEN** se invoca `NotificacionService.encolar` dos veces con la misma `claveIdempotencia` dentro de la misma clínica
- **THEN** existe un único registro en `notificacion` y no se duplica el trabajo activo en la cola
- **AND** la segunda llamada retorna el resultado idempotente sin error

#### Scenario: Encolado programado para envío futuro
- **WHEN** se encola una notificación indicando `programadaPara` posterior al instante actual
- **THEN** la notificación persiste con esa marca temporal UTC y el trabajo en `pg-boss` queda diferido hasta dicho instante

#### Scenario: Fallo del proveedor de email o de la cola no rompe el flujo que encola
- **WHEN** ocurre un fallo al encolar el trabajo en PostgreSQL o cuando el proveedor de email falla al procesar en segundo plano
- **THEN** el caso de uso de negocio que invocó `encolar` completa normalmente sin recibir excepción por el fallo de notificación
- **AND** el incidente queda registrado en logs estructurados usando únicamente identificadores

### Requirement: Procesamiento con reintentos crecientes, idempotencia de entrega y worker dual
The queue worker and `NotificacionService.procesarTrabajo` SHALL process jobs with exponential backoff, load notifications via `withTenant`, short-circuit already-`enviada` records, resolve content and invoke `EmailSender` outside database transactions, transition states between `pendiente`, `enviada`, and `fallida` (terminating permanent failures without extra retries), and support embedded and standalone execution with graceful shutdown.

#### Scenario: Entrega exitosa actualiza estado, intentos y marca temporal UTC
- **WHEN** el worker procesa un trabajo para una notificación `pendiente` y el proveedor envía el correo sin errores
- **THEN** `EmailSender.enviar` se ejecuta fuera de una transacción abierta de PostgreSQL
- **AND** la notificación se actualiza a `estado = 'enviada'`, `intentos` incrementado, `enviada_en` con timestamp UTC y `error = null`

#### Scenario: Reintento con espera creciente tras fallo transitorio del proveedor
- **WHEN** el proveedor falla de forma transitoria (`reintentable = true`) en el primer intento y tiene éxito en un intento posterior
- **THEN** en el primer fallo la notificación incrementa `intentos`, conserva `estado = 'pendiente'`, guarda el código de error saneado y el trabajo queda programado en `pg-boss` para reintento con espera creciente (`start_after > now()`)
- **AND** tras completarse el reintento exitoso pasa a `estado = 'enviada'` habiendo entregado el correo una sola vez

#### Scenario: Agotamiento de reintentos marca la notificación como fallida
- **WHEN** los fallos transitorios agotan el límite de reintentos configurado para el trabajo
- **THEN** la notificación pasa a `estado = 'fallida'` con el último código de error saneado y el total de intentos registrados

#### Scenario: Fallo definitivo evita reintentos innecesarios y marca fallida de inmediato
- **WHEN** el proveedor falla con `reintentable = false` o la resolución determina que el destinatario ya no es elegible
- **THEN** la notificación pasa de inmediato a `estado = 'fallida'` con `error` saneado y el trabajo se cierra sin agotar reintentos adicionales

#### Scenario: Idempotencia ante reentrega cuando la notificación ya fue enviada
- **WHEN** se procesa un trabajo cuya notificación en base de datos ya tiene `estado = 'enviada'`
- **THEN** el procesador finaliza como completado sin invocar nuevamente a `EmailSender.enviar` ni incrementar `intentos`

#### Scenario: Ciclo de vida ordenado en modo embebido y standalone
- **WHEN** se inicia y detiene el worker mediante su controlador embebido o mediante el punto de entrada standalone
- **THEN** el worker comienza a consumir la cola `notificaciones.email` con el rol de la aplicación y ante detención o señal (`SIGINT`/`SIGTERM`) completa el cierre ordenado sin dejar manejadores ni conexiones abiertas
