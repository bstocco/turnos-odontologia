# Tasks

> Rama: `change/C-01-foundation-setup`. Las pruebas de integración y del spike se verifican **en CI** (el Líder no tiene Docker ni `psql` localmente; ver `design.md`, D10). Cada tarea indica cómo se comprueba.

## 1. Repositorio y herramientas base

- [x] 1.1 Crear `.nvmrc` (Node 22), `package.json` (`type: module`, `engines`, scripts `dev`, `build`, `start`, `lint`, `format`, `format:check`, `typecheck`, `test`, `test:unit`, `test:integration`, `test:api`, `db:migrate`), `.gitattributes` (`*.sql text eol=lf`) y `.gitignore` según D13. Verificar con `git check-ignore -v` que se ignoran `node_modules/`, `dist/` y `.env`, y que **no** se ignoran `.atl/skill-registry.md`, `openspec/` ni `.active-orchestrator-state.json` ni `.env.example` (salida vacía, código 1).
- [x] 1.2 Instalar todas las dependencias de D12, resolviendo las versiones con la documentación vigente de cada librería y registrando las elegidas en el README. Verificar que `npm ci` termina bien en la máquina del Líder (Windows) y que `node -e "import('argon2')"` carga el módulo nativo.
- [x] 1.3 Configurar TypeScript estricto (sin `any` implícito) y la compilación a `dist/`. Verificar que `npm run typecheck` y `npm run build` terminan sin errores sobre un archivo de ejemplo.
- [x] 1.4 Configurar ESLint y Prettier con las reglas de capas (`domain` no importa `infrastructure`, `interfaces`, `pg` ni `fastify`) y la prohibición de `process.env` fuera de `src/config/`. Agregar una prueba unitaria que lintee fragmentos y verifique que ambas violaciones se detectan; verificar que `npm run lint` pasa sobre el código limpio.
- [x] 1.5 Crear la estructura `src/{domain,application,infrastructure,interfaces/http/modules}`, `migrations/`, `seeds/` y `test/{unit,integration,api}` con marcadores `.gitkeep`. Verificar con `git ls-files` que las carpetas están versionadas.

## 2. Configuración y guardas de datos

- [x] 2.1 Implementar `src/config/` con los perfiles `app`, `migrate` y `seed` (D6): validación con falla que lista solo nombres de variables, sin defaults para datos sensibles y valores sensibles redactados en cualquier volcado. Pruebas unitarias: variable obligatoria ausente, puerto inválido, zona horaria inválida, secreto sin valor por defecto, valor por defecto del puerto y resumen sin secretos.
- [x] 2.2 Crear `.env.example` con todas las variables (descripción y marca de sensibilidad, sin valores reales) y una prueba que compare las claves del esquema con las del archivo. Verificar que la prueba falla al agregar una variable al esquema sin documentarla y vuelve a pasar al documentarla.
- [x] 2.3 Implementar `assertNoProduction(config)` y el ejecutor de seeds vacío `seeds/run.ts` (D9). Pruebas unitarias: seeds sin habilitar (no abre conexión), producción con seeds habilitados, host fuera de la lista, host local permitido y mensaje sin usuario ni contraseña.

## 3. Registros (logs)

- [x] 3.1 Implementar el redactor recursivo con límite de profundidad (D5), insensible a mayúsculas y formato, sin mutar el objeto original, más el enmascarado de correos y números de 7 u 8 dígitos en textos de error. Pruebas unitarias: objeto anidado con `paciente.dni` y `paciente.email`, claves en `camelCase` y `snake_case`, cabecera `authorization`, mensaje de error con un DNI y objeto circular.
- [x] 3.2 Integrar el logger en la aplicación con serializador de pedidos (método, identificador y ruta sin cadena de consulta, sin cuerpo) y registro de acceso con estado y duración. Prueba `api` que captura los logs de `GET /pacientes?dni=30111222` y verifica que no aparecen ni el DNI ni la cadena de consulta.

## 4. Servicio HTTP

- [x] 4.1 Implementar `ErrorDeDominio` en `src/domain/shared/`, la tabla tipo→estado y el manejador central (D4), con `RUTA_NO_ENCONTRADA`, `SOLICITUD_INVALIDA` (sin eco de valores) y `ERROR_INTERNO`. Pruebas `api`: error de dominio `409` con su código, ruta inexistente `404`, cuerpo inválido `400` sin valores, error inesperado `500` sin traza y con el detalle en el log.
- [x] 4.2 Implementar `buildApp(config)` y `GET /salud` en la raíz. Pruebas `api`: `200 {"estado":"ok"}` sin credenciales y respuesta sin versiones, rutas ni configuración.
- [x] 4.3 Implementar el registrador de módulos (D3): escaneo ordenado, prefijo `/api/v1`, resolución de `index.ts` o `index.js`. Pruebas con carpetas de ejemplo: módulo nuevo disponible sin tocar otros archivos, módulo sin punto de entrada que aborta el arranque nombrándolo y orden alfabético determinista.
- [x] 4.4 Implementar `main.ts` (carga de configuración, arranque y cierre ordenado) y los scripts `dev` y `start`. Verificar con `npm run dev` y `curl http://localhost:3000/salud` que responde `200`, y que sin `DATABASE_URL` el proceso termina con código distinto de cero.

## 5. Migraciones y base de datos local

- [x] 5.1 Crear `docker-compose.yml` y `docker/postgres/init/01-roles.sql` (base y roles `migra` y `app`, este último sin superusuario, sin `BYPASSRLS` y sin ser propietario; D7), con contraseñas leídas del entorno. Verificar que `docker compose config` valida el archivo (donde haya Docker) y que el mismo script se aplica con `psql` en CI. **Cerrada con CI en verde:** en CI terminaron bien `docker compose config --quiet` (paso «Validar docker-compose.yml») y `psql -f docker/postgres/init/01-roles.sql` (paso «Inicializar roles y bases»); [run en main](https://github.com/bstocco/turnos-odontologia/actions/runs/45096148192), commit 6d7312e, y [run en la rama](https://github.com/bstocco/turnos-odontologia/actions/runs/45096089885), commit 99dae1d.
- [x] 5.2 Implementar el análisis de nombres, el orden `(NN, seq)`, la detección de duplicados y la huella con fines de línea normalizados (D7). Pruebas unitarias: orden entre changes, nombre fuera del patrón, secuencia repetida y huella idéntica para contenido con CRLF y con LF.
- [x] 5.3 Implementar la ejecución: tabla `schema_migrations`, transacción por migración, bloqueo asesor, rechazo de migraciones editadas y uso exclusivo de `DATABASE_MIGRATION_URL`. Pruebas de integración: segunda ejecución sin cambios, migración nueva, migración editada, sentencia inválida a mitad de archivo (la tabla no queda creada), dos ejecuciones simultáneas y conexión de migraciones ausente.
- [x] 5.4 Exponer `npm run db:migrate` y crear una migración de ejemplo **solo para pruebas** (en un directorio de fixtures, no en `migrations/`). Verificar que `npm run db:migrate` sobre una base vacía termina bien y deja `schema_migrations` vacía.

## 6. Pruebas y integración continua

- [x] 6.1 Crear `vitest.config.ts` con los proyectos `unit`, `integration` y `api` (confirmando la sintaxis de proyectos en la versión instalada), la preparación global con la guarda de host de D8 y una prueba de propiedades mínima con fast-check. Verificar que `npm run test:unit` pasa y que `test:integration` sin `TEST_DATABASE_URL` falla con un mensaje claro.
- [x] 6.2 Crear `.github/workflows/ci.yml` (D11): trabajo de calidad (lint, formato, tipos) y trabajo de pruebas con PostgreSQL de servicio, el script de inicialización, `npm ci`, pruebas unitarias, de integración y `api`, y una prueba de humo del build (`node dist/main.js` y `GET /salud`). Verificar con `gh run list` que el flujo termina en verde sobre la rama. **Cerrada con CI en verde:** el flujo se ejecutó y sus dos trabajos (calidad y pruebas) terminaron en verde; `actions/checkout@v7` y `actions/setup-node@v7` aceptaron `node-version-file` y `cache`. [run en main](https://github.com/bstocco/turnos-odontologia/actions/runs/45096148192), commit 6d7312e, y [run en la rama](https://github.com/bstocco/turnos-odontologia/actions/runs/45096089885), commit 99dae1d.
- [x] 6.3 Verificar las barreras de calidad: en una rama descartable introducir un error de tipos y comprobar que CI falla; cambiar `package.json` sin actualizar `package-lock.json` y comprobar que la instalación falla. Descartar la rama y registrar los enlaces de ejecución en el informe de la tarea 7.2. **Cerrada (2026-11-24):** el error de tipos falló en `typecheck` ([run 45346163266](https://github.com/bstocco/turnos-odontologia/actions/runs/45346163266)) y el lockfile desalineado falló en `npm ci` ([run 45346567430](https://github.com/bstocco/turnos-odontologia/actions/runs/45346567430)). La rama `test/barreras-ci` se descartó. Enlaces registrados en la sección "Barreras de calidad de CI" de [`docs/plataforma/informe-validacion-postgres.md`](../../../../docs/plataforma/informe-validacion-postgres.md).

## 7. Spike de plataforma (R-04 y R-05)

- [x] 7.1 Escribir las pruebas de `test/integration/platform/` (D14): `btree_gist`, exclusión por profesional y por sillón con rangos solapados y contiguos, RLS forzada sin contexto con rol no propietario, rechazo de la columna generada con `timestamptz + interval` (confirmando el código de error) y columna común con `CHECK` de coherencia. Verificar que pasan en CI y, donde haya base local, también en la máquina. **Cerrada con CI en verde:** el paso `npm run test:integration`, que incluye las 18 pruebas de `test/integration/platform/`, terminó en verde; [run en main](https://github.com/bstocco/turnos-odontologia/actions/runs/45096148192), commit 6d7312e, y [run en la rama](https://github.com/bstocco/turnos-odontologia/actions/runs/45096089885), commit 99dae1d. El primer run (commits 08eb1a0 y 4d615a9: [rama](https://github.com/bstocco/turnos-odontologia/actions/runs/45094846497) y [main](https://github.com/bstocco/turnos-odontologia/actions/runs/45094823516)) falló solo en el test de concurrencia, que se corrigió para aceptar `23P01` o `40P01` (commit 99dae1d).
- [x] 7.2 Redactar `docs/plataforma/informe-validacion-postgres.md` con la versión de PostgreSQL, la decisión sobre `fin_sillon`, el resultado de cada prueba y una tabla de entornos (local, CI, `sa-east-1`) donde lo no probado figure como "no verificado". Verificar que cada fila de la tabla se corresponde con una ejecución real o con la leyenda "no verificado".

## 8. Documentación y coherencia del repositorio

- [x] 8.1 Escribir el `README.md` de desarrollo: requisitos (Node 22 y base de datos local con Docker Desktop o PostgreSQL nativo más el script de inicialización), instalación, scripts, estructura, cómo agregar un módulo HTTP, convención de migraciones y de ramas, variables de entorno y versiones elegidas. Verificar ejecutando los comandos tal como están escritos desde un clon limpio.
- [x] 8.2 Corregir `CLAUDE.md`: reemplazar "no versionado — no está en el repo" por que `.atl/skill-registry.md` **sí está versionado**. Verificar con `grep` que la frase anterior ya no aparece.
- [x] 8.3 Actualizar `CHANGES.md`: nota en C-01 sobre `.gitignore` y la región, y corregir C-03 para que no cree los roles en `C03_001` (los crea el script de inicialización de C-01). Verificar con `git diff` que solo cambian esas líneas.
- [x] 8.4 Registrar en `knowledge-base/09_decisiones_y_supuestos.md` (DD-04) la región `sa-east-1` con su base legal, y en `10_preguntas_abiertas.md` el estado de PO-03: pendiente de asesoría legal, con la restricción de que el PaaS ofrezca región en São Paulo. Verificar que ningún texto afirma que Brasil tiene nivel adecuado.

## 9. Verificación integral

- [x] 9.1 Desde un clon limpio, correr `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:unit` y `npm run build` y comprobar que terminan sin errores. Verificar que `openspec validate c-01-foundation-setup --strict` pasa.
- [x] 9.2 Confirmar que CI queda en verde en la rama con todas las pruebas, incluidas las de integración, `api` y spike, y que cada escenario de las 7 specs tiene una prueba o una verificación documentada. Dejar la tabla escenario→prueba en la descripción del PR. **Cerrada con CI en verde, con una excepción:** pasaron unitarias, integración, `api`, spike y la prueba de humo del build; [run en main](https://github.com/bstocco/turnos-odontologia/actions/runs/45096148192), commit 6d7312e, y [run en la rama](https://github.com/bstocco/turnos-odontologia/actions/runs/45096089885), commit 99dae1d. **Excepción cerrada (2026-11-24):** la tabla escenario→prueba de las 7 specs (49 escenarios) está en [`docs/plataforma/tabla-escenarios-c01.md`](../../../../docs/plataforma/tabla-escenarios-c01.md). 39 escenarios tienen prueba automatizada y 10 se verifican por configuración de CI o por documento, con la evidencia indicada en la tabla.

## Workflow follow-up

- El Líder revisa el PR y lo fusiona a `main`; recién entonces A, B y C abren las ramas de C-02, C-03 y C-04 (GATE 1).
- Archivar el change tras la revisión y verificar el resultado archivado.
- Verificación opcional en `sa-east-1`: solo con aprobación explícita del Líder (sin cuentas ni costos antes de eso); sus resultados se agregan al informe de la tarea 7.2.
- Pendientes fuera de este change: asesoría legal sobre PO-03 (bloquea C-20) y elección del PaaS con región en São Paulo.

## Seguimiento pendiente al archivar (2026-11-22)

Este change se archivó con 5 tareas sin marcar por falta de un repositorio remoto y de Docker en la máquina del Líder. **Actualización (2026-11-23):** al subir el repositorio a GitHub, CI terminó en verde y se cerraron 4 de las 5. Las dos restantes, la tarea 6.3 y la tabla escenario→prueba de la 9.2, se cerraron el 2026-11-24.

Runs en verde: [run en main](https://github.com/bstocco/turnos-odontologia/actions/runs/45096148192), commit 6d7312e, y [run en la rama](https://github.com/bstocco/turnos-odontologia/actions/runs/45096089885), commit 99dae1d. En ambos pasaron los dos trabajos: calidad (`npm ci`, lint, formato y tipos) y pruebas (validación de `docker-compose.yml`, inicialización de roles con `psql`, unitarias, integración, `api` y prueba de humo del build).

- **5.1** ✅ Cerrada. `docker compose config` y el script de roles con `psql` pasaron en CI.
- **6.2** ✅ Cerrada. Primera ejecución real del flujo, en verde.
- **7.1** ✅ Cerrada. Las 18 pruebas del spike pasan en CI (junto con el resto de integración).
- **9.2** ✅ Cerrada para CI en verde. **Tabla escenario→prueba elaborada (2026-11-24)** en [`docs/plataforma/tabla-escenarios-c01.md`](../../../../docs/plataforma/tabla-escenarios-c01.md).
- **6.3** ✅ Cerrada (2026-11-24); evidencia en la sección "Barreras de calidad de CI" de [`docs/plataforma/informe-validacion-postgres.md`](../../../../docs/plataforma/informe-validacion-postgres.md). Descripción original: En una rama descartable, introducir un error de tipos y comprobar que CI falla; cambiar `package.json` sin actualizar `package-lock.json` y comprobar que la instalación falla. En local ya se verificó que `tsc` devuelve error y que `npm ci` falla con código 1. Los dos runs fallidos del 2026-11-23 ([rama](https://github.com/bstocco/turnos-odontologia/actions/runs/45094846497) y [main](https://github.com/bstocco/turnos-odontologia/actions/runs/45094823516)) probaron que CI se pone en rojo ante una prueba que falla, pero no reemplazan este experimento.
- Los enlaces de esa ejecución ya están en `docs/plataforma/informe-validacion-postgres.md`.
