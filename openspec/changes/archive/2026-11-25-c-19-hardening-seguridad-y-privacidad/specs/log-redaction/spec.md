# Spec Delta — log-redaction

## ADDED Requirements

### Requirement: Redacción de claves internas y privadas por nombre de campo
El redactor de logs SHALL incluir `internalkey` y `privatekey` entre los patrones de nombre de credencial sensible, reemplazando por `[REDACTADO]` campos como `adminInternalKey` o `privateKey` en cualquier profundidad del objeto registrado.

#### Scenario: Objeto con adminInternalKey es redactado
- **WHEN** se registra un objeto de configuración o error que contiene una propiedad `adminInternalKey` o `private_key`
- **THEN** el valor se reemplaza por `[REDACTADO]` en el registro emitido

### Requirement: Saneamiento de teléfonos argentinos y JWT en texto libre
El saneamiento de mensajes de error y trazas SHALL enmascarar con `[REDACTADO]` los números telefónicos en formato internacional argentino (`+54...`) y los tokens JWT completos (`eyJ...`) incrustados en texto libre, sin alterar identificadores cortos ni números ajenos al formato.

#### Scenario: Mensaje de error con teléfono argentino y JWT incrustados
- **WHEN** un mensaje de error o traza incluye `+5491155551234` o un JWT de tres segmentos que comienza con `eyJ`
- **THEN** ambos valores son reemplazados por `[REDACTADO]` conservando el resto del mensaje
