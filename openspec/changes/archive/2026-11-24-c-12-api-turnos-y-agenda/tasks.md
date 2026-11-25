# Tasks

## 1. Base de datos: migration C12_001

- [x] 1.1 Crear `migrations/C12_001_bloqueo_fk.sql`: `ALTER TABLE bloqueo ADD CONSTRAINT bloqueo_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES usuario(id)`. Verificar: nombre respeta el patrón `C{NN}_{seq}_{nombre}.sql` (regla 6 del database-migrations).

## 2. Módulos HTTP (zonas de C-12)

- [x] 2.1 Implementar `src/interfaces/http/modules/turnos/index.ts`: `POST /turnos` (delega en el caso de uso y traduce errores), `GET /turnos/{id}` (devuelve el turno; otro turno de otra clínica → 404) y `POST /turnos/{id}/{cancelar|reprogramar|confirmar|atendido|ausente}` (transiciones per RN-TU, conflictos `409`/`422`).
- [x] 2.2 Implementar `src/interfaces/http/modules/agenda/index.ts`: `GET /agenda?desde&hasta&profesionalId&sillonId` — vista diaria y semanal; el odontólogo ve solo su propia agenda.
- [x] 2.3 Implementar `src/interfaces/http/modules/bloqueos/index.ts`: `/bloqueos` (alta y baja) con rechazo `409` y lista de turnos en conflicto (RN-AG-08).

## 3. Integración final

- [x] 3.1 Re-ejecutar `openspec validate 2026-11-24-c-12-api-turnos-y-agenda` y `openspec status --change 2026-11-24-c-12-api-turnos-y-agenda --json`. Verificar: proposal, specs, design y tasks presentes y validan. (Resultado: valid ✓; proposal/specs/design/tasks = done.)
