# Design

## Context

Motivación y alcance: ver `proposal.md`. Requisitos: `specs/agenda-ocupacion`, `specs/turno-ciclo-de-vida`, `specs/zona-horaria-clinica`, `specs/agenda-disponibilidad` y `specs/agenda-puertos`.

Estado actual observado en el repo:

- `src/domain/` solo tiene `shared/errores.ts` con `ErrorDeDominio(codigo, tipo, mensaje)` y `TipoDeError` (`solicitud_invalida` → 400, `conflicto` → 409, `regla_de_negocio` → 422, según `src/interfaces/http/errores.ts`). El código debe cumplir `^[A-Z][A-Z0-9_]*$`.
- `eslint.config.*` ya prohíbe en `src/domain/**` importar `pg`, `pg-boss`, `fastify`, `nodemailer`, `argon2`, `jose`, `@fastify/*` y las capas `infrastructure`, `interfaces` y `application`. Además prohíbe `any` y `@ts-ignore`.
- `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, módulos `NodeNext` (imports con extensión `.js`).
- `vitest.config.ts`: el proyecto `unit` incluye `test/unit/**/*.test.ts`, así que `test/unit/domain/**` entra sin tocar configuración. `fast-check` ^4 ya está instalado y `test/unit/propiedades.test.ts` muestra el estilo (`fc.assert(fc.property(...))`).
- `src/config/index.ts` ya valida zonas IANA con `new Intl.DateTimeFormat('en-US', { timeZone })`: el dominio usa la misma técnica.
- Node `>=22.12` (`engines`); `Temporal` no está disponible de forma estable en esa versión.

Restricciones: zona `src/domain/**` y `test/unit/domain/**`; sin dependencias nuevas (solo el Líder toca npm); governance MEDIO; Strict TDD.

## Goals / Non-Goals

**Goals:**

- Un núcleo de agenda determinista y sin I/O: toda entrada temporal (instante actual, zona, granularidad) entra por parámetro.
- Que el mismo predicado de solape se use en validación, disponibilidad y pruebas de propiedades, para que la disponibilidad nunca ofrezca algo que la validación rechace.
- Puertos estables y mínimos, suficientes para C-05 (recursos), C-09 (turnos y ocupación), C-12 (agenda y bloqueos) y C-13 (disponibilidad pública).

**Non-Goals:**

- Persistencia, transacciones, traducción de `23P01`/`40P01` (C-09), HTTP (C-12, C-13), eventos de dominio y `TurnoEventPublisher` (C-09).
- Reprogramación atómica (RN-TU-02) y asignación con reintento (RN-RE-03): son casos de uso de C-09; el dominio solo aporta la transición `→ reprogramado` y la lista de sillones asignables.
- Regla de bloqueos sobre turnos (RN-AG-08, PO-08) y duración real (RN-TU-05): C-12. El predicado de solape queda reutilizable para ellas.
- Datos de pacientes: el dominio de agenda no los toca (solo `pacienteId`).

## Decisions

### D1. Estructura de módulos

```
src/domain/
├── shared/
│   ├── errores.ts            (existente, sin cambios de contrato)
│   ├── resultado.ts          Resultado<T> = { ok: true; valor: T } | { ok: false; error: ErrorDeDominio }
│   └── ids.ts                tipos marcados TurnoId, ProfesionalId, SillonId, PrestacionId, PacienteId
├── agenda/
│   ├── intervalo.ts          Intervalo [inicio, fin), seSolapa, contiene, esAdyacente
│   ├── ocupacion.ts          rangoProfesional, rangoSillon, detectarSolape
│   ├── zona-horaria.ts       localAInstante, instanteALocal, FechaLocal, minutos locales
│   ├── validaciones.ts       validarInicioNoPasado, validarGranularidad, validarNoFeriado,
│   │                         validarDentroDeHorario, validarSinBloqueo, validarTurnoPrevio
│   ├── disponibilidad.ts     calcularDisponibilidad
│   ├── errores-agenda.ts     fábricas de ErrorDeDominio con los códigos de agenda
│   └── puertos.ts            AgendaReader, RecursosReader (+ tipos FranjaAtencion, Bloqueo, Sillon, …)
└── turno/
    ├── estado.ts             EstadoTurno, esActivo, TRANSICIONES
    ├── turno.ts              Turno (readonly), crearTurno, transicionar
    └── puertos.ts            TurnoRepository
test/unit/domain/{agenda,turno}/*.test.ts  (+ generadores fast-check en test/unit/domain/arbitrarios.ts)
```

Sigue `08_arquitectura_propuesta.md` §Estructura (`agenda/`, `turno/`, `shared/`). Un `index.ts` por carpeta reexporta la API pública: es lo que se congela.

### D2. Instantes como `Date` en los contratos, milisegundos internos

Los contratos públicos (`Intervalo.inicio/fin`, `Turno.inicio/fin/finSillon`) usan `Date`, porque el driver `pg` devuelve `timestamptz` como `Date` y evita conversiones en cada adaptador. `Intervalo` copia los valores al construirse (`new Date(ms)`) y se congela con `Object.freeze`; las comparaciones usan `getTime()`. Alternativas descartadas: número de milisegundos marcado (obliga a convertir en todos los adaptadores y en la API) y cadenas ISO (comparación costosa y frágil).

### D3. Errores: `ErrorDeDominio` existente + `Resultado` en validaciones

- Se reutiliza `ErrorDeDominio` sin cambiarlo. Los códigos nuevos y su tipo:

| Código | Tipo (HTTP) | Origen |
|---|---|---|
| `INTERVALO_INVALIDO`, `OCUPACION_INVALIDA`, `ESTADO_TURNO_INVALIDO`, `ZONA_HORARIA_INVALIDA`, `FECHA_HORA_LOCAL_INVALIDA` | `solicitud_invalida` (400) | Datos mal formados |
| `TURNO_SOLAPADO_PROFESIONAL`, `TURNO_SOLAPADO_SILLON`, `TURNO_MODIFICADO_CONCURRENTEMENTE` | `conflicto` (409) | RN-AG-01/02, Excepciones globales |
| `TURNO_INICIO_EN_PASADO`, `TURNO_NO_ALINEADO`, `TURNO_EN_FERIADO`, `TURNO_FUERA_DE_HORARIO`, `TURNO_EN_BLOQUEO`, `TRANSICION_TURNO_INVALIDA`, `TURNO_AUN_NO_INICIADO`, `HORA_LOCAL_INEXISTENTE` | `regla_de_negocio` (422) | Flujo 2: "fuera de horario, feriado o bloqueo → 422" |

- Las **validaciones** devuelven `Resultado` (no lanzan) para poder componerse y probarse sin `try/catch`; `validarTurnoPrevio` las encadena en el orden fijado por el spec (pasado → granularidad → feriado → horario → bloqueo: de lo más barato y menos dependiente de datos a lo más dependiente).
- Las **construcciones** de objetos de valor (`crearIntervalo`, `crearTurno`, `transicionar`, conversiones de zona) también devuelven `Resultado`. Se ofrece una variante que lanza (`…OLanzar`) solo para pruebas y adaptadores que ya validaron.
- Los mensajes no interpolan datos personales; solo ids y horas.

Alternativa descartada: lanzar excepciones en todo el dominio (más simple, pero la composición de validaciones y las propiedades de fast-check quedan con `try/catch` en todas partes).

### D4. Zona horaria con `Intl`, sin dependencias

- `instanteALocal(instante, zona)`: `Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year, month, day, hour, minute, second, weekday })` + `formatToParts`. El formateador se cachea por zona (un `Map`), lo cual no es I/O.
- `localAInstante(fecha, minutos, zona)`: se toma la hora local como si fuera UTC (`t0`), se calcula el desplazamiento de la zona en `t0` y en `t0 - desplazamiento`, y se prueban los candidatos `t0 - d` para los desplazamientos distintos encontrados. Se conservan los candidatos cuyo `instanteALocal` reproduce exactamente la fecha y hora pedidas: ninguno → `HORA_LOCAL_INEXISTENTE`; dos → se elige el menor (primera ocurrencia, spec).
- `FechaLocal` es una cadena `AAAA-MM-DD` marcada y validada (incluye fechas imposibles); la hora local se maneja como minutos desde la medianoche (0–1440), con un parser de `HH:MM[:SS]` para que los adaptadores conviertan el tipo `time` de PostgreSQL.
- `dia_semana`: 0 = domingo … 6 = sábado (igual que `Date#getUTCDay` y `EXTRACT(DOW)` de PostgreSQL).

Alternativas descartadas: `date-fns-tz`/`luxon` (dependencia nueva, la decide el Líder) y `Temporal` (no estable en Node 22). Argentina hoy no tiene horario de verano, pero se prueba con `America/Santiago` para demostrar que no hay desplazamiento fijo.

### D5. Granularidad alineada al reloj local de la clínica

La alineación (RN-AG-11) se mide en minutos desde la medianoche local: `minutosLocales % granularidad === 0` y sin segundos ni milisegundos. La granularidad debe ser un entero positivo que divida 1440 (5, 10, 15, 20, 30, 60…). Los huecos de disponibilidad empiezan en el primer múltiplo ≥ inicio de la franja. Ver Open Questions (PO-06).

### D6. Horario de atención: contención en una sola franja

`validarDentroDeHorario` exige que `[inicio, fin)` esté contenido en **una** franja del día de semana local (spec). Las franjas de un día no se solapan (modelo de datos) y no cruzan medianoche (`hora_desde < hora_hasta`), así que la franja se convierte a un `Intervalo` UTC con `localAInstante` para la fecha local del turno y se usa `contiene`. El buffer no participa (solo bloquea al sillón).

### D7. Disponibilidad: generación y filtrado con el mismo predicado

`calcularDisponibilidad(entrada)` recorre cada fecha local de `[desde, hasta)`; descarta feriados; para cada franja del día genera inicios alineados con `inicio + duración <= fin de franja`; descarta los anteriores a `ahora`, los que se solapan con bloqueos o turnos activos del profesional; y calcula los sillones asignables (sillón activo cuyo `[inicio, fin + buffer)` no se solapa con el rango de sillón de los turnos activos de ese sillón). Devuelve `{ intervalo, sillonesAsignables: SillonId[] }[]` ordenado por inicio y, dentro de cada hueco, sillones en el orden recibido.

- Reutiliza `validarTurnoPrevio` y `detectarSolape` en vez de reimplementar reglas: garantiza la propiedad "todo hueco ofrecido es aceptado" por construcción, y la prueba de propiedades lo verifica.
- Complejidad: O(huecos × (turnos + bloqueos + sillones)). Para una agenda de un profesional y una semana (cientos de huecos, decenas de turnos) es suficiente; un barrido ordenado queda como optimización posterior sin cambiar el contrato.
- Devuelve **todos** los sillones asignables: elegir uno y reintentar ante concurrencia es de C-09 (RN-RE-03).

### D8. Entidad `Turno` inmutable y tabla de transiciones como dato

`Turno` es un tipo `Readonly` con los campos de `04_modelo_de_datos.md` §turno (`id`, `pacienteId`, `profesionalId`, `sillonId`, `prestacionId`, `inicio`, `fin`, `bufferMinutos`, `finSillon`, `estado`, `origen`, `reprogramadoDe`, `duracionRealMinutos`, `creadoEn`, `actualizadoEn`). `clinicaId` **no** está en el tipo de dominio (tenant implícito, D9). `TRANSICIONES: Readonly<Record<EstadoTurno, readonly EstadoTurno[]>>` codifica RN-TU-01; `transicionar(turno, hacia, ahora)` devuelve un `Turno` nuevo con `estado` y `actualizadoEn = ahora`, o el error. `crearTurno` recibe un `NuevoTurno` (sin `id`, sin fechas de auditoría: las asigna la base) y calcula `fin` y `finSillon`, coherente con el `CHECK` previsto para `fin_sillon` (R-04).

### D9. Puertos con tenant implícito y congelados

- Firmas (todas devuelven `Promise`):
  - `TurnoRepository`: `obtenerPorId(id): Turno | null`; `insertar(nuevo: NuevoTurnoValidado): Turno`; `actualizar(turno: Turno, estadoEsperado: EstadoTurno): Turno`.
  - `AgendaReader`: `franjasDeAtencion(profesionalId)`, `feriados(desde: FechaLocal, hasta: FechaLocal)`, `bloqueos(profesionalId, intervalo)`, `turnosActivosDeProfesional(profesionalId, intervalo)`, `turnosActivosDeSillones(sillonIds, intervalo)`.
  - `RecursosReader`: `profesional(id)`, `prestacion(id)`, `sillon(id)`, `sillonesActivos()`, `configuracionAgenda()` → `{ zonaHoraria, granularidadMinutos }`.
- **Sin `clinicaId`**: el adaptador se construye con un cliente ya dentro de `withTenant` (C-03), así que RLS filtra por clínica y un recurso ajeno se ve como `null` (regla dura 12). Evita que el dominio dependa de `RequestContext` (que vive en `application/`, prohibido por lint) y que un caso de uso pase un `clinicaId` distinto del contexto.
- `actualizar` con `estadoEsperado` (concurrencia optimista: `UPDATE … WHERE id = $1 AND estado = $2`) evita que dos transiciones simultáneas pisen el estado; falla con `TURNO_MODIFICADO_CONCURRENTEMENTE`.
- `turnosActivosDeSillones` filtra por **rango de sillón** (incluye buffer) e incluye turnos de cualquier profesional; el adaptador debe ensanchar la consulta, no el dominio.
- **Congelamiento**: al fusionarse, `src/domain/**/puertos.ts` y los tipos que exponen (`Turno`, `NuevoTurno`, `EstadoTurno`, `Intervalo`, `FechaLocal`, ids, `FranjaAtencion`, `Bloqueo`, `Sillon`, `Prestacion`, `Profesional`, `ConfiguracionAgenda`) son contrato (CHANGES.md §Contratos congelados, regla dura 14). Los cambios van en PR del dueño con aviso a C-05, C-09, C-12 y C-13.

Alternativa descartada: un único `AgendaRepository` grande; separar lectura de recursos (C-05) de lectura de ocupación (C-09) permite que cada dueño implemente su adaptador sin pisarse.

### D10. Pruebas (Strict TDD)

- Unitarias por módulo con ejemplos de los escenarios del spec (fin = inicio, buffer 0 y > 0, cambio de día local vs UTC, feriado, DST de `America/Santiago`, tabla completa de 36 transiciones).
- Propiedades con fast-check (generadores en `test/unit/domain/arbitrarios.ts`, instantes en minutos enteros dentro de un rango acotado para encoger bien):
  1. `seSolapa` simétrica; `esAdyacente ⇒ ¬seSolapa`; `contiene(a, b) ∧ seSolapa(b, c) ⇒ seSolapa(a, c)`.
  2. **Invariante central**: aceptar candidatos uno a uno con `detectarSolape` nunca deja dos turnos activos solapados por profesional ni por sillón (comprobado por fuerza bruta par a par, independiente de la implementación).
  3. Ida y vuelta de zona: `instanteALocal(localAInstante(x)) = x` para horas existentes.
  4. Coherencia: todo hueco de `calcularDisponibilidad` pasa `validarTurnoPrevio` y `detectarSolape`.
- Datos 100 % sintéticos (ids generados), sin pacientes reales (regla dura 2).

## Risks / Trade-offs

- [El contrato de puertos queda congelado antes de que existan sus adaptadores (C-05, C-09)] → firmas mínimas y orientadas a las consultas de los flujos 2, 3 y 6; cualquier ajuste se hace por PR del dueño con aviso, no en caliente.
- [Supuestos provisionales que fijan comportamiento en los specs (ver Open Questions)] → cada uno vive en una sola función (`validarGranularidad`, `validarDentroDeHorario`, `validarInicioNoPasado`, `localAInstante`) para cambiarlo sin tocar el resto.
- [La base IANA del runtime (ICU de Node) puede diferir entre entornos] → las pruebas con zonas con DST usan fechas de reglas estables (2026) y CI fija la versión de Node; Argentina sin DST no se ve afectada.
- [Rendimiento O(n·m) de la disponibilidad] → aceptable para el volumen de una clínica pequeña; medible en C-13 y optimizable sin cambiar el contrato.
- [El dominio no es la garantía final] → un error del dominio no produce solapes en la base: los constraints de exclusión de C-09 (DD-02) siguen siendo la última línea; el dominio evita viajes inútiles y da mensajes claros.
- [`Date` es mutable] → copias defensivas al construir `Intervalo`/`Turno` y `readonly` en los tipos; una prueba verifica que mutar la `Date` original no altera el objeto.

## Migration Plan

No aplica: código nuevo, sin base ni despliegue. Rollback = revertir el PR (ningún otro módulo depende todavía de `src/domain/agenda` ni `src/domain/turno`).

## Open Questions

Preguntas de `knowledge-base/10_preguntas_abiertas.md` y supuestos que tocan C-02. **No se resuelven en este change**: el diseño adopta el valor provisional indicado, aislado en una función, y requieren confirmación del Líder/producto antes o durante la revisión del PR.

- **PO-06 (Media) — granularidad**: se asume 15 min por defecto, configurable por clínica (`clinica_config.granularidad_minutos`) y alineada al reloj local desde la medianoche (D5). Alternativa no elegida: alinear al inicio de cada franja (permitiría franjas de 08:10). Confirmar.
- **PO-07 (Media) — sobreturno administrativo**: RN-AG-07 lo prohíbe en v1 como suposición. Las validaciones no tienen parámetro "forzar". Si producto lo habilita, se agregaría una opción en una versión posterior del contrato.
- **PO-08 (Media) — bloqueo con turnos existentes**: fuera de alcance (C-12); el dominio solo ofrece el predicado de solape reutilizable.
- **PO-11 (Media) / SU-05 — tipos de sillón**: la disponibilidad trata a todos los sillones activos como intercambiables. Si aparecen tipos por prestación, cambia `RecursosReader` (contrato congelado) y el cálculo de sillones asignables.
- **PO-15 (Baja) — mantenimiento de feriados**: no afecta al dominio (recibe la lista de feriados).
- **RN-AG-10 (Suposición)**: se acepta `inicio == ahora` y se rechaza solo `inicio < ahora`. No se fija anticipación mínima. Confirmar.
- **RN-AG-06 — franjas contiguas**: un turno debe caber en **una** franja; con franjas 08–12 y 12–16 no se puede agendar 11:45–12:15. Alternativa: aceptar la unión de franjas contiguas. Confirmar.
- **Horas inexistentes o repetidas por DST**: se rechaza la inexistente y se elige la primera ocurrencia de la repetida (no hay regla en la KB; hoy no ocurre en Argentina).
- **Nuevos códigos de error** (`TURNO_FUERA_DE_HORARIO`, `TURNO_EN_FERIADO`, `TURNO_EN_BLOQUEO`, `TURNO_INICIO_EN_PASADO`, `TURNO_NO_ALINEADO`, `TRANSICION_TURNO_INVALIDA`, `TURNO_AUN_NO_INICIADO`, `TURNO_MODIFICADO_CONCURRENTEMENTE`, …): la KB solo fija los dos de solape. Pasan a ser contrato público de la API (C-12/C-13) al fusionarse; revisar nombres en el PR.
- **R-04 — `fin_sillon` como columna común**: el dominio calcula `finSillon = fin + buffer`, coherente con el `CHECK` que diseñará C-09.
