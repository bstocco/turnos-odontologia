# Proposal

## Why

El dominio de agenda (C-02) ya define los puertos `RecursosReader` y `AgendaReader`, y C-03 dejó la base multi-tenant (`aplicar_rls`, `btree_gist`, `clinica`, `clinica_config`). Falta la **persistencia de los recursos de la clínica y de los pacientes**: sin las tablas `profesional`, `horario_atencion`, `sillon`, `prestacion`, `feriado`, `paciente` y `bloqueo`, ni C-08 (configuración), ni C-09 (turnos), ni C-10 (pacientes), ni C-12 (bloqueos), ni C-13 (disponibilidad) pueden avanzar. C-05 está en el camino crítico (`C-01 → C-03 → C-05 → C-09 → …`) y, por tocar datos de salud (Ley 25.326, RN-MT-03), su governance es **ALTO**: este documento es la propuesta de diseño que el Líder revisa antes de escribir código.

## What Changes

- **Migración `C05_001_datos_clinica_y_pacientes.sql`**: crea las siete tablas, cada una con `clinica_id` (FK a `clinica`) y `aplicar_rls('tabla')`; concede al rol `app` solo los privilegios necesarios (mínimo privilegio, sin `DELETE` donde el negocio pide desactivar).
- **Constraints en la base** como garantía final:
  - `horario_atencion`: `dia_semana` entre 0 y 6, `hora_desde < hora_hasta` (tipo `time`, admite `24:00`) y franjas del mismo profesional y día sin solape (exclusión GiST, propuesto; ver design).
  - `sillon.buffer_minutos ≥ 0` (por defecto 0); `prestacion.duracion_minutos > 0`.
  - `feriado` único por `(clinica_id, fecha)`; `paciente.dni` único por `(clinica_id, dni)` (RN-PA-02).
  - `bloqueo`: `inicio < fin` y **sin solape por profesional** con `EXCLUDE USING gist (clinica_id WITH =, profesional_id WITH =, tstzrange(inicio, fin, '[)') WITH &&)`.
  - **Claves foráneas compuestas** `(clinica_id, profesional_id)` para que una fila nunca referencie un recurso de otra clínica (las FK no pasan por RLS).
  - `bloqueo.creado_por` **sin** clave foránea (la agrega C-12 cuando exista `usuario`).
- **Repositorios en SQL explícito y parametrizado** bajo `src/infrastructure/db/repositories/**`, que reciben el cliente transaccional abierto por `withTenant` y nunca abren conexiones propias:
  - Implementan **completo** `RecursosReader` (C-02).
  - Implementan la **parte de `AgendaReader` que les corresponde**: `franjasDeAtencion`, `feriados` y `bloqueos`. Los dos métodos de turnos (`turnosActivosDeProfesional`, `turnosActivosDeSillones`) y `TurnoRepository` quedan para **C-09**; C-09 compone el `AgendaReader` completo.
  - Ofrecen la escritura mínima que necesitan C-08, C-10 y C-12 (alta, actualización, desactivación, búsqueda de pacientes por DNI y apellido, alta y baja de bloqueos y feriados), con interfaces propias **no congeladas**.
  - Traducen las violaciones de constraints (`23505`, `23P01`, `23503`, `23514`) a `ErrorDeDominio` con código estable, **sin** propagar el `detail` de PostgreSQL (que contiene DNI y otros valores).
- **Seed sintético** `seeds/demo-clinica.ts`: una clínica de demostración determinista (semilla fija de faker, emails `@example.com`), protegido por `assertNoProduction()` y registrado en `seeds/run.ts`.
- **Pruebas de integración contra PostgreSQL real**: cada constraint, el mapeo de errores sin datos personales y el **aislamiento entre clínicas de cada una de las siete tablas** con el arnés de C-03.

Sin cambios incompatibles: no hay tablas ni repositorios previos de estos recursos. **No** se modifican los puertos congelados de C-02 ni el contrato `RequestContext`.

## Capabilities

### New Capabilities
- `esquema-datos-clinica`: tablas de recursos de la clínica, pacientes y bloqueos con su RLS, privilegios, claves foráneas compuestas y constraints (unicidad, rangos, exclusión).
- `repositorios-recursos-clinica`: adaptadores SQL de `RecursosReader` y de la parte de `AgendaReader` de franjas, feriados y bloqueos, más la escritura de profesionales, horarios, sillones, prestaciones, feriados y bloqueos.
- `repositorio-pacientes`: persistencia de la ficha básica del paciente (RN-PA-01..03) con DNI único por clínica y manejo de datos personales sin filtrarlos en errores ni logs.
- `seed-clinica-demo`: carga determinista de una clínica de demostración con datos sintéticos, bloqueada fuera de entornos permitidos.

### Modified Capabilities
- (ninguna) — `agenda-puertos` y `data-safety-guards` se **consumen** sin cambiar sus requisitos.

## Impact

- **Código**: `migrations/C05_001_*.sql`; `src/infrastructure/db/repositories/{profesional,horario,sillon,prestacion,feriado,paciente,bloqueo}/**`; `seeds/**`. Se pide al Líder ampliar la zona con `src/infrastructure/db/repositories/{recursos,compartido}/**` (composición de `RecursosReader`, `configuracionAgenda` y utilidades compartidas) y `test/integration/datos-clinica/**` (ver design §Open Questions).
- **Dependencias de npm**: ninguna nueva. `@faker-js/faker` 10.6.0, `pg`, `vitest` y `tsx` ya están instalados. Faker **no** trae locale `es_AR`: se usa `es` más generadores propios para DNI y teléfono argentinos.
- **Precondición bloqueante**: C-03 figura `[x]` en `CHANGES.md`, pero en `main` solo está la migración `C03_001`; faltan `withTenant`, el pool, `RequestContext`, `resolver_clinica_por_slug` y el arnés `test/support/aislamiento.ts`, y el change `c-03-db-tenant-rls` sigue activo (1/7 tareas). El apply de C-05 no puede empezar hasta que eso se fusione.
- **Contratos**: consume `RecursosReader`/`AgendaReader` (C-02) y `withTenant`/arnés (C-03). Deja preparadas las FK compuestas `(clinica_id, id)` que usará C-09 para `turno`.
- **HTTP, cola, auditoría**: sin cambios (C-08, C-10, C-12; la auditoría de lecturas de fichas es de C-07/C-10).
- **Governance**: ALTO. Propuesta de diseño aprobada por el Líder antes del código.
