# Proposal

## Why

El change C-11 `cola-y-email-base` provee la infraestructura durable de cola de trabajos sobre PostgreSQL (`pg-boss`, `DD-09`, sin Redis), la persistencia aislada por clínica de notificaciones y el envío desacoplado de emails (`RN-NO-03`) necesarios para que la aplicación emita correos electrónicos sin bloquear transacciones de turnos ni exponer datos personales en payloads o logs (Ley 25.326). Con sus dependencias (`C-03` y `C-04`) ya fusionadas y archivadas en `main`, completarlo ahora en paralelo dentro de la FASE 4 desbloquea directamente `C-14` (`recordatorios-y-notificaciones-turno`) y `C-15` (`reserva-publica-otp-y-tokens`); por su gobernanza **ALTO** (`CHANGES.md`), requiere aprobación explícita del Líder antes de pasar a `/opsx:apply`.

## What Changes

- **Esquema SQL de notificaciones y cola (`migrations/C11_001_notificacion.sql` y `migrations/C11_002_pgboss_esquema.sql`)**:
  - `C11_001_notificacion.sql` crea la tabla `notificacion` con `id` (`uuid`), `clinica_id` (`uuid REFERENCES clinica(id)`), `turno_id` (`uuid` nullable sin clave foránea a `turno` en esta etapa porque `C-09` aún no está fusionado; Convención 4 de `CHANGES.md`), `canal` (`email`), `tipo` (`creacion` | `confirmacion` | `recordatorio` | `cancelacion` | `reprogramacion` | `codigo`), `estado` (`pendiente` | `enviada` | `fallida`), `clave_idempotencia` única por `(clinica_id, clave_idempotencia)`, `intentos`, `programada_para` (`timestamptz` UTC), `enviada_en` (`timestamptz`), `error` (solo código o resumen saneado sin datos personales), `creada_en` y `actualizada_en`, índices operativos, privilegios mínimos `SELECT, INSERT, UPDATE` para el rol `app` (sin `DELETE`) y aislamiento multi-tenant mediante `SELECT aplicar_rls('notificacion')` (`C-03`).
  - `C11_002_pgboss_esquema.sql` instala de manera idempotente el esquema interno `pgboss` (versión 47 de `pg-boss@12.39.0`) bajo propiedad del rol `migra` y otorga privilegios DML/USAGE/EXECUTE mínimos al rol `app` para que el runtime opere sin privilegios DDL y sin RLS sobre la infraestructura interna de la cola (cuyos payloads nunca contienen datos personales).
- **Puerto hexagonal `EmailSender` y adaptadores (`src/application/notificaciones/puertos.ts`, `src/infrastructure/email/**`)**: define el puerto puro `EmailSender.enviar(mensaje)` y el error tipado `ErrorDeEnvioEmail` con bandera `reintentable` y sin PII ni secretos; implementa `crearEmailSenderSmtp` sobre `nodemailer` (neutral entre Resend y Brevo según `C-01 D12`, con preset SMTP de Resend alimentado por `EMAIL_API_KEY` y `EMAIL_FROM` ya definidos en `src/config/variables.ts`) y `crearEmailSenderFalso` determinista para pruebas unitarias y de integración.
- **Servicio de notificaciones y contratos de aplicación (`src/application/notificaciones/**`)**: mantiene la capa de aplicación libre de `pg`, `pg-boss`, `nodemailer`, HTTP y `process.env` (`eslint.config.mjs`); expone `NotificacionService.encolar(...)` con idempotencia por `(clinicaId, claveIdempotencia)` y aislamiento de fallos (`RN-NO-03`: nunca invoca a `EmailSender` ni propaga fallos de cola/email al flujo llamador), y `procesarTrabajo(...)` para consumir notificaciones vía `withTenant`, cortocircuitar entregas ya completadas (`enviada`), resolver el contenido al vuelo mediante el puerto `ResolvedorContenidoEmail` (cero PII en cola ni en la tabla `notificacion`), enviar el email fuera de la transacción de base de datos y registrar la transición a `enviada` o `fallida`.
- **Integración con `pg-boss` v12 y worker dual (`src/infrastructure/queue/**`)**: configura `PgBoss` bajo el rol `app` con `schema: 'pgboss'` y DDL automático deshabilitado (`migrate: false`, `createSchema: false`, `reindex: false`, `persistQueueStats: false`), cola `notificaciones.email` sin particionado (`partition: false`) con espera creciente (`retryBackoff: true`, `retryDelay`, `retryDelayMax`, `retryLimit`), validación estricta de payloads solo-IDs (`{ clinicaId, notificacionId }`), repositorio PostgreSQL de `notificacion` en `withTenant` pasando `clinicaId` como `$1`, y ejecución del worker tanto en modo embebido (`iniciar`/`detener`) como standalone (`worker-cli.ts`) con cierre ordenado.
- **Pruebas unitarias y de integración sobre PostgreSQL real (`test/unit/notificaciones/**`, `test/integration/notificaciones/**`)**: cubren validaciones, idempotencia de encolado y de entrega, reintentos con espera creciente, terminación inmediata ante fallos permanentes, aislamiento de fallos para el llamador (`RN-NO-03`), ausencia total de datos personales en `pgboss.job.data`, `pgboss.job.output` y `notificacion.error`, y aislamiento multi-tenant entre `CLINICA_A` y `CLINICA_B`.

## Capabilities

### New Capabilities
- `esquema-notificacion-y-cola`: tabla `notificacion` multi-tenant con `aplicar_rls`, unicidad de clave de idempotencia por clínica y privilegios mínimos para `app`, más instalación idempotente del esquema `pgboss` bajo el rol `migra`.
- `puerto-y-adaptadores-email`: puerto hexagonal `EmailSender` con errores tipados reintentables/definitivos sin PII, adaptador SMTP neutral sobre `nodemailer` (compatible con Resend/Brevo) y adaptador falso determinista para pruebas.
- `cola-y-servicio-notificaciones`: payloads estrictos solo-IDs, `NotificacionService.encolar` idempotente y aislado frente a fallos (`RN-NO-03`), resolución diferida del contenido, worker `pg-boss` con espera creciente en modo embebido/standalone e idempotencia de entrega.

### Modified Capabilities
<!-- Ninguna: no se modifican capabilities existentes en openspec/specs/. -->

## Impact

- **Código y migraciones (zona exclusiva de C-11)**: `migrations/C11_001_notificacion.sql`, `migrations/C11_002_pgboss_esquema.sql`, `src/application/notificaciones/**`, `src/infrastructure/email/**`, `src/infrastructure/queue/**`, `test/unit/notificaciones/**` y `test/integration/notificaciones/**`.
- **Contratos congelados y archivos compartidos intactos**: sin modificaciones en `RequestContext` (`src/application/shared/request-context.ts`), `src/domain/**`, `src/config/**`, `.env.example`, `src/main.ts`, `package.json`, `package-lock.json` ni `test/support/**`.
- **Desbloqueos en el roadmap**: habilita la implementación de `C-14` (`recordatorios-y-notificaciones-turno`) y `C-15` (`reserva-publica-otp-y-tokens`).
- **Fuera de alcance**:
  - Creación de la clave foránea `notificacion.turno_id -> turno(id)` (se difiere a `C-14` cuando `C-09` ya esté fusionado, conforme a la Convención 4 de `CHANGES.md`).
  - Suscriptores de `TurnoEventPublisher`, plantillas concretas de turnos y job periódico de recordatorios 24 horas antes (`C-14`).
  - Códigos OTP de verificación, endpoints públicos y cableado de `NotificacionService` en `src/main.ts` (`C-14`, `C-15`).
  - Auditoría de notificaciones o exportaciones (`C-16`) y aprovisionamiento de cuentas reales Resend/Brevo en el PaaS (`C-20`).
