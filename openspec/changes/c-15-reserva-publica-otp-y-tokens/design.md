# Design

## Context

Motivación, alcance y requisitos verificables: ver [proposal.md](proposal.md), [esquema-otp-y-tokens-accion](specs/esquema-otp-y-tokens-accion/spec.md), [reserva-publica-con-otp](specs/reserva-publica-con-otp/spec.md) y [acciones-publicas-turno-token](specs/acciones-publicas-turno-token/spec.md).

Estado observado en el repositorio (`c19673c`) que condiciona el diseño:

- **Contratos y primitivas reutilizables ya en `main`**:
  - `src/domain/comunicacion/` (`C-04`): `emitirCodigoVerificacion`, `verificarCodigoVerificacion`, `emitirTokenAccion`, `validarTokenAccion`, `plantillaCodigoVerificacion` y `normalizarTelefonoAr`, respaldados por `cryptoComunicacion` (`src/infrastructure/crypto/index.ts`, SHA-256 + `timingSafeEqual` + `randomInt` + 256-bit `base64url`).
  - `src/application/disponibilidad/disponibilidad.ts` (`C-13`): expone `huecoOfrecido` (que verifica si un inicio sigue libre y devuelve los `sillonesAsignables`) y `src/infrastructure/db/repositories/clinica-publica/index.ts` expone `resolverClinicaPorSlug` (`C13_001`).
  - `src/application/notificaciones/turnos/` (`C-14`): `ResolvedorContenidoTurno` ya consulta el puerto opcional `ProveedorEnlacesTurno` al renderizar plantillas de `creacion`, `confirmacion`, `reprogramacion` y `recordatorio`. Además, `migrations/C14_001_notificacion_turno_fk.sql` agregó `UNIQUE (clinica_id, id)` en `turno` (`turno_clinica_id_id_key`) y `migrations/C11_001_notificacion.sql` ya admite `tipo = 'codigo'` con `turno_id IS NULL`.
  - `src/infrastructure/logging/redactor.ts`: ya enmascara `dni`, `telefono`, `email`, `nombre`, `apellido`, `obraSocial`, `codigoVerificacion` y cualquier clave que contenga `token`.
  - `src/config/variables.ts`: `PUBLIC_BASE_URL` ya existe en el esquema de entorno y `RATE_LIMIT_PUBLIC` ya controla el módulo público de disponibilidad (`30/min` por defecto).
  - `knowledge-base/10_preguntas_abiertas.md`: `PO-09` ya fue resuelta por la Líder fijando el tope en **2 reservas públicas activas simultáneas por paciente (validado por email o DNI)**.
- **Hallazgos críticos detectados al inspeccionar el código**:
  1. `agendarTurno` (`src/application/turnos/agendar-turno.ts`, `C-09`) fija `estado = 'pendiente_confirmacion'` y recibe un único `sillonId`. Como `C-15` requiere estado inicial dinámico según `clinica_config.reserva_requiere_confirmacion` (`RN-RE-01`) y selección/reintento entre múltiples sillones asignables (`RN-RE-03`), `reservarTurnoPublico` orquesta directamente las primitivas de dominio (`C-02` + `C-09`) y el repositorio transaccional sin alterar `agendarTurno`.
  2. `src/infrastructure/db/repositories/compartido/errores.ts` traduce `23P01` solo para `bloqueo_sin_solape` y `horario_sin_solape`, pero aún no traduce `turno_sin_solape_profesional`, `turno_sin_solape_sillon` ni deadlock `40P01`.
  3. En PostgreSQL, cualquier error SQL (`23P01`, `23505`) dentro de una transacción deja la transacción en estado abortado (`25P02`) si no se envuelve en `SAVEPOINT`. Reintentar otro sillón candidato o manejar una carrera de alta de paciente por DNI en la misma transacción requiere `SAVEPOINT` explícitos.
  4. Un intento fallido de código OTP debe **confirmarse (`COMMIT`)** en `codigo_verificacion.intentos` antes de devolver `422` (si ocurriera dentro de la transacción abortada de la reserva, el contador se revertiría y permitiría fuerza bruta infinita). Inversamente, marcar `consumido_en` debe ocurrir dentro de la transacción de la reserva para no quemar un OTP válido ante un conflicto `409` de agenda.
  5. `eslint.config.mjs` prohíbe importar `pg`, `pg-boss`, `fastify`, `nodemailer`, `infrastructure/` o `interfaces/` desde `src/application/**`, y prohíbe `process.env` fuera de `src/config/**`.

## Goals / Non-Goals

**Goals:**
- Materializar `codigo_verificacion`, `token_accion` y `resolver_clinica_por_hash_token` con RLS forzada, FK compuesta multi-tenant y cero secretos/tokens en claro.
- Habilitar `POST /api/v1/publico/{slug}/codigo` y `POST /api/v1/publico/{slug}/reservas` con validación OTP resistente a fuerza bruta y concurrencia, tope `PO-09`, reutilización segura de paciente (`RN-RE-04`), asignación automática de sillón libre (`RN-RE-03`), rate limiting dual (IP + email), auditoría *fail-closed* y publicación post-commit *fail-open*.
- Proveer `ProveedorEnlacesTurno` y `POST /api/v1/publico/turnos/accion` garantizando uso único bajo concurrencia, TTL acotado, `RN-RE-02` configurable y aislamiento multi-tenant.

**Non-Goals:**
- Reprogramación online por enlace (`IN-02`: queda en recepción).
- Interfaz gráfica web (`IN-03`).
- Modificar contratos congelados (`RequestContext`, `TurnoEventPublisher`, `RecursosReader`, `AgendaReader`, `TurnoRepository`, `resolverClinicaPorSlug`, `huecoOfrecido`).
- Pruebas E2E globales de los 10 flujos (`C-18`) y checklist transversal de hardening (`C-19`).

## Decisions

### D1. Migración `migrations/C15_001_reserva_publica_otp_y_tokens.sql`
- Crea `codigo_verificacion` (`id`, `clinica_id`, `email`, `hash_codigo`, `vence_en`, `intentos`, `consumido_en`, `creado_en`) con:
  - `CHECK (hash_codigo ~ '^[0-9a-f]{64}$')`, `CHECK (intentos >= 0)`, `CHECK (length(btrim(email)) > 0)`.
  - Índice `(clinica_id, email, creado_en DESC)`.
  - `aplicar_rls('codigo_verificacion')` y `GRANT SELECT, INSERT, UPDATE ON TABLE codigo_verificacion TO app` (sin `DELETE`/`TRUNCATE`).
- Crea `token_accion` (`id`, `clinica_id`, `turno_id`, `proposito`, `hash_token`, `vence_en`, `usado_en`, `creado_en`) con:
  - `CHECK (proposito IN ('confirmar', 'cancelar'))`, `CHECK (hash_token ~ '^[0-9a-f]{64}$')`.
  - `CONSTRAINT token_accion_hash_unico UNIQUE (hash_token)` (permite resolver tenant por hash único de 256 bits).
  - `CONSTRAINT token_accion_turno_fk FOREIGN KEY (clinica_id, turno_id) REFERENCES turno (clinica_id, id)` (reutiliza `turno_clinica_id_id_key` de `C-14`).
  - Índice `(clinica_id, turno_id)`.
  - `aplicar_rls('token_accion')` y `GRANT SELECT, INSERT, UPDATE ON TABLE token_accion TO app`.
- Crea `resolver_clinica_por_hash_token(p_hash_token text) RETURNS uuid` siguiendo exactamente el patrón de `C13_001`:
  - `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public`
  - `SELECT t.clinica_id FROM public.token_accion t JOIN public.clinica c ON c.id = t.clinica_id WHERE t.hash_token = p_hash_token AND c.activa LIMIT 1`
  - `REVOKE ALL ON FUNCTION resolver_clinica_por_hash_token(text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION resolver_clinica_por_hash_token(text) TO app;`
- *Alternativa descartada*: `BYPASSRLS` o consultas directas sin RLS sobre `token_accion`. Descartada porque violaría `RN-MT-01`/`RN-MT-02`.

### D2. Emisión y entrega de OTP sin texto plano en DB ni PII en `pg-boss` (`solicitarCodigoVerificacion`)
- El caso de uso normaliza el email (`trim().toLowerCase()`), verifica la validez básica y, dentro de `withTenant(clinicaId)`:
  1. Lee `clinica.nombre` (para `plantillaCodigoVerificacion`).
  2. Invalida cualquier código previo sin consumir de ese `(clinica_id, email)` (por ejemplo fijando `consumido_en = ahora` o `vence_en = LEAST(vence_en, ahora)` para dejar trazabilidad sin borrar filas).
  3. Emite OTP de 6 dígitos con `emitirCodigoVerificacion` (`C-04`, TTL 10 minutos).
  4. Persiste únicamente `hash_codigo` en `codigo_verificacion` y registra la fila de trazabilidad en `notificacion` (`tipo = 'codigo'`, `turno_id = NULL`, `estado = 'pendiente'`, `clave_idempotencia = 'codigo:<codigoId>'`).
- **Fuera de la transacción de DB** (evitando retener conexiones durante I/O SMTP), invoca `EmailSender.enviar` con `plantillaCodigoVerificacion({ nombreClinica, codigo, vigenciaMinutos: 10 })` y luego actualiza `notificacion` a `enviada` o `fallida` (`error` saneado sin PII ni código) dentro de un nuevo `withTenant`.
- *Alternativa descartada*: encolar el código OTP en `pg-boss`. Descartada porque el usuario espera el código en segundos, el OTP vence en 10 minutos y `pgboss.job` no debe almacenar ni el email ni el código en claro. Sujeto a confirmación en `Q2`.

### D3. Verificación de OTP con persistencia segura de intentos (`reservarTurnoPublico`)
- Paso 1 (transacción corta dedicada de verificación previa, o actualización confirmada antes de abrir la transacción principal):
  - Abre `withTenant(clinicaId)`, obtiene el último `codigo_verificacion` de `(clinica_id, email)` con `SELECT ... FOR UPDATE`.
  - Si no existe registro, rechaza con `422 CODIGO_VERIFICACION_INVALIDO`.
  - Ejecuta `verificarCodigoVerificacion` (`C-04`).
  - Si falla con motivo `'codigo_invalido'`, ejecuta `UPDATE codigo_verificacion SET intentos = $intentosActualizados`, **confirma esa transacción** y luego lanza `422 CODIGO_VERIFICACION_INVALIDO` (o `CODIGO_VERIFICACION_AGOTADO` cuando `agotado === true`, sujeto a la convención exacta de error).
  - Si falla por `'vencido'`, `'intentos_agotados'` o `'ya_consumido'`, confirma/cierra y lanza `422` (`CODIGO_VERIFICACION_VENCIDO`, `CODIGO_VERIFICACION_AGOTADO`, `CODIGO_VERIFICACION_USADO`).
- Paso 2 (transacción atómica de reserva):
  - Re-adquiere `FOR UPDATE` sobre ese `codigo_verificacion.id` al iniciar la transacción de reserva, revalida `consumido_en IS NULL`, `ahora < vence_en` e `intentos < maxIntentos` (protegiendo contra dos reservas concurrentes con el mismo OTP válido) y marca `consumido_en = ahora`.
  - Si la reserva falla luego por `409` o `422`, el rollback revierte `consumido_en` sin quemar un OTP válido.

### D4. Tope `PO-09` de 2 reservas públicas activas simultáneas
- Conforme a `knowledge-base/10_preguntas_abiertas.md` (`PO-09`): máximo **2** reservas públicas activas simultáneas por paciente (identificado por email o DNI).
- Dentro de la transacción de reserva, antes de consultar conteo e insertar turno:
  1. Toma `pg_advisory_xact_lock` determinista sobre `hashtext('po09:dni:' || clinicaId || ':' || dniNormalizado)` y `hashtext('po09:email:' || clinicaId || ':' || emailNormalizado)` (en orden determinista por clave para evitar deadlocks).
  2. Cuenta turnos en la clínica con `origen = 'enlace_web'`, `estado IN ('pendiente_confirmacion', 'confirmado')`, `inicio > ahora`, cuyo `paciente_id` tenga `p.dni = $dniNormalizado OR lower(p.email) = $emailNormalizado`.
  3. Si `conteo >= 2`, lanza `ErrorDeDominio('TOPE_RESERVAS_ACTIVAS_ALCANZADO', 'regla_de_negocio', ...)` (`422`, sujeto a confirmación en `Q3`).

### D5. Alta o reutilización segura de paciente por DNI (`RN-RE-04`)
- Normaliza `dni` (`normalizarDni`), `telefono` (`normalizarTelefono`, `+549...`) y `email` (`normalizarEmail`).
- Busca paciente por `dni` en la clínica:
  - Si no existe: crea en `paciente` (usando `SAVEPOINT` para capturar `23505` en `paciente_dni_unico` si hubo carrera concurrente, releyendo el paciente ganador) y audita `'crear'` sobre `'paciente'` con `actor_tipo = 'paciente_enlace'`.
  - Si ya existe: reutiliza `paciente.id`, **nunca** devuelve ni sobrescribe `nombre`, `apellido`, `dni`, `telefono` ni `obra_social`; únicamente si `paciente.email === null` completa `email` y audita `'actualizar'` sobre `'paciente'` (sujeto a confirmación en `Q4`).

### D6. Asignación automática de sillón, estado inicial, concurrencia y publicación (`RN-RE-01`, `RN-RE-03`)
- Lee `configuracionClinica` (`reservaRequiereConfirmacion`, `zonaHoraria`, `granularidadMinutos`), profesional y prestación (si inexistentes o inactivos → `404 RECURSO_NO_ENCONTRADO`).
- Valida horario, feriados, bloqueos, granularidad y pasado con `validarTurnoPrevio` (`C-02`), y calcula los sillones asignables para el hueco con `calcularDisponibilidad`/`huecoOfrecido` (`C-02`/`C-13`).
- Si el profesional ya tiene turno en el intervalo o ningún sillón está libre en el cálculo previo, lanza `409` (`TURNO_SOLAPADO_PROFESIONAL` o `TURNO_SOLAPADO_SILLON`) o el error de dominio correspondiente (`422` si viola franja/feriado/bloqueo/pasado/granularidad).
- Para el conjunto ordenado de sillones candidatos:
  - Fija `estado = config.reservaRequiereConfirmacion ? 'pendiente_confirmacion' : 'confirmado'` y `origen = 'enlace_web'`.
  - Ejecuta cada intento de `INSERT INTO turno` dentro de un `SAVEPOINT`:
    - Si tiene éxito: audita *fail-closed* (`conAuditoriaDeCambio`, `actor_tipo = 'paciente_enlace'`, `entidad = 'turno'`, `accion = 'crear'`), devuelve el turno y colecta `{ tipo: 'creado', turnoId }` para publicar **post-commit** en modo *fail-open* (`RN-NO-03`).
    - Si PostgreSQL responde `23P01` en `turno_sin_solape_sillon`: `ROLLBACK TO SAVEPOINT` y prueba el siguiente sillón candidato. Si se agotan los candidatos, lanza `409 TURNO_SOLAPADO_SILLON`.
    - Si PostgreSQL responde `23P01` en `turno_sin_solape_profesional` o deadlock `40P01`: traduce a `409` (`TURNO_SOLAPADO_PROFESIONAL` / `TURNO_SOLAPADO_SILLON`).

### D7. `ProveedorEnlacesTurno` y cableado en worker (`C-15` ↔ `C-14`)
- Implementa `ProveedorEnlacesTurno` (`src/application/notificaciones/turnos/puertos.ts`):
  - Si `tipo === 'cancelacion'`, devuelve `{}`.
  - Consulta el inicio del turno (si `turno.inicio <= ahora`, devuelve `{}`).
  - Calcula `venceEn = new Date(Math.min(ahora.getTime() + TTL_TOKEN_ACCION_MS, turno.inicio.getTime()))`.
  - Si `estadoTurno === 'pendiente_confirmacion'` y `tipo` es `'creacion'` o `'recordatorio'`: emite token `'confirmar'` + token `'cancelar'`, persiste solo sus `hash_token` en `token_accion` dentro de `withTenant(clinicaId)`, y arma URLs usando `publicBaseUrl`.
  - Si `estadoTurno === 'confirmado'` (o `tipo === 'reprogramacion'`): emite y persiste únicamente token `'cancelar'`.
  - Formato de URL configurable desde `PUBLIC_BASE_URL` (normalizado sin barra final, p. ej. `${baseUrl}/publico/turnos/accion?token=${token}&accion=${proposito}`, permitiendo también consumo directo del token en `POST /api/v1/publico/turnos/accion`).
- En `worker-cli.ts` (`Q6`): cuando `config.publicBaseUrl !== undefined`, inyecta `crearProveedorEnlacesTurnoPg(...)` automáticamente en `crearResolvedorContenidoTurno` (respetando un `proveedorEnlaces` explícito en opciones de prueba).

### D8. Ejecución de `POST /api/v1/publico/turnos/accion`
- Resuelve `hashToken = crypto.hashSha256(token)` y consulta `resolver_clinica_por_hash_token(hashToken)` en el pool sin tenant. Si devuelve `null` → `404 TOKEN_ACCION_INVALIDO`.
- Dentro de `withTenant(clinicaId)`:
  1. Bloquea `token_accion` por `hash_token` con `FOR UPDATE`.
  2. Si `accion` fue enviada en el body, valida coincidencia de propósito con `validarTokenAccion({ tokenPlano, propositoEsperado, registro, ahora, crypto })`; si no fue enviada, usa `registro.proposito` validando igualmente `hash_invalido`, `ya_usado` y `vencido`.
  3. Cualquier invalidez del token (no encontrado, usado, vencido, propósito incompatible) → `404 TOKEN_ACCION_INVALIDO` (`Q5`).
  4. Lee el turno con `FOR UPDATE` y `configuracionClinica`:
     - Si `proposito === 'confirmar'`: transiciona `pendiente_confirmacion -> confirmado` (`transicionar` de `C-09`, `422 TRANSICION_TURNO_INVALIDA` si el estado actual no lo permite).
     - Si `proposito === 'cancelar'`: valida primero estado transicionable (`pendiente_confirmacion` o `confirmado`, sino `422`) y luego verifica `turno.inicio.getTime() - ahora.getTime() >= cancelacionAnticipacionHoras * 3_600_000`. Si falta menos tiempo → lanza `409 CANCELACION_FUERA_DE_PLAZO` con mensaje `"No podés cancelar online con menos de {N} horas de anticipación; contactá a la clínica."` **sin consumir el token** ni modificar el turno.
  5. Marca `token_accion.usado_en = ahora`, actualiza el turno, audita *fail-closed* con `actor_tipo = 'paciente_enlace'`, y colecta `{ tipo: 'confirmado' | 'cancelado', turnoId }` para publicar **post-commit** *fail-open*.

### D9. Módulo HTTP `publico-reservas`, rate limiting dual y pruebas
- Nuevo módulo `src/interfaces/http/modules/publico-reservas/index.ts`, registrado automáticamente por `register-modules.ts` con prefijo `/api/v1`.
- **Rate limit por IP**: plugin `@fastify/rate-limit` encapsulado en el módulo con `hook: 'onRequest'`, `max` y `timeWindow` desde `RATE_LIMIT_PUBLIC` (`30/min` por defecto) y `cache` LRU acotado (`10_000` por defecto, configurable en opciones de test), evaluado antes de validar body o tocar PostgreSQL.
- **Rate limit por email**: limitador LRU acotado en memoria por email normalizado (`5` pedidos cada `15 min` por defecto, configurable en opciones del módulo para pruebas) aplicado en `/codigo` y `/reservas` tras validar esquema y resolver clínica (o sobre email normalizado antes de persistir/enviar), devolviendo `429 DEMASIADOS_PEDIDOS` con encabezado `retry-after`.
- **Privacidad en logs y respuestas**:
  - Propiedades TypeBox con nombres compatibles con `redactor.ts` (`email`, `dni`, `telefono`, `nombre`, `apellido`, `obraSocial`, `codigoVerificacion`, `token`).
  - Todas las respuestas públicas llevan `Cache-Control: no-store`.
  - Ninguna respuesta pública incluye datos de pacientes ni `sillonId`.
- **Estrategia de pruebas**:
  - Unitarias (`test/unit/reserva-publica/`): casos de uso, validaciones puras, cálculo `RN-RE-02`, rate limiter por email acotado, `ProveedorEnlacesTurno` con puertos en memoria.
  - Integración PG real (`test/integration/reserva-publica/`): migración `C15_001`, RLS, `resolver_clinica_por_hash_token`, persistencia de `intentos`, `SAVEPOINT` multi-sillón, carrera concurrente real de reservas y de consumo de token, integración real con worker `C-14` + `EmailSender` falso.
  - API HTTP (`test/api/publico-reservas/`): Flujos 3 y 4 completos, errores `400`/`404`/`409`/`422`/`429`, verificación de cero PII en respuestas, logs y `pgboss.job`.

## Risks / Trade-offs

- **[Carrera entre `verificarCodigoVerificacion` (commit de intento) y la transacción de reserva]** → Si dos requests usan el mismo OTP concurrentemente, el segundo podría pasar el Paso 1 antes de que el primero marque `consumido_en`. Mitigación: el Paso 2 vuelve a bloquear la fila `FOR UPDATE` dentro de la transacción de reserva y re-verifica `consumido_en IS NULL`, rechazando el segundo con `422 CODIGO_VERIFICACION_USADO`.
- **[Deadlock en `pg_advisory_xact_lock` si se toman locks de DNI y email en distinto orden]** → Mitigación: ordenar lexicográficamente las claves `dni:<clinica>:<dni>` y `email:<clinica>:<email>` antes de adquirir los advisory locks dentro de la transacción.
- **[Dependencia de `PUBLIC_BASE_URL` en `worker-cli.ts`]** → `loadConfig('app')` hoy tiene `PUBLIC_BASE_URL` opcional para no romper despliegues/tests previos a `C-15`. Mitigación: en `worker-cli.ts`, activar `ProveedorEnlacesTurno` automáticamente cuando `config.publicBaseUrl` esté definida (y validar su obligatoriedad en endpoints o despliegues si se decide en `Q6`).
- **[Falsos positivos en rate limit de pruebas API si todas comparten IP]** → Mitigación: exponer `OpcionesModuloPublicoReservas` (análogo a `publico-disponibilidad`) para configurar `cache` y límites por IP/email en pruebas específicas sin afectar los valores por defecto en producción.

## Migration Plan

1. Precondición verificada: migraciones `C03_001` a `C14_001` aplicadas (incluyendo `turno_clinica_id_id_key` de `C14_001` y `notificacion` de `C11_001`).
2. Ejecutar `npm run db:migrate` bajo el rol `migra` (`DATABASE_MIGRATION_URL`) para aplicar `migrations/C15_001_reserva_publica_otp_y_tokens.sql`.
3. Verificar con `npm run lint`, `npm run format:check`, `npm run typecheck` y `npm test` (unit + integration contra PostgreSQL real + api).
4. **Rollback** (solo antes de fusionar a `main`): bajo rol `migra`, ejecutar `DROP FUNCTION IF EXISTS resolver_clinica_por_hash_token(text); DROP TABLE IF EXISTS token_accion; DROP TABLE IF EXISTS codigo_verificacion;` y eliminar `'C15_001_reserva_publica_otp_y_tokens.sql'` de `schema_migrations`. Una vez fusionada a `main`, la migración es inmutable (Regla 6).

## Open Questions

Por gobernanza **CRÍTICO** (`CHANGES.md`), la Líder debe aprobar explícitamente `Q1`–`Q6` antes de iniciar `/opsx:apply`:

1. **Q1 — Esquema `C15_001` y función `SECURITY DEFINER` `resolver_clinica_por_hash_token`**: ¿se aprueba crear `codigo_verificacion` y `token_accion` con `aplicar_rls`, FK compuesta `(clinica_id, turno_id) -> turno (clinica_id, id)` y la función `SECURITY DEFINER` `resolver_clinica_por_hash_token(p_hash_token text)` (siguiendo el mismo patrón de mínimo alcance de `C13_001`) para resolver la clínica en `POST /publico/turnos/accion`?
2. **Q2 — Envío directo de OTP sin `pg-boss` y trazabilidad en `notificacion`**: ¿se aprueba que `POST /publico/{slug}/codigo` envíe el email directamente fuera de la transacción DB vía `EmailSender` (registrando solo el estado `pendiente`/`enviada`/`fallida` en `notificacion` con `tipo = 'codigo'` y `turno_id = NULL`, sin encolar ni almacenar el OTP o el email en `pgboss.job`), y devolver `202` siempre que el código quede emitido (o `503` si falla el proveedor SMTP)? *Recomendación*: devolver `202` si `EmailSender` tuvo éxito y `503 ERROR_PROVEEDOR_EMAIL` (o `202` sin revelar fallos internos) — confirmar comportamiento esperado ante fallo SMTP en `/codigo`.
3. **Q3 — Semántica y estado HTTP del tope `PO-09` (máximo 2 reservas activas)**: ¿se confirma contar turnos con `origen = 'enlace_web'`, `estado IN ('pendiente_confirmacion', 'confirmado')` y `inicio > ahora` por mismo `dni` o mismo `email` dentro de la clínica (serializado con `pg_advisory_xact_lock`), devolviendo `422 TOPE_RESERVAS_ACTIVAS_ALCANZADO` (alternativa: `409`)?
4. **Q4 — Reutilización de paciente existente por DNI (`RN-RE-04`)**: cuando ya existe un `paciente` con ese DNI en la clínica, ¿se aprueba reutilizar su `id` sin sobrescribir nombre/apellido/teléfono/obra social y completar únicamente `email` si estaba `NULL` (auditado bajo `actor_tipo = 'paciente_enlace'`), sin devolver datos del paciente en la respuesta `201`?
5. **Q5 — Contrato de `POST /api/v1/publico/turnos/accion` y error uniforme `404`**: ¿se aprueba aceptar `{ token, accion?: 'confirmar' | 'cancelar' }` (validando `accion` contra `token_accion.proposito` cuando se informe) y responder uniformemente `404 TOKEN_ACCION_INVALIDO` para tokens inexistentes, usados, vencidos, de propósito incompatible o de clínica inactiva (en lugar de `410`, evitando ampliar `TipoDeError`)?
6. **Q6 — Cableado fuera de zona de `C-15`**:
   - (a) ¿Se aprueba cablear `crearProveedorEnlacesTurnoPg` en `src/infrastructure/queue/worker-cli.ts` (activado automáticamente cuando `PUBLIC_BASE_URL` esté configurada) para que los emails reales enviados por el worker `C-14` incluyan los enlaces de un solo uso?
   - (b) ¿Se prefiere encapsular la traducción `23P01` (`turno_sin_solape_profesional`/`turno_sin_solape_sillon`) y `40P01` dentro de `src/infrastructure/db/repositories/reserva-publica/` o extender `src/infrastructure/db/repositories/compartido/errores.ts`?
