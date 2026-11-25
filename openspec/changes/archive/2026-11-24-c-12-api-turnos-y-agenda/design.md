# Design

## Context

Punto de partida (ver `specs/api-turnos-y-agenda/spec.md` para el contrato):

- Ficha de C-12 (`CHANGES.md` §[C-12] `api-turnos-y-agenda`).
- KB: `06_funcionalidades.md` Épicas 2 y 3 (US-010 a US-015, US-020 a US-022), `07_flujos_principales.md` §Flujos 2, 5, 6, 8 y 9, `05_reglas_de_negocio.md` RN-AG-07/08, RN-TU, RN-AB, `03_actores_y_roles.md` §RBAC — Matriz de permisos.
- C-09 (`turnos-persistencia-y-casos-de-uso`): `TurnoRepository`, casos de uso (`agendarTurno`, `reprogramarTurno`, ...) y la tabla `turno` (con exclusión de solape y `fin_sillon`).
- C-06 (`auth-personal-rbac`): `RequestContext` y JWT del personal.
- C-03 (`db-tenant-rls`): `withTenant`, `aplicar_rls`, rol `app` sin BYPASSRLS.

## Goals

- Cumplir los escenarios de `specs/api-turnos-y-agenda/spec.md`: endpoints de turnos con transiciones por RN-TU; agenda del profesional; bloqueos con `409` y lista de turnos en conflicto (RN-AG-08); migration `C12_001` con FK.

## Non-Goals

- No implementar rutas públicas (C-13) ni emails (C-14).
- No lógica de negocio en las rutas: handlers del módulo solo validan esquemas, autorizan y delegan casos de uso (regla 7).
- No modificar contratos congelados (regla 14).

## Decisions

1. **Módulos HTTP**: `src/interfaces/http/modules/{turnos,agenda,bloqueos}/**` — handlers delgados que: validan con typebox, llaman al caso de uso en `src/application/turnos-api/**` y traducen errores de dominio.
2. **Casos de uso** en `src/application/turnos-api/**`: agendarTurno, reprogramarTurno, cancelarTurno, confirmarTurno, marcarAtendido/Ausente, crearBloqueo, eliminarBloqueo; usan `TurnoRepository`/`BlockRepository` de C-09 y reusan `validarTurnoPrevio` y `detectarSolape` del dominio.
3. **Permisos por rol (03 §RBAC)**: `requireRole` según la matriz (ej. `POST /turnos` → recepcionista/odontólogo; CRUD de bloqueos → odontólogo).
4. **Validación previa de turno**: `validarTurnoPrevio` del dominio (RN-AG-06..11) antes de persistir.
5. **Migración `C12_001_bloqueo_fk.sql`**: `ALTER TABLE bloqueo ADD CONSTRAINT bloqueo_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES usuario(id)`.
