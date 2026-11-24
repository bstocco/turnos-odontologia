# Design

## Context

Motivación y alcance: ver `proposal.md`. Requisitos: `specs/api-publica-disponibilidad`, `specs/limite-tasa-publica` y `specs/db-tenant-rls`.

Estado observado en `main` (C-01 a C-09 y C-17 fusionados) que condiciona el diseño:

- **HTTP (C-01)**: `registrarModulos` carga cada carpeta de `src/interfaces/http/modules/` como plugin **encapsulado** con prefijo `/api/v1`; las rutas públicas quedan en `/api/v1/publico/...`, como en `03 §Rutas públicas`. `registrarManejoDeErrores` traduce `ErrorDeDominio.tipo` a estado con cuerpo `{ codigo, mensaje }`, los errores de esquema a `400 SOLICITUD_INVALIDA` con `campos` sin valores, y cualquier error con `statusCode` 429 a `{ codigo: 'DEMASIADOS_PEDIDOS', mensaje }`. El registro de acceso (`onResponse`) guarda método, ruta **sin consulta**, estado y duración. La app no configura `trustProxy`.
- **Auth (C-06)**: ningún hook global exige token; cada módulo autenticado invoca `pluginDeAutenticacion` en su propio contexto (D3 de C-08). Un módulo que no lo invoca es público por construcción.
- **`resolver_clinica_por_slug` no existe**: el spec `db-tenant-rls` y las tareas de C-03 la dan por hecha, pero `migrations/C03_001_tenant_rls.sql` no la crea y nada la usa. El login (C-06) busca la clínica con `SELECT id FROM clinica WHERE slug = $1` directo (`src/infrastructure/auth/repositorio-de-usuarios.ts:195`), sin filtrar `activa`.
- **`clinica` sin RLS**: `app` tiene `SELECT, INSERT, UPDATE, DELETE` sobre `clinica` (C03_001). La función `SECURITY DEFINER` no reduce hoy el privilegio de `app`; su valor es un **contrato único** (solo activas, solo el id) y la posibilidad de revocar después el `SELECT` directo (ver Q5).
- **Dominio (C-02, congelado)**: `calcularDisponibilidad(EntradaDisponibilidad) → Resultado<Hueco[]>` recorre `[desde, hasta)` en fechas locales, reutiliza `validarTurnoPrevio` y `detectarSolape`, y devuelve cada hueco con `sillonesAsignables` (nunca vacío). `Prestacion` del puerto no trae `nombre` ni `activa`; `Profesional` no trae `nombre`.
- **Readers**: `crearRecursosReader` (C-05) da `profesional`, `prestacion` (**incluye inactivas**, D12 de C-05), `sillonesActivos` y `configuracionAgenda` (filtra `clinica` por `app.clinica_id`); valida UUID y devuelve `null`. `crearAgendaReader` (C-09, `src/infrastructure/db/repositories/turno/index.ts`) es el `AgendaReader` completo (franjas, feriados, bloqueos, turnos activos del profesional y de sillones por `rango_sillon`), **sin** guarda de UUID. `crearPrestacionRepository` y `crearProfesionalRepository` (C-05) dan `listar()` y `obtenerPorId()` con `nombre`, `apellido`, `activa`/`activo`. No existe relación profesional-prestación: todo profesional activo puede atender toda prestación activa (SU-05, PO-11).
- **Límite de tasa**: `@fastify/rate-limit@^11` está instalado y sin uso; `RATE_LIMIT_PUBLIC` (`^[1-9][0-9]*/(s|min|h)$`, por defecto `30/min`) está en la configuración y sin uso. El login usa `LimiteDeTasaPorClave` (`src/infrastructure/auth/rate-limit.ts`), un `Map` sin desalojo.
- **Pruebas**: proyecto `integration` con PostgreSQL real, un archivo a la vez, esquema reiniciado y migraciones reales en `beforeAll` (patrón de `test/integration/configuracion/soporte.ts`, clínicas `CLINICA_A`/`CLINICA_B` de `test/support/aislamiento.ts`); los módulos leen la configuración de `process.env` con `loadConfig('app')`.

## Goals / Non-Goals

**Goals:**
- Un único cálculo de disponibilidad: lo que C-13 publica y lo que C-15 verifica antes de reservar salen de la **misma** función de aplicación sobre la **misma** función de dominio.
- Superficie pública mínima: lista blanca de campos, `404` uniforme, límite antes de tocar la base, transacción de solo lectura bajo RLS.
- Cero cambios en archivos existentes y en contratos congelados.

**Non-Goals:**
- Igualar tiempos de respuesta entre slugs existentes e inexistentes (D8).
- Límite distribuido entre instancias (D7) y configuración de `trustProxy` (zona de C-01/C-20, Q4).
- Corregir los hallazgos de otros changes (se reportan en Risks).
- Disponibilidad agregada de "cualquier profesional" (Q3).

## Decisions

### D1. Resolución de la clínica: `resolver_clinica_por_slug` en `C13_001` (requiere Q1)
```sql
CREATE FUNCTION resolver_clinica_por_slug(p_slug text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$ SELECT id FROM public.clinica WHERE slug = p_slug AND activa $$;
REVOKE ALL ON FUNCTION resolver_clinica_por_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolver_clinica_por_slug(text) TO app;
```
- Propietario `migra` (corre la migración). `search_path` fijo para que un objeto homónimo en otro esquema no secuestre la función (riesgo clásico de `SECURITY DEFINER`). `STABLE`, sin efectos. Devuelve **solo** el `uuid`: nombre, zona y configuración se leen después dentro de `withTenant`, filtrados por `app.clinica_id`.
- Inactiva = inexistente (`NULL`), para que el `404` no distinga los casos.
- Adaptador nuevo `src/infrastructure/db/repositories/clinica-publica/index.ts`: `resolverClinicaPorSlug(ejecutor, slug): Promise<string | null>` con `SELECT resolver_clinica_por_slug($1) AS id`, parametrizado. Lo reutiliza C-15 (contrato congelado).
- *Alternativa A*: usar el `SELECT` directo como el login. Descartada: contradice el spec `db-tenant-rls`, `04 §clinica` y `08 §Seguridad`, y no filtra `activa`.
- *Alternativa B*: que C-03 (Agente A) agregue la función en un `C03_002`. Correcta por dueño, pero bloquea el camino crítico; se ofrece como opción en Q1.

### D2. Capas y composición por pedido
```
onRequest: límite por IP (D7) ─► validación de forma (TypeBox) ─► validarSlug (sin base; inválido → 404)
  ─► resolverClinicaPorSlug(pool, slug)  (null → 404)
  ─► withTenant(clinicaId, c => { SET TRANSACTION READ ONLY; casoDeUso(dependencias(c), entrada) })
  ─► DTO por lista blanca + esquema de respuesta + Cache-Control
```
- `src/application/disponibilidad/` (sin I/O; ESLint impide importar `infrastructure/`): `puertos.ts` con **puertos propios** estructurales (`CatalogoPrestacionesPuerto = { listar, obtenerPorId }`, `CatalogoProfesionalesPuerto = { listar }`, `RecursosReader` y `AgendaReader` de C-02, `Reloj = () => Date`), `catalogo.ts`, `disponibilidad.ts`, `slug.ts`, `errores.ts`, `index.ts`. Los repositorios de C-05 y C-09 los satisfacen sin cambios.
- `modules/publico-disponibilidad/`: `index.ts` (plugin sin autenticación), `dependencias.ts` (arma los puertos sobre el `PoolClient`), `esquemas.ts`, `limite-de-tasa.ts` (D7).
- **Sin `RequestContext` ni actor**: ninguna operación de C-13 audita ni decide por rol, y el tenant llega por RLS. Inventar un actor `sistema` para lecturas anónimas mezclaría trazabilidad con algo que no la necesita. C-15 sí necesitará uno (`paciente_enlace`) para auditar la reserva; no es decisión de C-13.
- **Solo lectura**: la primera sentencia dentro de `withTenant` es `SET TRANSACTION READ ONLY` (pasar a solo lectura está permitido después de otras consultas; lo prohibido es lo inverso). Defensa en profundidad: cualquier escritura accidental falla con `25006`. Se verifica con una prueba de integración; si PostgreSQL lo rechazara, se quita y se deja constancia (no cambia el spec).
- *Alternativa*: ruta que llama a los repositorios directamente. Descartada por la regla 7 y porque C-15 necesita el mismo cálculo sin HTTP.

### D3. Flujo de `consultarDisponibilidad` y orden de las comprobaciones
1. `crearFechaLocal(desde|hasta)`; `hasta > desde`; `hasta − desde ≤ 14` días → si no, `400 RANGO_FECHAS_INVALIDO` (sin base).
2. `configuracionAgenda()` y `ahora()`; `hasta ≤ hoyLocal + 90` días → si no, `400 RANGO_FECHAS_INVALIDO`. La configuración es de la clínica, no del recurso: no filtra nada sobre profesionales ni prestaciones.
3. `recursos.profesional(id)`: `null` o inactivo → `404`. `prestaciones.obtenerPorId(id)`: `null` o inactiva → `404` (`RecursosReader.prestacion` devuelve inactivas y no se puede cambiar). Al validar antes el profesional con un reader que exige UUID, nunca llega un id mal formado al `AgendaReader` de C-09 (que no lo valida).
4. Ventana de consulta UTC = `[localAInstante(desde, 00:00) − 1 día, localAInstante(hasta, 00:00) + 1 día)`: ensanchada para absorber desplazamientos de zona y cambios de horario; leer de más no cambia el resultado porque el dominio filtra.
5. En paralelo: franjas, `feriados(desde, hasta)`, bloqueos, turnos activos del profesional, `sillonesActivos()`; luego turnos activos de esos sillones (omitido si no hay sillones). Se unen y deduplican por id y se mapean a `OcupacionExistente` (solo `profesionalId`, `sillonId`, `inicio`, `fin`, `finSillon`, `estado`: el `pacienteId` nunca sale de este paso).
6. `calcularDisponibilidad(...)` → huecos → `{ inicio, fin }` en ISO UTC.
- Las comprobaciones sin base van primero; el `404` va al final y es idéntico para todos sus casos, así que el orden no filtra existencia de recursos de otra clínica.

### D4. DTO por lista blanca y endpoint de profesionales (requiere Q2)
| Ruta | Respuesta `200` |
|---|---|
| `GET /publico/{slug}/prestaciones` | `{ prestaciones: [{ id, nombre, duracionMinutos }] }` activas, por `nombre`, `id` |
| `GET /publico/{slug}/profesionales` | `{ profesionales: [{ id, nombre, apellido }] }` activos, por `apellido`, `nombre`, `id` |
| `GET /publico/{slug}/disponibilidad` | `{ zonaHoraria, profesionalId, prestacionId, desde, hasta, huecos: [{ inicio, fin }] }` |

- **Sin sillones**: ni ids, ni nombres, ni cantidad de asignables. El paciente no elige sillón (RN-RE-03, SU-05) y la cantidad libre revela ocupación de la clínica. La asignación la hace C-15 con `huecoOfrecido` (D6).
- **Profesionales**: `nombre` y `apellido` son datos personales del profesional, pero publicarlos es inherente a reservar con un profesional elegido (US-030, Flujo 3 paso 2) y lo hace la propia clínica; matrícula, estado y vínculo con usuarios no se publican. *Alternativas*: (a) incluir los profesionales dentro de `/prestaciones` (mezcla recursos y rompe la forma de catálogo); (b) no listarlos y exigir que el sitio de la clínica conozca los ids (inviable para el MVP sin interfaz). La ruta nueva amplía el scope de `CHANGES.md`: **Q2 bloquea las tareas de esa ruta** (no el resto).
- Esquemas TypeBox de respuesta con `additionalProperties: false`: el serializador de Fastify descarta cualquier campo no declarado aunque un caso de uso lo devolviera por error (defensa en profundidad del requisito "Respuestas sin datos ajenos").
- **Zona horaria**: instantes UTC con `Z` (regla 9) más `zonaHoraria` IANA para que el cliente los muestre en hora local. *Alternativa*: ISO con desplazamiento local (`-03:00`); descartada porque exige formatear con zona en la API y C-15 recibirá de vuelta el `inicio`, que debe compararse sin ambigüedad.
- **Sin paginación**: con 14 días y granularidad 5 el máximo teórico es ~4000 huecos por profesional (~200 KB); con la granularidad por defecto (15) y jornadas reales, cientos. Acotar por rango es más simple que paginar un cálculo.

### D5. Parámetros y `404` uniforme
- `slug`: validado en la aplicación (`^[a-z0-9][a-z0-9-]{1,63}$`, el mismo patrón que el alta interna de C-17); uno inválido responde el **mismo** `404` sin consultar la base. No se valida en el esquema de ruta para no devolver `400` por algo que solo puede ser "no existe".
- Query de disponibilidad (`additionalProperties: false`): `profesionalId`, `prestacionId` (string, 1..64), `desde`, `hasta` (`^\d{4}-\d{2}-\d{2}$`). Falta o forma → `400 SOLICITUD_INVALIDA` (contrato de C-01). Un id que no es UUID pero tiene forma de string → `404` (coherente con C-08: un id mal formado "no existe").
- Errores en `src/application/disponibilidad/errores.ts`: `recursoPublicoNoEncontrado()` → `ErrorDeDominio('RECURSO_NO_ENCONTRADO', 'no_encontrado', 'El recurso solicitado no existe.')`, el mismo para clínica, profesional y prestación; `rangoFechasInvalido()` → `RANGO_FECHAS_INVALIDO` / `solicitud_invalida`. Mensajes fijos sin datos de entrada.
- *Alternativa*: `CLINICA_NO_ENCONTRADA` distinto (como el login). Descartada: un solo código simplifica y no da pistas; la existencia de una clínica activa ya es pública (su enlace lo es).

### D6. Contrato para C-15 (se congela al fusionar)
```ts
consultarDisponibilidad(deps, { profesionalId, prestacionId, desde, hasta }): Promise<DisponibilidadPublica>
huecoOfrecido(deps, { profesionalId, prestacionId, inicio: Date }): Promise<Hueco | null>   // Hueco de C-02, con sillonesAsignables
listarPrestacionesPublicas(deps), listarProfesionalesPublicos(deps)
validarSlug(slug): boolean
resolverClinicaPorSlug(ejecutor, slug): Promise<string | null>   // infraestructura
```
- `huecoOfrecido` calcula la disponibilidad del día local de `inicio` con el mismo flujo de D3 y busca el hueco con ese `inicio` exacto. C-15, dentro de **su** transacción, llama a `huecoOfrecido`, toma un sillón de `sillonesAsignables` y llama a `agendarTurno`; ante el conflicto de exclusión prueba el siguiente sillón o responde `409`. La base sigue siendo la garantía final (RN-AG-12).
- Así "un hueco ofrecido es reservable" no depende de reimplementar reglas: ambos caminos usan `calcularDisponibilidad`, que a su vez usa `validarTurnoPrevio` y `detectarSolape`, las mismas que valida C-09.

### D7. Límite de tasa con `@fastify/rate-limit`
- Registrado **dentro** del plugin del módulo con `global: true`, `hook: 'onRequest'`, `keyGenerator: (r) => r.ip`, `max` y `timeWindow` de `RATE_LIMIT_PUBLIC` (parseo puro en `limite-de-tasa.ts`: `30/min` → `{ max: 30, ventanaMs: 60000 }`), `cache: 10000` (LRU acotado del almacén en memoria) y `errorResponseBuilder` que devuelve un `Error` con `statusCode: 429`, para que el manejador central emita `DEMASIADOS_PEDIDOS`. El plugin usa `fastify-plugin`, así que alcanza solo a las rutas del contexto encapsulado del módulo: `/salud` y las rutas del personal quedan fuera.
- Un único cupo por IP para las tres rutas, consumido **antes** de validar y de resolver el slug: el `429` no depende de la existencia del slug y un barrido de slugs consume el mismo cupo.
- Encabezados `x-ratelimit-*` y `retry-after` del plugin: públicos y sin datos.
- *Alternativa 1*: `LimiteDeTasaPorClave` de C-06. Descartada: `Map` sin desalojo (memoria ilimitada ante IPs distintas) y sin encabezados.
- *Alternativa 2*: almacén en PostgreSQL. Descartada: una escritura por pedido público convierte el límite en un amplificador de carga sobre la base que protege. Redis está excluido por el stack.
- Limitación aceptada: contador por instancia; con N instancias el límite efectivo es N veces el configurado. El MVP corre en una instancia (C-20).

### D8. Oráculos de enumeración y tiempos
- Cuerpos y estados idénticos para todos los "no existe" (D5) y para el `429` (D7).
- **No** se igualan tiempos: un slug inexistente responde tras una consulta y uno existente tras varias. Lo que se filtraría es "existe una clínica activa con este slug", dato público por diseño (el slug va en el enlace que la clínica difunde). El límite por IP acota el barrido. Para profesionales y prestaciones, el `404` llega después de las mismas lecturas de clínica en todos los casos.

### D9. Auditoría, logs y caché
- **Sin auditoría**: RN-AU-02 cubre mutaciones y RN-AU-03 lecturas de fichas y exportaciones; aquí no hay ni una ni otra. Auditar lecturas anónimas además permitiría a cualquiera llenar una tabla append-only (abuso de almacenamiento).
- **Logs**: el registro de acceso de C-01 ya omite la consulta; el módulo no agrega logs con parámetros. El slug en la ruta no es dato personal.
- **Caché**: `no-store` en disponibilidad (un hueco cacheado que ya se ocupó genera `409` evitables en C-15); `private, max-age=60` en catálogos `200`; errores sin `Cache-Control` almacenable (`no-store`). *Alternativa*: `public` en catálogos; descartada para no depender de cachés compartidas que sigan sirviendo una clínica desactivada.

### D10. Estrategia de pruebas (Strict TDD)
- **Unitarias** (`test/unit/disponibilidad/**`): `validarSlug`, parseo de `RATE_LIMIT_PUBLIC`, `consultarDisponibilidad` y `huecoOfrecido` con puertos en memoria y reloj fijo (orden de las comprobaciones, `404` uniforme, rango, ventana ensanchada, deduplicación, proyección sin `pacienteId`), catálogos (filtro de activos, orden, lista blanca).
- **Integración** (`test/integration/disponibilidad/**`, PostgreSQL real, `inject`): función `resolver_clinica_por_slug` (activa, inactiva, inexistente, privilegios); rutas con agenda sembrada (franjas, feriado, bloqueo, turnos de pacientes sintéticos, buffer, turno cancelado); aislamiento A/B; ausencia de ids de paciente, turno y sillón en los cuerpos; `404` idénticos; `400`; transacción de solo lectura; `auditoria` sin cambios; logs sin parámetros; límite con `RATE_LIMIT_PUBLIC=3/min`; propiedad `fast-check` "todo hueco ofrecido se inserta sin error" contra la base real (pocas corridas, `numRuns` bajo, esquema reiniciado por corrida con datos sintéticos). El reloj se fija con `vi.setSystemTime` (`toFake: ['Date']`), único doble permitido además del email (regla 8).

## Risks / Trade-offs

- [`resolver_clinica_por_slug` no existe y su creación cae fuera de la zona declarada] → Q1 bloquea el apply; D1 ofrece dos dueños posibles.
- [La función no reduce el privilegio real de `app`, que lee `clinica` entero] → Se documenta; Q5 propone revocar el `SELECT` directo en C-19 cuando login y C-08 migren a funciones o a lecturas filtradas.
- [Sin `trustProxy`, en el PaaS todas las IPs son la del proxy: el límite se vuelve global (un abusador bloquea a todos) o inútil] → Q4: configurar `trustProxy` con la cantidad exacta de saltos en C-20/C-19 (zona C-01). Nunca `trustProxy: true` sin acotar, que permite falsear `X-Forwarded-For`.
- [Contador por instancia] → D7; revisar si C-20 escala horizontalmente.
- [Huecos obsoletos entre la consulta y la reserva] → Inherente; C-15 revalida con `huecoOfrecido` y la base decide (409).
- [Lecturas de la transacción en `READ COMMITTED` pueden ver estados distintos entre consultas] → Solo afecta a la vista ofrecida, nunca a la reserva; `SET TRANSACTION ISOLATION LEVEL` ya no es posible después del `set_config` de `withTenant` (y cambiar `withTenant` es zona de C-03).
- [Costo por pedido: ~10 consultas en una transacción] → Acotado por el rango de 14 días y el límite por IP; índices de C-05/C-09 sobre `profesional_id`, `rango_profesional` y `rango_sillon`.
- **Hallazgos fuera de zona (se reportan, no se corrigen)**:
  - C-03: falta `resolver_clinica_por_slug` (spec y tareas la dan por hecha).
  - C-06: el login (`src/interfaces/http/modules/auth/index.ts:57-60`) responde `404 CLINICA_NO_ENCONTRADA` para slug inexistente y `401` para credenciales: oráculo de enumeración; además no filtra `clinica.activa` (una clínica inactiva puede iniciar sesión).
  - C-06: `LimiteDeTasaPorClave` (`src/infrastructure/auth/rate-limit.ts`) nunca desaloja entradas.
  - C-09: `crearAgendaReader` (`src/infrastructure/db/repositories/turno/index.ts:130-190`) no valida UUID; un id mal formado llega a PostgreSQL (`22P02`).
  - C-09: `agendarTurno` (`src/application/turnos/agendar-turno.ts:83-91`) reintenta insertar **el mismo** sillón y ante cualquier error; la "asignación automática de sillón libre con reintentos" del spec `turnos-persistencia` no está implementada como tal. C-15 deberá elegir sillón con `huecoOfrecido` (D6).
  - C-05/C-09: hay dos implementaciones de lectura de calendario (`calendario/index.ts` y `turno/index.ts`) con SQL distinto para bloqueos y feriados; C-13 usa solo la de C-09.

## Migration Plan

1. `npm run db:migrate` aplica `C13_001_resolver_clinica_por_slug.sql` (transaccional, `CREATE FUNCTION` + `REVOKE` + `GRANT`; idempotencia no requerida porque el runner registra lo aplicado).
2. Despliegue del módulo: rutas nuevas, ninguna existente cambia.
3. **Rollback**: migración nueva `C13_002` con `DROP FUNCTION resolver_clinica_por_slug(text);` (nunca editar `C13_001`) y borrar la carpeta del módulo (el registrador no necesita cambios). Si Q1 resuelve que la función la crea C-03, este change no lleva migración.

## Open Questions

Resoluciones del Líder (aprobación del PR #15) y estado:

- **Q1 (RESUELTA, opción a)**: C-13 crea `migrations/C13_001_resolver_clinica_por_slug.sql` y el adaptador `src/infrastructure/db/repositories/clinica-publica/index.ts`, con la forma de D1.
- **Q2 (APROBADA)**: se incluye `GET /publico/{slug}/profesionales` con `id`, `nombre` y `apellido` (grupo 5 de tasks).
- **Q3 (no bloquea)**: "cualquier profesional" en una sola consulta. Provisional: `profesionalId` obligatorio; el cliente consulta por profesional.
- **Q4 (DIFERIDA a C-19/C-20)**: `trustProxy` con los saltos del PaaS en `app.ts` (C-01/C-20). No se toca en C-13: `request.ip` tal cual; las pruebas usan `inject` con `remoteAddress` distintos. Los hallazgos de C-06 de Risks tampoco se corrigen aquí (se notan para C-19/C-20).
- **Q5 (no bloquea)**: revocar el `SELECT` directo de `app` sobre `clinica` cuando el resto del código deje de usarlo (C-19).
- **Provisionales que no cambian el diseño**: rango máximo 14 días y horizonte 90 (ajustables por constante); `30/min` por IP (`RATE_LIMIT_PUBLIC`); `max-age=60` de catálogos; capacidad LRU 10000. **PO-06**: se usa la granularidad configurada por clínica (C-08). **PO-07**: sin excepciones; un feriado bloquea el día. **PO-11**: sin tipos de sillón. **PO-09** (tope de 2 reservas activas) es de C-15 y no afecta a la consulta.
