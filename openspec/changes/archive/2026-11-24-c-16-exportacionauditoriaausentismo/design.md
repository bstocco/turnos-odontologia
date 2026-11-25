# Design

## Context

Punto de partida (ver `specs/exportacion-auditoria-ausentismo/spec.md` para el contrato):

- Ficha de C-16 (`CHANGES.md` §[C-16] `exportacion-auditoria-ausentismo`): alcance (auditoría, exportación con formato abierta PO-16, ausentismo con conteo), Zona: `src/interfaces/http/modules/{auditoria,exportaciones,ausentismo}/**`, `src/application/exportacion/**`.
- KB: `06_funcionalidades.md` Épica 7 (US-061, US-062, US-063), `05_reglas_de_negocio.md` §Auditoría y datos (RN-AU, RN-DA-04, RN-AB-02, RN-DA-01), `07_flujos_principales.md` §Flujo 10, `10_preguntas_abiertas.md` PO-16.
- KB: `03_actores_y_roles.md` (roles, RBAC), `04_modelo_de_datos.md` (tablas, RLS), `08_arquitectura_propuesta.md` §Seguridad.
- Change de adyacencia: C-07 (`auditoria-append-only`, j extract merge de C-03): tabla `auditoria` ya existe y es append-only.

## Goals

- Cumplir los escenarios de `specs/exportacion-auditoria-ausentismo/spec.md`.
- Cumplir RN-DA-04 (exportación de datos de la clínica, solo para el rol `administrador`, auditada), RN-AU-03 (auditoría de cada exportación), RN-AU-02, RN-AU-01 (append-only).

## Non-Goals

- No Implementar transformación de exportación a algún formato específico: el formato se define en PO-16, dentro del change.
- No crear nuevas tablas ni migraciones (C-07 ya provee `auditoria`).
- No poner RBAC nuevo: los endpoints quedan bajo el RBAC de clínicas y el rol `administrador`.
- No construir motor de ejecución de scripts (plano al 0.1 de C-01).

## Decisions

- **Lectura vía RLS.** Todas las consultas de auditoría y exportación son selecciones sobre `auditoria` y las tablas de clínica dentro de `withTenant`, y apoyadas por RLS (C-03). No hay procesos crónicos de exportación; C-20 hace el despliegue.
- **Exportación sin herramientas criptográficas especiales.** El archivo se genera con los datos estándar de la clínica en formato abierto (definición PO-16); si el archivo incluyera hash de contraseñas, se reemplazan por huellas anónimas sintéticas (RN-DA-01).
- **Auditoría de la exportación como acción de dominio.** El evento de exportación se audita en la misma transacción que crea el archivo.
- **Aplicación de dominio puro.** Los interactuos (`ExportacionInteractor`, `AusentismoInteractor`) no validan datos y solo lo hace los porteros HTTP; la validación de entrada (rango de fechas válido, pagina) queda en los puertos.
- **Sin mencionar datos reales (Ley 25.326).** En el texto de los endpoint se loguean solo IDs.

## Impact

- Código: `src/interfaces/http/modules/{auditoria,exportaciones,ausentismo}/**`, `src/application/exportacion/**`.
- Sin cambios en `src/domain/**` existente salvo oportunas entidades de auditoría si C-07 no las provee.
- Tests: permisos por rol, RLS de exportación, auditoría de exportación, ausentismo con conteo.
- Docs: ficha de CHANGES.md al archivar; KB (PO-16 queda por definir si se completa).

## Testing Strategy

- Integration (integración contra PostgreSQL real): exportación completa de la clínica, que no incluya datos de otra clínica, auditoría de la exportación, auditoría append-only (no se puede borrar), ausentismo con conteo, permisos 403, sin contexto → vacío.
- Unit (sin DB): interactos de dominio con dobles.
