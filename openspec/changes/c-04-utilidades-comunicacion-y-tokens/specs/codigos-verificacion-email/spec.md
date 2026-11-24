# Spec Delta

## Purpose

Define la emisión y verificación pura de códigos numéricos OTP por email con hash SHA-256, vencimiento y límite de intentos para validar reservas públicas.

## ADDED Requirements

### Requirement: Emisión de código numérico de verificación por email
El dominio SHALL generar códigos numéricos uniformes de longitud configurable (6 dígitos por defecto, entre 4 y 12 enteros) preservando ceros a la izquierda, devolviendo el código en claro, su hash SHA-256, `venceEn = ahora + ttlMs` (por defecto 10 minutos) e `intentos = 0`.

#### Scenario: Emisión con valores por defecto
- **WHEN** se emite un código de verificación sin opciones personalizadas
- **THEN** devuelve `codigo` de exactamente 6 dígitos numéricos, `hashCodigo` igual a su SHA-256 y distinto de `codigo`, `intentos` igual a `0` y `venceEn` igual a `ahora + 10 minutos`

#### Scenario: Preservación de ceros a la izquierda
- **WHEN** el generador criptográfico produce un número con ceros iniciales como `004219`
- **THEN** `codigo` conserva los 6 caracteres completos (`004219`) y el hash se calcula sobre la cadena completa con los ceros iniciales

#### Scenario: Rechazo de longitud o TTL inválidos
- **WHEN** se intenta emitir un código con `ttlMs <= 0` o `longitud` fuera del rango entero `[4, 12]`
- **THEN** la operación falla con el error tipado `TTL_INVALIDO` o `PARAMETRO_INVALIDO` de tipo solicitud inválida

### Requirement: Verificación pura con vencimiento, consumo único y límite de intentos
El dominio SHALL verificar el código comparando su hash en tiempo constante y exigiendo no estar consumido (`consumidoEn === null`), estar vigente (`ahora < venceEn`) y no superar `maxIntentos` (por defecto 5), devolviendo `intentosActualizados`, `agotado` y `consumidoEn` sin mutar el registro ni exponer el código.

#### Scenario: Verificación exitosa
- **WHEN** el código ingresado coincide con `hashCodigo`, `consumidoEn` es `null`, `ahora < venceEn` e `intentos < maxIntentos`
- **THEN** devuelve resultado válido con `consumidoEn` igual a `ahora` e `intentosActualizados` igual a `intentos`

#### Scenario: Código incorrecto con intentos disponibles
- **WHEN** el código ingresado no coincide con `hashCodigo` estando vigente y con `intentos + 1 < maxIntentos`
- **THEN** devuelve resultado inválido con motivo `codigo_invalido`, `intentosActualizados` igual a `intentos + 1` y `agotado` en `false`

#### Scenario: Código incorrecto que agota el límite de intentos
- **WHEN** el código ingresado no coincide con `hashCodigo` y `intentos + 1` alcanza `maxIntentos`
- **THEN** devuelve resultado inválido con motivo `codigo_invalido`, `intentosActualizados` igual a `maxIntentos` y `agotado` en `true`

#### Scenario: Rechazo cuando los intentos ya están agotados
- **WHEN** se verifica cualquier código (incluso el correcto) sobre un registro con `intentos >= maxIntentos`
- **THEN** devuelve resultado inválido con motivo `intentos_agotados` y `agotado` en `true` sin consumir el código

#### Scenario: Rechazo de código vencido o ya consumido
- **WHEN** se verifica cualquier código (incluso el correcto) con `ahora >= venceEn` o con `consumidoEn !== null`
- **THEN** devuelve resultado inválido con motivo `vencido` o `ya_consumido` respectivamente sin alterar `intentos`
