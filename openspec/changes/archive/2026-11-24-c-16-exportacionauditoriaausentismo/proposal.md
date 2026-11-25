# Proposal

## Why

C-16 `exportacion-auditoria-ausentismo` (Épica 7): el administrador necesita consultar y conservar los datos de su clínica.

- **US-062 — Exportar los datos de la clínica**: descargar pacientes, turnos, profesionales, sillones, prestaciones y auditoría.
- **US-063 — Consultar el registro de ausentismo**: conteo de ausentes por período, paciente y profesional.
- **US-061 — Consultar la auditoría**: trazabilidad de accesos y cambios (trazabilidad legal de la Ley 25.326).

Las reglas involucradas: RN-DA-04 (cada clínica puede exportar sus datos, solo el administrador, la exportación queda auditada), RN-AU-03 (se audita cada exportación), RN-AU-02 (auditoría append-only), RN-AU-01 (no se actualiza ni borra).

## What Changes

- `GET /auditoria`: lista con filtros por entidad, actor y rango de fechas; solo el rol `administrador`.
- `POST /exportaciones` y `GET /exportaciones/{id}`: genera un archivo (formato abierto a definir — PO-16) con los datos de **su** clínica: pacientes, turnos, profesionales, sillones, prestaciones y auditoría. RLS (C-03) garantiza que solo se exporte la propia clínica. La exportación queda auditada (RN-DA-04, RN-AU-03).
- `GET /ausentismo`: por período, paciente y profesional, con conteo (RN-AB-02).
- Solo el rol `administrador` puede usar estos endpoints.
- Los datos exportados son todos sintéticos en desarrollo/tests; la exportación no puede exponer hashes reales (RN-DA-01).

## Capabilities

### New Capabilities

- `exportacion-auditoria-ausentismo`: consulta de auditoría, exportación de datos de la clínica y registro de ausentismo, por el rol `administrador`.

### Modified Capabilities

- (none)

## Impact

- Código: `src/interfaces/http/modules/{auditoria,exportaciones,ausentismo}/**`, `src/application/exportacion/**`, dependencias hacia `src/domain/auditoria/**`.
- Tests: permisos por rol (403/401), que la exportación no incluya datos de otra clínica, auditoría de la exportación, ausentismo por período.
- Docs: ficha de CHANGES.md, entrada en `docs/` si corresponde (ver detalle en `tasks.md`).
- Sin cambios en migraciones (C-07 ya provee `auditoria`).
