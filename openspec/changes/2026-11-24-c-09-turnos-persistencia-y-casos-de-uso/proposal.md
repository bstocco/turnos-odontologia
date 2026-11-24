# Proposal

## Why

C-09 `turnos-persistencia-y-casos-de-uso` persiste los turnos y los casos de uso de agenda, sin HTTP. Sin él no existe ninguna tabla `turno` en el modelo y ningún caso de uso de agenda; es el change `CRITICO` y depende de C-02 (puertos), C-05 (datos de la clínica), C-06 (auth personal) y C-07 (auditoría).

## What Changes

- Migración `C09_001`: tabla `turno` con `fin_sillon` como columna común más `CHECK` de coherencia con `buffer_minutos`, `rango_profesional` y `rango_sillon`; constraints de exclusión por profesional y por sillón (`WHERE estado NOT IN ('cancelado','reprogramado')`), índices y `aplicar_rls`.
- Repositorio y `AgendaReader` (consultas de ocupación) que implementan los puertos de C-02.
- Casos de uso: `agendarTurno`, `reprogramarTurno` (una transacción, RN-TU-02), `cancelarTurno`, `confirmarTurno`, `marcarAtendido`, `marcarAusente`; validan con el dominio y traducen los errores `23P01` y `40P01` a `TURNO_SOLAPADO_PROFESIONAL`/`TURNO_SOLAPADO_SILLON` (409).
- Asignación automática de sillón libre con reintento ante concurrencia (RN-RE-03).
- Puerto `TurnoEventPublisher` con eventos de dominio (creado, confirmado, cancelado, reprogramado); implementación nula por defecto, que consume C-14.
- Auditoría en cada caso de uso (C-07).

## Capabilities

### New Capabilities

- `turnos-persistencia`: persistencia de los turnos del modelo (tabla `turno` con constraints de exclusión, rangos generados y índices) y de los casos de uso de agenda sin HTTP.

### Modified Capabilities

- (none)

## Impact

- Código: `migrations/C09_*`, `src/infrastructure/db/repositories/turno/**`, `src/application/turnos/**`.
- Sistemas: PostgreSQL (constraints de exclusión, deadlocks `40P01` tras `deadlock_timeout`).
