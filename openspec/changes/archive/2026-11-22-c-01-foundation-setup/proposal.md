# Proposal

## Why

El repositorio tiene la base de conocimiento y el roadmap, pero **ningún código**. Después de C-01 tres integrantes arrancan en paralelo (C-02, C-03 y C-04 en ramas separadas); sin convenciones comunes se pisarían al registrar rutas, numerar migraciones y tocar `package.json`. Además hay tres riesgos técnicos sin validar que condicionan el modelo de datos: la columna `fin_sillon` (R-04), la disponibilidad de `btree_gist` y RLS en el PostgreSQL gestionado (R-05) y el destino de los datos bajo la Ley 25.326 (PO-03).

## What Changes

- Proyecto **TypeScript estricto sobre Node.js** con ESLint, Prettier y la estructura hexagonal `src/{domain,application,infrastructure,interfaces/http}`, más `migrations/`, `seeds/` y `test/{unit,integration,api}`.
- **Aplicación Fastify mínima** con `GET /salud`, manejo central de errores con códigos de dominio estables y un registrador que carga cada módulo de `src/interfaces/http/modules/*` por escaneo de carpeta.
- **Logger estructurado con redacción** de datos personales y secretos.
- **Runner de migraciones SQL** con tabla de control y nombres `C{NN}_{seq}_{nombre}.sql`, ordenadas por ID de change.
- **Configuración tipada del entorno** y `.env.example` según `08 §Variables de entorno`, sin valores sensibles por defecto y con falla inmediata si falta algo obligatorio.
- **Guardas de datos:** `ALLOW_SEED=false` por defecto y `assertNoProduction()` para seeds (RN-DA-02).
- **Vitest** con proyectos `unit`, `integration` y `api`, y fast-check. `docker-compose.yml` con PostgreSQL para desarrollo y pruebas.
- **Todas las dependencias previstas** instaladas de una vez, para que los changes siguientes no editen `package.json` ni el lockfile.
- **GitHub Actions:** lint, typecheck, pruebas unitarias e integración con PostgreSQL de servicio.
- **`.gitignore`** que ignora `node_modules/`, `dist/`, `.env` y temporales, y **no** ignora `.atl/skill-registry.md`, `openspec/` ni `.active-orchestrator-state.json`, porque son artefactos evaluables del repositorio.
- **Spike R-04 y R-05:** verificar `btree_gist`, RLS y `fin_sillon` como columna común con `CHECK` (no puede ser columna generada, porque `timestamptz + interval` es `STABLE`).
- **README de desarrollo** y actualización de la documentación afectada (ver Impact).

### Decisión de región y base legal (PO-03)

El Líder decidió desplegar la base de datos y el backend en **Sudamérica (`sa-east-1`, São Paulo, Brasil)** o en infraestructura local equivalente. La verificación hecha el 2026-11-22 contra la página oficial de la AAIP (`argentina.gob.ar/transferencias-internacionales`) muestra que **Brasil no figura en la lista de países con nivel adecuado** (sí figuran la UE y el EEE, Reino Unido, Suiza, Guernsey, Jersey, Isla de Man, Islas Feroe, Canadá en su sector privado, Andorra, Nueva Zelanda, Uruguay e Israel para datos automatizados).

Por eso este change registra `sa-east-1` como **decisión del Líder con una base legal distinta de "nivel adecuado"**: la transferencia necesita las cláusulas contractuales modelo (Disposición DNPDP 60/2016, Resolución AAIP 198/2023) o una validación legal equivalente. Queda como riesgo abierto y **pendiente de asesoría legal**; no bloquea C-01, pero sí el despliegue (C-20).

## Capabilities

### New Capabilities
- `http-service`: servicio HTTP base con chequeo de salud, carga automática de módulos de rutas y contrato de errores con códigos de dominio estables.
- `log-redaction`: logs estructurados que nunca emiten datos personales ni secretos.
- `database-migrations`: ejecución ordenada, idempotente y trazable de migraciones SQL versionadas por change.
- `runtime-configuration`: configuración del entorno tipada, validada al arrancar y sin valores sensibles por defecto.
- `data-safety-guards`: protecciones que impiden cargar datos de prueba en producción y exigen habilitar los seeds de forma explícita.
- `quality-gates`: verificaciones automáticas (lint, tipos, pruebas) obligatorias en cada rama.
- `platform-validation`: verificación documentada de PostgreSQL (`btree_gist`, RLS, `fin_sillon`) en local y en la región elegida.

### Modified Capabilities
<!-- Ninguna: el proyecto no tiene specs previas en openspec/specs/. -->

## Impact

- **Código nuevo:** toda la estructura del proyecto (`src/`, `test/`, `migrations/`, `seeds/`). No hay código previo que modificar.
- **Dependencias:** Fastify y sus plugins, `pg`, `argon2`, `jose`, `pg-boss`, TypeBox, `nodemailer`, `pino`, Vitest, fast-check, `@faker-js/faker`, TypeScript, ESLint y Prettier. Las versiones exactas se fijan al aplicar.
- **Infraestructura:** `docker-compose.yml`, `.github/workflows/`, `.nvmrc`.
- **Documentación a actualizar:**
  - `CLAUDE.md`: hoy dice que `.atl/skill-registry.md` "no está en el repo"; el Líder decidió versionarlo, así que hay que corregir esa línea.
  - `CHANGES.md`: nota en C-01 sobre `.gitignore` y la región.
  - `knowledge-base/09_decisiones_y_supuestos.md`: región `sa-east-1` en DD-04 con su base legal.
  - `knowledge-base/10_preguntas_abiertas.md`: estado de PO-03.
- **Fuera de alcance:** tablas de dominio, autenticación y RLS por tabla (C-03 y siguientes); elección final del proveedor de PaaS, creación de cuentas y cualquier costo sin aprobación del Líder; instalación de skills externas.
