# Trazabilidad de escenarios de C-01 (`foundation-setup`)

Cierra la excepción de la tarea 9.2: relaciona cada escenario de las 7 specs archivadas en `openspec/changes/archive/2026-11-22-c-01-foundation-setup/specs/` con la prueba que lo verifica en `test/`.

**Resumen:** 49 escenarios. 39 tienen al menos un caso de prueba automatizado. 10 no tienen caso de prueba: 6 de `quality-gates`, 3 de `platform-validation` y 1 de `runtime-configuration`. Esos 10 se verifican por configuración de CI o por documento, y figuran como **Sin prueba automatizada** con su evidencia.

Convenciones: las rutas de prueba son relativas a la raíz del repositorio. Los casos de prueba van entre comillas, tal como figuran en `it(...)`. Cuando un escenario lo cubre más de un caso, se listan todos.

## data-safety-guards (5)

| Spec | Escenario | Archivo de prueba | Caso de prueba / Estado |
|---|---|---|---|
| data-safety-guards | Habilitación ausente | `test/unit/data-safety-guards.test.ts` | "sin ALLOW_SEED explica que están deshabilitados"; "ALLOW_SEED=false también se rechaza"; "la guarda es síncrona y no abre conexiones" |
| data-safety-guards | Entorno de producción | `test/unit/data-safety-guards.test.ts` | "rechaza en producción aunque los seeds estén habilitados" |
| data-safety-guards | Host fuera de la lista permitida | `test/unit/data-safety-guards.test.ts` | "rechaza un host fuera de la lista permitida y nombra el host"; "respeta una lista de hosts permitidos configurada"; "rechaza si no se puede determinar el host" |
| data-safety-guards | Entorno local | `test/unit/data-safety-guards.test.ts` | "permite los hosts locales por defecto" |
| data-safety-guards | Rechazo por host | `test/unit/data-safety-guards.test.ts` | "ningún rechazo incluye usuario, contraseña ni la cadena de conexión"; "rechaza un host fuera de la lista permitida y nombra el host"; "extrae el host sin credenciales ni corchetes" |

## database-migrations (9)

| Spec | Escenario | Archivo de prueba | Caso de prueba / Estado |
|---|---|---|---|
| database-migrations | Orden entre changes | `test/unit/migraciones.test.ts`; `test/unit/propiedades.test.ts`; `test/integration/migraciones.test.ts` | "ordena entre changes: C03 antes que C05, sin importar el orden de entrada"; "ordena numéricamente por change y luego por secuencia"; propiedad "el orden resultante es siempre ascendente por (change, secuencia), en cualquier permutación"; integración: "aplica una migración de orden anterior (changes independientes) y lo informa" |
| database-migrations | Nombre fuera del patrón | `test/unit/migraciones.test.ts`; `test/integration/migraciones.test.ts` | `it.each` de nombres inválidos; "el error de nombre inválido nombra el archivo"; "un archivo fuera del patrón hace fallar la lectura completa"; "una subcarpeta también se rechaza"; integración: "valida nombres y duplicados antes de abrir ninguna conexión" |
| database-migrations | Secuencia repetida | `test/unit/migraciones.test.ts`; `test/integration/migraciones.test.ts` | "rechaza dos archivos con el mismo change y secuencia"; "permite la misma secuencia en changes distintos"; integración: "valida nombres y duplicados antes de abrir ninguna conexión" |
| database-migrations | Segunda ejecución | `test/integration/migraciones.test.ts` | "segunda ejecución sin cambios: no aplica nada y termina bien"; "registra nombre, huella e instante de cada migración"; "un cambio de fines de línea no se considera una edición" |
| database-migrations | Migración nueva | `test/integration/migraciones.test.ts` | "migración nueva con orden posterior: aplica solo esa" |
| database-migrations | Migración editada | `test/integration/migraciones.test.ts` | "una migración editada falla nombrando el archivo y no aplica las posteriores"; "una migración aplicada que desapareció del directorio falla" |
| database-migrations | Sentencia inválida a mitad de archivo | `test/integration/migraciones.test.ts` | "una sentencia inválida a mitad de archivo revierte todo y no queda registrada"; "las migraciones anteriores a la que falla permanecen aplicadas" |
| database-migrations | Dos ejecuciones simultáneas | `test/integration/migraciones.test.ts` | "dos ejecuciones simultáneas: solo una aplica y la otra no duplica nada" |
| database-migrations | Conexión de migraciones ausente | `test/integration/migraciones.test.ts` | "sin conexión de migraciones falla y no usa la de la aplicación"; "las migraciones se ejecutan con el rol de migraciones" |

## http-service (8)

| Spec | Escenario | Archivo de prueba | Caso de prueba / Estado |
|---|---|---|---|
| http-service | Servicio en marcha | `test/api/salud.test.ts` | "responde 200 {"estado":"ok"} sin credenciales"; "incluye un identificador de pedido para correlacionar con el log" |
| http-service | Sin filtración de detalles internos | `test/api/salud.test.ts` | "no filtra versiones, rutas del servidor ni configuración" |
| http-service | Módulo nuevo | `test/api/registro-de-modulos.test.ts` | "un módulo nuevo queda disponible sin editar ningún otro archivo"; "carga todos los módulos en orden alfabético con el prefijo /api/v1"; "GET /salud sigue disponible en la raíz junto con los módulos" |
| http-service | Módulo inválido | `test/api/registro-de-modulos.test.ts` | "sin punto de entrada: el arranque falla nombrando el módulo"; "sin exportar un plugin: el arranque falla nombrando el módulo"; "el servicio no llega a escuchar cuando un módulo es inválido" |
| http-service | Error de dominio | `test/api/errores.test.ts` | "un conflicto responde 409 con su código y mensaje"; "el tipo %s responde %i" (`it.each`); "rechaza códigos con formato inválido" |
| http-service | Ruta inexistente | `test/api/errores.test.ts` | "responde 404 RUTA_NO_ENCONTRADA" |
| http-service | Solicitud con forma inválida | `test/api/errores.test.ts` | "responde 400 con campo y regla, sin repetir los valores recibidos"; "falta un campo obligatorio: lo indica sin eco"; "un JSON mal formado responde 400 SOLICITUD_INVALIDA" |
| http-service | Fallo no controlado | `test/api/errores.test.ts` | "responde 500 ERROR_INTERNO genérico, sin traza ni mensaje original"; "deja el detalle en el log con el identificador del pedido y sin datos personales" |

## log-redaction (5)

| Spec | Escenario | Archivo de prueba | Caso de prueba / Estado |
|---|---|---|---|
| log-redaction | Registro de acceso | `test/api/logs.test.ts`; `test/api/salud.test.ts` | "registra método, ruta sin consulta, estado y duración; no el DNI ni la consulta"; "cada línea es JSON con nivel e instante"; salud: "incluye un identificador de pedido para correlacionar con el log" |
| log-redaction | Objeto anidado con datos del paciente | `test/unit/log-redaction.test.ts` | "objeto anidado: redacta paciente.dni y paciente.email y conserva el resto"; "reconoce los campos en camelCase, snake_case y con acentos"; "redacta dentro de arreglos"; "no enmascara de más campos que no son datos personales" |
| log-redaction | Cuerpo de pedido | `test/api/logs.test.ts` | "no registra el cuerpo del pedido, ni siquiera cuando es inválido" |
| log-redaction | Cabecera de autorización | `test/api/logs.test.ts`; `test/unit/log-redaction.test.ts` | "no registra la cabecera de autorización ni las cookies"; unit: "redacta cabeceras de autorización y cookies"; "redacta contraseñas, tokens, códigos y secretos con cualquier nombre compuesto" |
| log-redaction | Error con datos personales en el mensaje | `test/unit/log-redaction.test.ts`; `test/api/errores.test.ts` | "un Error con un DNI en el mensaje conserva el tipo y enmascara el valor"; "enmascara un DNI y un email dentro del mensaje y conserva el resto"; "redacta msg y message en cualquier nivel"; api: "deja el detalle en el log con el identificador del pedido y sin datos personales" |

## platform-validation (8)

| Spec | Escenario | Archivo de prueba | Caso de prueba / Estado |
|---|---|---|---|
| platform-validation | Rangos solapados | `test/integration/platform/postgres.test.ts` | "rechaza un solape del mismo sillón (aunque use otro profesional)"; "rechaza un solape del mismo profesional (aunque use otro sillón)"; "el rol de migraciones puede crearla (extensión de confianza, sin superusuario)" (`btree_gist`) |
| platform-validation | Rangos contiguos | `test/integration/platform/postgres.test.ts` | "acepta rangos contiguos: termina a las 10:00 y el siguiente empieza a las 10:00"; "el buffer bloquea al sillón pero no al profesional (RN-AG-05)" |
| platform-validation | Seguridad por fila sin contexto | `test/integration/platform/postgres.test.ts` | "sin contexto de clínica no ve ninguna fila (falla cerrada)"; "el rol de la aplicación no es superusuario, no tiene BYPASSRLS y no es propietario"; "FORCE ROW LEVEL SECURITY: ni el propietario ve filas sin contexto" |
| platform-validation | Columna generada con intervalo | `test/integration/platform/postgres.test.ts` | "timestamptz + interval es STABLE, por eso no puede usarse en una columna generada"; "PostgreSQL rechaza la columna generada con timestamptz + interval" |
| platform-validation | Columna común con restricción | `test/integration/platform/postgres.test.ts` | "la columna común con CHECK de coherencia acepta valores correctos y rechaza incoherentes" |
| platform-validation | Región aún sin verificar | — | **Sin prueba automatizada (verificación documental).** `docs/plataforma/informe-validacion-postgres.md`, tabla de entornos: `sa-east-1` figura como "No verificado", y lo ya verificado son local (2026-11-22) y CI (2026-11-23). |
| platform-validation | Región fuera de la lista de nivel adecuado | — | **Sin prueba automatizada (verificación documental, parcial).** El informe deja pendiente confirmar con asesoría legal la base de la transferencia a `sa-east-1` (sección "Pendientes", ref. PO-03). `knowledge-base/10_preguntas_abiertas.md` (PO-03) registra que Brasil no figura entre los países con nivel adecuado de la AAIP y adopta cláusulas contractuales modelo, sujeto a validación legal previa a producción. El informe ahora lo dice de forma explícita en la sección "Base legal de la región" (Brasil no figura entre los países con nivel adecuado de la AAIP; cláusulas contractuales modelo, Disposición DNPDP 60/2016 y Resolución AAIP 198/2023; validación legal pendiente). Evidencia cruzada: `knowledge-base/10_preguntas_abiertas.md`, PO-03. |
| platform-validation | Sin aprobación | — | **Sin prueba automatizada (verificación documental).** El informe indica que la verificación en `sa-east-1` "requiere aprobación explícita del Líder" y que no se crearon cuentas ni recursos en la nube. Solo hay evidencia de local y CI. |

## quality-gates (6)

Ninguno de estos escenarios tiene caso de Vitest: son propiedades del pipeline. La evidencia es `.github/workflows/ci.yml` y `package.json`.

| Spec | Escenario | Archivo de prueba | Caso de prueba / Estado |
|---|---|---|---|
| quality-gates | Error de tipos | — | **Sin prueba automatizada (configuración de CI).** `.github/workflows/ci.yml`, job `calidad`, ejecuta `npm run typecheck` (`tsc --noEmit`) en cada push a cualquier rama y en PR hacia `main`. Un fallo del paso hace fallar el job. |
| quality-gates | Todo en orden | — | **Sin prueba automatizada (configuración de CI).** `ci.yml`: los jobs `calidad` (lint, format:check, typecheck) y `pruebas` (unit, integration, api, humo del build). El informe de plataforma registra runs en verde en CI (2026-11-23). |
| quality-gates | Prueba que usa la base | — | **Sin prueba automatizada (configuración de CI).** `ci.yml`, job `pruebas`, usa el servicio `postgres:17` real y ejecuta `docker/postgres/init/01-roles.sql` antes de `npm run test:integration`. Las pruebas se conectan por `TEST_DATABASE_URL` y `TEST_DATABASE_MIGRATION_URL` (`test/support/base-de-datos.ts`). Configuración de entorno: `package.json` (`test:integration` = `vitest run --project integration`), `vitest.config.ts` (proyecto `integration` con `globalSetup: test/support/global-setup.ts`, que reinicia el esquema de la base de prueba con la conexión de migraciones y se niega a correr si falta `TEST_DATABASE_MIGRATION_URL`) y las variables `TEST_DATABASE_URL` / `TEST_DATABASE_MIGRATION_URL` del job `pruebas`. Las migraciones se aplican dentro de las pruebas, no en un paso previo de la CI: `test/integration/migraciones.test.ts` ejecuta el runner contra PostgreSQL real, como migra y no como app, con las pruebas "las migraciones se ejecutan con el rol de migraciones", "segunda ejecución sin cambios: no aplica nada y termina bien" y "migración nueva con orden posterior: aplica solo esa". No hay un paso de la CI que aplique `migrations/` antes de las pruebas de integración. |
| quality-gates | Archivo de bloqueo desactualizado | — | **Sin prueba automatizada (configuración de CI).** `ci.yml` usa `npm ci` en ambos jobs, que falla si `package.json` y `package-lock.json` no coinciden. No hay prueba que provoque el desajuste. |
| quality-gates | Ejecución local | — | **Sin prueba automatizada (configuración).** `package.json` define `test:unit`, `test:integration`, `test:api`, `lint`, `format:check` y `typecheck`, y `ci.yml` invoca los mismos scripts. |
| quality-gates | Base de las pruebas | — | **Sin prueba automatizada (configuración de CI).** `ci.yml`: el servicio `postgres:17` es efímero por job y todas las credenciales son descartables (`ci_superusuario_descartable`, `ci_migra_descartable`, `ci_app_descartable`), sin secretos del proyecto. |

## runtime-configuration (8)

| Spec | Escenario | Archivo de prueba | Caso de prueba / Estado |
|---|---|---|---|
| runtime-configuration | Variable obligatoria ausente | `test/unit/config.test.ts` | "variable obligatoria ausente: lista el nombre sin imprimir valores"; "el texto vacío se trata como ausente"; "cada perfil exige solo lo que usa" |
| runtime-configuration | Valor inválido | `test/unit/config.test.ts` | "puerto inválido: nombra la variable y no repite el valor"; "una URL de base de datos inválida no se imprime"; "ALLOW_SEED solo acepta true o false exactos"; "RATE_LIMIT_PUBLIC con formato inválido falla" |
| runtime-configuration | Zona horaria inválida | `test/unit/config.test.ts` | "zona horaria inválida: nombra la variable" |
| runtime-configuration | Secreto no configurado | `test/unit/config.test.ts` | "ninguna variable sensible tiene valor por defecto"; "un secreto no definido queda ausente: no se inventa un valor" |
| runtime-configuration | Variable no sensible con valor por defecto | `test/unit/config.test.ts` | "las variables no sensibles usan el valor por defecto documentado"; "convierte el puerto a número" |
| runtime-configuration | Configuración registrada al arrancar | `test/unit/config.test.ts` | "el resumen no contiene valores sensibles"; "el resumen omite las variables sensibles no definidas" |
| runtime-configuration | Variable nueva sin documentar | `test/unit/config.test.ts`; `test/unit/lint-rules.test.ts` | "documenta cada variable del esquema y del catálogo, y viceversa"; "deja vacías las variables sensibles"; "las variables no sensibles con valor por defecto coinciden con el ejemplo"; lint: "process.env se rechaza fuera de src/config/". La prueba compara el esquema de configuración con `.env.example`; la regla de lint impide leer variables fuera de `src/config/`, y juntas cubren el escenario. Evidencia: `test/unit/config.test.ts` (bloque `.env.example`, que lee `.env.example` y lo contrasta con `EsquemaEntorno` y con el catálogo `VARIABLES`) y `test/unit/lint-rules.test.ts` (bloque "lectura del entorno", que verifica la regla ESLint de `eslint.config.mjs` que prohíbe `process.env` fuera de `src/config/`). La CI corre ambas: `npm run test:unit` y `npm run lint`. |
| runtime-configuration | Archivo local de entorno | — | **Sin prueba automatizada (configuración).** `.gitignore` ignora `.env` y `.env.*` y excluye `.env.example` con `!.env.example`. No hay prueba que lo verifique, por ejemplo con `git check-ignore`. |
