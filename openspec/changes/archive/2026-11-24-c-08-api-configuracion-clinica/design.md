# Design

## Context

Motivación y alcance: ver `proposal.md`. Requisitos: `specs/api-configuracion-clinica`, `specs/api-recursos-clinica`, `specs/api-horarios-atencion`, `specs/api-feriados` y `specs/esquema-datos-clinica`.

Estado observado en `main` (C-01 a C-07 y C-17 fusionados) que condiciona el diseño:

- **HTTP (C-01)**: `registrarModulos` carga cada carpeta de `src/interfaces/http/modules/` como plugin encapsulado con prefijo `/api/v1`, sin editar archivos compartidos. `registrarManejoDeErrores` traduce `ErrorDeDominio.tipo` a estado (`solicitud_invalida` 400, `no_autenticado` 401, `prohibido` 403, `no_encontrado` 404, `conflicto` 409, `regla_de_negocio` 422) con cuerpo `{ codigo, mensaje }`; los errores de esquema salen como `400 SOLICITUD_INVALIDA` con `campos` (sin valores); una ruta o método inexistente, `404 RUTA_NO_ENCONTRADA`. La validación usa TypeBox (`typebox`) con el Ajv por defecto de Fastify (`removeAdditional: true`, `coerceTypes: 'array'`, `useDefaults: true`).
- **Auth/RBAC (C-06)**: `pluginDeAutenticacion` agrega un hook `onRequest` que valida el JWT y llena `request.userContext` (`RequestContext` con `actor.rol`). `contextoDePedido(request)` lanza `401 AUTENTICACION_REQUERIDA`; el hook responde `401 TOKEN_INVALIDO`. `requireRole(ctx, rol)` acepta **un solo rol** y lanza `403 ACCESO_PROHIBIDO`. El JWT no trae `profesional_id`; `buscarUsuarioPorId(cliente, clinicaId, id)` lo devuelve.
- **Hallazgo (bug latente de C-06)**: el módulo `auth` hace `await app.register(pluginDeAutenticacion)` sin `fastify-plugin` ni `skip-override`, así que el hook queda encapsulado en un contexto hijo **sin rutas**: ninguna ruta de otro módulo (incluido `usuarios`) recibe `userContext` y todas responden 401. No hay pruebas de API autenticadas que lo detecten.
- **Repositorios (C-05)**: `crear{Profesional,Sillon,Prestacion}Repository` (crear, obtenerPorId, listar, actualizar con lista blanca, desactivar), `crearFeriadoRepository` (crear, eliminar, listar), `crearHorarioRepository.reemplazarFranjas` (DELETE + INSERT bajo `SAVEPOINT`), `crearCalendarioReader.franjasDeAtencion`. Tenant implícito por RLS; un id ajeno o no UUID devuelve `null`/`false`. `consultar` traduce errores con `traducirErrorPg`: `FRANJA_SOLAPADA` 409, `FERIADO_DUPLICADO` 409, `23503 → RECURSO_NO_ENCONTRADO` 404, CHECK → `DATOS_INVALIDOS` 400. **No existe** adaptador de `clinica`/`clinica_config` (solo `configuracionAgenda` de lectura en `RecursosReader`).
- **Privilegios**: `app` tiene `SELECT, INSERT, UPDATE` (sin `DELETE`) sobre `profesional`, `sillon`, `prestacion`; `SELECT, INSERT, UPDATE, DELETE` sobre `feriado`, `horario_atencion`, `clinica`, `clinica_config`. `clinica` no tiene RLS: toda lectura filtra por `app.clinica_id`.
- **Auditoría (C-07)**: `crearAuditoriaPg(ejecutor)` + `conAuditoriaDeCambio(auditoria, ctx, opciones, ejecutar)` (*fail-closed*). `accion` es `AccionAuditoriaConocida | string` validada como `snake_case`; `entidad` es texto `snake_case` libre; `entidad_id` uuid. El enmascarador redacta globalmente `nombre`, `apellido`, `email`, etc. y sanea `descripcion`.
- **Dominio (C-02)**: `validarGranularidad` (entero > 0 que divide 1440), `parsearHoraLocal` (`HH:MM[:SS]` → minutos, admite `24:00`), `crearFechaLocal` (fecha de calendario válida), `FranjaAtencion` en minutos locales.
- **Pruebas**: proyecto `api` sin base de datos; proyecto `integration` con PostgreSQL real, sin paralelismo entre archivos, cada archivo reinicia el esquema y aplica `migrations/` en `beforeAll` (patrón de `test/integration/datos-clinica/soporte.ts`).

## Goals / Non-Goals

**Goals:**
- Lógica de negocio (permisos por rol, validaciones de franjas y granularidad, idempotencia de la plantilla, armado de los eventos de auditoría) en `src/application/configuracion/**`, pura y probada con dobles en memoria; rutas delgadas.
- Cada mutación y su auditoría en **una** transacción `withTenant`; la base sigue siendo la garantía final (FK compuestas, CHECK, exclusión, RLS).
- Cero cambios en contratos congelados y en archivos de otros changes.

**Non-Goals:**
- Corregir el registro de `pluginDeAutenticacion` en el módulo `auth` ni el mapeo de errores de `usuarios` (zona de C-06; se reporta).
- Paginación, búsqueda por texto u ordenamientos configurables (catálogos de decenas de filas).
- Validar que las franjas o duraciones estén alineadas a la granularidad (lo resuelve la disponibilidad de C-13).
- Efectos sobre turnos al desactivar recursos o cambiar la granularidad (C-09/C-13).

## Decisions

### D1. Migración `C08_001_usuario_profesional_fk.sql`: FK compuesta sin índice ni limpieza de datos
```sql
ALTER TABLE usuario
  ADD CONSTRAINT usuario_profesional_fk FOREIGN KEY (clinica_id, profesional_id)
  REFERENCES profesional (clinica_id, id);
```
- Compuesta como en D2 de C-05: las FK no pasan por RLS y una FK simple a `profesional(id)` permitiría vincular un usuario a un profesional de otra clínica. `profesional_clinica_id_id_key` (C-05) ya provee la clave única referenciada.
- `MATCH SIMPLE` (por defecto): con `profesional_id` nulo la FK no se evalúa → administradores y recepcionistas siguen sin profesional.
- `ON DELETE NO ACTION` (por defecto): `app` no tiene `DELETE` sobre `profesional`, así que no hay borrados que propagar.
- **Datos existentes**: se agrega validada (no `NOT VALID`). Si hubiera usuarios huérfanos, la migración falla de forma atómica (el runner de C-01 es transaccional por archivo) y se corrige el dato antes de reintentar; no se anulan vínculos en silencio. Hoy solo C-17 crea usuarios y lo hace con `profesional_id` nulo; las bases de desarrollo se recrean.
- Sin índice extra: no hay borrados de `profesional` que lo necesiten y las búsquedas por profesional no existen todavía (YAGNI). Sin cambios de privilegios: la comprobación de FK corre como propietario.
- *Alternativa*: FK simple `REFERENCES profesional(id)`. Descartada por el cruce de clínicas.

### D2. Capas y composición por pedido
```
ruta (módulo HTTP) ─ contextoDePedido → caso de uso (permiso sin I/O) → withTenant(ctx.clinicaId, cliente =>
    casoDeUso(dependencias(cliente), ctx, entrada))           ← repos C-05 + auditoría C-07 sobre el MISMO cliente
```
- `src/application/configuracion/puertos.ts` declara **puertos propios** mínimos (`ProfesionalesPuerto`, `SillonesPuerto`, `PrestacionesPuerto`, `FeriadosPuerto`, `HorariosPuerto` = lectura de franjas + `reemplazarFranjas`, `ConfiguracionClinicaPuerto`, `VinculoProfesionalPuerto`) cuyas firmas son subconjuntos estructurales de los repositorios de C-05: los adaptadores existentes los satisfacen sin cambios. La aplicación no importa `infrastructure/` (lo impide la regla de ESLint).
- Cada módulo HTTP tiene un `dependencias.ts` que arma `{ ...repos, auditoria: crearAuditoriaPg(cliente) }` desde el `PoolClient` de `withTenant`. Duplicación menor entre módulos aceptada: un helper compartido obligaría a una carpeta fuera de `modules/{...}` o a una carpeta que el registrador cargaría como módulo.
- Los casos de uso reciben `(deps, ctx, entrada)` y devuelven DTO planos; las rutas solo validan forma (TypeBox), llaman y fijan el estado HTTP.
- *Alternativa*: rutas que llaman a los repositorios directamente (como `usuarios`). Descartada: viola la regla 7 y no permite probar permisos y auditoría sin base.

### D3. Autenticación en los módulos de C-08 sin tocar C-06
Cada módulo de C-08 invoca `await pluginDeAutenticacion(app)` **como función** (no con `app.register`) al inicio de su plugin: el hook `onRequest` se agrega al contexto encapsulado del propio módulo y cubre todas sus rutas.
- *Alternativa*: envolver el plugin con `fastify-plugin` o `skip-override` en `src/infrastructure/auth/plugin.ts`. Es la corrección correcta, pero está fuera de la zona de C-08 (regla 14). Se reporta al Líder; si C-06 lo vuelve global, se quitan estas llamadas en un change de seguimiento (el hook correría dos veces; ver Riesgos).

### D4. Adaptador nuevo `src/infrastructure/db/repositories/configuracion-clinica/index.ts`
C-05 no dejó escritura de `clinica_config`. Se agrega un archivo **nuevo** (no se edita nada existente) con `crearConfiguracionClinicaRepository(ejecutor)`:
- `obtener({ bloquear })`: `SELECT c.id, c.nombre, c.slug, c.zona_horaria, cc.reserva_requiere_confirmacion, cc.cancelacion_anticipacion_horas, cc.granularidad_minutos FROM clinica c JOIN clinica_config cc ON cc.clinica_id = c.id WHERE c.id = CLINICA_DEL_CONTEXTO_SQL [FOR UPDATE OF cc]`. El filtro explícito es obligatorio porque `clinica` no tiene RLS.
- `actualizar(cambios)`: `UPDATE clinica_config SET col = CASE WHEN $flag THEN $valor ELSE col END ... WHERE clinica_id = CLINICA_DEL_CONTEXTO_SQL RETURNING ...` (mismo patrón de bandera+valor de C-05, SQL fijo y parametrizado).
- Usa `consultar` (traducción de errores de C-05). Sin fila → `ErrorDePersistencia` (500): toda clínica tiene `clinica_config` desde C-17.
- *Alternativa*: SQL inline en el módulo `clinica`. Descartada: pondría SQL en `interfaces/`. Se declara en `proposal.md §Impact` como extensión de zona sin edición de archivos ajenos.

### D5. Permisos por rol en la aplicación
`permisos.ts` define `exigirRol(ctx, roles: readonly RolDePersonal[])` → `ErrorDeDominio('ACCESO_PROHIBIDO', 'prohibido', 'El rol no tiene permiso para este recurso.')` (mismo código y mensaje que `requireRole` de C-06, que solo admite un rol). Constantes `LECTURA = ['administrador','recepcionista','odontologo']` y `ESCRITURA = ['administrador']` según `03 §RBAC`:

| Ruta | Lectura (GET) | Escritura |
|---|---|---|
| `/clinica` | los tres roles | `PATCH`: administrador |
| `/profesionales`, `/profesionales/{id}` | los tres | `POST`, `PATCH`: administrador |
| `/profesionales/{id}/horarios` | administrador y recepcionista; odontólogo solo el propio | `PUT`: administrador |
| `/sillones`, `/prestaciones` (+ `/{id}`) | los tres | `POST`, `PATCH`: administrador |
| `/feriados`, `/feriados/plantilla-nacional` | los tres | `POST /feriados`, `DELETE /feriados/{id}`, `POST /feriados/plantilla-nacional`: administrador |

- El chequeo de rol ocurre **antes** de abrir la transacción (403 sin tocar la base). Un rol desconocido en el token se trata como sin permiso.
- **Odontólogo y horarios propios**: dentro de la transacción, primero se verifica que el profesional exista (si no, 404 para todos los roles: no se distingue "ajeno" de "inexistente", regla 12); luego, si el rol es `odontologo`, `VinculoProfesionalPuerto.profesionalDelUsuario(ctx.actor.id)` (adaptador sobre `buscarUsuarioPorId` de C-06, solo lectura; usuario inactivo o sin vínculo → `null`) debe coincidir con el id pedido, si no **403**. Dentro de la propia clínica, 403 es correcto: el recurso existe y el rol no alcanza.
- *Alternativa*: matriz declarativa `requirePermission(ctx, 'recurso:accion')`. Descartada por ahora: C-06 no la ofrece y crearla sería un contrato nuevo compartido.

### D6. URLs, DTO y esquemas TypeBox
JSON en `camelCase` (como `usuarios`). Cuerpos con `additionalProperties: false` (Ajv **quita** los campos desconocidos, no falla) y esquemas de respuesta `200/201` que funcionan como lista blanca de serialización.

| Recurso | DTO de salida | Alta (`POST`, 201) | Modificación (`PATCH`, 200) |
|---|---|---|---|
| clínica | `{ id, nombre, slug, zonaHoraria, reservaRequiereConfirmacion, cancelacionAnticipacionHoras, granularidadMinutos }` | — | `reservaRequiereConfirmacion?: boolean`, `cancelacionAnticipacionHoras?: integer 0..720`, `granularidadMinutos?: integer 5..240` |
| profesional | `{ id, nombre, apellido, matricula: string\|null, activo }` | `nombre`, `apellido` (1..100, patrón `\S`), `matricula?` (1..50 o `null`) | los mismos opcionales + `activo?` |
| sillón | `{ id, nombre, bufferMinutos, activo }` | `nombre` (1..100), `bufferMinutos?` (integer 0..240, defecto 0) | `nombre?`, `bufferMinutos?`, `activo?` |
| prestación | `{ id, nombre, duracionMinutos, activa }` | `nombre` (1..100), `duracionMinutos` (integer 1..480) | `nombre?`, `duracionMinutos?`, `activa?` |
| horarios | `{ profesionalId, franjas: [{ diaSemana, horaDesde, horaHasta }] }` | — | `PUT` `{ franjas: [...] }` máx. 50; `diaSemana` integer 0..6; horas con patrón `^(([01][0-9]\|2[0-3]):[0-5][0-9]\|24:00)$` |
| feriado | `{ id, fecha: 'YYYY-MM-DD', descripcion }` | `fecha` (patrón `^\d{4}-\d{2}-\d{2}$`), `descripcion` (1..200, `\S`) | — (`DELETE /feriados/{id}` → 204 sin cuerpo) |
| plantilla | `GET ?anio=` → `{ anio, feriados: [{ fecha, descripcion }] }` | `POST { anio }` → 200 `{ anio, creados: Feriado[], omitidas: string[] }` | — |

- Listas: `GET /profesionales|/sillones|/prestaciones?activo=true|false` (para prestaciones el filtro también se llama `activo` y mapea a `activa`); `GET /feriados?anio=` (integer 2000..2100). Sin paginación: catálogos acotados por clínica. Orden: el de los repositorios de C-05 (profesionales por apellido, nombre, id; sillones y prestaciones por nombre, id; feriados por fecha). El filtro se aplica en la aplicación sobre `listar()` (sin SQL nuevo).
- Parámetro `{id}` sin `format: uuid`: un id mal formado responde **404** `RECURSO_NO_ENCONTRADO` (los repositorios ya devuelven `null` para no-UUID), igual que uno inexistente o ajeno.
- Textos: se recortan espacios (`trim`) en la aplicación antes de persistir; el patrón `\S` del esquema ya rechaza los vacíos con 400.
- **PATCH vacío**: como Ajv quita los campos desconocidos, la aplicación verifica que quede al menos un campo modificable; si no, `400 CAMBIOS_VACIOS` (antes de abrir la transacción, sin auditoría). Es determinístico y no depende del orden entre `removeAdditional` y `minProperties`.
- Sin `DELETE` para profesionales, sillones y prestaciones (D7): Fastify responde `404 RUTA_NO_ENCONTRADA`.

### D7. Baja = desactivación, nunca borrado físico
Profesionales, sillones y prestaciones se desactivan y reactivan por `PATCH` (`activo`/`activa`). No existe la tabla `turno` todavía, así que C-08 no puede preguntar "¿tiene turnos?"; en su lugar la regla es incondicional, coherente con D6 de C-05 (el rol `app` ni siquiera tiene `DELETE`). Así se cumple "desactivar en lugar de borrar cuando hay turnos" para siempre, sin depender de C-09. Desactivar un profesional **no** borra sus franjas (se conservan para reactivarlo); rechazar reservas sobre recursos inactivos es responsabilidad de C-09/C-15 (`RecursosReader` ya expone `activo`).
- *Alternativa*: `DELETE` que borra si no hay turnos y si no desactiva. Descartada: semántica ambigua, requiere `DELETE` en la base y una consulta a `turno` que no existe.
- `horario_atencion` y `feriado` sí se borran: no son referenciados por turnos (el turno copia lo necesario) y el reemplazo de franjas lo exige.

### D8. Validaciones puras y códigos de error
`src/application/configuracion/validaciones.ts` y `errores.ts`:

| Regla | Dónde | Respuesta |
|---|---|---|
| Tipos, rangos, patrones, longitudes | Esquema TypeBox | `400 SOLICITUD_INVALIDA` (+ CHECK de la base como respaldo → `400 DATOS_INVALIDOS`) |
| Sin campos modificables | Aplicación | `400 CAMBIOS_VACIOS` |
| Granularidad no divide 1440 | Aplicación (`esGranularidadValida`) | `422 GRANULARIDAD_INVALIDA` |
| `horaDesde >= horaHasta` | Aplicación | `400 FRANJA_INVALIDA` |
| Solape de franjas (mismo día) | Aplicación + exclusión `horario_sin_solape` | `409 FRANJA_SOLAPADA` (mismo código en ambos caminos) |
| Fecha de calendario inexistente | Aplicación (`crearFechaLocal` del dominio) | `400 FECHA_HORA_LOCAL_INVALIDA` |
| Feriado repetido | Base (`feriado_fecha_unica`) | `409 FERIADO_DUPLICADO` |
| Año sin plantilla | Aplicación | `422 PLANTILLA_FERIADOS_NO_DISPONIBLE` |
| Recurso inexistente, ajeno o id mal formado | Aplicación (repos devuelven `null`) / FK | `404 RECURSO_NO_ENCONTRADO` |
| Rol sin permiso | Aplicación | `403 ACCESO_PROHIBIDO` |

- **Granularidad**: `esGranularidadValida(g) = Number.isInteger(g) && g > 0 && 1440 % g === 0`. Es la misma regla que el primer guardia de `validarGranularidad` del dominio; para no divergir, una prueba de propiedad compara ambas para todo `g` de 1 a 1440 sondeando `validarGranularidad` con la medianoche UTC (`OCUPACION_INVALIDA` ⇔ inválida). Rango 5..240 en el esquema: debajo de 5 la grilla es inútil y encima de 240 no hay turnos posibles en franjas típicas (provisional, PO-06).
- **Franjas**: se convierten con `parsearHoraLocal` del dominio; el solape se detecta ordenando por `(diaSemana, desde)` y comparando vecinas (`siguiente.desde < anterior.hasta`), con semántica `[desde, hasta)`; una prueba de propiedad la compara con la verificación por pares. La salida se formatea `HH:MM` con un helper propio (`1440 → "24:00"`); `minutosAHora` de infraestructura no se importa desde la aplicación.
- Las fábricas de error de la aplicación reutilizan los **mismos códigos** que C-05/C-06 (`RECURSO_NO_ENCONTRADO`, `FRANJA_SOLAPADA`, `ACCESO_PROHIBIDO`) para que el cliente vea un único código por situación.

### D9. Auditoría por mutación, en la misma transacción
Toda mutación se envuelve con `conAuditoriaDeCambio(deps.auditoria, ctx, { accion, entidad, entidadId, antes, despues, ip: request.ip }, ejecutar)` dentro del `withTenant` del pedido; si la auditoría falla, el error se propaga y `withTenant` hace `ROLLBACK` (*fail-closed*). Las operaciones rechazadas (400/403/404/409/422) no auditan.

| Operación | `accion` | `entidad` | `entidad_id` | `antes` / `despues` |
|---|---|---|---|---|
| `PATCH /clinica` | `modificacion` | `clinica_config` | id de la clínica | los tres parámetros antes / después |
| `POST` profesional/sillón/prestación | `creacion` | `profesional` / `sillon` / `prestacion` | id creado | `null` / DTO |
| `PATCH` (incluye activar/desactivar) | `modificacion` | ídem | id | DTO antes / DTO después |
| `PUT /profesionales/{id}/horarios` | `modificacion` | `horario_atencion` | id del profesional | `{ franjas }` antes / después |
| `POST /feriados` y cada feriado creado por la plantilla | `creacion` | `feriado` | id del feriado | `null` / `{ fecha, descripcion, origen: 'manual' \| 'plantilla_nacional' }` |
| `DELETE /feriados/{id}` | `eliminacion` | `feriado` | id | `{ fecha, descripcion }` / `null` |

- **Vocabulario**: `creacion` y `modificacion` están en `ACCIONES_AUDITORIA`; `eliminacion` no, pero el contrato lo admite (`AccionAuditoriaConocida | (string & {})`, validado como `snake_case`). **No es un cambio de contrato congelado**; se recomienda al Líder sumarlo a la lista conocida en un change futuro de C-07/C-16 (no bloquea).
- `antes` se lee dentro de la misma transacción justo antes de mutar (`obtenerPorId`, `franjasDeAtencion`, `listar` de feriados, `obtener({ bloquear: true })` de la configuración). Un `PATCH` sin cambios efectivos igual se audita (refleja la intención del actor; simple y predecible).
- El enmascarador de C-07 redacta `nombre` y `apellido` de profesionales (y `nombre` de sillones y prestaciones) según su Q1; la trazabilidad queda por `entidad_id`. Se acepta.
- Plantilla: **un evento por feriado creado** (no uno resumen), para que la consulta por `entidad_id` de C-16 funcione igual que con altas manuales.

### D10. Plantilla de feriados nacionales: módulo TypeScript versionado
`src/application/configuracion/feriados-nacionales.ts` exporta `PLANTILLAS_FERIADOS_NACIONALES: Readonly<Record<number, readonly { fecha: string; descripcion: string }[]>>` con 2026 y 2027: feriados nacionales inamovibles y trasladables **ya trasladados** según la Ley 27.399; sin días no laborables ni "puentes" turísticos (la clínica los agrega a mano).

- 2026: 01-01 Año Nuevo; 02-16 y 02-17 Carnaval; 03-24 Día Nacional de la Memoria por la Verdad y la Justicia; 04-02 Día del Veterano y de los Caídos en la Guerra de Malvinas; 04-03 Viernes Santo; 05-01 Día del Trabajador; 05-25 Día de la Revolución de Mayo; 06-15 Paso a la Inmortalidad del Gral. Martín Miguel de Güemes (trasladado del 17/6); 06-20 Paso a la Inmortalidad del Gral. Manuel Belgrano; 07-09 Día de la Independencia; 08-17 Paso a la Inmortalidad del Gral. José de San Martín; 10-12 Día del Respeto a la Diversidad Cultural; 11-23 Día de la Soberanía Nacional (trasladado del 20/11); 12-08 Inmaculada Concepción de María; 12-25 Navidad.
- 2027: 01-01; 02-08 y 02-09 Carnaval; 03-24; 03-26 Viernes Santo; 04-02 Malvinas; 05-01; 05-25; 06-20 Belgrano; 06-21 Güemes (trasladado del 17/6); 07-09; 08-16 San Martín (trasladado del 17/8); 10-11 Diversidad Cultural (trasladado del 12/10); 11-20 Soberanía Nacional (sábado, no se traslada); 12-08; 12-25.
- **Provisional**: fechas derivadas de la ley y la Pascua; antes de fusionar se cotejan con el calendario oficial publicado por el Gobierno nacional. Cada año se agrega uno nuevo en un PR (PO-15).
- **Copia idempotente**: `copiarPlantilla` lee los feriados existentes de la clínica, crea solo las fechas ausentes (con `crearFechaLocal` + `FeriadosPuerto.crear`, auditando cada una) y devuelve `{ creados, omitidas }`; nunca sobrescribe la descripción de la clínica. Todo en una transacción: si una inserción falla, no queda nada a medias. Dos copias concurrentes pueden chocar en `feriado_fecha_unica` → `409 FERIADO_DUPLICADO` en la perdedora, que al reintentar obtiene 0 creados.
- *Alternativas*: JSON en `seeds/` o en `data/` (requiere lectura de archivo y su copia a `dist/`); tabla global de plantilla (más migración y RLS especial); servicio externo (prohibido por el alcance y por disponibilidad). El módulo TS se compila, se tipa y se prueba.

### D11. Estrategia de pruebas (Strict TDD)
- **Unitarias** (`test/unit/configuracion/**`, sin base): validaciones (con propiedades `fast-check`: solape vs pares, granularidad vs dominio), permisos, y cada caso de uso con puertos en memoria y un `ServicioAuditoria` espía (auditoría con los datos de D9; sin auditoría si el caso falla; error de auditoría propagado), y la plantilla (fechas válidas, únicas, del año, ordenadas; inamovibles presentes).
- **API sin base** (`test/api/configuracion-acceso.test.ts`): 401 sin token y con token inválido, 403 por rol en escrituras (el chequeo de rol es previo a `withTenant`). Requiere `JWT_ACCESS_SECRET` y `DATABASE_URL` (ficticia) en `process.env`, porque `pluginDeAutenticacion` lee `loadConfig('app')`.
- **Integración con PostgreSQL real** (`test/integration/configuracion/**`): soporte propio (`soporte.ts`, sin tocar `test/support/**`) que reinicia esquema, aplica migraciones, crea clínicas A y B, firma tokens con `firmarTokenDeAcceso` por rol y crea un usuario odontólogo vinculado; pruebas `inject` por recurso de permisos, aislamiento A/B (404 y listas), validaciones y auditoría persistida; prueba de la FK de C08_001; prueba de atomicidad que ejecuta un caso de uso dentro de `withTenant` con una auditoría que falla y verifica que la base no cambió.

## Risks / Trade-offs

- [Si C-06 corrige `pluginDeAutenticacion` para que sea global, el hook corre dos veces en las rutas de C-08; con un token inválido podría intentar responder dos veces] → El fix de C-06 debe ir con la eliminación de las llamadas de D3 (una línea por módulo); se deja anotado en el PR. Las pruebas de 401 con token inválido lo detectan.
- [El hook de C-06 responde 401 sin `return reply` en un hook `async`] → Cubierto por la prueba "token inválido → 401" de C-08; si aparece el aviso de respuesta doble, se reporta a C-06 (no se edita su archivo).
- [Con la FK nueva, `POST/PUT /usuarios` de C-06 con un `profesionalId` inexistente o ajeno falla con `23503` no traducido → 500] → Es un dato inválido que antes se aceptaba en silencio; se reporta para que C-06 lo traduzca a 404/422. C-08 no edita `repositorio-de-usuarios.ts`.
- [`antes` de la auditoría de profesionales/sillones/prestaciones se lee sin `FOR UPDATE`: dos `PATCH` concurrentes al mismo recurso pueden auditar un `antes` desactualizado] → Impacto bajo (catálogo editado por un administrador); `despues` siempre es exacto. La configuración de la clínica sí se bloquea (`FOR UPDATE`).
- [Plantilla de feriados con fechas derivadas, no oficiales] → Marcada provisional; verificación manual antes de fusionar; la clínica puede borrar o agregar feriados.
- [Cambiar la granularidad deja turnos futuros desalineados respecto de la grilla nueva] → No existen turnos todavía; C-09 valida alineación solo al crear. Se documenta para C-13.
- [Ajv con `coerceTypes` acepta `"30"` como 30 y quita campos desconocidos] → Comportamiento uniforme de toda la API (C-01); `CAMBIOS_VACIOS` cubre el caso de cuerpo que queda vacío.
- [Nombres de profesionales enmascarados en auditoría] → Decisión vigente de C-07 (Q1); la trazabilidad es por `entidad_id`.

## Migration Plan

1. `npm run db:migrate` aplica `C08_001_usuario_profesional_fk.sql` (transaccional). Antes, en bases con datos, verificar que no haya huérfanos: `SELECT count(*) FROM usuario u WHERE profesional_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profesional p WHERE p.clinica_id = u.clinica_id AND p.id = u.profesional_id)` (como `migra` devuelve 0 por la RLS forzada: ejecutarlo como `app` por clínica, o confiar en el fallo atómico de la migración, ya que la validación de la FK sí ignora la RLS).
2. Despliegue de los cinco módulos HTTP: no cambian rutas existentes.
3. **Rollback**: `ALTER TABLE usuario DROP CONSTRAINT usuario_profesional_fk;` en una migración nueva `C08_002` (nunca editar `C08_001`); los módulos se retiran borrando sus carpetas (el registrador no necesita cambios).

## Open Questions

No bloquean el apply; se adopta el valor provisional indicado.

- **PO-06 (granularidad)**: configurable por clínica, rango 5..240 y divisor de 1440; por defecto 15 (`clinica_config`).
- **PO-07 (sobreturnos/feriados)**: C-08 no ofrece excepciones; un feriado bloquea el día entero (RN-AG-07).
- **PO-11 (tipo de sillón por prestación)**: sin relación sillón-prestación en v1.
- **PO-15 (mantenimiento de feriados)**: plantilla versionada en el repositorio, un PR por año; cada clínica copia y ajusta.
- **Rango de anticipación de cancelación**: 0..720 horas (30 días), por defecto 24 (provisional).
- **Límites de textos y cantidades** (100/50/200 caracteres, 50 franjas, buffer ≤ 240, duración ≤ 480): provisionales, ajustables sin cambiar el diseño.
- **`eliminacion` en `ACCIONES_AUDITORIA`**: se sugiere sumarlo a la lista conocida de C-07 en un change futuro.
