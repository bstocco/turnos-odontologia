# Turnos Odontología

## 📦 Entregables del Trabajo de Integración

- [Reflexión sobre SDD (PDF)](docs/reflexion/reflexion-sdd.pdf)
- [Informe de Discovery (PDF)](docs/discovery/informe-discovery.pdf)
- [Índice completo de entregables](docs/ENTREGABLES.md)
- Video: https://youtu.be/GGHIPzrCWtQ

> El MVP es una **API REST sin interfaz gráfica** (front y back en el mismo proyecto: el backend vive en `src/`).

SaaS multi-tenant de turnos para clínicas odontológicas argentinas. El MVP es una **API REST** (TypeScript, Node.js, Fastify y PostgreSQL), sin interfaz gráfica. Su regla central: **nunca hay solapamientos de profesional ni de sillón**.

- Reglas de trabajo del proyecto y del equipo de 4: [CLAUDE.md](CLAUDE.md)
- Dominio y decisiones: [knowledge-base/](knowledge-base/README.md)
- Plan de implementación: [CHANGES.md](CHANGES.md)
- Despliegue y operación (Fly.io, Neon, Resend, runbook, respaldo y protección de datos): [docs/operacion/](docs/operacion/)
- Instrucciones para agentes: [AGENTS.md](AGENTS.md)

## Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| Node.js | 22.12 o superior (`.nvmrc` fija 22) | Ejecutar y probar |
| npm | el que trae Node | Instalar dependencias (`package-lock.json` versionado) |
| PostgreSQL | 17 (mínimo 15 para el script de inicialización) | Pruebas de integración y desarrollo con base |
| Docker Desktop **o** PostgreSQL nativo | — | Dos formas de tener PostgreSQL en local (ver abajo) |

Las pruebas unitarias y `api` **no necesitan base de datos**. Solo `test:integration` la necesita.

## Primeros pasos

```bash
npm ci                  # instala exactamente lo que dice package-lock.json
npm run lint            # ESLint, incluidas las reglas de capas
npm run typecheck       # TypeScript estricto
npm run test:unit       # pruebas unitarias
npm run test:api        # pruebas de la API (sin base de datos)
```

### Variables de entorno

Copiá `.env.example` a `.env` y completá los valores. `.env` no se versiona. Los scripts `dev`, `db:migrate` y `db:seed`, y Vitest, leen `.env` solos si existe.

```bash
cp .env.example .env    # PowerShell: Copy-Item .env.example .env
```

Las variables sensibles van **vacías** en el ejemplo: un valor vacío se trata como ausente, así que si olvidás una obligatoria el arranque falla nombrándola. El catálogo completo está en `src/config/variables.ts`; una prueba exige que `.env.example` lo refleje.

### Base de datos local

Elegí una de las dos opciones. Ambas usan el mismo script, `docker/postgres/init/01-roles.sql`, que crea los roles `migra` (propietario del esquema, ejecuta las migraciones) y `app` (la aplicación: sin superusuario, sin `BYPASSRLS`, sin ser propietario) y las bases `turnos` y `turnos_test`.

**Opción A: Docker Desktop**

```bash
export POSTGRES_PASSWORD=cambiar MIGRA_PASSWORD=cambiar APP_PASSWORD=cambiar   # PowerShell: $env:POSTGRES_PASSWORD='cambiar'; ...
docker compose up -d --wait
```

Esas tres contraseñas son solo para `docker-compose.yml` (no las lee la aplicación) y no tienen valor por defecto. Usá contraseñas descartables.

**Opción B: PostgreSQL nativo** (con `psql` 15 o superior)

```bash
export MIGRA_PASSWORD=cambiar APP_PASSWORD=cambiar
psql -h localhost -U postgres -f docker/postgres/init/01-roles.sql
```

Después definí en `.env` (o en el entorno):

```text
DATABASE_URL=postgres://app:<APP_PASSWORD>@localhost:5432/turnos
DATABASE_MIGRATION_URL=postgres://migra:<MIGRA_PASSWORD>@localhost:5432/turnos
TEST_DATABASE_URL=postgres://app:<APP_PASSWORD>@localhost:5432/turnos_test
TEST_DATABASE_MIGRATION_URL=postgres://migra:<MIGRA_PASSWORD>@localhost:5432/turnos_test
```

Y corré las pruebas de integración:

```bash
npm run test:integration
```

> Las pruebas de integración **borran el esquema `public`** de la base de pruebas. Por seguridad solo corren si el host está en `SEED_ALLOWED_HOSTS` (por defecto, hosts locales) y el nombre de la base termina en `_test`.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga (`tsx watch`) |
| `npm run build` / `npm start` | Compila a `dist/` y ejecuta `dist/main.js` |
| `npm run lint` | ESLint |
| `npm run format` / `format:check` | Prettier (escribe / verifica) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Todos los proyectos de Vitest |
| `npm run test:unit` / `test:integration` / `test:api` | Un proyecto de Vitest |
| `npm run db:migrate` | Aplica las migraciones pendientes (usa `DATABASE_MIGRATION_URL`) |
| `npm run db:seed` | Ejecutor de seeds con sus guardas (`seeds/run.ts`); incluye el seed de la clínica de demostración y el de la primera clínica, solo con datos sintéticos |

## Estructura

```
src/
├── config/                  # único lugar que lee process.env; catálogo de variables
├── domain/                  # TypeScript puro: sin I/O, HTTP ni base de datos
├── application/             # casos de uso, a través de puertos
├── infrastructure/          # PostgreSQL, logging, seeds, email, cola
└── interfaces/http/         # Fastify: app, errores y módulos de rutas
migrations/                  # SQL versionado C{NN}_{seq}_{nombre}.sql
seeds/                       # SOLO datos sintéticos
test/{unit,integration,api}  # un proyecto de Vitest por carpeta
docker/postgres/init/        # roles y bases para local y CI
docs/plataforma/             # informe de validación de PostgreSQL
docs/operacion/              # runbook, imagen Docker, respaldo, retención y protección de datos
```

ESLint hace cumplir la regla de capas: `domain` no importa `infrastructure`, `interfaces`, `application`, `pg` ni `fastify`, y `application` no importa `infrastructure` ni `interfaces`.

## Cómo agregar un módulo HTTP

Un módulo es una carpeta en `src/interfaces/http/modules/<nombre>/` con un `index.ts` que exporta un plugin de Fastify. **No hay que editar ningún otro archivo**: el servicio carga las carpetas por escaneo, en orden alfabético, con el prefijo `/api/v1`.

```ts
// src/interfaces/http/modules/turnos/index.ts
import type { FastifyPluginAsync } from 'fastify';

const plugin: FastifyPluginAsync = async (app) => {
  app.get('/turnos', async () => []); // queda disponible en GET /api/v1/turnos
};

export default plugin;
```

Si falta el `index` o no exporta un plugin, el arranque falla nombrando el módulo. `GET /salud` vive en la raíz, fuera de los módulos.

### Errores

Lanzá `ErrorDeDominio(codigo, tipo, mensaje)` desde `src/domain/shared/errores.ts`; la capa HTTP lo traduce:

| `tipo` | Estado |
|---|---|
| `solicitud_invalida` | 400 |
| `no_autenticado` | 401 |
| `prohibido` | 403 |
| `no_encontrado` | 404 |
| `conflicto` | 409 |
| `regla_de_negocio` | 422 |

La respuesta es `{ "codigo": "...", "mensaje": "..." }`. Un error inesperado responde `500 ERROR_INTERNO` sin detalles; el detalle queda en el log con el identificador del pedido (cabecera `x-request-id`). **No interpoles datos personales en los mensajes.**

## Migraciones

- Archivos `migrations/C{NN}_{seq}_{nombre}.sql`: `NN` es el número del change (dos dígitos) y `seq` el orden dentro del change (tres dígitos). Ejemplo: `C03_001_base.sql`.
- Se aplican en orden `(NN, seq)`. Los IDs de change respetan las dependencias, así que ese orden es seguro.
- Cada una corre en **una transacción**. Si falla, se revierte completa y el runner se detiene.
- Una migración ya aplicada es **inmutable**: si cambia su contenido, el runner falla nombrándola. Creá una nueva.
- Hay una tabla de control (`schema_migrations`) con el nombre, la huella SHA-256 (con fines de línea normalizados) y el instante. `.gitattributes` fija `eol=lf` para los `.sql`.
- No se admiten sentencias que no pueden ir en una transacción (por ejemplo `CREATE INDEX CONCURRENTLY`).
- Las claves foráneas solo apuntan a tablas de changes ya fusionados; las cruzadas se agregan en el change que depende de ambas.
- Toda tabla con `clinica_id` aplica Row-Level Security. Ver [el informe de validación](docs/plataforma/informe-validacion-postgres.md) para la forma de la política y las trampas conocidas.

## Ramas y trabajo en equipo

Equipo de 4: 1 líder y 3 implementadores (Agentes A, B y C), cada uno en su rama. Una rama por change (`change/C-NN-nombre`) con PR a `main` y sin commits directos. Los commits siguen el formato de commits convencionales. Las reglas completas están en [CLAUDE.md](CLAUDE.md).

Reglas duras que conviene recordar: sin datos de pacientes en logs, **sin datos reales fuera de producción** (los seeds se niegan a correr contra producción), aislamiento por `clinica_id` con RLS y cero solapamientos de profesional y de sillón.

## Limitaciones conocidas

- Los defectos **F1, F2, F6, F8 y F9** (autenticación y autorización de `usuarios`, alta de la primera clínica, `turnos`, `agenda`, `bloqueos`, `ausentismo`, `auditoria` y `exportaciones`) están **abiertos**. Están documentados en [docs/seguridad/checklist-ley-25326.md](docs/seguridad/checklist-ley-25326.md) y se resolverán en un change correctivo aparte.
- Hasta entonces no hay que dar de alta clínicas reales ni cargar datos reales de pacientes. El entorno `produccion` está solo documentado, no aprovisionado.
- Quedan pendientes la validación legal y el registro ante la AAIP; ver [docs/operacion/proteccion-datos.md](docs/operacion/proteccion-datos.md).

## Versiones elegidas

Resueltas el 2026-11-22 (ver `package-lock.json`).

| Paquete | Versión | Nota |
|---|---|---|
| `fastify` | 5.12.8 | |
| `typebox` | 1.4.7 | `@fastify/type-provider-typebox` 6.x lo exige (no `@sinclair/typebox`) |
| `@fastify/type-provider-typebox` | 6.3.0 | |
| `pg` | 8.23.1 | |
| `pg-boss` | 12.39.0 | Requiere Node 22.12 o superior |
| `pino` | 10.4.0 | |
| `argon2` | 0.45.2 | Módulo nativo: verificá que instale en tu sistema |
| `jose` | 6.2.18 | |
| `nodemailer` | 10.6.1 | Envío por SMTP con Resend (DD-04): `smtp.resend.com:465`, usuario `resend`, contraseña `EMAIL_API_KEY`. No se usa la API HTTP de Resend (`src/infrastructure/email/smtp-sender.ts`) |
| `typescript` | 6.0.3 | `typescript-eslint` aún no soporta TypeScript 7 |
| `vitest` | 5.1.1 | |
| `fast-check` | 4.11.0 | |
| `eslint` / `typescript-eslint` | 10.15.0 / 8.73.0 | |
| `prettier` | 3.10.1 | |
| `tsx` | 4.23.15 | |
| `@faker-js/faker` | 10.6.0 | Verificar si existe una localización `es_AR` antes de C-05 |

## Integración continua

`.github/workflows/ci.yml` corre en cada push y en cada PR a `main`: lint, formato y tipos; pruebas unitarias, de integración (con PostgreSQL de servicio) y `api`; y una prueba de humo del build compilado. Las credenciales del flujo son descartables y no hay datos reales.
