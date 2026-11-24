# Spec Delta

## Purpose

Provee el puerto append-only, el servicio de aplicación de auditoría, el enmascaramiento recursivo de datos personales y credenciales en cumplimiento de la Ley 25.326, y su adaptador transaccional sobre PostgreSQL.

## ADDED Requirements

### Requirement: Puerto append-only y frontera hexagonal en aplicación
The application layer SHALL expose an append-only audit repository port with a single insertion operation and an audit service accepting `RequestContext` without modifying `RequestContext` and without importing database, HTTP, or infrastructure modules.

#### Scenario: Delegación exclusiva a inserción leyendo el contexto compartido
- **WHEN** se registra un evento de auditoría invocando al servicio con un `RequestContext` válido y una entrada de auditoría
- **THEN** el servicio toma `clinicaId`, `actor.tipo` y `actor.id` del `RequestContext` sin alterarlo
- **AND** invoca únicamente la operación de inserción del repositorio append-only

### Requirement: Validación de contexto, actores e IP antes de persistir
The audit service SHALL validate `clinicaId` as a UUID, accept actor types `usuario`, `paciente_enlace`, and `sistema` (requiring non-empty `actor.id` for `usuario` and `paciente_enlace`, and normalizing blank `actor.id` to `null` for `sistema`), enforce snake_case `accion` and `entidad`, validate optional `ip` addresses, and reject invalid inputs with a domain validation error containing no personal data.

#### Scenario: Registro válido para usuario, paciente por enlace y sistema
- **WHEN** se registra auditoría con un `RequestContext` de actor `usuario`, `paciente_enlace` o `sistema` (con `actor.id` presente o vacío en `sistema`) y metadatos válidos
- **THEN** el servicio valida la entrada, normaliza cadenas opcionales vacías a `null` y persiste el evento con el tipo de actor correspondiente

#### Scenario: Rechazo ante identificador de clínica o actor inválido
- **WHEN** `clinicaId` no es un UUID válido o un actor `usuario` o `paciente_enlace` tiene `actor.id` vacío
- **THEN** el servicio falla con un error de dominio de tipo solicitud inválida sin llamar al repositorio
- **AND** el mensaje de error no contiene datos personales

#### Scenario: Rechazo ante acción, entidad o dirección IP mal formada
- **WHEN** `accion` o `entidad` está vacía o no cumple snake_case minúscula, o `ip` no es una dirección IPv4/IPv6 válida
- **THEN** el servicio falla con un error de dominio de tipo solicitud inválida sin llamar al repositorio

### Requirement: Enmascaramiento recursivo de datos personales y credenciales
Before persisting `datos_antes` and `datos_despues`, the audit sanitizer MUST recursively replace personal patient fields, patient-prefixed variants, credentials, secrets, and verification codes with `[REDACTADO]` regardless of casing, accents, or separators, sanitize embedded PII or secrets in free-text fields, preserve domain error codes, convert dates to ISO-8601 UTC, handle circular or overly deep structures, and never mutate caller objects.

#### Scenario: Redacción de datos personales en variantes de clave y anidamiento
- **WHEN** `datos_antes` o `datos_despues` contiene `dni`, `telefono`, `email`, `nombre`, `apellido`, `obra_social` o variantes compuestas (`obraSocial`, `TELÉFONO`, `nombrePaciente`, `dniPaciente`) en raíz o dentro de subobjetos y arreglos
- **THEN** cada valor sensible se reemplaza por `[REDACTADO]` manteniendo intactos identificadores, fechas y atributos operativos no sensibles
- **AND** los objetos originales del llamador no sufren ninguna mutación

#### Scenario: Redacción de credenciales, secretos y hashes conservando códigos de dominio
- **WHEN** la carga útil incluye claves que contienen `contrasena`, `password`, `passwd`, `token`, `secret`, `apikey`, `authorization`, `cookie`, `codigoverificacion`, `verificationcode` o `hashcodigo`, junto a un campo `codigo` de error de dominio
- **THEN** todas las credenciales, tokens y hashes se reemplazan por `[REDACTADO]`
- **AND** el campo `codigo` de error de dominio conserva su valor

#### Scenario: Saneamiento de texto libre con PII o credenciales incrustadas
- **WHEN** un campo de texto libre (`motivo`, `mensaje`, `message`, `msg`, `stack` u observación equivalente) incluye un correo electrónico, un número de 7 u 8 dígitos, un token `Bearer` o credenciales en una URL
- **THEN** el patrón sensible se reemplaza por `[REDACTADO]` antes de persistir

#### Scenario: Conversión de fechas y protección contra ciclos y profundidad excesiva
- **WHEN** se enmascara una estructura que incluye instancias `Date`, referencias circulares o anidamiento superior al límite máximo
- **THEN** las fechas válidas se serializan en formato ISO-8601 UTC, las referencias circulares se reemplazan por `[CIRCULAR]` y los niveles que exceden el límite se reemplazan por `[TRUNCADO]`

### Requirement: Persistencia transaccional en PostgreSQL y errores seguros
The PostgreSQL audit repository adapter SHALL insert records inside the caller's `withTenant` transaction using parameterized SQL with `ctx.clinicaId` as the inserted `clinica_id`, return the created record with textual sequential `id`, UTC `ocurrioEn`, sanitized JSON payloads, and canonical `ip`, and translate database errors without exposing PostgreSQL `detail` or personal data.

#### Scenario: Inserción transaccional real devuelve el registro creado
- **WHEN** se invoca al servicio de auditoría conectado al adaptador PostgreSQL dentro de `withTenant`
- **THEN** se inserta la fila en `auditoria` dentro de la misma transacción, permitiendo su reversión atómica si el caso de uso falla luego
- **AND** devuelve el identificador secuencial en texto, el instante UTC y los campos almacenados

#### Scenario: Rechazo ante desalineación entre el contexto de pedido y la transacción
- **WHEN** el adaptador recibe un `RequestContext` cuyo `clinicaId` difiere de `app.clinica_id` fijado en la transacción actual
- **THEN** PostgreSQL rechaza la inserción mediante la política RLS sin insertar el registro

#### Scenario: Traducción de error del motor sin filtrar detalles sensibles
- **WHEN** la inserción en PostgreSQL falla con un error del motor que contiene valores de fila en `detail`
- **THEN** el adaptador traduce el error a un error seguro sin copiar `detail` ni datos personales en el mensaje ni en `cause`
