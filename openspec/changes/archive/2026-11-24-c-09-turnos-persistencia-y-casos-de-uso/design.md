# Design

## Context

Punto de partida (ver `specs/turnos-persistencia/spec.md` para el contrato):

- Ficha de C-09 (`CHANGES.md` §[C-09] `turnos-persistencia-y-casos-de-uso`).
- KB: `04_modelo_de_datos.md` §turno (entidades, índices, gotcha de `fin_sillon`), `05_reglas_de_negocio.md` §Agenda (RN-AG), §Turnos y estados (RN-TU), `07_flujos_principales.md` §Flujo 2 (agendar), §Flujo 5 (reprogramación), `08_arquitectura_propuesta.md` §Seguridad (No solapamiento), `09_decisiones_y_supuestos.md` DD-02 + SU-03.
- Informe de validación de PostgreSQL (`docs/plataforma/informe-validacion-postgres.md`): hallazgos R-04 y R-05 (concurrency, deadlocks) usados abajo.

## Goals

- Cumplir los escenarios de `specs/turnos-persistencia/spec.md`.

## Non-Goals

- No tocar HTTP: los endpoints son de C-12 (`src/interfaces/http/modules/{turnos,agenda,bloqueos}/**`).
- No agregar más de `turno` ni modificar contratos congelados.

## Decisions

1. **`fin_sillon` como columna común + `CHECK`**: per el hallazgo R-04 del informe, `timestamptz + interval` es `STABLE` y una columna generada la rechaza (42P17); el `CHECK (fin_sillon = fin + make_interval(mins => buffer_minutos))` la acepta.
2. **Rangos generados**: `rango_profesional = tstzrange(inicio, fin, '[)')` y `rango_sillon = tstzrange(inicio, fin_sillon, '[)')` (en el entorno local validado; si algún PaaS los rechaza, se degrada a columnas comunes — decisión para aplicar en deployment).
3. **Constraints de exclusión** (RN-AG-01, RN-AG-02): `EXCLUDE USING gist (clinica_id WITH =, profesional_id WITH =, rango_profesional WITH &&) WHERE (estado NOT IN ('cancelado','reprogramado'))` y el equivalente para el sillón — la garantía final del no solapamiento.
4. **Repositorio y AgendaReader** en SQL explícito sobre `withTenant` (C-03), con traducción de errores `23P01`/`40P01` a `TURNO_SOLAPADO_PROFESIONAL`/`TURNO_SOLAPADO_SILLON`.
5. **Casos de uso** en el dominio (`src/domain/turno/**`/`src/application/turnos/**`): validaciones puras (RN-AG-06, RN-AG-07, RN-AG-10, RN-AG-11), transacciones atómicas (RN-TU-02).
6. **Asignación automática de sillón libre con reintentos** (RN-RE-03).
7. **`TurnoEventPublisher`** como puerto en `src/domain/turno/`, implementación nula por defecto; consume C-14.
