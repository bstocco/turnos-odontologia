# Proposal

## Why

Las piezas base para la atención al paciente sin cuenta ya están en `main`: primitivas criptográficas, emisión/verificación pura de códigos OTP, tokens de un solo uso y plantillas en español (`C-04`), persistencia con exclusión de profesional y sillón (`C-09`), cola `pg-boss` y envío de correos (`C-11`), resolución pública de clínica por slug y disponibilidad (`C-13`), y suscriptor de eventos con `ResolvedorContenidoTurno` listo para consumir `ProveedorEnlacesTurno` (`C-14`). Falta habilitar los flujos públicos de extremo a extremo para que el paciente valide su email mediante un código OTP, reserve un turno con asignación automática de sillón bajo control anti-abuso (incluyendo la resolución ya definida de `PO-09`: máximo **2** reservas públicas activas simultáneas por email o DNI), y confirme o cancele mediante enlaces de un solo uso respetando la anticipación mínima configurable (`RN-RE-01` a `RN-RE-06`, `US-031`, `US-032`, `Flujo 3`, `Flujo 4`, `R-02`).

Por tratarse de un change de gobernanza **CRÍTICO** y perteneciente al camino crítico, el diseño y las preguntas abiertas `Q1`–`Q6` se someten a aprobación explícita de la Líder antes de pasar a implementación (`/opsx:apply`).

## What Changes

- **Esquema `migrations/C15_001_reserva_publica_otp_y_tokens.sql`**:
  - Incorporar las tablas multi-tenant `codigo_verificacion` y `token_accion` con `clinica_id`, `aplicar_rls`, validación de formato SHA-256 (`^[0-9a-f]{64}$`), clave foránea compuesta `token_accion_turno_fk (clinica_id, turno_id) -> turno (clinica_id, id)` (reutilizando `turno_clinica_id_id_key` introducida en `C-14`), restricción `UNIQUE (hash_token)` en `token_accion`, índices operativos y privilegios mínimos para el rol `app` (`SELECT, INSERT, UPDATE`; sin `DELETE` ni `TRUNCATE`).
  - Incorporar la función `SECURITY DEFINER` `resolver_clinica_por_hash_token(p_hash_token text) RETURNS uuid` (mismo patrón que `C13_001` `resolver_clinica_por_slug`: `SET search_path = pg_catalog, public`, solo clínicas activas, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO app`) para resolver el tenant al recibir `POST /api/v1/publico/turnos/accion` sin `BYPASSRLS`.
- **Emisión y entrega de código OTP (`POST /api/v1/publico/{slug}/codigo`)**:
  - Endpoint público sin sesión con límite de tasa dual (por IP en `onRequest` y por email normalizado en almacén acotado) y respuesta `404 RECURSO_NO_ENCONTRADO` idéntica para slug inválido, inexistente o clínica inactiva.
  - Invalida códigos previos no consumidos de `(clinica_id, email)`, emite un código numérico de 6 dígitos con `emitirCodigoVerificacion` (`C-04`), persiste únicamente `hash_codigo` en `codigo_verificacion`, registra el seguimiento en `notificacion` (`tipo = 'codigo'`, `turno_id = NULL`), envía el correo fuera de la transacción de base de datos vía `EmailSender` con `plantillaCodigoVerificacion` sin depositar código en claro ni PII en `pg-boss` ni en logs, y actualiza `notificacion` a `enviada` o `fallida`.
- **Reserva pública con OTP (`POST /api/v1/publico/{slug}/reservas`)**:
  - Valida el OTP con `verificarCodigoVerificacion` (`C-04`) bloqueando el registro `FOR UPDATE`; cuando el código es incorrecto **confirma en PostgreSQL el incremento de `intentos`** antes de responder `422` (evitando perder el contador por rollback), y en caso válido marca `consumido_en` atómicamente dentro de la misma transacción de la reserva.
  - Aplica el tope `PO-09` (máximo **2** reservas públicas activas simultáneas por email o DNI dentro de la clínica, serializando carreras con `pg_advisory_xact_lock` determinista por clínica+DNI y clínica+email).
  - Busca o crea al paciente por DNI normalizado (`RN-RE-04`, teléfono normalizado `RN-PA-03`) sin exponer datos de pacientes existentes en la respuesta ni sobrescribir datos previos (completando únicamente `email` si era `NULL`, sujeto a `Q4`).
  - Valida reglas de agenda (`C-02`), verifica disponibilidad con `huecoOfrecido` (`C-13`) y asigna automáticamente un sillón libre (`RN-RE-03`) reintentando con `SAVEPOINT` por sillón candidato ante `23P01` (`turno_sin_solape_sillon`), traduciendo `23P01`/`40P01` a `409` (`TURNO_SOLAPADO_PROFESIONAL` o `TURNO_SOLAPADO_SILLON`).
  - Determina el estado inicial según `clinica_config.reserva_requiere_confirmacion` (`RN-RE-01`), audita *fail-closed* con `actor_tipo = 'paciente_enlace'` (`C-07`), publica `{ tipo: 'creado', turnoId }` post-commit *fail-open* (`RN-NO-03`) y responde `201` con DTO mínimo sin PII ni `sillonId`.
- **Proveedor de enlaces de un solo uso y ejecución de acciones (`POST /api/v1/publico/turnos/accion`)**:
  - Implementación de `ProveedorEnlacesTurno` (`C-14`) que emite tokens de 256 bits (`emitirTokenAccion` de `C-04`) al enviar correos de turno (`creacion`, `confirmacion`, `reprogramacion`, `recordatorio`), persiste solo `hash_token` en `token_accion` con vencimiento acotado (`min(ahora + 48h, turno.inicio)`) y construye enlaces usando `PUBLIC_BASE_URL` (sujeto a cableado en `worker-cli.ts` en `Q6`).
  - `POST /api/v1/publico/turnos/accion`: ruta pública sin sesión con límite de tasa por IP (`onRequest`), resuelve el tenant vía `resolver_clinica_por_hash_token`, bloquea `token_accion FOR UPDATE`, valida con `validarTokenAccion` (`C-04`), rechaza uniformemente con `404 TOKEN_ACCION_INVALIDO` tokens inexistentes, usados, vencidos, con propósito erróneo o de clínica inactiva (`Q5`), confirma o cancela verificando la anticipación mínima `clinica_config.cancelacion_anticipacion_horas` (`RN-RE-02`, rechazando con `409 CANCELACION_FUERA_DE_PLAZO` sin consumir el token), marca `usado_en = ahora`, audita *fail-closed*, publica el evento post-commit *fail-open* y responde `200` sin PII.
- **Fuera de alcance**: reprogramación online por el paciente (`IN-02`, operación exclusiva de recepción), interfaz gráfica (`IN-03`), alteración de contratos congelados (`RequestContext`, `TurnoEventPublisher`, `RecursosReader`, `AgendaReader`, `TurnoRepository`, `resolverClinicaPorSlug`), pruebas E2E globales de los 10 flujos (`C-18`) y hardening transversal (`C-19`).

## Capabilities

### New Capabilities
- `esquema-otp-y-tokens-accion`: Tablas `codigo_verificacion` y `token_accion` con RLS multi-tenant, FK compuesta hacia `turno`, privilegios mínimos de `app` y función `SECURITY DEFINER` `resolver_clinica_por_hash_token`.
- `reserva-publica-con-otp`: Solicitud de código OTP por email y creación pública de reservas con verificación de código, persistencia de intentos, tope `PO-09`, alta/reutilización segura de paciente, asignación automática de sillón, límite de tasa IP/email, auditoría y publicación de evento.
- `acciones-publicas-turno-token`: Emisión diferida de enlaces de un solo uso (`ProveedorEnlacesTurno`) y ejecución segura de confirmación o cancelación online con validación de anticipación mínima (`RN-RE-02`), consumo atómico y auditoría.

### Modified Capabilities
<!-- Ninguna capacidad existente modifica sus requisitos de especificación; `C-15` consume los contratos existentes de `C-04`, `C-09`, `C-11`, `C-13` y `C-14`. -->

## Impact

- **Zona principal de `C-15`**: `migrations/C15_*`, `src/application/reserva-publica/**`, `src/infrastructure/db/repositories/reserva-publica/**`, `src/interfaces/http/modules/publico-reservas/**`, `test/unit/reserva-publica/**`, `test/integration/reserva-publica/**`, `test/api/publico-reservas/**`.
- **Puntos sujetos a aprobación de la Líder (`Q1`–`Q6`)**: alcance y privilegios de `resolver_clinica_por_hash_token`, entrega directa de OTP con trazabilidad en `notificacion`, semántica y código HTTP del tope `PO-09`, completado condicional de `email` en paciente existente, contrato y errores de `POST /publico/turnos/accion`, y cableado opcional de `ProveedorEnlacesTurno` en `src/infrastructure/queue/worker-cli.ts` más alcance de la traducción `23P01`/`40P01`.
- **Contratos congelados preservados**: `RequestContext`, `TurnoEventPublisher`, puertos de `C-02` (`RecursosReader`, `AgendaReader`), puertos de `C-09` (`TurnoRepository`), `resolverClinicaPorSlug` y `huecoOfrecido` permanecen sin cambios rompientes.
