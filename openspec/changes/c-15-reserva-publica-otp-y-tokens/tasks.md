# Tasks

> **Gobernanza CRÍTICO (`CHANGES.md`)**: este change requiere aprobación explícita de la Líder sobre las preguntas `Q1`–`Q6` de [design.md](design.md) antes de iniciar `/opsx:apply`.
> **Strict TDD**: cada bloque de código sigue el ciclo **RED → GREEN → TRIANGULATE → REFACTOR** (primero la prueba que falla contra el comportamiento de la spec, luego el código mínimo para pasar, triangulación con casos borde y refactor manteniendo verde).

## 1. Aprobación de diseño (Gobernanza CRÍTICO)

- [ ] 1.1 Confirmar las resoluciones de `Q1`–`Q6` con la Líder y registrar fecha y decisión de cada pregunta en [design.md](design.md) antes de crear migraciones o escribir código en `src/`.

## 2. Migración `C15_001` y verificación de esquema y RLS

- [ ] 2.1 **(Safety Net)** Ejecutar `npm run test:integration -- test/integration/notificaciones` y `npm run test:api -- test/api/publico-disponibilidad` antes de modificar migraciones para capturar el baseline en verde.
- [ ] 2.2 **(RED → GREEN)** Escribir en `test/integration/reserva-publica/esquema-y-aislamiento.test.ts` las pruebas que verifiquen: columnas, `CHECK` de SHA-256 (`23514` ante texto plano o hash inválido) en `codigo_verificacion` y `token_accion`, FK compuesta `token_accion_turno_fk` (`23503` ante turno de otra clínica), unicidad `UNIQUE (hash_token)` (`23505`), aislamiento RLS entre Clínica A y Clínica B, rechazo de `DELETE` para rol `app` (`42501`), y función `resolver_clinica_por_hash_token` (devuelve `clinica_id` solo si activa y `NULL` si inexistente o inactiva); luego crear `migrations/C15_001_reserva_publica_otp_y_tokens.sql`, correr `npm run db:migrate` y verificar el test en verde.

## 3. Contratos, errores y validaciones puras (`src/application/reserva-publica/`)

- [ ] 3.1 Definir puertos hexagonales y errores de dominio sin PII (`CODIGO_VERIFICACION_INVALIDO`, `CODIGO_VERIFICACION_VENCIDO`, `CODIGO_VERIFICACION_AGOTADO`, `CODIGO_VERIFICACION_USADO`, `TOPE_RESERVAS_ACTIVAS_ALCANZADO`, `TOKEN_ACCION_INVALIDO`, `CANCELACION_FUERA_DE_PLAZO`) en `src/application/reserva-publica/{puertos,errores}.ts`, asegurando que `src/application/` no importe infraestructura (`npm run lint` y `npm run typecheck`).
- [ ] 3.2 **(Strict TDD)** Escribir en `test/unit/reserva-publica/validaciones-y-reglas.test.ts` las pruebas unitarias para normalización de entradas (DNI, teléfono `+549...`, email, slug, campos sin PII en errores), cálculo de vencimiento acotado de token (`min(ahora + 48h, turno.inicio)`) y verificación pura de anticipación mínima `RN-RE-02` (incluyendo límite exacto `24h00m00s` y anticipación personalizada en horas); luego implementar `src/application/reserva-publica/validaciones.ts` y verificar `npm run test:unit` en verde.

## 4. Caso de uso `solicitarCodigoVerificacion` (`src/application/reserva-publica/`)

- [ ] 4.1 **(Strict TDD)** Escribir en `test/unit/reserva-publica/solicitar-codigo.test.ts` las pruebas para: normalización de email, invalidación de códigos previos sin consumir, emisión de OTP de 6 dígitos con `emitirCodigoVerificacion` (`C-04`), persistencia solo de `hash_codigo`, trazabilidad en `notificacion` (`tipo = 'codigo'`, `turno_id = NULL`), envío fuera de transacción con `plantillaCodigoVerificacion`, actualización de `notificacion` a `enviada`/`fallida`, y ausencia de código o PII en logs; luego implementar `src/application/reserva-publica/solicitar-codigo.ts` y verificar `npm run test:unit` en verde.

## 5. Caso de uso `reservarTurnoPublico` (`src/application/reserva-publica/`)

- [ ] 5.1 **(Strict TDD)** Escribir en `test/unit/reserva-publica/reservar-turno-publico.test.ts` las pruebas unitarias cubriendo: rechazo de código faltante/incorrecto (con persistencia explícita de `intentos` antes de lanzar `422`), agotado, vencido y usado; preservación de `consumido_en IS NULL` si falla la reserva por `409`; tope `PO-09` (2 reservas permitidas, 3ª rechazada por DNI o por email, liberación al cancelar); alta de paciente nuevo vs reutilización sin sobrescribir ni exponer datos (`Q4`); estado inicial según `clinica_config.reserva_requiere_confirmacion` (`RN-RE-01`); asignación automática del primer sillón libre y reintento sobre el siguiente sillón ante solape de sillón (`RN-RE-03`); auditoría *fail-closed* con `actor_tipo = 'paciente_enlace'`; y evento `{ tipo: 'creado', turnoId }` post-commit; luego implementar `src/application/reserva-publica/reservar-turno.ts` y verificar `npm run test:unit` en verde.

## 6. Proveedor de enlaces (`ProveedorEnlacesTurno`) y caso de uso `ejecutarAccionPublicaTurno`

- [ ] 6.1 **(Strict TDD)** Escribir en `test/unit/reserva-publica/proveedor-enlaces.test.ts` las pruebas unitarias para `ProveedorEnlacesTurno` (`C-14`): emisión de `enlaceConfirmar` + `enlaceCancelar` en `creacion`/`recordatorio` cuando `estadoTurno === 'pendiente_confirmacion'`, solo `enlaceCancelar` en `confirmado`/`reprogramacion`, omisión en `cancelacion` o turnos ya iniciados, persistencia solo de `hash_token` con `vence_en <= turno.inicio` y armado de URL desde `PUBLIC_BASE_URL`; luego implementar `src/application/reserva-publica/proveedor-enlaces.ts` y verificar `npm run test:unit` en verde.
- [ ] 6.2 **(Strict TDD)** Escribir en `test/unit/reserva-publica/ejecutar-accion-turno.test.ts` las pruebas unitarias para `ejecutarAccionPublicaTurno`: token inexistente/usado/vencido/propósito cruzado (`404 TOKEN_ACCION_INVALIDO`), confirmación `pendiente_confirmacion -> confirmado`, rechazo `422 TRANSICION_TURNO_INVALIDA` si ya cancelado/confirmado, cancelación con `>=` anticipación configurada (`200`, marca `usado_en`, audita y emite evento), rechazo `409 CANCELACION_FUERA_DE_PLAZO` con `<` anticipación configurada sin consumir el token ni alterar el turno; luego implementar `src/application/reserva-publica/ejecutar-accion.ts` y su barril `src/application/reserva-publica/index.ts`, verificando `npm run test:unit` y `npm run lint`.

## 7. Adaptadores PostgreSQL (`src/infrastructure/db/repositories/reserva-publica/`)

- [ ] 7.1 Implementar los repositorios SQL explícitos en `src/infrastructure/db/repositories/reserva-publica/` (`resolverClinicaPorHashToken`, repositorio OTP con `FOR UPDATE` e invalidación previa, conteo `PO-09` con `pg_advisory_xact_lock` ordenado determinísticamente, alta/reutilización de paciente con `SAVEPOINT` ante `23505`, inserción de turno multi-sillón con `SAVEPOINT` ante `23P01` y traducción `23P01`/`40P01` según `Q6`, y repositorio `token_accion` con `FOR UPDATE`), además del adaptador `crearProveedorEnlacesTurnoPg`; verificar `npm run typecheck` y `npm run lint`.
- [ ] 7.2 Según la resolución aprobada en `Q6`, cablear `crearProveedorEnlacesTurnoPg` en `src/infrastructure/queue/worker-cli.ts` cuando `config.publicBaseUrl` esté configurada, verificando `npm run typecheck` y las pruebas existentes de `test/integration/notificaciones`.

## 8. Módulo HTTP `src/interfaces/http/modules/publico-reservas/`

- [ ] 8.1 **(Strict TDD)** Escribir en `test/unit/reserva-publica/limite-tasa-email.test.ts` las pruebas del limitador por email normalizado (ventana configurable, memoria LRU acotada ante múltiples emails distintos, independencia entre emails) e implementar `src/interfaces/http/modules/publico-reservas/limite-email.ts`; verificar `npm run test:unit` en verde.
- [ ] 8.2 Implementar los esquemas TypeBox (cuidando nombres de campos cubiertos por `redactor.ts` y sin exponer `sillonId` ni PII en respuestas), composición de dependencias (`withTenant` para lecturas/escrituras), manejo de `Cache-Control: no-store`, rate limit dual (IP en `onRequest` + email en `/codigo` y `/reservas`) y handlers delgados para `POST /publico/:slug/codigo`, `POST /publico/:slug/reservas` y `POST /publico/turnos/accion` con publicación post-commit *fail-open*; verificar `npm run typecheck` y `npm run lint`.

## 9. Pruebas de integración real y API HTTP (`Flujo 3` y `Flujo 4`)

- [ ] 9.1 **(Strict TDD — Integración PG real)** Escribir y verificar en `test/integration/reserva-publica/concurrencia-y-enlaces.test.ts`: persistencia real de 5 intentos fallidos de OTP hasta agotarlo; carrera concurrente real de dos reservas sobre el mismo último sillón disponible (una `201`, otra `409`) y asignación automática del 2° sillón; carrera concurrente `PO-09` (2 permitidas, 3ª rechazada); carrera concurrente de consumo del mismo `token_accion` (una exitosa, otra `404`); e integración real con `worker-cli`/resolvedor `C-14` + `EmailSender` falso generando enlaces de un solo uso y ejecutándolos contra `POST /api/v1/publico/turnos/accion`.
- [ ] 9.2 **(Strict TDD — API HTTP)** Escribir y verificar en `test/api/publico-reservas/publico-reservas.test.ts` los Flujos 3 y 4 completos: slug inexistente vs inactivo (`404`), rate limit por IP y por email (`429` + `retry-after`), solicitud OTP y reserva con `reserva_requiere_confirmacion` `true`/`false`, código incorrecto/vencido/usado (`422`), paciente preexistente sin exposición de datos (`RN-RE-04`), tope `PO-09` (`422`), confirmación y cancelación por token (`>= 24h` liberando hueco en `/disponibilidad`, `< 24h` rechazado `409` sin quemar token, token reutilizado/vencido/propósito cruzado `404`), aislamiento cross-tenant en auditoría/turnos, y verificación de cero PII en respuestas, logs redactados y `pgboss.job`.

## 10. Puertas de calidad finales

- [ ] 10.1 Ejecutar `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test` (unit + integration + api) y `openspec validate --all --strict`, confirmando 100% de aprobaciones sin advertencias ni regresiones.

## Workflow follow-up

- Esperar la revisión y aprobación explícita de `Q1`–`Q6` por la Líder antes de ejecutar `/opsx:apply` sobre `c-15-reserva-publica-otp-y-tokens`.
- Archivar el change con `/opsx:archive` una vez completadas y verificadas todas las tareas de implementación.
