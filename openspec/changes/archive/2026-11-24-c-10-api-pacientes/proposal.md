# Proposal

## Why

La recepción todavía no puede cargar, buscar ni corregir la ficha de un paciente: C-05 dejó la tabla `paciente` (DNI único por clínica, teléfono en formato internacional, RLS) y su repositorio, C-04 la normalización del teléfono, C-06 la autenticación y el RBAC, C-07 la auditoría de lecturas de ficha y C-09 los turnos, pero no existe ninguna API que los use. Sin pacientes cargados por la recepción, los turnos de C-09 no tienen a quién asignarse fuera de la reserva pública. C-10 implementa US-040 (Épica 5) con las reglas RN-PA-01 a RN-PA-03 y RN-AU-03, y aplica el mínimo acceso por rol que exige la Ley 25.326 (RN-MT-03). Gobernanza **ALTO**: el diseño requiere aprobación del Líder antes del código.

## What Changes

- **API `/pacientes`** (módulo HTTP nuevo `src/interfaces/http/modules/pacientes/`):
  - `POST /pacientes` → 201 con la ficha creada.
  - `GET /pacientes/{id}` → 200 con la ficha completa; **cada lectura exitosa se audita** como `lectura_ficha` (RN-AU-03), sin datos personales en el registro.
  - `PATCH /pacientes/{id}` → 200 con la ficha modificada (cambio parcial).
  - `GET /pacientes?dni=` (DNI exacto) o `GET /pacientes?apellido=` (prefijo, con mínimo de caracteres y tope de resultados) → lista con campos reducidos.
  - Sin `DELETE` en v1 (ver `design.md`).
- **Normalización al guardar**: el teléfono pasa por `normalizarTelefonoAr` de C-04 y se guarda como `+549…` (RN-PA-03); el DNI se normaliza (se quitan puntos y espacios) y se valida con 7 u 8 dígitos; los textos se recortan.
- **DNI único por clínica**: un DNI repetido responde `409 PACIENTE_DNI_DUPLICADO` (traducción del constraint de C-05, sin el DNI en el error).
- **Permisos por rol** según la matriz RBAC (`03 §RBAC`): administrador y recepcionista crean, leen, buscan y modifican cualquier paciente de su clínica; el odontólogo **solo lee y busca pacientes con al menos un turno activo o realizado con su profesional** (C-09) y no crea ni modifica. Un paciente de otra clínica, o fuera del alcance del odontólogo, responde `404` (regla 12).
- **Auditoría** (C-07, *fail-closed*, misma transacción): `creacion` y `modificacion` de pacientes con la lista de campos cambiados y sin valores personales; `lectura_ficha` en cada detalle leído.
- **Casos de uso en `src/application/pacientes/**`** (sin I/O, con puertos propios) y un **adaptador de lectura nuevo** para la relación paciente–profesional vía turnos (archivo nuevo, ver Impact).
- **Pruebas**: unitarias de validaciones, permisos y casos de uso; de integración con PostgreSQL real y `inject` para permisos por rol, DNI duplicado, búsqueda limitada a la clínica, auditoría de lecturas, aislamiento entre dos clínicas y ausencia de datos personales en logs, errores y auditoría.

## Capabilities

### New Capabilities
- `api-pacientes`: alta, consulta de detalle auditada, modificación parcial y búsqueda por DNI o apellido de la ficha básica del paciente, con normalización, unicidad de DNI, permisos por rol (incluido el alcance del odontólogo por sus turnos) y aislamiento por clínica.

### Modified Capabilities
<!-- Ninguna: los requisitos de `repositorio-pacientes`, `telefono-whatsapp` y `hooks-auditoria-casos-de-uso` se reutilizan sin cambios. -->

## Impact

- **Zona de C-10**: `src/interfaces/http/modules/pacientes/**`, `src/application/pacientes/**`, `test/unit/pacientes/**`, `test/integration/pacientes/**` y `test/api/pacientes-acceso.test.ts`.
- **Archivo nuevo fuera de la zona declarada (sin editar nada existente, requiere visto bueno del Líder)**: `src/infrastructure/db/repositories/paciente-acceso/index.ts`, lector de solo lectura que responde si un paciente tiene turnos con un profesional y filtra las búsquedas del odontólogo. Ni C-05 ni C-09 proveen esa consulta (`design.md` D5, Open Question Q1). Mismo precedente que el adaptador `configuracion-clinica` de C-08.
- **Reutiliza sin modificar**: `crearPacienteRepository` y `traducirErrorPg` (C-05), `normalizarTelefonoAr` (C-04), `pluginDeAutenticacion`, `contextoDePedido` y `buscarUsuarioPorId` (C-06), `crearAuditoriaPg`, `conAuditoriaDeCambio` y `conAuditoriaDeLecturaPaciente` (C-07), `ESTADOS_ACTIVOS_LIST` del dominio de turnos (C-02/C-09), `withTenant` (C-03).
- **Base de datos**: sin migración. `app` ya tiene `SELECT, INSERT, UPDATE` sobre `paciente` (C05_001) y `SELECT` sobre `turno` (C09_001); la tabla `paciente` ya tiene RLS.
- **Contratos congelados**: sin cambios en `RequestContext`, los puertos de dominio, `TurnoEventPublisher` ni `AuditoriaService`.
- **Sin dependencias npm nuevas.**
- **Fuera de alcance**: baja o desactivación de pacientes (D de la matriz RBAC; `paciente` no tiene columna `activo`), historia clínica, odontograma y adjuntos (RN-PA-01: no existen en v1), alta de paciente desde la reserva pública (C-15, que podrá reutilizar el caso de uso de alta), consulta de la auditoría (C-16), exportación (C-16) y teléfonos que no sean celulares argentinos (limitación vigente de C-04).
- **Nota de nombre**: en la conversación del Líder este change apareció como "historial-clinico-y-adjuntos"; se sigue la definición de `CHANGES.md` (`C-10 api-pacientes`), ya que historia clínica y adjuntos están fuera de v1 según RN-PA-01.
