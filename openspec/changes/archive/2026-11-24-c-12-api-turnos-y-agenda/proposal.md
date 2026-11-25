# Proposal

## Why

C-12 `api-turnos-y-agenda` expone la agenda y los turnos del personal por HTTP (Fase 2). Los changes anteriores dejaron en el sistema los turnos (C-09), el aislamiento (C-03) y la autenticación (C-06); esta change ofrece la API que los usa. Es `MEDIO` (governance de la hoja) y depende de C-04 (whatsapp), C-06 (autenticación) y C-09 (turnos).

## What Changes

- Endpoints: `POST /turnos`, `GET /turnos/{id}`, `POST /turnos/{id}/{cancelar|reprogramar|confirmar|atendido|ausente}`, `GET /turnos/{id}/enlace-whatsapp` (con C-04).
- `GET /agenda?desde&hasta&profesionalId&sillonId`: vista diaria y semanal con turnos, bloqueos y feriados; el odontólogo ve solo la propia.
- `/bloqueos` (alta y baja) con rechazo `409` y lista de turnos en conflicto (RN-AG-08).
- Migración `C12_001`: clave foránea `bloqueo.creado_por → usuario`.
- Permisos por rol, auditoría, esquemas de validación y OpenAPI.
- Tests API: flujos 2, 5, 6, 8 y 9; permisos; conflictos `409` y `422`.

## Capabilities

### New Capabilities

- `api-turnos-y-agenda`: API de turnos, agenda y bloqueos para el personal (autenticación C-06, aislamiento C-03, persistencia C-09).

### Modified Capabilities

- (none)

## Impact

- Código: `migrations/C12_*`, `src/interfaces/http/modules/{turnos,agenda,bloqueos}/**`.
