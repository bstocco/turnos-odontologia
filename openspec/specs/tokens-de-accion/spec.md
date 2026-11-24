# tokens-de-accion Specification

## Purpose

Provee primitivas criptográficas seguras y la lógica pura de emisión y validación de tokens aleatorios de un solo uso para confirmar o cancelar turnos.

## Requirements

### Requirement: Primitivas criptográficas seguras
El módulo de criptografía SHALL proveer generación de tokens aleatorios de 256 bits en formato URL-safe, generación uniforme de códigos numéricos sin sesgo de módulo, cálculo de hash SHA-256 en hexadecimal minúscula y comparación en tiempo constante resistente a diferencias de longitud.

#### Scenario: Generación de token aleatorio de 256 bits
- **WHEN** se generan dos tokens aleatorios consecutivos
- **THEN** cada uno tiene 43 caracteres válidos de `base64url` (`[A-Za-z0-9_-]`) equivalentes a 256 bits sin relleno y ambos valores son distintos

#### Scenario: Hash SHA-256 determinístico
- **WHEN** se calcula el hash SHA-256 de una misma cadena en dos llamadas
- **THEN** devuelve la misma cadena hexadecimal minúscula de 64 caracteres, distinta del valor original

#### Scenario: Comparación en tiempo constante con longitudes distintas
- **WHEN** se comparan dos cadenas idénticas, dos distintas de igual longitud y dos de longitudes diferentes (incluidos caracteres UTF-8 multibyte)
- **THEN** devuelve `true` solo ante igualdad exacta y `false` en los demás casos sin lanzar excepción

### Requirement: Emisión de token de acción de un solo uso
El dominio SHALL emitir tokens de acción para propósito `confirmar` o `cancelar` entregando el token en claro, su hash SHA-256, el propósito y `venceEn = ahora + ttlMs` (por defecto 48 horas), rechazando un TTL menor o igual a cero.

#### Scenario: Emisión válida para confirmar o cancelar
- **WHEN** se emite un token de acción para `confirmar` o `cancelar` con un instante `ahora` y un TTL válido
- **THEN** devuelve el token de 256 bits en claro, `hashToken` igual al SHA-256 del token, el propósito indicado y `venceEn` igual a `ahora + ttlMs`

#### Scenario: Rechazo de TTL inválido en token
- **WHEN** se intenta emitir un token con `ttlMs <= 0` o no finito
- **THEN** la operación falla con el error tipado `TTL_INVALIDO` de tipo solicitud inválida

### Requirement: Validación pura de token de acción
El dominio SHALL validar un token recibido comparando su hash en tiempo constante contra `hashToken` y exigiendo coincidencia de propósito, no haber sido usado (`usadoEn === null`) y vigencia estricta (`ahora < venceEn`), devolviendo un resultado discriminado sin mutar estado.

#### Scenario: Token válido y vigente
- **WHEN** el token corresponde a `hashToken`, coincide el propósito, `usadoEn` es `null` y `ahora` es anterior a `venceEn` (incluido 1 ms antes)
- **THEN** la validación devuelve resultado válido

#### Scenario: Hash inválido
- **WHEN** el token en claro no coincide con `hashToken`
- **THEN** la validación devuelve resultado inválido con motivo `hash_invalido`

#### Scenario: Propósito incorrecto
- **WHEN** un token emitido para `confirmar` se valida esperando `cancelar` (o viceversa)
- **THEN** la validación devuelve resultado inválido con motivo `proposito_invalido`

#### Scenario: Token ya usado
- **WHEN** el registro del token tiene `usadoEn` distinto de `null` aunque el hash coincida
- **THEN** la validación devuelve resultado inválido con motivo `ya_usado`

#### Scenario: Token vencido en el límite exacto o posterior
- **WHEN** `ahora` es igual o posterior a `venceEn`
- **THEN** la validación devuelve resultado inválido con motivo `vencido`
