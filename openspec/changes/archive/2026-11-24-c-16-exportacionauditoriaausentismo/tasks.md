# Tasks

## 1. API de consulta de auditoría

- [x] 1.1 Implementar `GET /auditoria` con filtros por entidad, actor y rango de fechas (`desde`/`hasta`); devolver la lista ordenada por fecha (más recientes primero). Verificar: filtro por entidad, filtro por actor, rango de fechas, lista paginable mínima.
- [x] 1.2 Aplicar permisos: sin rol `administrador` → `403`; sin contexto de clínica → `403`. Verificar: otros roles no acceden.

## 2. Exportación de datos de la clínica

- [x] 2.1 Implementar `POST /exportaciones`: devuelve un id de exportación (201) y audita la acción. Verificar: sin admin → 403; devuelve id válido.
- [x] 2.2 Implementar `GET /exportaciones/{id}`: devuelve el archivo (formato abierto definido en PO-16) con los datos de **su** clínica: pacientes, turnos, profesionales, sillones, prestaciones y auditoría. Verificar: los datos son los de la clínica del admin; no incluye datos de otra clínica (RLS).
- [x] 2.3 Validar datos no reales (RN-DA-01) en la exportación; no debe exponer hashes reales de contraseñas.

## 3. Ausentismo

- [x] 3.1 Implementar `GET /ausentismo` con filtros por período, paciente y profesional, devolviendo conteo de ausentes. Verificar: conteo correcto por período; filtro por paciente; filtro por profesional; sin permisos → 403.

## 4. Auditoría de exportación y validación

- [x] 4.1 Verificar: cada exportación realizada queda registrada en `auditoria` (actor, fecha, entidad).
- [x] 4.2 Re-ejecutar `openspec validate --all --strict` y `openspec status --change 2026-11-24-c-16-exportacionauditoriaausentismo --json`. Verificar: valid ✓; proposal, specs, design y tasks presentes y validan. (Resultado: asociado al archivado del change.)
