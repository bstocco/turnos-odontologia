# Proposal

## Why

La base de notificaciones y cola durable (`C-11`) y el ciclo de vida de turnos (`C-09`) ya están integrados en `main`, pero todavía no existe el conector de dominio que convierta los eventos de turnos y la proximidad de citas en correos automáticos enviados al paciente (`RN-NO-01`, `RN-NO-03`, `US-050`, `Flujo 7`, `SU-08`). `C-14` cierra ese circuito conectando `TurnoEventPublisher`, las plantillas en español con zona horaria IANA (`C-04`) y el worker `pg-boss` de `C-11`, además de completar la clave foránea pendiente `notificacion.turno_id -> turno(id)` diferida desde `C-11`.

## What Changes

- **Integridad referencial diferida (`notificacion` → `turno`)**: agregar migración `migrations/C14_001_notificacion_turno_fk.sql` con restricción única compuesta `(clinica_id, id)` en `turno` y clave foránea compuesta `(clinica_id, turno_id) -> turno (clinica_id, id)` en `notificacion`, preservando `turno_id IS NULL` para notificaciones de tipo `codigo` (`MATCH SIMPLE`), y adaptar los 3 fixtures de integración de `C-11` que generaban `turnoId` aleatorios sin fila en `turno`.
- **Suscriptor de eventos de turno sobre `TurnoEventPublisher`**: implementar el suscriptor por clínica en `src/application/notificaciones/turnos/` que mapea los 4 eventos (`creado` → `creacion`, `confirmado` → `confirmacion`, `cancelado` → `cancelacion`, `reprogramado` → `reprogramacion`) hacia `NotificacionService.encolar` con claves de idempotencia deterministas `turno:<turnoId>:<tipo>` y comportamiento *fail-open* ante fallos de cola/email (`RN-NO-03`), sin alterar el contrato congelado `TurnoEventPublisher`.
- **Resolución diferida de contenido para turnos sin PII en cola**: implementar `ResolvedorContenidoEmail` para tipos de turno y su lector SQL por tenant (`withTenant`), resolviendo al vuelo turno, turno anterior (para `reprogramacion`), paciente, profesional, prestación y clínica, formateando fechas/horas con `C-04` en la zona horaria IANA de la clínica, soportando un puerto opcional `ProveedorEnlacesTurno` (preparado para `C-15`) y descartando defensivamente entregas inválidas (turno cancelado/reprogramado/ya iniciado o paciente sin email).
- **Cálculo puro de ventana de recordatorio y planificador multi-tenant**: implementar cálculo puro de la ventana de recordatorio (24 horas por defecto, parametrizable) en la zona horaria IANA de cada clínica usando las primitivas de `C-02` (con manejo seguro de transiciones DST) y un planificador que recorre las clínicas activas, consulta cada una aisladamente dentro de `withTenant(clinicaId)` buscando turnos `pendiente_confirmacion` o `confirmado` sin recordatorio previo y encola exactamente **un** recordatorio idempotente por turno (`turno:<turnoId>:recordatorio`).
- **Job periódico en `pg-boss` bajo rol `app`**: registrar la cola `notificaciones.recordatorios` (`partition: false`, sin DDL en runtime), habilitar programación cron configurable (`*/15 * * * *` por defecto) en `crearPgBossApp` mediante opción `schedule?: boolean`, e integrar el resolvedor de turnos y el job periódico en el ciclo de vida del worker (`worker-cli.ts` y fábrica embebida).
- **Cableado retrocompatible de `TurnoEventPublisher` (sujeto a aprobación en `Q2`)**: inyectar opcionalmente `publicador: TurnoEventPublisher = turnoEventPublisherNulo()` en los casos de uso de `src/application/turnos/` para disparar notificaciones al crear, confirmar, cancelar o reprogramar turnos.
- **Fuera de alcance**: generación/validación de tokens de acción de un solo uso y códigos OTP (`C-15`), enlaces manuales de WhatsApp (`C-12`), nuevas columnas en `clinica_config` o nuevas variables en `src/config/variables.ts`, cambios al contrato congelado `TurnoEventPublisher` o `RequestContext`, y pruebas E2E HTTP globales (`C-18`).

## Capabilities

### New Capabilities
- `suscriptor-notificaciones-turno`: Suscripción a eventos de ciclo de vida de turnos (`TurnoEventPublisher`), encolado idempotente aislado ante fallos y resolución diferida de plantillas de correo en español con zona horaria IANA sin PII en cola.
- `job-recordatorios-turno`: Cálculo puro de ventana de recordatorio en zona horaria IANA de la clínica, escaneo multi-tenant idempotente de turnos próximos y ejecución periódica programada sobre `pg-boss` bajo el rol restringido `app`.

### Modified Capabilities
- `esquema-notificacion-y-cola`: Incorporación de la clave foránea compuesta multi-tenant `(clinica_id, turno_id) -> turno (clinica_id, id)` sobre `notificacion` (diferida en `C-11` hasta la fusión de `C-09`), manteniendo `turno_id` nulo para `tipo = 'codigo'`.

## Impact

- **Zona principal de `C-14`**: `src/application/notificaciones/turnos/**`, `src/infrastructure/queue/jobs/**`, `test/unit/notificaciones/**`, `test/integration/notificaciones/**`.
- **Migraciones**: `migrations/C14_001_notificacion_turno_fk.sql` (sobre `turno` y `notificacion`).
- **Extensiones puntuales sobre infraestructura de `C-11`**: `src/infrastructure/queue/cola-pg-boss.ts`, `src/infrastructure/queue/worker-cli.ts`, `src/infrastructure/queue/index.ts`.
- **Puntos sujetos a revisión del Líder (`Q1`–`Q2`)**: ajuste de 3 fixtures en `test/integration/notificaciones/{cola-y-worker,repositorio-pg}.test.ts` tras la FK compuesta, y cableado opcional de `TurnoEventPublisher` en `src/application/turnos/{agendar,confirmar,cancelar,reprogramar}-turno.ts` (y eventualmente `src/interfaces/http/modules/turnos/index.ts`).
- **Contratos congelados preservados**: `RequestContext`, `TurnoEventPublisher` / `EventoDeTurno` (`src/domain/turno/turno-eventos.ts`) y puertos de dominio existentes sin modificaciones rompientes.
