# Design

## Context

Motivación y alcance: ver `proposal.md`. Requisitos: `specs/api-pacientes`.

Estado observado en `main` (C-01 a C-09, C-13 y C-17 fusionados) que condiciona el diseño:

- **Tabla `paciente` (C05_001)**: `id`, `clinica_id`, `nombre`, `apellido`, `dni`, `telefono`, `email`, `obra_social`, `creado_en`. Constraints `paciente_dni_unico (clinica_id, dni)`, `paciente_dni_formato_check` (`^[0-9]{7,8}$`) y `paciente_telefono_formato_check` (`^\+[1-9][0-9]{7,14}$`). Índice `paciente_apellido_idx` sobre `translate(lower(apellido), 'áéíóúü', 'aeiouu')` con `text_pattern_ops`. RLS con `aplicar_rls`. **No hay columna `activo`** (el comentario D6 de C05_001 dice "pacientes se desactivan", pero el esquema no lo soporta).
- **Privilegios**: `app` tiene `SELECT, INSERT, UPDATE` a nivel de tabla sobre `paciente` (sin `DELETE`) y `SELECT, INSERT, UPDATE, DELETE` sobre `turno`. **No hace falta migración** para C-10.
- **Repositorio (C-05)**: `crearPacienteRepository(ejecutor)` con `crear`, `obtenerPorId` (no-UUID → `null`), `buscarPorDni` (exacto), `buscarPorApellido(prefijo, limite ≤ 200)` (prefijo literal escapado, sin mayúsculas ni tildes, orden `apellido, nombre, id`) y `actualizar` (lista blanca con banderas, no-UUID o ausente → `null`). `consultar` traduce `23505 paciente_dni_unico` → `409 PACIENTE_DNI_DUPLICADO` y los CHECK → `400 DATOS_INVALIDOS`, sin copiar el `detail` del motor. El repositorio espera el teléfono **ya normalizado**.
- **Teléfono (C-04)**: `normalizarTelefonoAr(texto)` devuelve `549` + área + abonado (13 dígitos, **sin `+`**) o lanza `400 TELEFONO_INVALIDO` sin el número en el mensaje. Solo acepta celulares argentinos. El seed de C-05 guarda `+${normalizarTelefonoAr(...)}`.
- **Auth/RBAC (C-06)**: `pluginDeAutenticacion` no está envuelto con `fastify-plugin`; los módulos lo invocan como función (`await pluginDeAutenticacion(app)`) y agregan un `preValidation` que llama a `contextoDePedido` (401 antes que la validación de forma), patrón de `modules/profesionales`. El JWT no trae `profesional_id`; `buscarUsuarioPorId(cliente, clinicaId, id)` lo devuelve junto con `activo`.
- **Auditoría (C-07)**: `crearAuditoriaPg(cliente)`, `conAuditoriaDeCambio` y `conAuditoriaDeLecturaPaciente` (registra `lectura_ficha`/`paciente` con `antes`/`despues` nulos solo si la ficha existe; *fail-closed*). El enmascarador redacta por clave `nombre`, `apellido`, `dni`, `telefono`, `email`, `obraSocial` y sanea DNIs y emails en campos de texto libre.
- **Turnos (C-09)**: `turno.paciente_id` y `turno.profesional_id` (sin FK a `paciente`), índice `(clinica_id, paciente_id)`. `ESTADOS_ACTIVOS_LIST = ['pendiente_confirmacion','confirmado','atendido','ausente']` en `src/domain/turno/estado.ts`. **Ningún lector existente** responde "¿este paciente tiene turnos con este profesional?" ni filtra pacientes por profesional; C-09 no tiene módulo HTTP.
- **Logs (C-01)**: el serializador de pedidos de `src/infrastructure/logging/logger.ts` registra la URL **sin la query string** y el redactor limpia claves sensibles; el manejador de errores responde `{ codigo, mensaje }` y los errores de esquema listan campo y regla, sin valores.
- **Precedente C-08**: casos de uso en `src/application/<área>/` con puertos propios, `dependencias.ts` por módulo, chequeo de rol antes de `withTenant`, `CAMBIOS_VACIOS`, 404 para id ajeno o mal formado, y un adaptador de infraestructura **nuevo** fuera de zona (`configuracion-clinica`) declarado en la propuesta.

## Goals / Non-Goals

**Goals:**
- Permisos, normalización, alcance del odontólogo y armado de la auditoría en `src/application/pacientes/**`, puros y probados con dobles en memoria; rutas delgadas.
- Cada operación y su auditoría en **una** transacción `withTenant`; la base sigue siendo la garantía final (unicidad de DNI, CHECK, RLS).
- Cero datos personales en logs, errores y auditoría; cero cambios en contratos congelados y en archivos de otros changes.

**Non-Goals:**
- Baja o desactivación de pacientes, historia clínica, adjuntos, fusión de duplicados.
- Paginación por cursor u ordenamientos configurables (la búsqueda es por criterio y con tope).
- Corregir el registro encapsulado de `pluginDeAutenticacion` (zona de C-06; se mantiene el patrón vigente).
- Agregar FK `turno.paciente_id → paciente` (zona de C-09; se reporta).

## Decisions

### D1. Capas y composición por pedido
```
ruta (módulo pacientes) ─ contextoDePedido → caso de uso: exigirRol (sin I/O)
   → withTenant(ctx.clinicaId, cliente => casoDeUso(dependenciasDePacientes(cliente, ctx.clinicaId), ctx, entrada, ip))
        repos C-05 + lector paciente-acceso + vínculo C-06 + auditoría C-07 sobre el MISMO cliente
```
- `src/application/pacientes/`: `puertos.ts` (`PacientesPuerto` = subconjunto estructural de `PacienteRepository`; `AccesoPacientesPuerto`; `VinculoProfesionalPuerto`; `ServicioAuditoria` de C-07), `permisos.ts`, `errores.ts`, `validaciones.ts`, `pacientes.ts` (casos de uso) e `index.ts`. La aplicación no importa `infrastructure/` (regla de ESLint) ni `application/configuracion/` (se duplican `exigirRol` y `RolDePersonal`, tres líneas, para no acoplar áreas).
- `src/interfaces/http/modules/pacientes/`: `index.ts` (rutas), `esquemas.ts` (TypeBox) y `dependencias.ts`. El adaptador del vínculo odontólogo→profesional repite el de `modules/profesionales/dependencias.ts` (usuario inactivo, inexistente o sin vínculo → `null`); duplicación aceptada como en C-08.
- *Alternativa*: rutas que llaman a los repositorios directamente. Descartada: regla 7 y no permite probar permisos y auditoría sin base.

### D2. Autenticación
Patrón de C-08 sin tocar C-06: `await pluginDeAutenticacion(app)` como función al inicio del plugin y `app.addHook('preValidation', ...)` con `contextoDePedido(request)`, para que un pedido sin token responda 401 antes de cualquier 400 de forma.

### D3. Permisos por rol
| Ruta | Administrador | Recepcionista | Odontólogo |
|---|---|---|---|
| `POST /pacientes` | sí | sí | 403 |
| `PATCH /pacientes/{id}` | sí | sí | 403 |
| `GET /pacientes/{id}` | todos de la clínica | todos de la clínica | solo en su alcance (D4); fuera → 404 |
| `GET /pacientes?dni=\|apellido=` | todos de la clínica | todos de la clínica | resultados filtrados por su alcance (D4) |
| `DELETE /pacientes/{id}` | ruta inexistente → 404 `RUTA_NO_ENCONTRADA` | ídem | ídem |

- `exigirRol` corre **antes** de abrir la transacción (403 sin tocar la base). Rol desconocido en el token = sin permiso. Para el odontólogo en `PATCH`/`POST` el 403 es incondicional (la matriz le da solo R), aunque el paciente esté en su alcance.
- La "D" del administrador en la matriz RBAC no se implementa en v1 (D9, Q4).

### D4. Alcance del odontólogo
1. Dentro de la transacción, `VinculoProfesionalPuerto.profesionalDelUsuario(ctx.actor.id)`; `null` (sin vínculo o usuario inactivo) → `403 ACCESO_PROHIBIDO` (coherente con `03 §Reglas transversales`: sin profesional no opera).
2. **Detalle**: `AccesoPacientesPuerto.esPacienteDeProfesional(pacienteId, profesionalId)`; `false` → `404 RECURSO_NO_ENCONTRADO` **sin auditar**. Se elige 404 y no 403 para no confirmar la existencia de pacientes ajenos al odontólogo (mínimo acceso, Ley 25.326), extendiendo el espíritu de la regla 12. El chequeo ocurre antes de `conAuditoriaDeLecturaPaciente`, así que solo se audita lo efectivamente entregado.
3. **Búsqueda**: `AccesoPacientesPuerto.buscarPorDniDeProfesional(dni, profesionalId)` y `buscarPorApellidoDeProfesional(prefijo, profesionalId, limite)`, que filtran en SQL con `EXISTS` (no se filtra en memoria después del `LIMIT`, lo que devolvería menos resultados de los existentes).
4. **Qué turnos cuentan**: `estado = ANY(ESTADOS_ACTIVOS_LIST)` (`pendiente_confirmacion`, `confirmado`, `atendido`, `ausente`), sin ventana temporal. Un turno `cancelado` o `reprogramado` no da acceso (el turno sucesor del reprogramado sí). Ver Q2.
- *Alternativas*: (a) 403 al odontólogo en búsquedas; descartada, la matriz le da R y lo necesita para ubicar a sus pacientes del día. (b) Agregar `profesionalId` al `RequestContext`; descartada, es contrato congelado.

### D5. Adaptador nuevo `src/infrastructure/db/repositories/paciente-acceso/index.ts`
Archivo **nuevo** (no se edita `paciente/index.ts` de C-05 ni `turno/index.ts` de C-09), `crearAccesoPacientesReader(ejecutor)`, solo `SELECT`, SQL fijo y parametrizado vía `consultar`, con el filtro de tenant explícito además de la RLS:
```sql
-- esPacienteDeProfesional
SELECT EXISTS (SELECT 1 FROM turno t
  WHERE t.clinica_id = CLINICA_DEL_CONTEXTO_SQL AND t.paciente_id = $1
    AND t.profesional_id = $2 AND t.estado = ANY($3::text[])) AS vinculado
-- buscarPor{Dni,Apellido}DeProfesional: mismo SELECT/orden/escape LIKE que el repositorio de C-05
SELECT <columnas> FROM paciente p
 WHERE <p.dni = $1 | APELLIDO_NORMALIZADO LIKE ...>
   AND EXISTS (SELECT 1 FROM turno t WHERE t.clinica_id = p.clinica_id AND t.paciente_id = p.id
               AND t.profesional_id = $2 AND t.estado = ANY($3::text[]))
 ORDER BY p.apellido, p.nombre, p.id LIMIT $4
```
- Id no UUID → `false`/lista vacía sin consultar. Índices existentes alcanzan: `turno_clinica_paciente_idx` y `paciente_apellido_idx`.
- La expresión de apellido normalizado y el escape de `LIKE` se repiten (copiados de C-05, con un comentario que lo indica) porque C-05 no los exporta; una prueba de integración verifica que ambos repositorios devuelven lo mismo para el mismo prefijo.
- *Alternativas*: SQL inline en `modules/pacientes` (descartada: SQL en `interfaces/`); agregar métodos a `PacienteRepository` o a `AgendaReader` (descartada: edita archivos de C-05/C-09). Requiere visto bueno del Líder (Q1).

### D6. Normalización y validación (`validaciones.ts`, puras)
| Campo | Esquema TypeBox | Aplicación | Error |
|---|---|---|---|
| `nombre`, `apellido` | string 1..100, patrón `\S` | `trim` | 400 `SOLICITUD_INVALIDA` |
| `dni` | string 1..20 | quitar `.` y espacios; exigir `^[0-9]{7,8}$` | 400 `DNI_INVALIDO` |
| `telefono` | string 1..30 | `'+' + normalizarTelefonoAr(texto)` | 400 `TELEFONO_INVALIDO` (de C-04) |
| `email` | string ≤ 254, `format: 'email'`, o `null` | `trim` + minúsculas | 400 `SOLICITUD_INVALIDA` |
| `obraSocial` | string 1..100 con `\S`, o `null` | `trim` | 400 `SOLICITUD_INVALIDA` |

- `POST`: `nombre`, `apellido`, `dni`, `telefono` obligatorios; `email` y `obraSocial` opcionales (ausente = `null`). `PATCH`: todos opcionales, solo `email` y `obraSocial` admiten `null`. Cuerpos con `additionalProperties: false` (Ajv quita lo desconocido) y esquemas de respuesta como lista blanca de serialización.
- El CHECK de la base queda como respaldo (`400 DATOS_INVALIDOS`). Las validaciones de la aplicación corren antes de abrir la transacción.
- El DNI de la búsqueda pasa por la misma normalización; un DNI de búsqueda inválido → `400 DNI_INVALIDO`.

### D7. Errores
| Situación | Origen | Respuesta |
|---|---|---|
| Rol sin permiso / odontólogo sin vínculo | Aplicación | 403 `ACCESO_PROHIBIDO` |
| Paciente inexistente, ajeno, id mal formado o fuera del alcance del odontólogo | Aplicación (puertos devuelven `null`/`false`) | 404 `RECURSO_NO_ENCONTRADO` |
| DNI repetido en la clínica | Base (`paciente_dni_unico`, traducido por C-05) | 409 `PACIENTE_DNI_DUPLICADO` |
| DNI o teléfono no normalizable | Aplicación | 400 `DNI_INVALIDO` / `TELEFONO_INVALIDO` |
| `PATCH` sin campos | Aplicación | 400 `CAMBIOS_VACIOS` |
| Búsqueda sin criterio, con ambos o apellido < 2 caracteres | Aplicación | 400 `BUSQUEDA_INVALIDA` |
| Forma inválida (`limite` > 50, tipos, longitudes) | Esquema | 400 `SOLICITUD_INVALIDA` |

- Sin chequeo previo de DNI repetido: el constraint es la única fuente (sin carrera entre dos altas concurrentes). El error de la base aborta la transacción y `withTenant` hace `ROLLBACK`; no se audita.
- Mensajes fijos, sin interpolar datos. Los códigos existentes se reutilizan tal cual (`RECURSO_NO_ENCONTRADO`, `ACCESO_PROHIBIDO`, `CAMBIOS_VACIOS`, `PACIENTE_DNI_DUPLICADO`, `TELEFONO_INVALIDO`); son nuevos `DNI_INVALIDO` y `BUSQUEDA_INVALIDA`.

### D8. Búsqueda
- `GET /pacientes?dni=…` o `?apellido=…` (exactamente uno) y `limite` opcional (integer 1..50, por defecto 20). `apellido`: `trim`, al menos 2 caracteres, máx. 100; prefijo literal (los comodines `%` y `_` se escapan en el repositorio).
- `dni` → `buscarPorDni` (0 o 1 resultado); `apellido` → `buscarPorApellido(prefijo, limite)`. Para el odontólogo, las variantes filtradas de D5.
- Respuesta: arreglo de `PacienteResumenDto = { id, nombre, apellido, dni }` (minimización: sin `telefono`, `email`, `obraSocial`, `creadoEn`). La ficha completa solo se obtiene por el detalle auditado. El DNI se incluye porque la recepción lo necesita para distinguir homónimos y confirmar identidad (Q5).
- **Sin auditoría por búsqueda** (RN-AU-03 audita la lectura de la ficha; la lista es reducida). Ver Q3.
- Mínimo de 2 caracteres y tope de 50 evitan la enumeración masiva de la clínica; la RLS y el filtro de tenant impiden la enumeración entre clínicas.

### D9. Sin baja de pacientes
No se expone `DELETE` ni desactivación: `paciente` no tiene `activo`, `app` no tiene `DELETE` y `turno.paciente_id` referencia (lógicamente) al paciente. Fastify responde `404 RUTA_NO_ENCONTRADA`. La "D" de la matriz y el comentario de C05_001 quedan para un change futuro (Q4).

### D10. DTO
`PacienteDto = { id, nombre, apellido, dni, telefono, email: string|null, obraSocial: string|null, creadoEn: ISO-8601 UTC }`, JSON en `camelCase`, sin `clinicaId`. Igual para los tres roles en el detalle (la matriz da R completo al odontólogo dentro de su alcance). `POST` → 201, `PATCH` → 200 con el mismo DTO.

### D11. Auditoría
| Operación | `accion` | `entidad` | `entidad_id` | `antes` / `despues` |
|---|---|---|---|---|
| `GET /pacientes/{id}` (200) | `lectura_ficha` | `paciente` | id | `null` / `null` (vía `conAuditoriaDeLecturaPaciente`) |
| `POST /pacientes` (201) | `creacion` | `paciente` | id creado | `null` / `{ camposInformados: [...] }` |
| `PATCH /pacientes/{id}` (200) | `modificacion` | `paciente` | id | `null` / `{ camposModificados: [...] }` |

- Todo dentro del `withTenant` del pedido con `conAuditoriaDeCambio` (*fail-closed*: si la auditoría falla, `ROLLBACK` y 500). `ip` = `request.ip`. Las respuestas 4xx no auditan.
- **Sin valores personales**: en lugar de pasar el DTO al enmascarador (que lo dejaría lleno de `[REDACTADO]` sin información útil), se registran **nombres de campos** (`nombre`, `apellido`, `dni`, `telefono`, `email`, `obraSocial`). Las claves `camposInformados`/`camposModificados` no son sensibles para el enmascarador y los valores del arreglo son nombres de campo, no datos. Esto concilia RN-AU-02 ("antes y después") con la Ley 25.326 y la decisión Q1 de C-07.
- `camposInformados` = campos con valor no nulo en el alta. `camposModificados` = campos cuyo valor normalizado difiere entre la ficha leída antes (`obtenerPorId` en la misma transacción) y la resultante; un `PATCH` sin cambios efectivos se audita igual con `[]` (refleja la intención, como en C-08).
- `POST` y `PATCH` devuelven la ficha pero no registran `lectura_ficha` (ya quedan auditados como cambio).

### D12. Estrategia de pruebas (Strict TDD)
- **Unitarias** (`test/unit/pacientes/**`, sin base): validaciones (DNI con puntos, letras, 6 y 9 dígitos; teléfono con `+`; email en minúsculas; propiedad `fast-check`: la normalización de DNI es idempotente y todo DNI válido de 7-8 dígitos con puntos insertados normaliza a sus dígitos), permisos y cada caso de uso con puertos en memoria y un `ServicioAuditoria` espía (eventos de D11, ausencia de PII en el payload, sin auditoría en 4xx, error de auditoría propagado, alcance del odontólogo con 403/404).
- **API sin base** (`test/api/pacientes-acceso.test.ts`): 401 sin token y con token inválido; 403 del odontólogo en `POST`/`PATCH` (previo a `withTenant`); 400 `BUSQUEDA_INVALIDA` y `CAMBIOS_VACIOS`.
- **Integración con PostgreSQL real** (`test/integration/pacientes/**`): soporte propio (`soporte.ts`, sin tocar `test/support/**`) con clínicas A y B, tokens por rol firmados con `firmarTokenDeAcceso`, un odontólogo vinculado a un profesional P, otro profesional Q y turnos sintéticos insertados como `app` dentro de `withTenant` (estados `confirmado` y `cancelado`). Cubre: CRUD y normalización, `PACIENTE_DNI_DUPLICADO` (alta y modificación) y mismo DNI en B, búsqueda limitada a la clínica y tope, alcance del odontólogo (detalle y búsqueda), aislamiento A/B en las cuatro rutas, `lectura_ficha` persistida (y ausente en 404), auditoría de alta y modificación sin PII (búsqueda del DNI, teléfono y email literales en `datos_despues`), atomicidad con auditoría que falla, el lector `paciente-acceso` y la ausencia del DNI en los logs capturados del pedido. Solo datos sintéticos (regla 2).

## Risks / Trade-offs

- [Lectura de `antes` sin `FOR UPDATE` en `PATCH`: dos modificaciones concurrentes pueden calcular `camposModificados` sobre un estado viejo] → Impacto bajo (la ficha final es exacta y ambos eventos quedan); se acepta.
- [El DNI viaja en la query string de `GET /pacientes?dni=`; el logger de la app lo descarta, pero un proxy o el PaaS podrían registrar la URL completa] → Prueba de que los logs de la app no lo contienen; al elegir el PaaS (C-20) verificar que sus access logs no guarden query strings o que se puedan desactivar (Q6).
- [El filtro de apellido y el escape `LIKE` se duplican en `paciente-acceso`] → Prueba de integración de equivalencia con el repositorio de C-05; si C-05 los exporta en el futuro, se unifican.
- [Solo se aceptan celulares argentinos (C-04): un paciente con fijo o número extranjero no se puede cargar] → Limitación conocida, coherente con el uso de WhatsApp; Q7.
- [`turno.paciente_id` sin FK: un turno huérfano no da acceso a nada (el `EXISTS` exige al paciente), pero C-09 podría crear turnos para pacientes inexistentes] → Fuera de zona; se reporta al Líder.
- [Si C-06 vuelve global `pluginDeAutenticacion`, el hook correría dos veces] → Mismo riesgo y mitigación que C-08 (quitar la llamada del módulo al corregirlo).
- [Ajv con `coerceTypes` acepta `"20"` en `limite` y quita campos desconocidos] → Comportamiento uniforme de la API; `CAMBIOS_VACIOS` cubre el `PATCH` que queda vacío.

## Migration Plan

1. Sin migraciones: los privilegios y la RLS necesarios ya existen (C05_001, C09_001).
2. Despliegue del módulo `pacientes` y del adaptador `paciente-acceso`: no cambian rutas existentes.
3. **Rollback**: borrar la carpeta `src/interfaces/http/modules/pacientes/` (el registrador no necesita cambios); no hay datos nuevos de esquema que revertir.

## Open Questions

Las opciones recomendadas ya están reflejadas en `specs/` y `tasks.md`. Las **bloqueantes** requieren el visto bueno del Líder antes del apply (gobernanza ALTO); si elige otra opción se actualizan los artefactos con `openspec-update-change`.

**Bloqueantes**
- **Q1 — Archivo nuevo fuera de zona `src/infrastructure/db/repositories/paciente-acceso/index.ts` (D5).** La zona declarada de C-10 no incluye infraestructura, pero el alcance del odontólogo necesita SQL sobre `turno` que ni C-05 ni C-09 ofrecen. *Recomendación*: aprobar el archivo nuevo (sin editar archivos existentes), como el precedente `configuracion-clinica` de C-08.
- **Q2 — Qué turnos dan al odontólogo acceso a un paciente (D4).** *Recomendación*: cualquier turno con su profesional en `ESTADOS_ACTIVOS_LIST` (`pendiente_confirmacion`, `confirmado`, `atendido`, `ausente`), sin ventana temporal; `cancelado` y `reprogramado` no cuentan. Alternativas: incluir todos los estados (más acceso), o limitar a turnos futuros y de los últimos N meses (menos acceso, más complejo). Y fuera del alcance responder **404** (no 403) para no confirmar existencia.

**No bloqueantes** (se adopta la recomendación)
- **Q3 — ¿Auditar las búsquedas?** *Recomendación*: no en v1; RN-AU-03 habla de la lectura de la ficha y la lista es reducida. Si el Líder lo pide, se agrega un evento `busqueda_pacientes` con el tipo de criterio (`dni`/`apellido`) y la cantidad de resultados, nunca el valor buscado.
- **Q4 — Baja de pacientes (la "D" del administrador en la matriz RBAC).** *Recomendación*: fuera de v1; si se necesita, un change futuro agrega `paciente.activo` y desactivación por `PATCH`, y corrige el comentario D6 de C05_001.
- **Q5 — Campos de la lista.** *Recomendación*: `{ id, nombre, apellido, dni }`. Alternativa más estricta: DNI enmascarado (últimos 3 dígitos) en la lista.
- **Q6 — DNI en la query string.** *Recomendación*: mantener `GET /pacientes?dni=` como define `CHANGES.md` y verificar los access logs del PaaS en C-20. Alternativa: `POST /pacientes/busqueda` con el DNI en el cuerpo (cambia el contrato de `CHANGES.md`).
- **Q7 — Teléfonos no celulares o extranjeros.** *Recomendación*: aceptar solo lo que normaliza C-04 en v1 (RN-NO-04 depende del enlace de WhatsApp).
- **Límites provisionales**: apellido mínimo 2 caracteres, `limite` por defecto 20 y tope 50, textos hasta 100 caracteres, email hasta 254. Ajustables sin cambiar el diseño.
- **Endurecimiento de privilegios (opcional)**: `app` tiene `UPDATE` de tabla completa sobre `paciente` (incluye `clinica_id` e `id`). Una migración `C10_001` podría reducirlo a `UPDATE (nombre, apellido, dni, telefono, email, obra_social)`, como hizo C-06 con `usuario`. *Recomendación*: no incluirlo en C-10 (la RLS ya impide mover filas entre clínicas) y proponerlo al Líder como change de seguridad transversal.
