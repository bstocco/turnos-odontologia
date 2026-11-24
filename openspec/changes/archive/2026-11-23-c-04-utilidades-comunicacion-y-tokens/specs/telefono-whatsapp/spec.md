# Spec Delta

## Purpose

Permite normalizar teléfonos celulares argentinos al formato internacional exigido por `wa.me` y construir enlaces click-to-chat seguros para recordatorios manuales desde la recepción.

## ADDED Requirements

### Requirement: Normalización de teléfonos celulares argentinos
El sistema SHALL normalizar teléfonos celulares argentinos válidos al formato internacional `549` seguido de código de área y número local (13 dígitos, sin `+`, `0` inicial ni `15`), y MUST rechazar números inválidos con un error tipado cuyo mensaje MUST NOT incluir el número ingresado.

#### Scenario: Número local con 0 y 15 en áreas de 2, 3 y 4 dígitos
- **WHEN** se normalizan `011 15 5555-1234`, `0351 15 512-3456` y `02920 15 41-2345`
- **THEN** se devuelven `5491155551234`, `5493515123456` y `5492920412345` respectivamente

#### Scenario: Número local sin 0 ni 15
- **WHEN** se normalizan `11 5555-1234` y `341 512-3456`
- **THEN** se devuelven `5491155551234` y `5493415123456` respectivamente

#### Scenario: Número con prefijo internacional argentino
- **WHEN** se normalizan `+54 11 15 5555-1234`, `+54 9 11 5555-1234`, `54 351 5123456` y `+54 9 11 15 5555-1234`
- **THEN** se devuelven `5491155551234` y `5493515123456` eliminando `+`, `0` y `15` residuales

#### Scenario: Idempotencia sobre un teléfono ya normalizado
- **WHEN** se normaliza nuevamente un valor previamente normalizado como `5491155551234`
- **THEN** se devuelve exactamente el mismo valor `5491155551234`

#### Scenario: Rechazo de teléfonos inválidos sin fuga de datos
- **WHEN** se intenta normalizar una cadena vacía, con letras, sin código de área (`15 5555-1234`), con prefijo de otro país (`+1 555 123 4567`), con longitud distinta de 10 dígitos locales o con un número local truncado iniciado en `15`
- **THEN** la operación falla con el error tipado `TELEFONO_INVALIDO` de tipo solicitud inválida
- **AND** el mensaje de error no contiene ningún dígito ni fragmento del teléfono ingresado

### Requirement: Generación de enlace click-to-chat de WhatsApp
El sistema SHALL construir enlaces `https://wa.me/<numero>?text=<mensaje codificado>` normalizando previamente el teléfono de destino y codificando el texto con `encodeURIComponent`, rechazando mensajes vacíos o teléfonos inválidos.

#### Scenario: Enlace válido con caracteres especiales en español
- **WHEN** se construye un enlace con el teléfono `011 15 5555-1234` y un mensaje que incluye tildes, `ñ`, saltos de línea y caracteres reservados (`&`, `?`, `#`)
- **THEN** la URL comienza con `https://wa.me/5491155551234?text=`
- **AND** el parámetro `text` decodificado coincide exactamente con el mensaje original

#### Scenario: Rechazo de mensaje vacío
- **WHEN** se intenta construir un enlace con una cadena vacía o compuesta solo por espacios y saltos de línea
- **THEN** la operación falla con el error tipado `MENSAJE_VACIO` de tipo solicitud inválida

#### Scenario: Rechazo de teléfono inválido al construir enlace
- **WHEN** se intenta construir un enlace con un teléfono inválido
- **THEN** la operación falla con `TELEFONO_INVALIDO` sin exponer el teléfono ni generar un enlace parcial
