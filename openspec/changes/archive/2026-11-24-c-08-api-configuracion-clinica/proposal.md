# Proposal

## Why

El administrador de la clínica todavía no puede configurar su agenda: C-05 dejó las tablas y los repositorios de recursos, C-06 la autenticación y el RBAC, y C-07 la auditoría, pero no existe ninguna API que los use. Sin profesionales, horarios, sillones, prestaciones, feriados y parámetros de la clínica cargados, C-09 (turnos) y la disponibilidad no tienen sobre qué operar. C-08 cierra la Épica 1 (US-001 a US-004) y agrega la clave foránea `usuario.profesional_id → profesional` que C-05 dejó pendiente (D2 de C-05, regla de migraciones de `CHANGES.md`). Gobernanza **MEDIO**: se implementa con checkpoints, sin aprobación previa del Líder.

## What Changes

- **Migración `migrations/C08_001_usuario_profesional_fk.sql`**: clave foránea compuesta `usuario (clinica_id, profesional_id) → profesional (clinica_id, id)`, coherente con las FK compuestas de C-05, de modo que un usuario nunca quede vinculado a un profesional de otra clínica ni a uno inexistente.
- **API `/clinica`** (`GET`; `PATCH` de `reserva_requiere_confirmacion`, `cancelacion_anticipacion_horas` y `granularidad_minutos`), con la granularidad validada contra la misma regla que usa el dominio de agenda (entero que divide 1440).
- **API de recursos**: `/profesionales`, `/sillones` y `/prestaciones` (listar, obtener, crear, modificar, activar y desactivar). Los recursos **nunca se borran físicamente**: la baja es siempre una desactivación, lo que preserva los turnos futuros de C-09 (US-003, RN-AG-04).
- **API de horarios**: `GET` y `PUT /profesionales/{id}/horarios` (reemplazo completo y atómico de las franjas), con validación de franjas `hora_desde < hora_hasta` y sin solape (RN-AG-06, RN-AG-03), y el constraint de exclusión de C-05 como garantía final.
- **API de feriados**: `/feriados` (listar por año, crear, borrar) y una **plantilla de feriados nacionales** versionada en el repositorio (año en curso y siguiente) que se previsualiza y se copia de forma idempotente a la clínica (US-004).
- **Permisos por rol** según la matriz RBAC (`03 §RBAC`): el administrador lee y escribe; recepcionista y odontólogo solo leen (el odontólogo, solo sus propios horarios). Cada mutación se **audita en la misma transacción** con `conAuditoriaDeCambio` de C-07 (*fail-closed*).
- **Casos de uso en `src/application/configuracion/**`** (sin I/O, con puertos propios) y **módulos HTTP** `clinica`, `profesionales`, `sillones`, `prestaciones` y `feriados`.
- **Pruebas**: unitarias de validaciones y casos de uso; de integración con PostgreSQL real y `inject` para permisos por rol, aislamiento entre clínicas (404 para recursos ajenos), validaciones, atomicidad de la auditoría y la FK nueva.

## Capabilities

### New Capabilities
- `api-configuracion-clinica`: lectura y modificación de los parámetros de la clínica (`clinica` + `clinica_config`) con sus rangos y la regla de granularidad.
- `api-recursos-clinica`: alta, consulta, modificación y activación/desactivación de profesionales, sillones y prestaciones, sin borrado físico.
- `api-horarios-atencion`: consulta y reemplazo atómico de las franjas semanales de un profesional, con validación de forma y de solape.
- `api-feriados`: feriados por clínica y plantilla de feriados nacionales copiable de forma idempotente.

### Modified Capabilities
- `esquema-datos-clinica`: se agrega el requisito de que `usuario.profesional_id` referencie a un profesional de la misma clínica por FK compuesta.

## Impact

- **Zona de C-08**: `migrations/C08_*`, `src/interfaces/http/modules/{clinica,profesionales,sillones,prestaciones,feriados}/**`, `src/application/configuracion/**`, `test/unit/configuracion/**` y `test/integration/configuracion/**`.
- **Archivo nuevo fuera de la zona declarada (sin editar nada existente)**: `src/infrastructure/db/repositories/configuracion-clinica/index.ts`, adaptador de lectura/escritura de `clinica` + `clinica_config`, que C-05 no proveyó (ver `design.md` D4).
- **Reutiliza sin modificar**: repositorios de C-05 (`profesional`, `sillon`, `prestacion`, `feriado`, `horario`, `calendario`), `traducirErrorPg`, `withTenant`, `pluginDeAutenticacion` y `buscarUsuarioPorId` de C-06, `crearAuditoriaPg` y `conAuditoriaDeCambio` de C-07, `validarGranularidad` del dominio de C-02.
- **Contratos congelados**: sin cambios en `RequestContext`, los puertos de C-02 ni el contrato de `AuditoriaService`. El vocabulario de auditoría es abierto por tipo (`AccionAuditoriaConocida | string`): `eliminacion` se usa sin tocar C-07.
- **Hallazgo sobre C-06 (fuera de zona)**: `pluginDeAutenticacion` se registra encapsulado dentro del módulo `auth` y su hook no llega a los demás módulos. C-08 lo resuelve en su propia zona (D3) y se reporta al Líder para corregir `usuarios`.
- **Sin dependencias npm nuevas.**
- **Fuera de alcance**: CRUD de usuarios (C-06), bloqueos (C-12), turnos y disponibilidad (C-09, C-13), API pública de prestaciones (C-15), consulta de auditoría (C-16), sobreturnos o excepciones en feriados (PO-07), tipos de sillón por prestación (PO-11) y cambio de zona horaria de la clínica.
