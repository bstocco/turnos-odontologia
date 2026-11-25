# Design

## Context

Ver `proposal.md` (Why). Estado verificado del repositorio al 2026-11-25:

- **Sin artefactos de despliegue**: no hay `Dockerfile`, `.dockerignore` ni configuración de PaaS. `docker-compose.yml` solo levanta PostgreSQL 17 para desarrollo y `docker/postgres/init/01-roles.sql` crea los roles `migra` (propietario del esquema) y `app` (sin `BYPASSRLS`, sin propiedad de tablas) con la nota "en el PaaS elegido el aprovisionamiento equivalente se documenta en C-20".
- **Build**: `npm run build` (`tsc -p tsconfig.build.json`) emite a `dist/`. Tres puntos de entrada ya compilables, sin `tsx`: `dist/main.js` (API), `dist/infrastructure/queue/worker-cli.js` (worker; se ejecuta solo si es el módulo principal) y `dist/infrastructure/db/migrate-cli.js` (usa `DATABASE_MIGRATION_URL`; resuelve `migrations/` con `../../../migrations`, o sea, la raíz del proyecto, tanto desde `src/` como desde `dist/`). Por eso la imagen debe incluir `migrations/` junto a `dist/`.
- **Runtime**: Node `>=22.12.0` (`.nvmrc`), `NODE_ENV=production` hace que la API escuche en `0.0.0.0` (`src/main.ts`). Cierre ordenado ante `SIGTERM` ya implementado en API y worker.
- **Salud**: `GET /salud` responde `{"estado":"ok"}` sin consultar la base (spec `http-service`): sirve como chequeo de **vida**, no de **disponibilidad** de la base.
- **Worker**: `pg-boss` con el rol `app` sin DDL; el esquema `pgboss` lo crea la migración `C11_002` bajo `migra`. Soporta ejecución embebida (`schedule:false`) o proceso independiente (`worker-cli.ts`, con recordatorios programados).
- **Migraciones**: el runner ya impide ejecuciones concurrentes y usa solo el rol `migra` (spec `database-migrations`). `C03_001` ejecuta `CREATE EXTENSION IF NOT EXISTS btree_gist`.
- **Configuración**: `loadConfig('app' | 'migrate')` falla con nombres de variables, nunca valores. `ADMIN_INTERNAL_KEY`, `JWT_*`, `EMAIL_*` y `PUBLIC_BASE_URL` son opcionales para el esquema pero necesarias en producción por las features ya fusionadas.
- **CI**: `.github/workflows/ci.yml` (jobs `calidad` y `pruebas` con PostgreSQL 17 efímero) con `concurrency` y `cancel-in-progress`.
- **Preguntas heredadas de la KB**: `PO-03` (base legal; ya decidida: cláusulas contractuales modelo, pendiente validación legal), `PO-10` (retención), `PO-14` (registro AAIP), `R-05` (el PostgreSQL gestionado debe habilitar `btree_gist`), `DD-04` (proveedor abierto).

## Goals / Non-Goals

**Goals:**
- Dejar decidido y justificado el PaaS, con evidencia verificable de las condiciones de `DD-04`/`R-05`/`PO-03`.
- Definir un despliegue repetible (imagen única, tres modos de arranque, migraciones previas) con la menor superficie operativa posible para un equipo de 4 sin dedicación a operaciones.
- Fijar las condiciones legales y de datos que deben cumplirse antes de la primera clínica real.

**Non-Goals:**
- Modificar el comportamiento de la API, el esquema de datos o los contratos congelados (`RequestContext`, puertos de dominio, `TurnoEventPublisher`).
- Agregar dependencias de npm (solo las toca el Líder, regla 14) ni nuevas variables en `src/config/variables.ts`.
- Alta disponibilidad multi-región, balanceo avanzado, dominio propio o CDN.
- Sustituir la asesoría legal: este documento ordena el trabajo técnico y los puntos a validar, no es dictamen jurídico.

## Decisions

### D1. PaaS: Fly.io, región `gru` (São Paulo), Managed Postgres 17

**Evidencia verificada el 2026-11-25** (páginas oficiales, leídas por un subagente de lectura web y contrastadas con las condiciones de `DD-04`):

| Criterio | Fly.io | Render | Railway |
|---|---|---|---|
| Región en São Paulo / Sudamérica | **Sí** (`gru`, con Managed Postgres ✓) | No (Oregon, Ohio, Virginia, Frankfurt, Singapur) | No (EE. UU. oeste/este, Ámsterdam, Singapur) |
| PostgreSQL gestionado | Managed Postgres, versión 16 o 17 (17 por defecto en el CLI) | Render Postgres | Plantilla mantenida por Railway sobre un volumen (no DBaaS gestionado por defecto) |
| `btree_gist` | Figura en la tabla de extensiones | Figura (PG 13+) | No figura; "no planean agregar extensiones" a la plantilla |
| Backups | "Automatic backups and recovery"; retención **no figura** | PITR 3 días (Hobby) / 7 días (Pro) | Backups de volumen + PITR documentado |
| Conexión directa (sin pooler) | Sí (`direct.<id>.flympg.net`; el plan Developer no tiene PgBouncer) | — | — |
| Roles adicionales | Sí (`Schema Admin`, `Writer`, `Reader`) | — | — |

Render descarta por región (la región de un servicio existente no se puede cambiar); Railway por región y por no ofrecer extensiones. **Fly.io es el único candidato de `DD-04` que cumple la condición de región.**

**Alternativas consideradas**
- *Neon (`aws-sa-east-1`) + aplicación en Fly `gru`*: región ✓ y `btree_gist` 1.7 en PG17 ✓ (página de Neon actualizada el 2026-11-21), pero no se pudo verificar retención de backups, conexión directa ni creación de roles sin `BYPASSRLS`, y suma un tercer proveedor. **Plan B** si falla el spike de `Q1`.
- *Supabase (`sa-east-1`)*: región ✓, pero no se verificaron PG17 ni `btree_gist`; descartado como primera opción.
- *AWS (RDS + ECS en `sa-east-1`)*: cumple todo pero contradice `DD-04` ("PaaS económico", equipo sin operaciones) y multiplica el trabajo de operación.
- *VPS propia con Docker* (alternativa (b) de `DD-04`): más barata pero traslada backups, parches y seguridad al equipo.

**Costos orientativos (USD/mes, de la página de precios de Fly, no incluyen `gru`)**: Machine más chica `shared-cpu-1x` 256 MB desde 2,19 (precio de `iad`/`ewr`, varía por región); Managed Postgres plan *Developer* 4,00 (256 MB, 5 GB, sin PgBouncer) y *Basic* 38,00 (1 GB). El precio de `gru` y el plan de producción final se confirman en `Q6`.

### D2. Cierre de `PO-03`: protección de datos personales (Ley 25.326)

`PO-03` ya figura como decidida en la KB (región `sa-east-1` con cláusulas contractuales modelo). `C-20` la **cierra operativamente** así:

1. **Transferencia internacional**: la aplicación y la base se alojan en Brasil (`gru`), país que no figura entre los de nivel adecuado de la AAIP (verificado el 2026-11-22 en `argentina.gob.ar/transferencias-internacionales`). La base legal adoptada es el contrato con **cláusulas contractuales modelo** (Disposición DNPDP 60/2016 y Resolución AAIP 198/2023) entre la clínica (responsable) y el proveedor, sujeto a validación legal.
2. **Inventario de transferencias** (requisito de la spec `operacion-y-proteccion-de-datos`): (a) Fly.io — aplicación y base, Brasil, todos los datos; (b) proveedor de email (`Resend` o `Brevo`, `Q3`) — nombre, email y detalle del turno de pacientes, país de tratamiento a verificar; (c) GitHub/CI — **ningún dato personal** (solo sintéticos, regla 2).
3. **Minimización y trazabilidad**: se mantienen las reglas ya implementadas (logs solo con IDs, `log-redaction`, auditoría de lecturas y exportaciones, RLS forzada). C-20 no agrega almacenamiento de datos nuevos.
4. **Cifrado**: HTTPS en el borde del PaaS y SSL en la conexión a la base; las copias residen en la misma región del proveedor.
5. **Puerta antes de datos reales** (checklist, no código): cláusulas firmadas con el PaaS y el proveedor de email, validación legal de `PO-03` y `PO-10`, análisis de `PO-14` (registro de la base ante la AAIP). Mientras no esté completo, solo `pruebas` con datos sintéticos.

Lo que **no** se puede resolver desde el repositorio —y queda en cabeza del equipo con asesoría legal— es si los términos estándar del proveedor satisfacen las cláusulas modelo argentinas (`Q3`).

### D3. Una imagen, tres modos de arranque

`Dockerfile` multi-etapa: etapa de build (`npm ci`, `npm run build`) y etapa final con `npm ci --omit=dev`, `dist/` y `migrations/`, usuario sin privilegios. Comandos sobre la misma imagen:

| Modo | Comando |
|---|---|
| API | `node dist/main.js` |
| Worker | `node dist/infrastructure/queue/worker-cli.js` |
| Migraciones | `node dist/infrastructure/db/migrate-cli.js` |

Razón: un solo artefacto probado reduce el riesgo de que API y worker difieran, y no exige `tsx` en producción. **Alternativa**: ejecutar el worker embebido en la API (`schedule:false`) para ahorrar un proceso; se descarta porque `C-11`/`C-14` ya eligieron proceso independiente (Q6 de `C-14`) y mezclar tareas periódicas con el tráfico HTTP complica los reinicios.

### D4. Migraciones como paso previo del despliegue

El comando de migraciones se ejecuta como paso de liberación (en Fly, `release_command`) con `DATABASE_MIGRATION_URL` **antes** de arrancar la nueva versión; si falla, el despliegue se cancela y la anterior sigue activa. Sin pasos de migración automáticos en el arranque de la API (evita carreras entre instancias). El runner ya impide ejecuciones concurrentes.

**Compatibilidad hacia atrás**: como las migraciones corren antes del reemplazo, cada migración debe ser compatible con la versión anterior de la aplicación durante la ventana de despliegue (migraciones aditivas; las destructivas en dos pasos). Se documenta como convención en el runbook (regla 6: nunca editar una migración ya fusionada).

### D5. Roles `app` y `migra` en la base gestionada

Se replica `01-roles.sql` sobre Managed Postgres: `migra` con permisos de esquema (rol `Schema Admin`) y `app` con el rol más restringido posible (`Writer`), verificando después con consultas sobre `pg_roles`/`pg_class` que `app` no es superusuario, no tiene `BYPASSRLS` y no es propietario de tablas. Fly crea de entrada un único usuario administrador (`fly-user`): se usa solo para el aprovisionamiento y no se carga como secreto de la aplicación.

**Riesgo conocido y primera tarea (spike `Q1`)**: la documentación no confirma que (a) el rol `Schema Admin` pueda ejecutar `CREATE EXTENSION btree_gist` (la doc ofrece `fly mpg databases extensions enable`), ni que (b) los roles con nombre `app` y `migra` puedan crearse con esos atributos, ni que (c) `Writer` reciba los `GRANT` que otorgan las migraciones (`C06_002_privilegios_app.sql`). El spike lo verifica en una base de `pruebas` antes de escribir nada más; **si falla, se activa el Plan B (Neon `aws-sa-east-1` para la base)** sin cambiar el resto del diseño.

### D6. Entornos y secretos

Dos aplicaciones Fly (`turnos-pruebas`, `turnos-produccion`), cada una con su base y secretos; las claves (`JWT_*`, `ADMIN_INTERNAL_KEY`, URLs de base) se generan de forma independiente por entorno. `ALLOW_SEED` permanece `false` en producción y `SEED_ALLOWED_HOSTS` sin hosts remotos (`data-safety-guards`). El token de despliegue de GitHub Actions se limita a la app correspondiente y vive solo como secreto del repositorio.

### D7. Copias de seguridad y retención (`PO-10`)

- Se usan las copias automáticas del Managed Postgres; la ventana de recuperación efectiva del plan elegido es **dato a confirmar** (`Q2`) y se registra en `docs/operacion/`.
- **Prueba de restauración** (tarea obligatoria): restaurar la base de `pruebas` (sintética) en una base nueva y comprobar migraciones registradas, políticas RLS vigentes, `app` sin `BYPASSRLS` y rechazo de `UPDATE/DELETE` sobre `auditoria`, con evidencia sin datos de pacientes.
- **Propuesta de retención a validar legalmente** (valor de referencia: Oclusar publica 90 días): clínica dada de baja → datos activos conservados 90 días (reactivable) y luego eliminados; copias de seguridad según la ventana del plan (objetivo ≤ 30 días); por lo tanto los datos desaparecen por completo ≈ 120 días tras la baja. Si la normativa sobre registros de atención exigiera plazos mayores, prevalece el plazo legal (`Q5`).

### D8. Monitoreo y alertas mínimas

- **API**: monitoreo externo de `GET /salud` (chequeos HTTP del PaaS más un monitor externo gratuito) con alerta por email a una persona de guardia.
- **Worker**: reinicio automático ante caída y alerta por eventos del PaaS. Un chequeo funcional del worker (por ejemplo, retraso de cola) requeriría código nuevo, fuera del alcance (`Q8`).
- **Logs**: estructurados (`pino`) y sin datos de pacientes (`log-redaction`); las alertas incluyen solo IDs y códigos.

### D9. Despliegue desde GitHub Actions

Workflow nuevo `deploy.yml` (manual `workflow_dispatch` y por etiqueta `v*`), que exige que el commit haya pasado `CI` y despliega con `flyctl`. `ci.yml` no se modifica. `pruebas` se despliega desde `main` por acción manual; `produccion`, solo por etiqueta tras la aprobación del Líder.

## Risks / Trade-offs

- **Managed Postgres de Fly no habilita lo que necesita el esquema** (`btree_gist`, roles `app`/`migra`) → spike `Q1` como primera tarea; Plan B Neon; no se despliega nada en producción hasta pasarlo.
- **Retención de backups desconocida** (`Q2`) → se verifica en el panel y por escrito antes del primer cliente; si es insuficiente, se sube de plan o se agrega un volcado cifrado periódico.
- **Validez legal de los términos del proveedor** (`Q3`) → fuera del control técnico; puerta explícita del checklist: sin cláusulas firmadas no se cargan datos reales.
- **`/salud` no consulta la base**: el PaaS puede considerar sana una API sin base → aceptado en esta versión; mejorar con un chequeo de disponibilidad es un change aparte (`Q4`).
- **Dependencia del proveedor y tarifas** (`DD-04`) → la imagen es portable (Docker estándar) y las variables son las mismas; el plan B existe.
- **Latencia con la clínica**: `gru` está en Brasil, no en Argentina → aceptable para un MVP de agenda; se mide en `pruebas`.
- **Cambios de documentación del proveedor** → la evidencia de D1 es del 2026-11-25; se revalida al ejecutar el spike.
- **Costo desconocido de `gru`** (`Q6`) → se estima con el calculador de Fly al aprovisionar y se informa al Líder antes de pasar a producción.

## Migration Plan

1. Aprobar esta propuesta (Líder) y fusionar `C-17`, `C-18` y `C-19` antes de aplicar.
2. Spike `Q1` en `pruebas`: crear el cluster, habilitar `btree_gist`, crear `migra` y `app`, ejecutar todas las migraciones y las pruebas de aislamiento contra esa base.
3. Construir la imagen y desplegar `pruebas` con datos sintéticos; ejecutar la prueba de restauración.
4. Completar el checklist legal (D2) y la política de retención (D7).
5. Aprovisionar `produccion` con el mismo procedimiento; dar de alta la primera clínica con el runbook.
6. **Reversión**: la versión anterior sigue activa si falla la migración; para volver atrás tras un despliegue exitoso se redepliega la imagen anterior (migraciones aditivas, D4); la restauración de datos sigue el runbook.

## Open Questions

- **Q1 (gate, resolver al inicio de apply)**: ¿el Managed Postgres de Fly permite `CREATE EXTENSION btree_gist` y los roles `app`/`migra` con los atributos de `01-roles.sql`? Si no, activar el Plan B (Neon `aws-sa-east-1`).
- **Q2**: ¿qué ventana de recuperación y retención de backups tiene el plan de producción de Managed Postgres? (No figura en la documentación leída.)
- **Q3**: ¿los términos de Fly.io y del proveedor de email (`Resend` o `Brevo`, también por elegir) cubren las cláusulas contractuales modelo? Responsable: el Líder con asesoría legal.
- **Q4**: ¿se agrega un chequeo de disponibilidad que consulte la base (`/salud/listo`) en un change aparte? Se propone **no** en `C-20`: la spec `http-service` exige que `/salud` no exponga datos de la base.
- **Q5**: valores definitivos de retención (`PO-10`) validados con asesoría legal; el borrador de D7 no es vinculante.
- **Q6**: precio de `gru` y plan final de producción (¿Basic o superior?); confirmar con el calculador de Fly.
- **Q7**: el worker usa `pg-boss` con conexión directa a la base, no por pooler (PgBouncer en modo transacción rompe `LISTEN` y bloqueos asesores); se confirma en el spike que la URL del rol `app` es la directa.
- **Q8**: ¿monitoreo funcional del worker (heartbeat o métrica de cola)? Requiere código y queda para un change posterior.
