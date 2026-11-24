# Tasks

> Strict TDD: en cada grupo, primero la prueba de integración que falla (RED) contra PostgreSQL real, luego el mínimo código o SQL (GREEN), luego casos que generalizan (TRIANGULATE) y por último el refactor con las pruebas en verde. Nunca se mockea PostgreSQL (regla 8). Comando base: `npx vitest run --project integration test/integration/datos-clinica`. Zona: `migrations/C05_*`, `src/infrastructure/db/repositories/**` (con la ampliación pedida en design §Open Questions 2), `seeds/**`, `test/integration/datos-clinica/**`. Datos de prueba siempre sintéticos (regla 2). Las tareas asumen las decisiones **provisionales** de `design.md`; si el Líder cambia alguna de las Open Questions, se actualizan los artefactos antes de seguir.

## 0. Precondiciones y red de seguridad

- [ ] 0.1 Confirmar con el Líder las Open Questions 1-7 de `design.md` (C-03, zona, D5, D12, DNI/email, `DELETE`, seed) y registrar las respuestas en `design.md`. Verificar: cada pregunta tiene respuesta escrita; si alguna cambia specs o tareas, correr `openspec-update-change` antes de seguir.
- [ ] 0.2 Verificar que C-03 está fusionado en la rama: existen `src/infrastructure/db/tenant/` (`withTenant`), `src/infrastructure/db/pool/` y `test/support/aislamiento.ts`, y anotar la firma real de `withTenant` y del arnés. Verificar: los tres archivos existen; si falta alguno, frenar y reportar el bloqueo (no implementarlo en C-05).
- [ ] 0.3 Línea base: `npm run typecheck`, `npm run lint`, `npm run test:unit` y `npm run test:integration`. Verificar: todo en verde y registrar la cantidad de pruebas; si algo falla, frenar y reportarlo como falla preexistente.

## 1. Soporte de pruebas de C-05

- [ ] 1.1 Crear `test/integration/datos-clinica/soporte.ts`: reinicia el esquema, aplica las migraciones reales de `migrations/` con el rol `migra`, inserta dos clínicas sintéticas (A y B) con `clinica_config` por defecto y expone helpers para ejecutar como `app` dentro de `withTenant`. Verificar: un `it` de humo que lee `configuracion` de A con `withTenant` pasa (con solo C03_001 aplicada).

## 2. Migración C05_001: tablas, RLS y privilegios (spec esquema-datos-clinica)

- [ ] 2.1 Spike D5: en `test/integration/datos-clinica/esquema.test.ts`, prueba que crea en una base temporal la función `minutos_del_dia(time) IMMUTABLE` y un `EXCLUDE` con `int4range` sobre `time`, incluyendo `24:00`. Verificar: la prueba pasa en PG 17; si no, aplicar el plan B de D5 y anotarlo en `design.md`.
- [ ] 2.2 RED: en `esquema.test.ts`, escenarios de existencia de las siete tablas con `clinica_id NOT NULL` y FK a `clinica`, columnas `timestamptz`/`time`/`date`, propietario distinto de `app` y privilegios de D6 (`DELETE` de `app` sobre `profesional` rechazado; sobre `feriado` permitido). Verificar: fallan porque `C05_001` no existe.
- [ ] 2.3 GREEN: escribir `migrations/C05_001_datos_clinica_y_pacientes.sql` con las tablas y constraints nombrados de D3, `UNIQUE (clinica_id, id)` y FK compuestas (D2), `minutos_del_dia` y exclusiones (D4, D5), `GRANT` de D6 y `SELECT aplicar_rls('…')` para cada tabla. Verificar: pruebas de 2.2 en verde y el nombre cumple `C{NN}_{seq}_nombre.sql`.
- [ ] 2.4 RED → GREEN: `test/integration/datos-clinica/aislamiento.test.ts` con `it.each` sobre las siete tablas usando el arnés de C-03: A no lee filas de B, A no inserta con `clinica_id` de B (42501), sin contexto 0 filas. Verificar: 21 casos en verde.
- [ ] 2.5 TRIANGULATE constraints: en `esquema.test.ts`, un caso por escenario del spec (franja `10:00-10:00`, `dia_semana = 7`, franja `20:00-24:00`, franjas contiguas vs. solapadas, `buffer_minutos = -5`, buffer por defecto 0, `duracion_minutos = 0`, feriado repetido y en otra clínica, DNI repetido y en otra clínica, bloqueo invertido, solapado, contiguo y de otro profesional, `creado_por` sin usuario, horario y bloqueo con profesional de otra clínica → FK). Verificar: todos en verde.
- [ ] 2.6 TRIANGULATE propiedad: con fast-check (pocas corridas), insertar secuencias arbitrarias de bloqueos para 2 profesionales ignorando los rechazos 23P01 y verificar por fuerza bruta que ningún par aceptado del mismo profesional se solapa. Verificar: propiedad en verde.
- [ ] 2.7 REFACTOR: comentarios en el SQL que citan RN/DD, orden y nombres. Verificar: `npm run test:integration` en verde. A partir de acá `C05_001` no se edita una vez fusionada (regla 6).

## 3. Utilidades compartidas de repositorios

- [ ] 3.1 RED: `test/integration/datos-clinica/errores.test.ts` que provoca con SQL real cada violación de la tabla D10 y espera el `ErrorDeDominio` correspondiente; para pacientes, verifica que `JSON.stringify(error)`, `message` y `stack` no contienen el DNI, teléfono ni email usados, y que un error no previsto se propaga solo con `sqlstate` y `constraint`. Verificar: fallan por falta de `traducirErrorPg`.
- [ ] 3.2 GREEN: implementar en `src/infrastructure/db/repositories/compartido/` la interfaz `EjecutorSql`, `traducirErrorPg`, `ErrorDePersistencia`, las fábricas de errores con `ErrorDeDominio` (sin modificar `src/domain/**`) y los mapeos `minutosAHora`/`horaAMinutos` (vía `parsearHoraLocal`). Verificar: pruebas de 3.1 en verde.
- [ ] 3.3 TRIANGULATE: pruebas unitarias en `test/integration/datos-clinica/errores.test.ts` (o unit si el Líder lo prefiere) de `minutosAHora` (0 → `00:00`, 540 → `09:00`, 1440 → `24:00`, 1441 rechazado) y de un error de `pg` sin `constraint`. Verificar: en verde.
- [ ] 3.4 REFACTOR: mensajes fijos en español, sin interpolaciones. Verificar: `grep` de `detail` y de `${` en `compartido/` sin usos sobre datos de fila; suite en verde.

## 4. RecursosReader y escritura de recursos (spec repositorios-recursos-clinica)

- [ ] 4.1 RED: `test/integration/datos-clinica/recursos-reader.test.ts` con los escenarios del spec: sillón con buffer 10, `sillonesActivos` con un inactivo, recurso de otra clínica → `null`, sin contexto → `null`, `configuracionAgenda` de A (Buenos Aires, 15) y con B en `America/Santiago`, clínica sin `clinica_config` → error interno sin datos. Verificar: fallan por falta de repositorios.
- [ ] 4.2 GREEN: implementar `profesional/`, `sillon/` y `prestacion/` (lectura por id y listados) y `recursos/` (`crearRecursosReader(ejecutor): RecursosReader` y `configuracionAgenda` con filtro explícito de D11), tipado contra el puerto de C-02 sin modificarlo. Verificar: pruebas de 4.1 en verde y `npm run typecheck` en verde.
- [ ] 4.3 RED → GREEN escritura: `test/integration/datos-clinica/escritura.test.ts`: crear profesional en A sin pasar `clinica_id`, actualizar con lista blanca, desactivar sillón (sigue existiendo, sale de activos), crear prestación con duración 0 → `DATOS_INVALIDOS`, escritura sin contexto rechazada. Implementar `crear`/`actualizar`/`desactivar`/`listar` de profesional, sillón y prestación (D7, D9). Verificar: en verde.
- [ ] 4.4 REFACTOR: extraer el SQL de `clinica_id` del contexto a una constante compartida. Verificar: suite en verde.

## 5. Calendario: franjas, feriados y bloqueos (AgendaReader parcial)

- [ ] 5.1 RED: `test/integration/datos-clinica/calendario-reader.test.ts`: franja martes 09:00-13:30 → `{2, 540, 810}`; guardar y leer `{5, 1200, 1440}`; `reemplazarFranjas` con solape → `FRANJA_SOLAPADA` y franjas anteriores intactas; feriados en `[2026-12-08, 2026-12-25)` → solo `2026-12-08`; bloqueo adyacente `[12:00,13:00)` no aparece; parcial `[11:30,13:00)` sí, con su intervalo completo. Verificar: fallan.
- [ ] 5.2 GREEN: implementar `horario/` (`franjasDeAtencion`, `reemplazarFranjas`), `feriado/` (`feriados` con `fecha::text`, `crear`, `eliminar`, `listar`) y `bloqueo/` (`bloqueos` con `tstzrange && tstzrange`, `crear`, `eliminar`), y `crearCalendarioReader(ejecutor): Pick<AgendaReader, 'franjasDeAtencion' | 'feriados' | 'bloqueos'>`. Verificar: pruebas de 5.1 en verde.
- [ ] 5.3 TRIANGULATE: feriado `2026-07-09` leído con `process.env.TZ` distinto de UTC (proceso hijo o `TZ=Pacific/Kiritimati` en la prueba) sigue siendo `2026-07-09`; bloqueo solapado → `BLOQUEO_SOLAPADO`; bloqueo con profesional de B → `RECURSO_NO_ENCONTRADO`; feriado repetido → `FERIADO_DUPLICADO`. Verificar: en verde.
- [ ] 5.4 REFACTOR: un solo mapeo fila→dominio por tabla. Verificar: suite y `npm run lint` en verde.

## 6. Repositorio de pacientes (spec repositorio-pacientes)

- [ ] 6.1 RED: `test/integration/datos-clinica/pacientes.test.ts`: alta en A con `id`, `clinica_id` y `creado_en`; obra social `null`; DNI repetido → `PACIENTE_DNI_DUPLICADO` sin el DNI en el error; mismo DNI en B aceptado; teléfono `+5491123456789` aceptado y `011 15-2345-6789` → `DATOS_INVALIDOS` sin el teléfono en el error. Verificar: fallan.
- [ ] 6.2 GREEN: implementar `paciente/` (`crear`, `obtenerPorId`, `buscarPorDni`, `buscarPorApellido(prefijo, limite)`, `actualizar` con lista blanca) con SQL parametrizado y sin logs. Verificar: pruebas de 6.1 en verde.
- [ ] 6.3 TRIANGULATE: DNI de B buscado desde A → `null`; prefijo "go" devuelve "Gómez" y "Godoy" ordenados, respetando el límite y escapando `%`/`_` del prefijo; actualizar a un DNI existente → `PACIENTE_DNI_DUPLICADO`; error de motor no previsto → solo `sqlstate`/`constraint`. Verificar: en verde.
- [ ] 6.4 REFACTOR: revisar que ningún `throw`, `console` ni mensaje del directorio `paciente/` use campos personales. Verificar: `grep` de `console.` y de interpolaciones con `dni|telefono|email|nombre|apellido|obra` sin resultados; suite en verde.

## 7. Seed de la clínica de demostración (spec seed-clinica-demo)

- [ ] 7.1 RED: `test/integration/datos-clinica/seed.test.ts`: sin `ALLOW_SEED` y con host no permitido el seed falla sin conectarse (sin filas nuevas); con guardas superadas contra la base `_test`, crea ≥ 2 profesionales con franjas, 2 sillones (uno con buffer > 0), las 3 prestaciones del Discovery, feriados, 1 bloqueo y pacientes con emails `@example.com`. Verificar: fallan por falta del seed.
- [ ] 7.2 GREEN: implementar `seeds/demo-clinica.ts` según D13 (faker `es` con semilla fija, generadores propios de DNI y teléfono, clínica `clinica-demo`, repositorios de C-05 dentro de `withTenant`) y registrarlo en `seeds/run.ts` después de `assertNoProduction()`. Verificar: pruebas de 7.1 en verde.
- [ ] 7.3 TRIANGULATE: segunda ejecución → mensaje "ya existe" y mismos conteos; dos bases vacías → mismos ids; la salida capturada contiene `id`, `slug` y conteos y no contiene ningún DNI, teléfono ni email generado. Verificar: en verde.
- [ ] 7.4 REFACTOR: extraer los datos fijos (prestaciones, feriados, franjas) a constantes con comentario de fuente pública. Verificar: suite en verde y `npm run db:seed` local con `ALLOW_SEED=true` termina bien.

## 8. Integración final

- [ ] 8.1 Correr `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:unit` y `npm run test:integration`. Verificar: todo en verde y la cantidad de pruebas es la línea base de 0.3 más las nuevas.
- [ ] 8.2 Revisión de reglas duras: sin `any` ni `@ts-ignore`; todo SQL parametrizado; ninguna importación de `pg` desde `src/domain/**`; puertos de C-02 sin diff (`git diff main -- src/domain` vacío). Verificar: comandos y `git diff` sin hallazgos.
- [ ] 8.3 Registrar evidencia (tabla escenario → prueba) en `tasks.md` y re-ejecutar `openspec status --change c-05-datos-clinica-y-pacientes --json` y `openspec validate c-05-datos-clinica-y-pacientes --strict`. Verificar: artefactos `done` y validación sin errores. El `[x]` de `CHANGES.md` lo marca quien fusione el PR.
