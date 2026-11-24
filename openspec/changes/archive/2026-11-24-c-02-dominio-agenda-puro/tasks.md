# Tasks

> Strict TDD: en cada grupo, primero la prueba que falla (RED), luego el mínimo código (GREEN), luego casos que generalizan (TRIANGULATE) y por último el refactor con las pruebas en verde. Comando base: `npx vitest run --project unit test/unit/domain`. Zona: solo `src/domain/**` y `test/unit/domain/**`. Antes de empezar, confirmar con el Líder los supuestos provisionales de `design.md` §Open Questions (PO-06, RN-AG-10, franjas contiguas, códigos de error).

## 0. Red de seguridad

- [x] 0.1 Correr `npx vitest run --project unit` y `npm run lint` antes de tocar nada y registrar la línea base (N pruebas en verde). Verificar: todo verde; si algo falla, frenar y reportarlo como falla preexistente.

## 1. Base compartida: Resultado, ids y errores de agenda

- [x] 1.1 RED: escribir `test/unit/domain/shared/resultado.test.ts` y `test/unit/domain/agenda/errores-agenda.test.ts` que esperan `ok()/error()` de `Resultado` y una fábrica por código de D3 con su `tipo` correcto (p. ej. `TURNO_SOLAPADO_SILLON` → `conflicto`, `TURNO_EN_FERIADO` → `regla_de_negocio`, `INTERVALO_INVALIDO` → `solicitud_invalida`). Verificar: las pruebas fallan porque los módulos no existen.
- [x] 1.2 GREEN + TRIANGULATE: crear `src/domain/shared/resultado.ts`, `src/domain/shared/ids.ts` (ids marcados) y `src/domain/agenda/errores-agenda.ts` usando `ErrorDeDominio` existente sin modificarlo; cubrir todos los códigos de la tabla D3. Verificar: pruebas en verde y ningún mensaje interpola datos personales.

## 2. Intervalo semiabierto (spec agenda-ocupacion)

- [x] 2.1 RED: `test/unit/domain/agenda/intervalo.test.ts` con los escenarios del spec: intervalo válido e inmutable (mutar la `Date` de entrada no lo altera), `fin <= inicio` → `INTERVALO_INVALIDO`, `[09:00,10:00)` vs `[10:00,10:30)` adyacentes sin solape, solape parcial en ambos órdenes, contención con extremos iguales. Verificar: fallan por falta de `intervalo.ts`.
- [x] 2.2 GREEN: implementar `src/domain/agenda/intervalo.ts` (`crearIntervalo`, `seSolapa`, `contiene`, `esAdyacente`) según D2. Verificar: pruebas de 2.1 en verde.
- [x] 2.3 TRIANGULATE: agregar propiedades fast-check (generadores en `test/unit/domain/arbitrarios.ts`): simetría de `seSolapa` y `esAdyacente`, `esAdyacente ⇒ ¬seSolapa`, `contiene(a,b) ∧ seSolapa(b,c) ⇒ seSolapa(a,c)`. Verificar: propiedades en verde.
- [x] 2.4 REFACTOR: limpiar nombres y duplicación. Verificar: suite de dominio y `npm run lint` en verde.

## 3. Estados y ciclo de vida del turno (spec turno-ciclo-de-vida)

- [x] 3.1 RED: `test/unit/domain/turno/estado.test.ts` y `turno.test.ts`: estado desconocido → `ESTADO_TURNO_INVALIDO`; `esActivo` para los 6 estados; tabla completa de 36 pares con exactamente 7 aceptados; transición a sí mismo rechazada; `crearTurno` 09:00 + 45 min + buffer 15 → `fin` 09:45 y `finSillon` 10:00; estado inicial `atendido` rechazado; `transicionar` no muta el original. Verificar: fallan por falta de módulos.
- [x] 3.2 GREEN: implementar `src/domain/turno/estado.ts` (`EstadoTurno`, `TRANSICIONES`, `esActivo`) y `src/domain/turno/turno.ts` (`Turno`, `NuevoTurno`, `crearTurno`, `transicionar`) según D8. Verificar: pruebas de 3.1 en verde.
- [x] 3.3 TRIANGULATE: RN-TU-04 con `ahora` por parámetro: `ausente` a las 09:59 de un turno de 10:00 → `TURNO_AUN_NO_INICIADO`; `atendido` a las 10:00 aceptado; `cancelado` antes del inicio aceptado; duración o buffer inválidos en `crearTurno` → `OCUPACION_INVALIDA`. Verificar: en verde.
- [x] 3.4 REFACTOR: verificar que la tabla de transiciones sea la única fuente (sin `if` duplicados). Verificar: suite de dominio y lint en verde.

## 4. Ocupación y detección de solapes (spec agenda-ocupacion)

- [x] 4.1 RED: `test/unit/domain/agenda/ocupacion.test.ts`: buffer 0 → rangos iguales; buffer 10 → sillón `[09:00,09:40)`; buffer negativo o duración no entera → `OCUPACION_INVALIDA`; mismo profesional superpuesto en otro sillón → `TURNO_SOLAPADO_PROFESIONAL`; existente `cancelado`/`reprogramado` ignorado; buffer no bloquea al profesional (09:30 en otro sillón OK); buffer ocupa el sillón (09:30 en S → `TURNO_SOLAPADO_SILLON`); 09:40 en S OK; doble conflicto → se informa profesional. Verificar: fallan.
- [x] 4.2 GREEN: implementar `src/domain/agenda/ocupacion.ts` (`rangoProfesional`, `rangoSillon`, `detectarSolape`) reutilizando `seSolapa` y `esActivo`. Verificar: pruebas de 4.1 en verde.
- [x] 4.3 TRIANGULATE (invariante central): `test/unit/domain/agenda/no-solapamiento.property.test.ts` con fast-check: secuencias arbitrarias de candidatos (profesionales, sillones, inicios en minutos, duraciones, buffers 0..60, estados), aceptados uno a uno con `detectarSolape`; un verificador por fuerza bruta par a par comprueba que ningún par activo viola RN-AG-01 ni RN-AG-02. Incluir casos fijos (`fc.example`/`examples`) para `fin = inicio` y buffer 0. Verificar: propiedad en verde con el número de corridas por defecto.
- [x] 4.4 REFACTOR: sin cambios de comportamiento. Verificar: suite de dominio y lint en verde.

## 5. Zona horaria IANA (spec zona-horaria-clinica)

- [x] 5.1 RED: `test/unit/domain/agenda/zona-horaria.test.ts`: zona `America/Atlantida` → `ZONA_HORARIA_INVALIDA`; `2026-03-10` 09:00 Buenos Aires → `2026-03-10T12:00:00Z`; `2026-02-30` → `FECHA_HORA_LOCAL_INVALIDA`; `2026-03-11T01:30:00Z` → fecha local `2026-03-10`, 22:30, día 2. Verificar: fallan.
- [x] 5.2 GREEN: implementar `src/domain/agenda/zona-horaria.ts` (`FechaLocal`, `parsearHoraLocal`, `localAInstante`, `instanteALocal`) con `Intl` según D4, sin dependencias nuevas ni desplazamientos fijos. Verificar: pruebas de 5.1 en verde.
- [x] 5.3 TRIANGULATE: `America/Santiago` 09:00 en `2026-01-15` (`-03:00`) y `2026-07-15` (`-04:00`); `2026-09-06` 00:30 → `HORA_LOCAL_INEXISTENTE`; `2026-04-04` 23:30 → `2026-04-05T02:30:00Z`; propiedad de ida y vuelta `instanteALocal(localAInstante(x)) = x` para Buenos Aires. Verificar: en verde.
- [x] 5.4 REFACTOR: cachear el formateador por zona; buscar con `grep` que no haya literales de desplazamiento (`-03:00`, `-180`) en `src/domain`. Verificar: suite de dominio y lint en verde.

## 6. Validaciones previas (spec agenda-disponibilidad)

- [x] 6.1 RED: `test/unit/domain/agenda/validaciones.test.ts` con un caso por escenario: inicio 09:59 con ahora 10:00 → `TURNO_INICIO_EN_PASADO` (e `inicio == ahora` aceptado); 09:45 alineado y 09:50 → `TURNO_NO_ALINEADO` con granularidad 15; granularidad que no divide 1440 rechazada; feriado `2026-05-25` a las 10:00 locales → `TURNO_EN_FERIADO` y `2026-05-25T01:00:00Z` (22:00 del 24) aceptado; franja 08–12: `[11:30,12:00)` OK, `[11:45,12:15)` y día sin franja → `TURNO_FUERA_DE_HORARIO`; bloqueo `[10:00,11:00)`: `[10:30,11:00)` → `TURNO_EN_BLOQUEO` y 11:00 aceptado. Verificar: fallan.
- [x] 6.2 GREEN: implementar `src/domain/agenda/validaciones.ts` (una función por regla, todas devuelven `Resultado`, sin leer reloj) según D3, D5 y D6. Verificar: pruebas de 6.1 en verde.
- [x] 6.3 TRIANGULATE: `validarTurnoPrevio` compone en el orden pasado → granularidad → feriado → horario → bloqueo (turno pasado y en feriado → `TURNO_INICIO_EN_PASADO`); turno válido → éxito; el buffer no afecta la validación de horario. Verificar: en verde.
- [x] 6.4 REFACTOR: extraer conversión franja → `Intervalo` UTC compartida con disponibilidad. Verificar: suite de dominio y lint en verde.

## 7. Cálculo de disponibilidad (spec agenda-disponibilidad)

- [x] 7.1 RED: `test/unit/domain/agenda/disponibilidad.test.ts`: franja 08–10, 30 min, granularidad 15, sin ocupación → 7 huecos 08:00…09:30; feriado sin huecos; `ahora` 09:10 excluye inicios anteriores; turno del profesional `[09:00,09:30)` excluye 08:45, 09:00, 09:15 y conserva 08:30 y 09:30; dos sillones con S1 ocupado por otro profesional → solo S2; un sillón con buffer 15 y turno `[09:00,09:30)` → 09:30 no se ofrece y 09:45 sí; sin sillones activos → vacío; bloqueo excluye huecos superpuestos. Verificar: fallan.
- [x] 7.2 GREEN: implementar `src/domain/agenda/disponibilidad.ts` (`calcularDisponibilidad`) según D7, reutilizando `validarTurnoPrevio`, `rangoSillon` y `detectarSolape`. Verificar: pruebas de 7.1 en verde.
- [x] 7.3 TRIANGULATE: rango de varias fechas que incluye cambio de día local vs UTC; varias franjas en un día; propiedad fast-check de coherencia: todo hueco ofrecido, con cualquiera de sus sillones, pasa `validarTurnoPrevio` y `detectarSolape` con los mismos datos. Verificar: en verde.
- [x] 7.4 REFACTOR: orden estable de salida (por inicio y sillones en el orden recibido). Verificar: suite de dominio y lint en verde.

## 8. Puertos (spec agenda-puertos)

- [x] 8.1 RED: `test/unit/domain/puertos.test.ts` que implementa `TurnoRepository`, `AgendaReader` y `RecursosReader` en memoria (tenant implícito, sin `clinicaId`) y ejercita: `obtenerPorId` de un id ajeno → `null`; `actualizar` con estado esperado desactualizado → `TURNO_MODIFICADO_CONCURRENTEMENTE`; `turnosActivosDeSillones` incluye turnos de otro profesional por buffer y excluye cancelados; `configuracionAgenda` por defecto Buenos Aires/15. Verificar: falla al compilar porque los puertos no existen.
- [x] 8.2 GREEN: declarar `src/domain/agenda/puertos.ts` (`AgendaReader`, `RecursosReader` y tipos `FranjaAtencion`, `Bloqueo`, `Sillon`, `Prestacion`, `Profesional`, `ConfiguracionAgenda`) y `src/domain/turno/puertos.ts` (`TurnoRepository`) con las firmas de D9, solo interfaces y `Promise`. Verificar: prueba de 8.1 en verde, `npm run typecheck` y `npm run lint` sin errores (sin `any`, sin `@ts-ignore`, sin imports prohibidos).
- [x] 8.3 REFACTOR: `index.ts` por carpeta (`src/domain/agenda`, `src/domain/turno`, `src/domain/shared`) que reexporta la API pública congelada, con un comentario de cabecera que indique que es contrato congelado (regla 14). Verificar: las pruebas importan desde los `index.ts` y siguen en verde.

## 9. Verificación integral

- [x] 9.1 Correr `npx vitest run --project unit`, `npm run typecheck` y `npm run lint`. Verificar: todo en verde, la línea base de 0.1 se mantiene y `git status` muestra cambios solo bajo `src/domain/**`, `test/unit/domain/**` y `openspec/changes/c-02-dominio-agenda-puro/**`.
- [x] 9.2 Recorrer cada `#### Scenario` de los cinco specs del change y confirmar que tiene al menos una prueba que lo ejercita (anotar el archivo en la evidencia TDD). Verificar: ningún escenario sin prueba.
