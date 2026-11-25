# job-recordatorios-turno Specification

## Purpose

Calcula la ventana de recordatorios en la zona horaria IANA de cada clínica, escanea periódicamente los turnos próximos elegibles en forma aislada por clínica y encola un único recordatorio idempotente por turno sobre `pg-boss` bajo el rol restringido `app`.

## Requirements

### Requirement: Cálculo de ventana de recordatorio en zona horaria IANA de la clínica
The system SHALL compute the reminder lookahead window `(ahora, limiteSuperior]` strictly in the clinic's IANA timezone using `C-02` timezone primitives (without fixed UTC offsets), defaulting `anticipacionHoras` to `24` (configurable) and handling DST transitions safely so no turn inside the upcoming local window is skipped or shifts by a wrong fixed offset.

#### Scenario: Ventana normal en zona horaria IANA por defecto
- **WHEN** se calcula la ventana de recordatorio con `anticipacionHoras = 24` para una clínica en `America/Argentina/Buenos_Aires` dado un instante `ahora`
- **THEN** el límite inferior es `ahora` (exclusivo) y el límite superior es el instante equivalente en la zona IANA al día/hora local objetivo sin usar desplazamientos fijos

#### Scenario: Transición DST en zona horaria IANA con cambio de duración del día
- **WHEN** se calcula la ventana de recordatorio atravesando un cambio de horario de verano (día de 23 o 25 horas) en una zona IANA con DST, incluyendo casos donde la hora local objetivo no existe por adelanto del reloj
- **THEN** la función resuelve un instante límite válido y determinista sin lanzar excepción por hora local inexistente

#### Scenario: Exclusión de turnos cuyo inicio ya ocurrió
- **WHEN** un turno tiene `inicio <= ahora` aunque siga en estado `pendiente_confirmacion` o `confirmado`
- **THEN** el turno queda fuera del límite inferior exclusivo de la ventana `(ahora, limiteSuperior]` y no es seleccionado

### Requirement: Escaneo multi-tenant y encolado idempotente de recordatorios
The reminder scheduler SHALL iterate active clinics (`clinica.activa = true`), query each clinic isolated inside `withTenant(clinicaId)` for `pendiente_confirmacion` or `confirmado` turns inside its IANA reminder window lacking a prior `recordatorio`, enqueue at most one notification per turn via `NotificacionService.encolar` (`claveIdempotencia = "turno:<turnoId>:recordatorio"`), and isolate per-clinic failures.

#### Scenario: Un único recordatorio ante múltiples ejecuciones consecutivas del job
- **WHEN** el job de recordatorios se ejecuta varias veces mientras un turno elegible permanece dentro de la ventana de 24 horas
- **THEN** la primera ejecución crea una única fila `notificacion` de tipo `recordatorio` y encola un trabajo en `notificaciones.email`
- **AND** las ejecuciones siguientes no duplican la notificación ni el envío

#### Scenario: Exclusión de turnos cancelados, reprogramados, atendidos, ausentes y clínicas inactivas
- **WHEN** existen turnos en estado `cancelado`, `reprogramado`, `atendido` o `ausente` dentro de las próximas 24 horas, o turnos en clínicas con `activa = false`
- **THEN** ninguno de esos turnos recibe notificación de recordatorio

#### Scenario: Turno reprogramado genera recordatorio independiente para el nuevo turno
- **WHEN** un turno original pasa a `reprogramado` y se crea un nuevo turno activo dentro de las próximas 24 horas con su propio `turnoId`
- **THEN** el turno original en `reprogramado` es ignorado y el nuevo turno recibe su propio recordatorio con clave `turno:<nuevoTurnoId>:recordatorio`

#### Scenario: Aislamiento de fallos entre clínicas y ausencia de PII
- **WHEN** falla la consulta o el encolado al procesar una clínica durante el ciclo periódico
- **THEN** el incidente se registra en logs únicamente con `clinicaId` y código de error, sin datos personales
- **AND** el ciclo continúa procesando normalmente al resto de las clínicas activas

### Requirement: Programación periódica en pg-boss bajo el rol app sin DDL
The system SHALL register and consume the periodic reminder queue `notificaciones.recordatorios` with `partition: false` (no runtime DDL under role `app`), allow enabling `schedule: true` in `crearPgBossApp`, schedule a configurable cron cadence defaulting to `*/15 * * * *`, wire the turn resolver and reminder job into `worker-cli.ts` and embedded lifecycle controls, and support idempotent start and graceful stop.

#### Scenario: Registro y ejecución del schedule periódico bajo el rol app
- **WHEN** se inicia el job periódico de recordatorios conectado con `DATABASE_URL` (rol `app` sin permisos DDL)
- **THEN** crea la cola `notificaciones.recordatorios` con `partition: false`, registra la programación cron en `pgboss.schedule` sin errores de permisos (`42501`) y procesa el ciclo periódico al dispararse el trabajo

#### Scenario: Arranque y detención idempotentes en modo embebido y standalone
- **WHEN** se invoca `iniciar()` dos veces y luego `detener()` sobre el controlador del job o se cierra `worker-cli.ts`
- **THEN** el registro y consumo del job periódico no se duplican y el cierre ordenado detiene los workers sin dejar manejadores ni conexiones colgadas
