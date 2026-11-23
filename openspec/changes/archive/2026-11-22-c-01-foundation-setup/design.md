# Design

## Context

El repositorio es **greenfield**: tiene KB (`knowledge-base/`), roadmap (`CHANGES.md`), `CLAUDE.md` y OpenSpec, pero ningún código. Motivación y alcance: ver `proposal.md`. Los requisitos verificables están en `specs/`.

Restricciones que condicionan el enfoque:

- Stack decidido: TypeScript, Node.js, Fastify, SQL explícito, PostgreSQL, Vitest y pg-boss (DD-08, DD-09). Arquitectura hexagonal: el dominio no importa infraestructura ni HTTP.
- Tres agentes trabajarán en paralelo después de C-01, así que las convenciones deben evitar archivos compartidos (rutas, migraciones, `package.json`).
- Reglas duras de `CLAUDE.md`: sin datos de pacientes en logs, sin datos reales fuera de producción, SQL parametrizado, `any` prohibido.
- **Entorno local del Líder** (verificado el 2026-11-22): Node v22.15.0, npm 10.9.2 y Git 2.49. **No hay Docker ni `psql`.** Esto afecta cómo se corren localmente las pruebas de integración.
- PostgreSQL gestionado de la región elegida: sin verificar (R-05).

## Goals / Non-Goals

**Goals:**
- Dejar un esqueleto ejecutable, probado y con integración continua, sobre el que A, B y C no necesiten tocar archivos comunes.
- Fijar las convenciones compartidas (módulos HTTP, migraciones, errores, logs, configuración, guardas de datos).
- Convertir los riesgos R-04 y R-05 en pruebas automatizadas y en un informe honesto sobre qué entornos se verificaron.
- Registrar la región `sa-east-1` con su base legal real.

**Non-Goals:**
- Tablas de dominio, autenticación, RLS por tabla, seeds con datos y despliegue (C-03 en adelante, C-17 y C-20).
- Elegir el proveedor de PaaS, crear cuentas o generar costos.
- Contenedorizar la aplicación (`Dockerfile`): lo hace C-20. Aquí solo hay Docker Compose para la base de datos.
- Instalar skills externas.

## Decisions

### D1. Node 22, módulos ESM y npm
Se fija Node 22 en `.nvmrc` y en `engines` (es la versión instalada en la máquina del Líder; se confirma su estado de soporte al aplicar). El proyecto usa ESM (`"type": "module"`, resolución `NodeNext`), `tsx` para desarrollo y `tsc` para compilar a `dist/`. Gestor: **npm**, con `package-lock.json` versionado y `npm ci` en CI.
*Alternativas:* Node 24 (sin ganancia para el MVP); CommonJS (la ecosistema actual de Fastify y de las librerías elegidas es ESM-first); pnpm (agrega una herramienta que nadie instaló).

### D2. Estructura hexagonal con regla de dependencias verificada por lint
Carpetas: `src/{domain,application,infrastructure,interfaces/http}`, `migrations/`, `seeds/`, `test/{unit,integration,api}`. La regla "el dominio no importa infraestructura, HTTP ni `pg`" se hace cumplir con `no-restricted-imports` por carpeta en ESLint, sin dependencia extra. Además `process.env` solo se permite en el módulo de configuración (`no-restricted-properties`).
*Alternativa:* `dependency-cruiser` (más potente, pero una herramienta más para tres personas; se puede sumar luego).

### D3. Aplicación como fábrica y registrador de módulos por escaneo
`buildApp(config)` construye la instancia de Fastify **sin escuchar**; `main.ts` la arranca. Así las pruebas `api` usan `inject` sin abrir puertos. `GET /salud` se registra en la raíz desde el núcleo. El registrador lee `src/interfaces/http/modules/`, ordena los directorios alfabéticamente y carga el punto de entrada (`index`) de cada uno, registrándolo con el prefijo `/api/v1`. El nombre de la carpeta no define la ruta.
- Debe resolver la extensión (`index.ts` en desarrollo, `index.js` en `dist/`), y fallar el arranque nombrando el módulo si falta el punto de entrada o no exporta un plugin.
*Alternativa:* un `modules/index.ts` con una línea por módulo (más simple, pero es el archivo compartido que genera conflictos entre ramas).

### D4. Errores de dominio sin conocer HTTP
`ErrorDeDominio(codigo, tipo, mensaje)` vive en `src/domain/shared/`. El **tipo** es semántico y la capa HTTP lo traduce:

| Tipo | Estado |
|---|---|
| `solicitud_invalida` | 400 |
| `no_autenticado` | 401 |
| `prohibido` | 403 |
| `no_encontrado` | 404 |
| `conflicto` | 409 |
| `regla_de_negocio` | 422 |

Un manejador central devuelve `{codigo, mensaje}`. Los errores de validación del esquema se traducen a `400 SOLICITUD_INVALIDA` listando campo y regla, **sin repetir los valores**; el `notFound` responde `RUTA_NO_ENCONTRADA`; cualquier otro error responde `500 ERROR_INTERNO` genérico y el detalle va solo al log.

### D5. Logs: redacción profunda propia
Se usa el logger incorporado de Fastify (pino). Sus rutas de redacción solo cubren un nivel de comodín, y la spec exige redactar a cualquier profundidad, así que se agrega un **redactor recursivo** (con límite de profundidad) aplicado a cada objeto registrado. Reglas:
- Se comparan los nombres de campo sin distinguir mayúsculas ni formato (`obra_social`, `obraSocial`). Conjunto de datos personales: `dni`, `telefono`, `email`, `nombre`, `apellido`, `obra_social`. Conjunto de credenciales: `contrasena`, `password`, `token`, `codigo`, `authorization`, `cookie`, `secret`, `apiKey`.
- El serializador de pedidos registra método, identificador y **ruta sin cadena de consulta**; nunca el cuerpo.
- En los mensajes de error se enmascaran correos y números de 7 u 8 dígitos (DNI). Es un respaldo de mejor esfuerzo: la regla principal es no interpolar datos personales en mensajes (regla dura 1).
*Alternativa:* solo `redact.paths` de pino (más simple, no cumple la profundidad ni los textos libres).

### D6. Configuración tipada con perfiles
Un único módulo `config` valida el entorno con TypeBox (esquema = documentación), con tres perfiles: `app`, `migrate` y `seed`. Cada perfil exige solo lo que usa. Las variables de changes posteriores (secretos JWT, email, `PUBLIC_BASE_URL`) se declaran como **opcionales** hasta que el change dueño (C-06, C-11, C-15) las vuelva obligatorias; ninguna sensible tiene valor por defecto.

| Variable | Perfil que la exige en C-01 | Sensible |
|---|---|---|
| `DATABASE_URL` | `app` | Sí |
| `DATABASE_MIGRATION_URL` | `migrate` | Sí |
| `NODE_ENV`, `PORT`, `LOG_LEVEL`, `DEFAULT_TIMEZONE`, `RATE_LIMIT_PUBLIC` | ninguno (con defaults documentados) | No |
| `ALLOW_SEED`, `SEED_ALLOWED_HOSTS` | `seed` | No |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `EMAIL_API_KEY` | ninguno (opcionales) | Sí |
| `EMAIL_FROM`, `PUBLIC_BASE_URL` | ninguno (opcionales) | No |

Una prueba compara las claves del esquema con `.env.example`, de modo que una variable sin documentar rompe el CI.
La zona horaria se valida con `Intl.supportedValuesOf('timeZone')` o con un intento de `Intl.DateTimeFormat`.

### D7. Runner de migraciones propio, de SQL plano
Un runner de unos cientos de líneas en lugar de una herramienta externa, porque el proyecto necesita un esquema de nombres por change (`C{NN}_{seq}_{nombre}.sql`), detección de edición de lo aplicado y SQL puro.
- Valida nombres con una expresión regular, ordena por `(NN, seq)` y rechaza duplicados **antes** de aplicar nada.
- Tabla `schema_migrations(nombre, huella, aplicada_en)`. La huella es SHA-256 del contenido **con fines de línea normalizados**: el equipo trabaja en Windows y Linux, y sin normalizar el CRLF cambiaría la huella. Se agrega `.gitattributes` con `*.sql text eol=lf`.
- Cada migración corre en una transacción; un bloqueo asesor de PostgreSQL evita ejecuciones simultáneas.
- Usa `DATABASE_MIGRATION_URL`; si falta, falla (no cae en la conexión de la app).
- No soporta sentencias que no pueden ir en una transacción (por ejemplo `CREATE INDEX CONCURRENTLY`); se documenta.
*Alternativas:* `node-pg-migrate` (numeración y formato propios), `dbmate` (binario aparte), Flyway (Java).

**Coordinación con C-03:** una migración no puede crear el rol con el que se ejecuta. Por eso C-01 entrega un script de inicialización (`docker/postgres/init/01-roles.sql`) que crea la base y los roles `migra` (propietario del esquema) y `app` (sin superusuario, sin `BYPASSRLS`, sin ser propietario) para local y CI. C-03 se limita a otorgar privilegios y a crear `aplicar_rls`. El aprovisionamiento en el PaaS se documenta en C-20. Hay que ajustar la ficha de C-03, que hoy dice que `C03_001` crea los roles.

### D8. Pruebas: tres proyectos de Vitest y base real
Un `vitest.config.ts` con tres proyectos (`unit`, `integration`, `api`). `integration` y `api` leen `TEST_DATABASE_URL` y `TEST_DATABASE_MIGRATION_URL`. La preparación global aplica las migraciones sobre un esquema limpio, y **antes de borrar nada** comprueba que el host esté en la lista permitida (reutiliza la guarda de D9). fast-check queda instalado, con una prueba de propiedades mínima para demostrar que la herramienta corre. Se confirma al aplicar la forma de configurar proyectos en la versión de Vitest instalada.

### D9. Guardas de datos
`assertNoProduction(config)` rechaza si `NODE_ENV=production` o si el host de la base no está en `SEED_ALLOWED_HOSTS` (por defecto `localhost`, `127.0.0.1`, `::1`). `ALLOW_SEED` debe ser exactamente `true`. Los mensajes nombran el host y nunca la cadena de conexión. Un ejecutor de seeds vacío (`seeds/run.ts`) la invoca, de modo que C-05 solo agrega datos.

### D10. PostgreSQL local y en CI
`docker-compose.yml` levanta PostgreSQL con los scripts de inicialización de D7. En CI se usa un contenedor de servicio y un paso que ejecuta esos mismos scripts con `psql`. La versión de PostgreSQL se fija en un solo lugar y se registra en el informe de validación (se elige al aplicar la más reciente estable que ofrezca el PaaS candidato).
**Como el Líder no tiene Docker ni `psql`, la integración continua es el entorno de referencia** de las pruebas de integración y del spike. Para correrlas localmente hay dos opciones (ver Open Questions); el README documenta ambas.

### D11. Integración continua
`.github/workflows/ci.yml`, con permisos mínimos (`contents: read`), cancelación de ejecuciones previas por rama y Node tomado de `.nvmrc`. Dos trabajos: **calidad** (lint, formato, tipos) y **pruebas** (unitarias, integración y `api` con PostgreSQL de servicio). Se agrega una prueba de humo que compila y arranca `dist/main.js` para verificar `/salud` y la carga de módulos fuera de `tsx`. Las credenciales de la base de CI son descartables. Las acciones se fijan por versión mayor; fijarlas por huella es un endurecimiento para C-19.

### D12. Dependencias
Se instalan todas las previstas, con `npm ci` y archivo de bloqueo versionado. Las versiones exactas se resuelven al aplicar consultando la documentación vigente de cada librería.

| Tipo | Paquetes |
|---|---|
| Ejecución | `fastify`, `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`, `@fastify/swagger`, `@sinclair/typebox`, `@fastify/type-provider-typebox`, `pg`, `pg-boss`, `argon2`, `jose`, `nodemailer` |
| Desarrollo | `typescript`, `tsx`, `vitest`, `fast-check`, `@faker-js/faker`, `eslint`, `typescript-eslint`, `prettier`, `eslint-config-prettier`, `@types/node`, `@types/pg`, `@types/nodemailer` |

- **Email:** `nodemailer` (SMTP) es neutral respecto de Resend y Brevo, que el proyecto aún no eligió; C-11 puede reemplazarlo por el cliente del proveedor.
- **JWT:** `jose`; C-06 confirma su uso.
- **Faker:** no hay localización `es_AR` garantizada; se verifica al aplicar y, si no existe, se usa la española y se agregan datos locales (DNI, teléfonos) en el generador de C-05.

### D13. `.gitignore`
Ignora `node_modules/`, `dist/`, `coverage/`, `.env` y `.env.*` (con excepción de `.env.example`), logs, archivos temporales (`*.log`, `*.tmp`, `*.bak`, `.DS_Store`, `Thumbs.db`) y `.claude/settings.local.json`. **No** ignora `.atl/skill-registry.md`, `openspec/` ni `.active-orchestrator-state.json`: el archivo documenta con un comentario que son artefactos evaluables.
**Discrepancia a corregir:** `CLAUDE.md` afirma que `.atl/skill-registry.md` "no está en el repo". El Líder decidió versionarlo (el commit de la Etapa 5 ya lo incluye), así que se corrige esa línea. La plantilla de la skill `agent-instruction` repite la frase "no versionado"; si se regenera `CLAUDE.md`, la corrección debe conservarse.

### D14. Spike R-04 y R-05
Pruebas de integración en `test/integration/platform/`, con tablas de **uso exclusivo del spike** en un esquema descartable (no son migraciones: la tabla real es de C-09):
1. `CREATE EXTENSION btree_gist` funciona con el rol de migraciones.
2. Restricciones de exclusión por profesional y por sillón: rechazan solapes y aceptan rangos contiguos.
3. RLS forzada con un rol no propietario y sin contexto no devuelve filas.
4. `fin_sillon` como columna generada con `timestamptz + interval` es **rechazada** (se espera el error de expresión no inmutable; se confirma el código al aplicar).
5. `fin_sillon` como columna común con `CHECK (fin_sillon = fin + make_interval(mins => buffer_minutos))` funciona y rechaza valores incoherentes.
El resultado se vuelca en `docs/plataforma/informe-validacion-postgres.md`, con la versión de PostgreSQL y una tabla de entornos: local, CI y `sa-east-1`. Un entorno no probado dice **"no verificado"**.

### D15. Región y base legal (PO-03)
Se registra en `knowledge-base/09_decisiones_y_supuestos.md` (DD-04) y `10_preguntas_abiertas.md` (PO-03):
- **Decisión del Líder:** base de datos y backend en `sa-east-1` (São Paulo) o en infraestructura local equivalente.
- **Base legal:** Brasil **no** figura en la lista de países con nivel adecuado de la AAIP (verificado el 2026-11-22 en `argentina.gob.ar/transferencias-internacionales`). La transferencia requiere cláusulas contractuales modelo (Disposición DNPDP 60/2016, Resolución AAIP 198/2023) o una validación legal equivalente.
- **Estado:** pendiente de asesoría legal. No bloquea C-01 pero bloquea C-20.
- **Restricción para la elección del PaaS:** debe ofrecer región en São Paulo. De Railway, Render y Fly.io (candidatos de DD-04) **no está verificado** cuál la ofrece.

## Risks / Trade-offs

- **Base legal de `sa-east-1`** → Brasil no es "adecuado"; se necesita cláusulas modelo o dictamen legal. Se registra como riesgo abierto y se bloquea C-20 hasta resolverlo. El Líder debe confirmar qué se entiende por "infraestructura local equivalente" (no se verificó que exista una región argentina de ningún proveedor).
- **El Líder no tiene Docker ni `psql`** → CI como entorno de referencia; el README ofrece instalar Docker Desktop o PostgreSQL nativo con el mismo script de inicialización. Hasta entonces el spike local queda "no verificado".
- **`argon2` es nativo** → puede fallar al instalar en Windows o en imágenes mínimas (por ejemplo musl). Mitigación: probar `npm ci` en Windows y en el runner de CI al aplicar; en C-20 usar una imagen basada en Debian.
- **Redacción de texto libre de mejor esfuerzo** → puede enmascarar de más (números de 7 u 8 dígitos) o dejar pasar un dato con otro formato. Mitigación: la regla dura 1 prohíbe interpolar datos personales en mensajes y la revisión de PR lo verifica; C-19 repasa los logs.
- **Huellas de migración y fines de línea** → `.gitattributes` y normalización antes de hashear; prueba específica con CRLF.
- **Carga dinámica de módulos distinta en `tsx` y en `dist/`** → prueba de humo del build en CI.
- **Dependencias instaladas sin uso durante semanas** → es deliberado para no editar `package.json` después; si un change descarta una, la quita y avisa al Líder.
- **Cambios de API entre versiones** (proyectos de Vitest, plugins de Fastify con TypeBox, pg-boss) → se consulta la documentación vigente al aplicar y se registran las versiones elegidas.
- **Resultados del spike en un PostgreSQL gestionado pueden diferir del local** → el informe distingue entornos y no extrapola.

## Migration Plan

1. Rama `change/C-01-foundation-setup`; todo es código nuevo, sin datos que migrar.
2. Aplicar las tareas en orden y correr las verificaciones en CI.
3. El Líder revisa el PR y fusiona a `main`; recién entonces A, B y C abren sus ramas de C-02, C-03 y C-04 (GATE 1).
4. **Rollback:** revertir el PR. No hay datos ni infraestructura externa creada.
5. Avisar a los otros agentes de la corrección pendiente de la ficha de C-03 (roles creados por el script de inicialización).

## Open Questions

- **Entorno local del Líder:** ¿instalar Docker Desktop o PostgreSQL nativo para correr las pruebas de integración en la máquina, o apoyarse solo en CI durante C-01? No cambia las specs ni el diseño, solo dónde se ve el resultado.
- **Proveedor de PaaS con región São Paulo:** se resuelve antes de C-20 (con PO-03), no afecta a C-01.
- **Versión de PostgreSQL:** se fija al aplicar, según lo que ofrezca el PaaS candidato.
