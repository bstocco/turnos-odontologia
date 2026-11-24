# Tasks

## 1. Base de datos: migration C09_001

- [x] 1.1 Crear `migrations/C09_001_turno.sql`: tabla `turno` (`id`, `clinica_id`, `paciente_id`, `profesional_id`, `sillon_id`, `prestacion_id`, `inicio`, `fin`, `buffer_minutos`, `estado`, `origen`, `reprogramado_de`, `duracion_real_minutos`, `creado_en`, `actualizado_en`), `rango_profesional`/`rango_sillon` generados, `fin_sillon` común con `CHECK (fin_sillon = fin + make_interval(mins => buffer_minutos))`, constraints de exclusión por profesional y por sillón (`WHERE estado NOT IN ('cancelado','reprogramado')`), índices y `aplicar_rls('turno')`. Verificar: nombre respeta el patrón `C{NN}_{seq}_{nombre}.sql` (regla 6 del database-migrations).

## 2. Repositorio y AgendaReader

- [x] 2.1 Implementar `src/infrastructure/db/repositories/turno/**` (repositorio del turno + `AgendaReader`) con SQL explícito sobre `withTenant`. Verificar: el repositorio compila y los errores de aislamiento devuelven 0 filas sin contexto.

## 3. Casos de uso de agenda

- [x] 3.1 Implementar `agendarTurno`, `reprogramarTurno` (RN-TU-02), `cancelarTurno`, `confirmarTurno`, `marcarAtendido`, `marcarAusente` con validaciones del dominio (`validarTurnoPrevio`, `detectarSolape` en repositorio); traducir `23P01`/`40P01` a los errores del dominio (`TURNO_SOLAPADO_PROFESIONAL`/`TURNO_SOLAPADO_SILLON`, 409). Verificar: `npx vitest run --project integration test/integration/turnos/` en verde (pruebas nuevas de C-09: concurrencia, borde fin = inicio, buffer, reprogramación atómica, aislamiento por clínica).
- [x] 3.2 Asignación automática de sillón libre con reintentos ante concurrencia (RN-RE-03): `agendarTurno` reintenta la inserción (`RetrasoDeRetries`) ante conflictos de sillón.

## 4. Puerto TurnoEventPublisher

- [x] 4.1 Definir el puerto `TurnoEventPublisher` en `src/domain/turno/`; implementación nula por defecto (consumido por C-14).

## 5. Integración final

- [x] 5.1 Re-ejecutar `openspec validate 2026-11-24-c-09-turnos-persistencia-y-casos-de-uso` y `openspec status --change 2026-11-24-c-09-turnos-persistencia-y-casos-de-uso --json`. Verificar: proposal, specs, design y tasks presentes y validan. (Resultado: valid ✓; proposal/specs/design/tasks = done.)
