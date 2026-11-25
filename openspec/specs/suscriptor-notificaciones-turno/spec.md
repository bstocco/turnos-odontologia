# suscriptor-notificaciones-turno Specification

## Purpose

Conecta los eventos de dominio del ciclo de vida de turnos (`TurnoEventPublisher`) con el encolado idempotente y aislado de notificaciones (`NotificacionService`) y resuelve de forma diferida y sin PII en cola el contenido en español formateado en la zona horaria IANA de la clínica.

## Requirements

### Requirement: Suscriptor de eventos de turno sobre TurnoEventPublisher
The system SHALL provide a tenant-scoped subscriber implementing the frozen `TurnoEventPublisher` port that maps every `EventoDeTurno` (`creado` → `creacion`, `confirmado` → `confirmacion`, `cancelado` → `cancelacion`, `reprogramado` → `reprogramacion`) to `NotificacionService.encolar` with deterministic idempotency keys `turno:<turnoId>:<tipo>` and guarantees (`RN-NO-03`) that queue or notification persistence failures never throw or abort the calling turn operation and never log patient PII.

#### Scenario: Encolado de los cuatro eventos de ciclo de vida de turno
- **WHEN** se publica un `EventoDeTurno` con tipo `creado`, `confirmado`, `cancelado` o `reprogramado` sobre el suscriptor de una clínica
- **THEN** el suscriptor invoca `NotificacionService.encolar` con el `clinicaId` del suscriptor, el `turnoId` del evento, el `tipo` de notificación correspondiente y `claveIdempotencia` igual a `turno:<turnoId>:<tipo>`

#### Scenario: Deduplicación idempotente ante publicación repetida del mismo evento
- **WHEN** se publica dos veces el mismo `EventoDeTurno` para igual `clinicaId` y `turnoId`
- **THEN** se registra una única notificación y no se duplica el trabajo en la cola

#### Scenario: Fallo al encolar o persistir no afecta la operación del turno ni expone PII
- **WHEN** `NotificacionService.encolar` devuelve `no_encolada` o el almacenamiento/cola falla al publicar un evento de turno
- **THEN** `publicar(evento)` completa sin lanzar excepción hacia el caso de uso llamador
- **AND** el incidente se registra en logs estructurados usando únicamente identificadores (`clinicaId`, `turnoId`, `tipo`, código de error), sin datos personales del paciente

### Requirement: Resolución diferida de contenido de turno con plantillas IANA y cero PII en cola
The system SHALL implement `ResolvedorContenidoEmail` for turn notifications (`creacion`, `confirmacion`, `cancelacion`, `reprogramacion`, `recordatorio`), resolving all entities inside `withTenant(clinicaId)` at delivery time, formatting via `C-04` templates in `clinica.zona_horaria`, supporting optional `ProveedorEnlacesTurno`, enforcing tenant isolation, and discarding ineligible turns or missing emails without extra retries.

#### Scenario: Resolución de plantillas en español usando la zona horaria IANA de la clínica
- **WHEN** el worker procesa una notificación de tipo `creacion`, `confirmacion`, `cancelacion`, `reprogramacion` o `recordatorio` asociada a un turno válido con paciente con email
- **THEN** el resolvedor consulta los datos dentro de `withTenant(clinicaId)`, construye el correo con la plantilla correspondiente de `C-04` formateada en `clinica.zona_horaria` (incluyendo `inicioAnterior` desde `reprogramado_de` en `reprogramacion`) y adjunta los enlaces provistos por `ProveedorEnlacesTurno` si está configurado
- **AND** ningún email, nombre, DNI ni cuerpo de mensaje se almacena en `pgboss.job.data`

#### Scenario: Descarte defensivo cuando el turno fue cancelado, reprogramado o ya pasó su inicio
- **WHEN** el worker procesa un `recordatorio` y el turno en base ya está en estado `cancelado`, `reprogramado`, `atendido` o `ausente`, o su `inicio` ya es anterior o igual al instante actual, o bien procesa `creacion`/`confirmacion` de un turno ya `cancelado` o `reprogramado`
- **THEN** el resolvedor retorna `{ estado: 'descartar', codigo: ... }` sin invocar `EmailSender.enviar`
- **AND** la notificación queda marcada como `fallida` sin consumir reintentos adicionales

#### Scenario: Descarte defensivo cuando el paciente no tiene email válido
- **WHEN** el paciente asociado al turno tiene `email` nulo o vacío al momento del procesamiento
- **THEN** el resolvedor retorna `{ estado: 'descartar', codigo: 'PACIENTE_SIN_EMAIL' }` sin invocar `EmailSender.enviar` ni exponer PII en logs o en `notificacion.error`

#### Scenario: Aislamiento multi-tenant en la resolución de contenido
- **WHEN** se resuelve una notificación para la clínica A cuyo `turno_id` no existe en la clínica A (o pertenece a la clínica B)
- **THEN** el lector bajo `withTenant(clinicaA)` no accede a datos de la clínica B y retorna descarte con código estable sin revelar existencia del recurso ajeno
