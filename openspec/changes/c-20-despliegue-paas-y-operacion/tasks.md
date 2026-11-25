# Tasks

> Aplicar este change solo después de la aprobación del Líder y con `C-17`, `C-18` y `C-19` fusionados. Gobernanza ALTO: cada grupo se revisa antes de pasar al siguiente. Sin datos reales en ningún paso.

## 1. Spike del PostgreSQL gestionado (gate de `Q1`, `Q2`, `Q7`)

- [x] 1.1 Crear en Fly.io un cluster de Managed Postgres 17 en `gru` para `pruebas` y registrar el plan, su precio y la ventana de backups mostrados en el panel (`Q2`, `Q6`). Verificar: captura o transcripción en `docs/operacion/evidencia/spike-postgres.md`, sin credenciales.
> **Actualización 2026-11-25**: el spike en Fly falló en `GRANT ... TO app` (ver `docs/operacion/evidencia/spike-postgres.md`) y la Líder activó el Plan B: la base pasa a **Neon `aws-sa-east-1`** (D1/D5). Las tareas 1.2 a 1.4 se rehacen sobre Neon; 1.1 queda como evidencia del intento en Fly.

- [x] 1.2 En Neon (`aws-sa-east-1`, PostgreSQL 17), habilitar `btree_gist` (la crea `C03_001` con `migra`) y crear con SQL —no desde la consola, que da `BYPASSRLS`— los roles `migra` y `app` equivalentes a `docker/postgres/init/01-roles.sql`, más las bases `turnos` y `turnos_test`. Verificar: `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('migra','app')` devuelve `false` en ambas columnas para los dos roles y `app` no es propietario de ninguna tabla.
- [ ] 1.3 Ejecutar todas las migraciones con `DATABASE_MIGRATION_URL` sobre `turnos` y las pruebas de integración y de aislamiento (`test:integration`) apuntando a `turnos_test` (la guarda exige un nombre terminado en `_test` y esas pruebas reinician el esquema `public`). Verificar: las pruebas pasan, incluida la de exclusión por solapamiento y la de `auditoria` append-only.
- [ ] 1.4 Confirmar que la URL del rol `app` es una conexión directa (sin PgBouncer en modo transacción) para `pg-boss` (`Q7`). Verificar: el worker procesa un job de prueba contra esa base.
- [x] 1.5 Decidir con el Líder según el resultado: continuar con Fly.io o activar el Plan B (Neon `aws-sa-east-1`). Verificar: decisión registrada en `design.md` (D1/D5) antes de seguir.

## 2. Imagen de contenedor

> **Decisión de la Líder (2026-11-25)**: sin Docker local, la verificación de 2.1 y 2.2 corre como el job `verificar-imagen` de `.github/workflows/deploy.yml` (sin workflow extra y sin tocar `ci.yml`). 2.1 y 2.2 se marcan cuando ese job pase en GitHub Actions; 2.3 sigue exigiendo que otra persona reproduzca el procedimiento.

- [ ] 2.1 Crear `Dockerfile` multi-etapa (build con `npm ci` + `npm run build`; final con `npm ci --omit=dev`, `dist/` y `migrations/`, usuario sin privilegios) y `.dockerignore` (excluye `.env`, `node_modules`, `.git`, `openspec/`, `docs/`, `test/`). Verificar: `docker build` termina sin variables de entorno de producción y la imagen no contiene `.env`.
- [ ] 2.2 Probar los tres modos sobre la misma imagen contra el PostgreSQL de `docker-compose.yml`: migraciones, API (`GET /salud` → `200`) y worker (arranca y se cierra ordenadamente con `SIGTERM`). Verificar: los tres comandos de `design.md` D3 funcionan y una variable obligatoria ausente produce un error con nombre sin valores.
- [ ] 2.3 Documentar la construcción local y los modos de arranque en `docs/operacion/imagen.md`. Verificar: otra persona del equipo reproduce el procedimiento tal como está escrito.

## 3. Entornos y configuración del PaaS

- [x] 3.1 Crear `fly.toml` de `pruebas` y de `produccion` con: proceso API (puerto interno, chequeo `GET /salud`), proceso worker (sin servicio HTTP) y `release_command` de migraciones. Verificar: `fly config validate` pasa en ambos archivos.
- [ ] 3.2 Definir los secretos de cada entorno en el PaaS (`DATABASE_URL`, `DATABASE_MIGRATION_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `EMAIL_API_KEY`, `ADMIN_INTERNAL_KEY`) con valores distintos entre entornos, y `NODE_ENV=production`, `ALLOW_SEED=false`, `PUBLIC_BASE_URL`, `EMAIL_FROM`. Verificar: `fly secrets list` muestra los nombres de cada entorno; ningún valor aparece en el repositorio ni en los logs de despliegue.
- [ ] 3.3 Desplegar `pruebas` y verificar la API y el worker en vivo. Verificar: `GET /salud` público responde `200`; el worker aparece activo; el log de arranque muestra la configuración con `[REDACTADO]` en las variables sensibles.
- [ ] 3.4 Crear `.github/workflows/deploy.yml` (manual y por etiqueta `v*`) que exige `CI` verde sobre el commit y despliega con `flyctl` y un token limitado a la app. No modificar `ci.yml`. Verificar: ejecución manual sobre `pruebas` exitosa y rechazada cuando el commit tiene `CI` en rojo.

## 4. Copias de seguridad y restauración

- [ ] 4.1 Confirmar que las copias automáticas están activas en `pruebas` y en `produccion` y registrar la ventana de recuperación efectiva en `docs/operacion/respaldo.md` (`Q2`). Verificar: el documento cita la fuente (panel o documentación) y la fecha.
- [ ] 4.2 Ejecutar la prueba de restauración: restaurar la base de `pruebas` (sintética) en una base nueva y verificar migraciones registradas, políticas RLS vigentes, `app` sin `BYPASSRLS`, aislamiento entre dos clínicas sintéticas y rechazo de `UPDATE`/`DELETE` sobre `auditoria`. Verificar: evidencia con fecha, conteos y resultados en `docs/operacion/evidencia/restauracion.md`, sin datos de pacientes.
- [ ] 4.3 Redactar la política de retención (`PO-10`, borrador de `design.md` D7) en `docs/operacion/retencion.md`, marcada como pendiente de validación legal. Verificar: el documento declara plazos en base activa y en copias, y el estado de validación.

## 5. Operación y monitoreo

- [ ] 5.1 Configurar el monitoreo externo de `GET /salud` y el reinicio automático del worker, con alertas por email a la persona de guardia. Verificar: detener el worker de `pruebas` genera una alerta y la API vuelve a responder tras reiniciar.
- [ ] 5.2 Revisar que logs y alertas no contienen datos de pacientes tras un ciclo de pruebas (alta, turno, recordatorio). Verificar: búsqueda en los logs de `pruebas` sin coincidencias de DNI, teléfono o email sintéticos.
- [ ] 5.3 Escribir el runbook en `docs/operacion/runbook.md`: alta de la primera clínica con el endpoint interno (`C-17`), rotación de `JWT_*` y `ADMIN_INTERNAL_KEY` (impacto sobre sesiones), despliegue con reversión, restauración y retiro de una clínica. Verificar: una persona que no lo escribió ejecuta el alta y la rotación en `pruebas` siguiendo solo el documento.

## 6. Protección de datos y cierre documental

- [ ] 6.1 Crear `docs/operacion/proteccion-datos.md` con el inventario de transferencias (Fly.io, proveedor de email, GitHub sin datos personales), la base legal (D2) y el checklist previo a datos reales con responsable, fecha y estado (`Q3`, `Q5`, `PO-14`). Verificar: cada ítem del checklist de la spec `operacion-y-proteccion-de-datos` figura con estado.
- [ ] 6.2 Tras la aprobación, actualizar `knowledge-base/09_decisiones_y_supuestos.md` (`DD-04`: proveedor Fly.io y evidencia) y `knowledge-base/10_preguntas_abiertas.md` (`PO-03`, `PO-10`, `R-05`) y el `CHANGES.md` de C-20 (nota de decisión; el `[x]` lo marca quien fusiona). Verificar: los textos coinciden con `design.md` y no contradicen las reglas duras.
- [ ] 6.3 Aprovisionar `produccion` con el mismo procedimiento que `pruebas` (incluida la base creada con colación ICU `es-AR`, ver `docs/operacion/evidencia/spike-postgres.md`), **sin cargar datos reales**. Verificar: `GET /salud` responde `200` y los backups figuran activos.
- [ ] 6.4 Ejecutar `openspec validate c-20-despliegue-paas-y-operacion` y `openspec status --change c-20-despliegue-paas-y-operacion --json`. Verificar: validan y proposal, specs, design y tasks figuran `done`.

## Workflow follow-up

- La alta de la primera clínica real en producción queda bloqueada hasta completar el checklist de `docs/operacion/proteccion-datos.md`.
- Archivar el change tras la revisión del Líder y la fusión del PR.
