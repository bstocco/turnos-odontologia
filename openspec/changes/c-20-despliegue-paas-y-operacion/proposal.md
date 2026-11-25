# Proposal

## Why

Todo el backend del MVP (`C-01`..`C-17`) corre hoy solo en desarrollo y en CI: no existe una imagen desplegable, ni un entorno de producción, ni copias de seguridad probadas, ni un procedimiento para dar de alta la primera clínica. `C-20` es el último eslabón del camino crítico (`… → C-15 → C-18 → C-20`) y está **bloqueado por `PO-03`**: la elección del PaaS (`DD-04`) depende de que el proveedor ofrezca región en São Paulo (`sa-east-1`, decisión del Líder del 2026-11-22) con PostgreSQL gestionado que soporte `btree_gist` (`R-05`), y el alojamiento fuera de Argentina exige una base legal documentada bajo la Ley 25.326.

Se verificó el 2026-11-25 contra la documentación oficial de los tres candidatos de `DD-04`: solo **Fly.io** ofrece São Paulo (`gru`) con Managed Postgres; Render (Oregon, Ohio, Virginia, Frankfurt, Singapur) y Railway (EE. UU. oeste/este, Ámsterdam, Singapur) no tienen región en Sudamérica. Esta propuesta fija esa elección, documenta la protección de datos personales y deja el despliegue listo para revisión **antes de escribir cualquier artefacto de despliegue** (gobernanza ALTO: proponer y esperar revisión).

## What Changes

- **Elección del PaaS y cierre de `PO-03` (decisión documentada, no código)**: Fly.io, región `gru`, con Managed Postgres 17 para la base y dos procesos de aplicación (API y worker). Se documenta la base legal (cláusulas contractuales modelo, Disposición DNPDP 60/2016 y Resolución AAIP 198/2023), el inventario de transferencias (hosting, base, email transaccional) y la condición de no operar con datos reales hasta cumplir el checklist legal.
- **Imagen de contenedor**: `Dockerfile` multi-etapa (compilación con `npm ci` + `npm run build`, imagen final sin dependencias de desarrollo, usuario sin privilegios) y `.dockerignore`, con tres comandos de arranque sobre la misma imagen: API (`dist/main.js`), worker (`dist/infrastructure/queue/worker-cli.js`) y migraciones (`dist/infrastructure/db/migrate-cli.js`).
- **Configuración del PaaS versionada**: `fly.toml` (API con chequeo `GET /salud`) y proceso de worker; migraciones al desplegar con el rol `migra` antes de reemplazar la versión; variables de entorno solo como secretos del PaaS.
- **Entornos**: `produccion` y `pruebas` (staging) separados, cada uno con su propia base y secretos; `pruebas` solo con datos sintéticos; los seeds permanecen bloqueados en producción (`data-safety-guards`).
- **Aprovisionamiento equivalente de roles** `app` y `migra` en la base gestionada (el equivalente de `docker/postgres/init/01-roles.sql`), verificando antes que el rol de la aplicación queda sin `BYPASSRLS` ni propiedad de las tablas.
- **Copias de seguridad y restauración**: backups automáticos de la base gestionada, política de retención (`PO-10`, propuesta a validar legalmente) y **prueba de restauración** sobre un entorno sintético con evidencia registrada.
- **Operación mínima**: monitoreo del chequeo de salud y del worker de `pg-boss`, alertas básicas, logs estructurados sin datos de pacientes, y `docs/operacion/**` con el runbook: alta de la primera clínica (`C-17`), rotación de secretos, restauración y retiro de una clínica.
- **Despliegue desde GitHub Actions** (`.github/workflows/`): flujo manual/por etiqueta que reutiliza las puertas de calidad de `C-01` antes de desplegar; sin tocar el workflow `ci.yml` existente.
- **Limpieza ya aplicada en esta rama**: se eliminó `probe-out.txt` (archivo de salida accidental, versionado en `e6941c3`) y se agregó al `.gitignore`.
- **Fuera de alcance**: cambios de comportamiento de la API, nuevas tablas, nuevas dependencias de npm (solo las toca el Líder, regla 14), interfaz gráfica, dominio propio y CDN, alta disponibilidad multi-región, y la firma real de contratos o el registro ante la AAIP (`PO-14`), que son acciones legales del equipo y no software.

## Capabilities

### New Capabilities
- `despliegue-contenedor-y-entornos`: imagen reproducible de la aplicación, procesos API/worker/migraciones, entornos `pruebas` y `produccion` separados, secretos solo por variables de entorno y migraciones previas al reemplazo de la versión.
- `respaldo-y-restauracion-datos`: copias de seguridad automáticas, política de retención, prueba de restauración sobre datos sintéticos y exigencia de que la restauración preserve el aislamiento entre clínicas.
- `operacion-y-proteccion-de-datos`: monitoreo del servicio y del worker, alertas básicas, logs sin datos de pacientes, runbook operativo y condiciones legales previas a operar con datos reales (Ley 25.326).

### Modified Capabilities
<!-- Ninguna: no cambia el comportamiento observable de la API. `GET /salud` y `data-safety-guards` se reutilizan tal cual. -->

## Impact

- **Zona de `C-20`** (según `CHANGES.md`): `Dockerfile`, `.dockerignore`, `fly.toml` (configuración del PaaS), `docs/operacion/**`, `.github/workflows/` (solo un workflow nuevo de despliegue).
- **Código de la aplicación**: ninguno planificado. Si la revisión aprueba un chequeo de salud con base de datos o variables nuevas, serían un change separado (ver `Q4` y `Q8` en `design.md`).
- **Documentación de la KB a actualizar tras la aprobación**: `knowledge-base/09_decisiones_y_supuestos.md` (`DD-04`) y `knowledge-base/10_preguntas_abiertas.md` (`PO-03`, `PO-10`, `R-05`).
- **Sistemas externos**: cuenta de Fly.io (Líder) y proveedor de email (**Resend**, elegido el 2026-11-25; también es una transferencia de datos).
- **Contratos congelados**: `RequestContext`, puertos de dominio y `TurnoEventPublisher` sin cambios.
- **Dependencias**: `C-17`, `C-18` y `C-19` deben estar fusionados antes de **aplicar** este change; la propuesta y el diseño pueden revisarse ya.
