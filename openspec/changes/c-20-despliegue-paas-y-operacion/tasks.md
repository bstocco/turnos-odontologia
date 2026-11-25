# Tasks

> Aplicar este change solo después de la aprobación del Líder y con `C-17`, `C-18` y `C-19` fusionados. Gobernanza ALTO: cada grupo se revisa antes de pasar al siguiente. Sin datos reales en ningún paso.
>
> **Alcance ajustado (decisión de la Líder, 2026-11-25):** C-20 no despliega en Fly.io ni abre cuenta de Resend, y `produccion` solo se documenta. Las tareas y escenarios que requieren un entorno desplegado pasaron a la sección 7 (trabajo posterior) y a `design.md` ("Trabajo posterior").

## 1. Spike del PostgreSQL gestionado (gate de `Q1`, `Q2`, `Q7`)

- [x] 1.1 Crear en Fly.io un cluster de Managed Postgres 17 en `gru` para `pruebas` y registrar el plan, su precio y la ventana de backups mostrados en el panel (`Q2`, `Q6`). Verificar: captura o transcripción en `docs/operacion/evidencia/spike-postgres.md`, sin credenciales.

> **Actualización 2026-11-25**: el spike en Fly falló en `GRANT ... TO app` (ver `docs/operacion/evidencia/spike-postgres.md`) y la Líder activó el Plan B: la base pasa a **Neon `aws-sa-east-1`** (D1/D5). Las tareas 1.2 a 1.4 se rehacen sobre Neon; 1.1 queda como evidencia del intento en Fly.

- [x] 1.2 En Neon (`aws-sa-east-1`, PostgreSQL 17), habilitar `btree_gist` (la crea `C03_001` con `migra`) y crear con SQL —no desde la consola, que da `BYPASSRLS`— los roles `migra` y `app` equivalentes a `docker/postgres/init/01-roles.sql`, más las bases `turnos` y `turnos_test` (con colación ICU `es-AR`). Verificar: `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('migra','app')` devuelve `false` en ambas columnas para los dos roles y `app` no es propietario de ninguna tabla.
- [x] 1.3 Ejecutar todas las migraciones con `DATABASE_MIGRATION_URL` sobre `turnos` y las pruebas de integración y de aislamiento (`test:integration`) apuntando a `turnos_test` (la guarda exige un nombre terminado en `_test` y esas pruebas reinician el esquema `public`). Verificar: las pruebas pasan, incluida la de exclusión por solapamiento y la de `auditoria` append-only. _Evidencia: 516 pruebas de integración pasan en Neon con colación `es-AR` (informado por la Líder, 2026-11-25; ver `spike-postgres.md`)._
- [x] 1.4 Confirmar que la URL del rol `app` es una conexión directa (sin PgBouncer en modo transacción) para `pg-boss` (`Q7`). Verificar: el worker procesa un job de prueba contra esa base. _Evidencia: el worker corrió contra el host directo de Neon, no el `-pooler` (informado por la Líder, 2026-11-25), y las pruebas de `pg-boss` de `test/integration/notificaciones/` pasan contra esa base._
- [x] 1.5 Decidir con el Líder según el resultado: continuar con Fly.io o activar el Plan B (Neon `aws-sa-east-1`). Verificar: decisión registrada en `design.md` (D1/D5) antes de seguir.

## 2. Imagen de contenedor

> **Decisión de la Líder (2026-11-25)**: sin Docker local, la verificación de 2.1, 2.2 y 2.4 corre como el job `verificar-imagen` de `.github/workflows/deploy.yml` (sin workflow extra y sin tocar `ci.yml`).

- [x] 2.1 Crear `Dockerfile` multi-etapa (build con `npm ci` + `npm run build`; final con `npm ci --omit=dev`, `dist/` y `migrations/`, usuario sin privilegios) y `.dockerignore` (excluye `.env`, `node_modules`, `.git`, `openspec/`, `docs/`, `test/`). Verificar: `docker build` termina sin variables de entorno de producción y la imagen no contiene `.env`. _Evidencia: job `verificar-imagen` en verde en el PR #26._
- [x] 2.2 Probar los tres modos sobre la misma imagen contra un PostgreSQL efímero: migraciones, API (`GET /salud` → `200`) y worker (arranca y se cierra ordenadamente con `SIGTERM`). Verificar: los tres comandos de `design.md` D3 funcionan y una variable obligatoria ausente produce un error con nombre sin valores. _Evidencia: job `verificar-imagen` en verde en el PR #26._
- [x] 2.3 Documentar la construcción local y los modos de arranque en `docs/operacion/imagen.md`. Verificar: el procedimiento documentado coincide con los pasos que ejecuta el job `verificar-imagen`.
- [ ] 2.4 Agregar al job `verificar-imagen` un chequeo de que el proceso de la imagen corre con un usuario distinto de `root`. Verificar: el job pasa en GitHub Actions.

## 3. Configuración del PaaS

- [x] 3.1 Crear `fly.toml` de `pruebas` y de `produccion` con: proceso API (puerto interno, chequeo `GET /salud`), proceso worker (sin servicio HTTP) y `release_command` de migraciones. Verificar: `fly config validate` pasa en ambos archivos.
- [x] 3.4 Crear `.github/workflows/deploy.yml` (manual, por etiqueta `v*` y en los PR que tocan la imagen) con el job `verificar-imagen`. No modificar `ci.yml`. Verificar: el job pasa en el PR #26. _El job de despliegue con `flyctl` queda como trabajo posterior (sección 7)._

## 4. Copias de seguridad y retención

- [x] 4.1 Documentar en `docs/operacion/respaldo.md` el tipo de copias y la ventana de recuperación de cada plan de base evaluado (Fly Managed Postgres Developer y Neon Free), con fuente y fecha (`Q2`). Verificar: el documento cita la fuente y la fecha, y declara que sin recuperación a un punto en el tiempo no se opera con datos reales.
- [x] 4.3 Redactar la política de retención (`PO-10`, borrador de `design.md` D7) en `docs/operacion/retencion.md`, marcada como pendiente de validación legal. Verificar: el documento declara plazos en base activa y en copias, y el estado de validación.

## 5. Operación

- [x] 5.3 Mantener el runbook en `docs/operacion/runbook.md` con rotación de `JWT_*`, `ADMIN_INTERNAL_KEY` y `EMAIL_API_KEY` (impacto sobre sesiones), despliegue con reversión, restauración y el procedimiento del primer despliegue de `pruebas`; el alta de la primera clínica y el retiro de una clínica quedan marcados como bloqueados o pendientes de definir. Verificar: el documento contiene esos procedimientos y marca lo que está sin verificar.

## 6. Protección de datos y cierre documental

- [x] 6.1 Crear `docs/operacion/proteccion-datos.md` con el inventario de transferencias (Fly.io, Neon, Resend, GitHub sin datos personales), la base legal (D2) y el checklist previo a datos reales con responsable, fecha y estado (`Q3`, `Q5`, `PO-14`). Verificar: cada ítem del checklist de la spec `operacion-y-proteccion-de-datos` figura con estado.
- [ ] 6.2 Tras la aprobación, actualizar `knowledge-base/09_decisiones_y_supuestos.md` (`DD-04`: Fly.io para la aplicación, Neon para la base, Resend para el email, y la evidencia) y `knowledge-base/10_preguntas_abiertas.md` (`PO-03`, `PO-10`, `R-05`) y el `CHANGES.md` de C-20 (nota de decisión; el `[x]` lo marca quien fusiona). Verificar: los textos coinciden con `design.md` y no contradicen las reglas duras.
- [x] 6.3 **Alcance reducido (decisión de la Líder, 2026-11-25, `design.md` D11): solo documentar `produccion`**, sin crear la app, secretos ni Machines en Fly ni el proyecto de producción en Neon. Se cumple dejando `fly.produccion.toml`, el runbook y el procedimiento de aprovisionamiento (incluida la base con colación ICU `es-AR`, ver `docs/operacion/evidencia/spike-postgres.md`) listos y revisados, y registrando el motivo: siguen abiertos F1, F2, F6, F8 y F9 (change correctivo aparte) y el checklist legal (`PO-03`, `PO-10`, `PO-14`). Sin datos reales. Verificar: `fly.produccion.toml` valida con `fly config validate`, el runbook describe el aprovisionamiento de `produccion` y el motivo del aplazamiento figura en `design.md` (D11).
- [x] 6.4 Revisar que no hay valores de secretos en el contenido versionado (escaneo sobre los archivos de la rama). Verificar: el escaneo no encuentra coincidencias, salvo los valores descartables de CI. _Evidencia: escaneo del 2026-11-25 sobre los archivos versionados y nuevos (sin `.env`): solo valores falsos de pruebas y de CI, sin claves reales ni patrones de tokens conocidos._
- [x] 6.5 Ejecutar `openspec validate c-20-despliegue-paas-y-operacion` y `openspec status --change c-20-despliegue-paas-y-operacion --json`. Verificar: validan y proposal, specs, design y tasks figuran `done`. _Resultado 2026-11-25: `Change 'c-20-despliegue-paas-y-operacion' is valid`; proposal, specs, design y tasks en `done`._

## 7. Trabajo posterior (fuera del alcance verificable de C-20)

Estas tareas se sacaron de C-20 por la decisión de la Líder del 2026-11-25 (sin despliegue en Fly.io ni cuenta de Resend; `produccion` solo documentada). Su detalle y dependencias están en `design.md`, "Trabajo posterior". No cuentan como tareas pendientes de este change.

- Crear la app `turnos-pruebas`, cargar secretos (incluida la clave de Resend) y desplegar `pruebas`, verificando `GET /salud`, el worker y el log con `[REDACTADO]` (antes 3.2 y 3.3; procedimiento en `docs/operacion/runbook.md` §2.1).
- Job de despliegue con `flyctl` y token limitado a la app, que exija `CI` verde (parte de despliegue de 3.4).
- Prueba de restauración sobre datos sintéticos con evidencia en `docs/operacion/evidencia/restauracion.md` (antes 4.2). Se puede hacer solo con Neon.
- Monitoreo externo de `GET /salud` y del worker con alertas, y revisión de logs de un ciclo de pruebas en vivo (antes 5.1 y 5.2).
- Que otra persona ejecute el alta de la primera clínica y la rotación siguiendo solo el runbook (verificación de 5.3); el alta depende de corregir F2.
- Procedimiento de retiro de una clínica y plazos de eliminación (`PO-10`).
- Checklist legal completo con fecha y responsable (`PO-03`, `PO-10`, `PO-14` y cláusulas con Fly.io, Neon y Resend).
- Aprovisionar `produccion` de verdad (app, secretos, proyecto de Neon con plan elegido y colación `es-AR`) y comprobar `GET /salud` y copias activas.

## Workflow follow-up

- La alta de la primera clínica real en producción queda bloqueada hasta completar el checklist de `docs/operacion/proteccion-datos.md` y cerrar F1, F2, F6, F8 y F9.
- Archivar el change tras la revisión del Líder y la fusión del PR.
