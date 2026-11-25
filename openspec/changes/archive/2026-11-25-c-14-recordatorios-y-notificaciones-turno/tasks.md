# Tasks

> **Gobernanza ALTO (`CHANGES.md`)**: este change requiere aprobación explícita de la Líder sobre las preguntas `Q1`–`Q6` de [design.md](design.md) antes de iniciar `/opsx:apply`.
> **Strict TDD**: cada bloque de código sigue el ciclo **RED → GREEN → TRIANGULATE → REFACTOR** (primero la prueba que falla contra el comportamiento de la spec, luego el código mínimo para pasar, triangulación con casos borde y refactor manteniendo verde).

## 1. Aprobación de diseño (Gobernanza ALTO)

- [x] 1.1 Confirmar las resoluciones de `Q1`–`Q6` con la Líder y registrarlas en `design.md` (sección de resoluciones) antes de modificar código o migraciones; verificar que la fecha y decisión de cada pregunta queden documentadas.

## 2. Migración `C14_001` y ajuste de fixtures de `C-11`

- [x] 2.1 **(Safety Net)** Ejecutar `npm run test:integration -- test/integration/notificaciones` antes de tocar migraciones para capturar el baseline de `C-11` en verde.
- [x] 2.2 **(RED → GREEN)** Escribir en `test/integration/notificaciones/esquema-y-aislamiento.test.ts` las pruebas de integración que exijan rechazo (`23503`) al insertar en `notificacion` un `turno_id` inexistente o perteneciente a otra clínica y aceptación de `tipo = 'codigo'` con `turno_id IS NULL`; luego crear `migrations/C14_001_notificacion_turno_fk.sql` agregando `turno_clinica_id_id_key` (`UNIQUE (clinica_id, id)`) en `turno` y `notificacion_turno_fk` (`FOREIGN KEY (clinica_id, turno_id) REFERENCES turno (clinica_id, id)`) en `notificacion`, y verificar que la suite pase tras `npm run db:migrate`.
- [x] 2.3 Adaptar los 3 fixtures en `test/integration/notificaciones/cola-y-worker.test.ts` (línea 137) y `test/integration/notificaciones/repositorio-pg.test.ts` (líneas 41 y 57) para crear un turno real en el mismo tenant antes de insertar la notificación con `turnoId`, verificando `npm run test:integration -- test/integration/notificaciones` en verde.

## 3. Puertos y cálculo puro de ventana de recordatorio (`src/application/notificaciones/turnos/`)

- [x] 3.1 Definir los puertos e interfaces de aplicación en `src/application/notificaciones/turnos/puertos.ts` (`LectorDatosNotificacionTurno`, `ProveedorEnlacesTurno`, `CatalogoClinicasActivas`, `BuscadorTurnosRecordatorio`, `DatosNotificacionTurno`, `ClinicaActivaRecordatorio`, `VentanaRecordatorio`) sin importar infraestructura (`pg`, `pg-boss`, `process.env`); verificar con `npm run lint` y `npm run typecheck`.
- [x] 3.2 **(Strict TDD + `fast-check`)** Escribir en `test/unit/notificaciones/ventana-recordatorio.test.ts` los tests unitarios y propiedades `fast-check` (zona `America/Argentina/Buenos_Aires`, otra zona con DST en días de 23h/25h y hora local inexistente, `anticipacionHoras` parametrizable, exclusión de `<= ahora`, rechazo de zona inválida o desplazamiento fijo); luego implementar `calcularVentanaRecordatorio` en `src/application/notificaciones/turnos/ventana-recordatorio.ts` reutilizando `C-02` (`instanteALocal`, `sumarDias`, `localAInstante`) y verificar `npm run test:unit` en verde.

## 4. Suscriptor de `TurnoEventPublisher` (`src/application/notificaciones/turnos/`)

- [x] 4.1 **(Strict TDD)** Escribir en `test/unit/notificaciones/suscriptor-turnos.test.ts` las pruebas que verifiquen el mapeo de los 4 eventos (`creado`, `confirmado`, `cancelado`, `reprogramado`), claves deterministas `turno:<turnoId>:<tipo>`, idempotencia ante publicación duplicada, comportamiento *fail-open* cuando `encolar` retorna `no_encolada` o lanza (`RN-NO-03`), y ausencia de PII en los logs; luego implementar `crearPublicadorEventosTurno` en `src/application/notificaciones/turnos/suscriptor-turnos.ts` respetando el contrato congelado `TurnoEventPublisher`, verificar `npm run test:unit` en verde.

## 5. `ResolvedorContenidoTurno` (`src/application/notificaciones/turnos/`)

- [x] 5.1 **(Strict TDD)** Escribir en `test/unit/notificaciones/resolvedor-turno.test.ts` las pruebas unitarias para: resolución de las 5 plantillas de `C-04` (`creacion`, `confirmacion`, `cancelacion`, `reprogramacion` con `inicioAnterior`, `recordatorio`) en la zona IANA de la clínica, adjunto de enlaces vía `ProveedorEnlacesTurno` opcional, y todos los descartes defensivos (`TURNO_NO_ENCONTRADO`, `PACIENTE_SIN_EMAIL`, `TURNO_YA_NO_ACTIVO`, `TURNO_NO_ELEGIBLE_RECORDATORIO`, `TURNO_ORIGEN_REPROGRAMACION_NO_ENCONTRADO`, `TIPO_NO_SOPORTADO_EN_TURNO`); luego implementar `crearResolvedorContenidoTurno` en `src/application/notificaciones/turnos/resolvedor-turno.ts` y verificar `npm run test:unit` en verde.

## 6. Planificador multi-tenant de recordatorios (`src/application/notificaciones/turnos/`)

- [x] 6.1 **(Strict TDD)** Escribir en `test/unit/notificaciones/planificador-recordatorios.test.ts` las pruebas que verifiquen iteración de clínicas activas con zonas IANA distintas, consulta aislada por `clinicaId`, encolado idempotente con `claveIdempotencia = "turno:<turnoId>:recordatorio"`, ausencia de duplicados ante re-ejecuciones, y aislamiento cuando falla una clínica sin frenar a las demás ni loguear PII; luego implementar `crearPlanificadorRecordatorios` en `src/application/notificaciones/turnos/planificador-recordatorios.ts` y su barril `src/application/notificaciones/turnos/index.ts`, verificando `npm run test:unit` y `npm run lint`.

## 7. Adaptadores PostgreSQL y job periódico `pg-boss` (`src/infrastructure/queue/jobs/`)

- [x] 7.1 Implementar `crearLectorDatosTurnoPg` en `src/infrastructure/queue/jobs/lector-turno-notificacion-pg.ts` (consultando `turno`, `LEFT JOIN turno` para `reprogramado_de`, `paciente`, `profesional`, `prestacion` y `clinica` dentro de `withTenant(clinicaId)`) y `crearRepositorioRecordatoriosPg` en `src/infrastructure/queue/jobs/repositorio-recordatorios-pg.ts` (`clinica WHERE activa = TRUE` + consulta de elegibles dentro de `withTenant(clinicaId)` con `NOT EXISTS` sobre `notificacion` tipo `'recordatorio'`); verificar compilación con `npm run typecheck`.
- [x] 7.2 Extender `OpcionesPgBossApp` en `src/infrastructure/queue/cola-pg-boss.ts` con `schedule?: boolean` (default `false`), exportar `NOMBRE_COLA_RECORDATORIOS = 'notificaciones.recordatorios'` y `asegurarColaRecordatorios(boss)` con `partition: false`, e implementar `crearJobRecordatorios` (`iniciar`, `detener`, `ejecutarAhora`, cron default `'*/15 * * * *'`) en `src/infrastructure/queue/jobs/job-recordatorios.ts` y su barril `src/infrastructure/queue/jobs/index.ts`.
- [x] 7.3 Cablear `crearResolvedorContenidoTurno` + `crearJobRecordatorios` en `src/infrastructure/queue/worker-cli.ts` (habilitando `schedule: true` en `crearPgBossApp` y cierre ordenado en `SIGINT`/`SIGTERM`) y reexportar las nuevas fábricas desde `src/infrastructure/queue/index.ts`; verificar `npm run typecheck` y `npm run lint`.

## 8. Cableado de `TurnoEventPublisher` en casos de uso de turnos (sujeto a `Q2`)

- [x] 8.1 Según la resolución aprobada en `Q2`, agregar parámetro opcional retrocompatible `publicador: TurnoEventPublisher = turnoEventPublisherNulo()` en `agendarTurno`, `confirmarTurno`, `cancelarTurno` y `reprogramarTurno` (publicando `{ tipo: 'reprogramado', turnoId: insertado.id }` conforme a `Q4`, y manteniendo `turnoEventPublisherNulo()` por defecto para no romper tests existentes); verificar que `npm run test:unit` y `npm run test:api` sigan en verde sin regresiones.

## 9. Pruebas de integración reales contra PostgreSQL y `pg-boss`

- [x] 9.1 **(Strict TDD — Integración)** Escribir y verificar en `test/integration/notificaciones/eventos-turno-e2e.test.ts` el ciclo completo con PostgreSQL real, `pg-boss` bajo rol `app` y `crearEmailSenderFalso`: publicación de `creado`, `confirmado`, `cancelado` y `reprogramado` (con `inicioAnterior` formateado en `clinica.zona_horaria`), descarte defensivo si un turno se cancela antes de enviarse su email pendiente, aislamiento ante fallo de cola/proveedor (`RN-NO-03`) y verificación de cero PII en `pgboss.job.data`, `pgboss.job.output` y `notificacion.error`.
- [x] 9.2 **(Strict TDD — Integración)** Escribir y verificar en `test/integration/notificaciones/recordatorios-job.test.ts` el job periódico real bajo rol `app` (`schedule: true`, `partition: false`, sin `42501`): encolado único ante ejecuciones repetidas, exclusión de turnos `cancelado`/`reprogramado`/`atendido`/`ausente`, exclusión de clínicas inactivas, cálculo correcto en zona horaria IANA no-UTC, aislamiento multi-tenant entre Clínica A y Clínica B, arranque/detención idempotentes y verificación de cero PII en base de cola.

## 10. Puertas de calidad finales

- [x] 10.1 Ejecutar `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test` (unit + integration + api) y `openspec validate --all --strict`, confirmando 100% de aprobaciones sin advertencias ni regresiones.

## Workflow follow-up

- Esperar la revisión y aprobación de `Q1`–`Q6` por la Líder antes de ejecutar `/opsx:apply` sobre `c-14-recordatorios-y-notificaciones-turno`.
- Archivar el change con `/opsx:archive` una vez completadas y verificadas todas las tareas de implementación.
