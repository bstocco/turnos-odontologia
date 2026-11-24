# Design

## Context

Motivación y alcance: ver `proposal.md`. Requisitos: `specs/esquema-datos-clinica`, `specs/repositorios-recursos-clinica`, `specs/repositorio-pacientes` y `specs/seed-clinica-demo`.

Estado observado en `main` (commit `1b0264d`) que condiciona el diseño:

- **C-02 fusionado**: `src/domain/agenda/puertos.ts` declara `RecursosReader` y `AgendaReader` como contrato congelado (regla 14), con tenant implícito. `FranjaAtencion` usa minutos locales 0-1440; `parsearHoraLocal` ya convierte `HH:MM[:SS]` (formato de `time`) a minutos y admite `24:00`. `Intervalo` es `[inicio, fin)` con `Date`. `FechaLocal` es un string `YYYY-MM-DD` marcado. `ErrorDeDominio(codigo, tipo, mensaje)` vive en `src/domain/shared/errores.ts`. No hay puerto de pacientes ni de escritura de recursos.
- **C-03 incompleto en `main`**: está `migrations/C03_001_tenant_rls.sql` (`btree_gist`, `aplicar_rls`, `clinica`, `clinica_config`, grants a `app`), pero **no** existen `src/infrastructure/db/{pool,tenant}`, `RequestContext`, `resolver_clinica_por_slug` ni `test/support/aislamiento.ts`; el change `c-03-db-tenant-rls` sigue activo con 1/7 tareas, aunque `CHANGES.md` lo marca `[x]`. La política creada por `aplicar_rls` es `FOR ALL TO app USING (clinica_id = NULLIF(current_setting('app.clinica_id', true), '')::uuid)` (sin `WITH CHECK` explícito: se usa la misma expresión).
- **Roles**: `app` (sin `BYPASSRLS`, sin propiedad) y `migra` (propietario, ejecuta migraciones). Como la política es solo `TO app` y la RLS está forzada, `migra` **no ve ni escribe filas** de las tablas con RLS: cualquier carga de datos pasa por `app` con contexto.
- **Pruebas de integración**: `vitest` proyecto `integration`, sin paralelismo entre archivos; `global-setup` deja el esquema vacío y `migraciones.test.ts` lo reinicia en cada prueba, así que cada archivo de C-05 debe reiniciar el esquema y aplicar las migraciones reales en su `beforeAll`.
- **Seeds**: `seeds/run.ts` ya aplica `assertNoProduction(loadConfig('seed'))`; el perfil `seed` usa `DATABASE_URL` (rol `app`). `@faker-js/faker` 10.6.0 está instalado, pero **no** tiene locale `es_AR` (solo `es`, `es_MX`).
- **Redacción de logs** (C-01): el redactor ya enmascara `dni`, `telefono`, `email` y `obra_social`.

## Goals / Non-Goals

**Goals:**
- Que la base sea la garantía final de las invariantes de C-05 (unicidad, rangos, exclusión, no cruce de clínicas), no solo la aplicación.
- Implementar `RecursosReader` y la parte de `AgendaReader` de franjas, feriados y bloqueos **sin tocar** los puertos de C-02.
- Ninguna ruta por la que un dato personal del paciente llegue a un error, log o salida del seed.
- Cubrir cada tabla nueva con una prueba de aislamiento entre clínicas (regla 3).

**Non-Goals:**
- Tabla `turno`, `TurnoRepository` y las dos consultas de turnos de `AgendaReader` (C-09).
- HTTP, RBAC, validación de entrada del borde y auditoría de lecturas de fichas (C-08, C-10, C-12, C-07).
- Regla "un bloqueo no puede pisar turnos activos" (RN-AG-08): depende de `turno`, la resuelve C-09/C-12.
- FK `bloqueo.creado_por → usuario` (C-12) y `usuario.profesional_id → profesional` (C-08).
- Plantilla de feriados nacionales reutilizable por clínica (C-08); el seed trae solo los del año para la demo.
- Normalización del teléfono (C-04/C-10); el repositorio solo verifica el formato.

## Decisions

### D1. Una migración `C05_001_datos_clinica_y_pacientes.sql`
Las siete tablas en un solo archivo, atómico por el runner de C-01. Orden: `profesional`, `sillon`, `prestacion`, `paciente`, `feriado`, `horario_atencion`, `bloqueo`; luego `GRANT` y `SELECT aplicar_rls(...)` por tabla.
- *Alternativa*: una migración por tabla (`C05_001..007`). Más granular para revertir, pero el change se fusiona entero y el runner ya es atómico por archivo; más archivos no aportan.

### D2. Claves foráneas compuestas por clínica
Cada tabla "padre" declara `UNIQUE (clinica_id, id)`; los hijos referencian `FOREIGN KEY (clinica_id, profesional_id) REFERENCES profesional (clinica_id, id)`. Todas llevan además `FOREIGN KEY (clinica_id) REFERENCES clinica(id)`.
- *Por qué*: las comprobaciones de FK de PostgreSQL **no pasan por RLS**; con una FK simple a `profesional(id)`, la clínica A podría insertar un horario apuntando a un profesional de la B (no lo ve, pero lo referencia). La FK compuesta lo hace imposible en la base.
- *Alternativa*: FK simple + validación en el repositorio. Descartada: viola "la base es la garantía final" (DD-01, R-03).
- `sillon`, `prestacion` y `paciente` también exponen `UNIQUE (clinica_id, id)` para que C-09 haga lo mismo en `turno`.

### D3. Esquema por tabla (resumen; nombres de constraints estables porque el mapeo de errores depende de ellos)

| Tabla | Columnas | Constraints con nombre |
|---|---|---|
| `profesional` | `id`, `clinica_id`, `nombre`, `apellido`, `matricula` null, `activo` default true | `profesional_clinica_id_id_key` |
| `sillon` | `id`, `clinica_id`, `nombre`, `buffer_minutos int default 0`, `activo` | `sillon_buffer_minutos_check (>= 0)` |
| `prestacion` | `id`, `clinica_id`, `nombre`, `duracion_minutos int`, `activa` | `prestacion_duracion_minutos_check (> 0)` |
| `paciente` | `id`, `clinica_id`, `nombre`, `apellido`, `dni`, `telefono`, `email` null, `obra_social` null, `creado_en timestamptz default now()` | `paciente_dni_unico UNIQUE (clinica_id, dni)`, `paciente_dni_formato_check`, `paciente_telefono_formato_check (~ '^\+[1-9][0-9]{7,14}$')`; índice `(clinica_id, lower(apellido) text_pattern_ops)` |
| `feriado` | `id`, `clinica_id`, `fecha date`, `descripcion` | `feriado_fecha_unica UNIQUE (clinica_id, fecha)` |
| `horario_atencion` | `id`, `clinica_id`, `profesional_id`, `dia_semana smallint`, `hora_desde time`, `hora_hasta time` | `horario_dia_semana_check (0..6)`, `horario_horas_check (hora_desde < hora_hasta)`, `horario_sin_solape` (D5) |
| `bloqueo` | `id`, `clinica_id`, `profesional_id`, `inicio timestamptz`, `fin timestamptz`, `motivo` null, `creado_por uuid NOT NULL` | `bloqueo_rango_check (inicio < fin)`, `bloqueo_sin_solape` (D4) |

- `id uuid DEFAULT gen_random_uuid()` (nativo desde PG13, sin extensión). El seed pasa ids explícitos para ser determinista.
- `dni`: texto de 7 u 8 dígitos sin puntos (`^[0-9]{7,8}$`), propuesta **provisional** (ver Open Questions: extranjeros/pasaporte).
- `email` y `obra_social` opcionales; `telefono` obligatorio (recordatorio manual por WhatsApp, RN-NO-02). Provisional.
- La matrícula no es única (no lo pide la KB).

### D4. Exclusión de bloqueos con expresión de rango
```sql
CONSTRAINT bloqueo_sin_solape EXCLUDE USING gist (
  clinica_id WITH =, profesional_id WITH =, tstzrange(inicio, fin, '[)') WITH &&)
```
`btree_gist` (creada en C03_001) permite `uuid WITH =` dentro de GiST. `tstzrange(timestamptz, timestamptz, text)` es `IMMUTABLE`, así que vale como expresión de índice (a diferencia de `timestamptz + interval`, gotcha R-04). El mismo índice GiST sirve a `bloqueos(profesionalId, intervalo)` con `tstzrange(inicio, fin, '[)') && tstzrange($2, $3, '[)')`.
- *Alternativa*: columna generada `rango tstzrange GENERATED ALWAYS AS (...) STORED`. Equivalente; descartada por duplicar datos sin beneficio.

### D5. Franjas sin solape también en la base (propuesto, a confirmar)
La KB dice que las franjas de un profesional "no se solapan entre sí"; CHANGES.md solo exige `hora_desde < hora_hasta` y deja "franjas sin solape" como validación de C-08. Se propone llevarlo a la base:
```sql
CONSTRAINT horario_sin_solape EXCLUDE USING gist (
  clinica_id WITH =, profesional_id WITH =, dia_semana WITH =,
  int4range(minutos_del_dia(hora_desde), minutos_del_dia(hora_hasta), '[)') WITH &&)
```
con `minutos_del_dia(time) RETURNS int IMMUTABLE` = `(EXTRACT(EPOCH FROM t) / 60)::int` (`24:00` → 1440). La primera tarea de grupo 2 es un *spike* que confirma la inmutabilidad en PG 17; si falla, el plan B es almacenar además `desde_minutos`/`hasta_minutos smallint` con `CHECK` de coherencia.
- *Por qué*: el cálculo de disponibilidad de C-02 asume franjas disjuntas; una franja duplicada generaría huecos repetidos. Barato en la base.
- *Alternativa*: dejarlo solo en C-08. Descartada salvo que el Líder prefiera no ampliar el alcance.

### D6. Privilegios mínimos
`GRANT SELECT, INSERT, UPDATE` sobre las siete tablas a `app`; `DELETE` solo en `horario_atencion` (reemplazo de franjas), `feriado` y `bloqueo` (baja de C-12). Profesionales, sillones y prestaciones se **desactivan** (C-08: "desactivar en lugar de borrar"). Pacientes no se borran desde la app en v1 (la supresión por Ley 25.326 y la retención PO-10 quedan abiertas y se harían con el rol de mantenimiento).
- *Alternativa*: `DELETE` en todas. Más simple pero amplía la superficie de daño ante un bug o inyección.

### D7. Repositorios: cliente transaccional inyectado, sin conexión propia
Cada repositorio es una fábrica `crearXRepository(ejecutor)` donde `ejecutor` es la mínima interfaz `{ query(texto, valores) }` que cumple el `PoolClient` que entrega `withTenant(clinicaId, fn)` a `fn`. Los repositorios no importan el pool ni leen el `clinicaId`: el tenant llega por `app.clinica_id` (RLS). En las escrituras, `clinica_id` se toma en SQL de `NULLIF(current_setting('app.clinica_id', true), '')::uuid`, así el llamador nunca lo pasa y sin contexto la inserción falla (NOT NULL / política).
- Si C-03 expone un tipo marcado de "cliente con tenant", se usa ese tipo en lugar de la interfaz mínima (ver Open Questions); la decisión no cambia la forma de los repositorios.
- *Alternativa*: repositorios que reciben el pool y llaman a `withTenant` internamente. Descartada: rompe la transacción única de los casos de uso (p. ej. reprogramar en C-09) y obligaría a pasar `clinicaId`, contra el puerto congelado.

### D8. Qué puertos implementa C-05 (y cuáles no)

| Puerto (C-02) | Método | Dueño |
|---|---|---|
| `RecursosReader` | `profesional`, `prestacion`, `sillon`, `sillonesActivos`, `configuracionAgenda` | **C-05** (completo) |
| `AgendaReader` | `franjasDeAtencion`, `feriados`, `bloqueos` | **C-05** |
| `AgendaReader` | `turnosActivosDeProfesional`, `turnosActivosDeSillones` | C-09 |
| `TurnoRepository` | todos | C-09 |

C-05 exporta `crearRecursosReader(ejecutor): RecursosReader` y `crearCalendarioReader(ejecutor): Pick<AgendaReader, 'franjasDeAtencion' | 'feriados' | 'bloqueos'>`. C-09 compone `{ ...calendario, ...turnos }` para obtener el `AgendaReader` completo. Tipar con `Pick<>` deja al compilador comprobar que la firma coincide con el contrato congelado **sin modificarlo**.

### D9. Escritura y lectura de detalle: interfaces propias, no congeladas
C-08, C-10 y C-12 no tienen repositorios en su zona, así que C-05 entrega la escritura: `ProfesionalRepository`, `HorarioRepository` (`reemplazarFranjas` transaccional: `DELETE` + `INSERT` dentro de la misma transacción), `SillonRepository`, `PrestacionRepository`, `FeriadoRepository`, `BloqueoRepository` (`crear`, `eliminar`) y `PacienteRepository` (`crear`, `obtenerPorId`, `buscarPorDni`, `buscarPorApellido(prefijo, limite)`, `actualizar`). Las interfaces y los tipos de fila (`PacienteRegistro`, etc.) viven junto a cada repositorio y **no** son contrato congelado. Los changes de aplicación declaran sus propios puertos y los satisfacen por tipado estructural, de modo que las dependencias siguen apuntando hacia adentro.
- *Alternativa*: nuevos puertos en `src/domain/**` o `src/application/**`. Más limpio en hexagonal, pero sale de la zona de C-05 y fija contratos antes de que C-08/C-10 diseñen sus casos de uso.
- `actualizar` usa una lista blanca de columnas y SQL fijo por columna (nunca nombres de columna interpolados desde la entrada).

### D10. Traducción de errores de PostgreSQL sin datos personales
Utilidad `traducirErrorPg(error)` en `repositories/compartido/`: decide por `code` y `constraint` (campos estructurados del `DatabaseError` de `pg`), nunca por el texto.

| SQLSTATE | Constraint | Código de dominio | Tipo |
|---|---|---|---|
| 23505 | `paciente_dni_unico` | `PACIENTE_DNI_DUPLICADO` | conflicto |
| 23505 | `feriado_fecha_unica` | `FERIADO_DUPLICADO` | conflicto |
| 23P01 | `bloqueo_sin_solape` | `BLOQUEO_SOLAPADO` | conflicto |
| 23P01 | `horario_sin_solape` | `FRANJA_SOLAPADA` | conflicto |
| 23503 | FK compuestas | `RECURSO_NO_ENCONTRADO` | no_encontrado |
| 23514 / 22P02 / 22007 / 22008 | checks y formatos | `DATOS_INVALIDOS` | solicitud_invalida |
| otro | — | `ErrorDePersistencia` con solo `sqlstate` y `constraint` | — |

El `detail` de PostgreSQL (`Key (clinica_id, dni)=(…, 30111222) already exists`) **nunca** se copia ni se adjunta como `cause`. Mensajes fijos en español, sin interpolar valores. Una prueba por tabla verifica que el error serializado (`JSON.stringify` + `message` + `stack`) no contiene el DNI, el teléfono ni el email usados. Los repositorios no loguean.
- Los códigos nuevos se crean con `ErrorDeDominio` existente, sin modificar `src/domain/**`.

### D11. Mapeos de tipos con `pg`
- `time` → `pg` lo devuelve como string `HH:MM:SS` → `parsearHoraLocal` (dominio) → minutos. Escritura: minutos → `'HH:MM'` (`1440` → `'24:00'`) con parámetro `$n::time`.
- `date` → `pg` lo convertiría a `Date` en la zona **del proceso** (corrimiento de un día). Se selecciona `fecha::text` y se valida con `crearFechaLocal`; los parámetros se pasan como texto `$n::date`. Sin cambiar el *type parser* global (afectaría a otros changes).
- `timestamptz` → `Date` absoluto (correcto); se construye el `Intervalo` con `crearIntervaloOLanzar`.
- `configuracionAgenda`: `SELECT c.zona_horaria, cc.granularidad_minutos FROM clinica c JOIN clinica_config cc ON cc.clinica_id = c.id WHERE c.id = NULLIF(current_setting('app.clinica_id', true), '')::uuid` — el filtro explícito es obligatorio porque `clinica` no tiene RLS.
- `sillon.buffer_minutos` → `Sillon.bufferMinutos`. El repositorio **no** calcula `finSillon`; el dominio (C-02) lo deriva del buffer y C-09 lo copia al turno (RN-AG-05).

### D12. Prestación y profesional inactivos en `RecursosReader`
El contrato dice "`null` = inexistente o ajeno". `Profesional` y `Sillon` traen `activo`; `Prestacion` **no** trae `activa`. Decisión provisional: `prestacion(id)` devuelve la prestación aunque esté inactiva (fidelidad al contrato), y `profesional`/`sillon` devuelven su marca. Filtrar inactivas queda en los casos de uso. Si el Líder quiere que una prestación inactiva no se pueda reservar desde el dominio, hace falta agregar `activa` al tipo `Prestacion` de C-02 (cambio de contrato congelado, ver Open Questions).

### D13. Seed determinista de la clínica de demostración
- Archivo `seeds/demo-clinica.ts`, registrado en `seeds/run.ts` después de `assertNoProduction()`; usa `DATABASE_URL` (rol `app`).
- `new Faker({ locale: [es, base] })` con `faker.seed(20260501)` fijo. Ids con `faker.string.uuid()` tras la semilla (reproducibles). DNI y teléfono con generadores propios (`+54 9 11 …` en formato internacional, validados con la normalización de C-04); emails `nombre.apellido.N@example.com` (RFC 2606).
- Inserta `clinica` (sin RLS; `app` tiene `INSERT`) con `id` y `slug` fijos (`clinica-demo`), luego todo lo demás dentro de `withTenant(idDemo, …)` usando los repositorios de C-05 (así el seed también prueba la RLS).
- Idempotencia: si `slug = 'clinica-demo'` ya existe, informa y termina sin escribir. No borra nada.
- Salida: `id`, `slug` y conteos por tabla. Nunca datos de pacientes.
- Contenido: 2 profesionales (lun-vie 09:00-13:00 y 14:00-18:00), 2 sillones (buffer 0 y 10), prestaciones del Discovery (30/45/60), feriados nacionales fijos del año (lista estática en el seed, pública), 1 bloqueo, 20 pacientes.
- *Alternativa*: `seeds/` que inserta con SQL crudo como `migra`. Descartada: `migra` no ve filas con RLS forzada `TO app`, y no reutilizaría los repositorios.

### D14. Pruebas de integración (base real, nunca mock)
- Ubicación propuesta: `test/integration/datos-clinica/{esquema,aislamiento,recursos-reader,calendario-reader,escritura,pacientes,errores,seed}.test.ts`.
- `beforeAll`: `reiniciarEsquema` + `aplicarMigraciones` con el directorio real `migrations/` + dos clínicas sintéticas (A, B) insertadas en `clinica`/`clinica_config`.
- Aislamiento: tabla de casos `it.each` sobre las siete tablas usando el arnés de C-03 (lectura A≠B, escritura cruzada → 42501, sin contexto → 0 filas).
- Constraints: un caso por constraint de D3-D5 (incluye borde `fin = inicio` en bloqueos y franjas contiguas).
- Propiedad (fast-check, pocas corridas): para cualquier secuencia de bloqueos aceptados por la base, ningún par del mismo profesional se solapa.
- Seed: corre contra la base de prueba (host permitido, base `_test`), dos veces, comparando conteos e ids.

## Risks / Trade-offs

- **[C-03 sin implementar en `main`]** → C-05 no puede ejecutar su apply: depende de `withTenant`, del pool y del arnés. Mitigación: tarea 0 bloqueante que verifica su presencia; el Líder decide si C-03 se termina primero (recomendado) o si C-05 la incluye (no recomendado: sale de zona y de Agente B).
- **[Firma real de `withTenant` y del arnés distinta de la supuesta]** → D7 usa una interfaz mínima `{ query }` para tolerar cambios; si el arnés de C-03 no es parametrizable por tabla, C-05 necesitaría extenderlo (zona `test/support/**` de C-03). Mitigación: confirmar con el dueño de C-03 antes del apply.
- **[FK que no pasan por RLS]** → mitigado con FK compuestas (D2) y prueba de inserción cruzada.
- **[`detail` de PostgreSQL con DNI]** → mitigado con D10 y pruebas que buscan el valor en el error serializado.
- **[`date` desplazado por la zona del proceso]** → `fecha::text` (D11) y prueba con `TZ` distinta de UTC.
- **[Inmutabilidad de la expresión de franjas]** → *spike* en la tarea 2.1; plan B con columnas en minutos.
- **[DNI sintéticos que coinciden con DNI reales]** → cualquier número de 7-8 dígitos puede ser de una persona real. Mitigación propuesta: generar en un rango acordado y documentado como sintético, sin otros datos reales asociados (los nombres y emails son inventados). Requiere confirmación del Líder.
- **[Teléfonos sintéticos marcables]** → mismo problema; se usan solo en entornos sin envío real (WhatsApp es manual, email va a `example.com`).
- **[Interfaces de escritura no congeladas]** → C-08/C-10/C-12 pueden necesitar operaciones extra; se agregan en un PR a la zona de C-05 con aviso, sin romper el contrato de C-02.
- **[Sin `DELETE` de pacientes]** → el derecho de supresión (Ley 25.326) no tiene camino en la app v1; queda como operación de mantenimiento hasta resolver PO-10.
- **[`motivo` del bloqueo como texto libre]** → podría contener datos personales escritos por la recepción; se trata como dato sensible (no se loguea).

## Migration Plan

1. Verificar precondiciones: `C03_001` aplicada; `withTenant`, pool y arnés de C-03 fusionados.
2. Agregar `migrations/C05_001_datos_clinica_y_pacientes.sql`; aplicarla con `npm run db:migrate` (rol `migra`).
3. Correr `npm run test:integration` (constraints, aislamiento, repositorios, seed).
4. Opcional en local: `ALLOW_SEED=true npm run db:seed`.
5. **Rollback** (base no productiva; no hay datos reales todavía): `DROP TABLE bloqueo, horario_atencion, feriado, paciente, prestacion, sillon, profesional;` y `DROP FUNCTION minutos_del_dia(time);` con el rol `migra`, más borrar la fila `C05_001` de `schema_migrations`. Una vez fusionada, la migración no se edita (regla 6): cualquier corrección va en `C05_002`.

## Open Questions

Deben confirmarse con el Líder **antes del apply** (governance ALTO). Ninguna cambia los puertos de C-02 salvo la Q4.

1. **C-03**: ¿se completa y fusiona C-03 (pool, `withTenant`, `RequestContext`, arnés, `resolver_clinica_por_slug`) antes de empezar C-05? ¿Y se corrige su estado `[x]` en `CHANGES.md`?
2. **Zona**: autorizar `src/infrastructure/db/repositories/{recursos,compartido}/**` (composición de `RecursosReader`, `configuracionAgenda`, traducción de errores, mapeos) y `test/integration/datos-clinica/**`.
3. **D5**: ¿exclusión de franjas en la base o solo validación en C-08?
4. **D12 / contrato congelado**: ¿basta con que `prestacion(id)` devuelva prestaciones inactivas, o se agrega `activa` a `Prestacion` en C-02 (PR del dueño de C-02 con aviso a C-05, C-09, C-12, C-13)?
5. **DNI** (`paciente_dni_formato_check`): ¿solo 7-8 dígitos o también pasaportes/documentos extranjeros? ¿`email` opcional y `telefono` obligatorio?
6. **D6**: ¿sin `DELETE` para pacientes y recursos desactivables?
7. **Seed**: rango de DNI y teléfonos sintéticos aceptado; faker `es` en lugar de `es_AR` (no existe en faker 10).
8. **PO-11** (tipos de sillón por prestación): no se modela; si se resuelve por sí, hará falta una tabla de compatibilidad en un change posterior.
9. **PO-15** (mantenimiento anual de feriados): el seed trae una lista estática del año; la plantilla nacional es de C-08.
10. **PO-06** (granularidad): se lee de `clinica_config` tal como la dejó C-03; C-05 no la valida.
