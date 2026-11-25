# log-redaction Specification

## Purpose

Garantiza que los registros de la aplicación sean estructurados y que nunca contengan datos personales de pacientes ni credenciales, en cumplimiento de la Ley 25.326 y de RN-DA-01.

## Requirements

### Requirement: Logs estructurados con identificador de pedido
El servicio SHALL emitir un registro JSON por línea con nivel, instante y, cuando corresponda, el identificador del pedido. Los registros de acceso SHALL incluir método, ruta sin cadena de consulta, estado y duración.

#### Scenario: Registro de acceso
- **WHEN** el servicio atiende `GET /pacientes?dni=30111222`
- **THEN** el registro contiene el método, la ruta `/pacientes`, el estado y la duración
- **AND** no contiene la cadena de consulta ni el valor del DNI

### Requirement: Redacción de datos personales
Todo valor asociado a un campo de datos personales (`dni`, `telefono`, `email`, `nombre`, `apellido`, `obra_social`) SHALL reemplazarse por `[REDACTADO]` en cualquier nivel de profundidad de lo que se registre.

#### Scenario: Objeto anidado con datos del paciente
- **WHEN** se registra un objeto que contiene `paciente.dni` y `paciente.email`
- **THEN** ambos valores aparecen como `[REDACTADO]` y el resto de los campos se conserva

#### Scenario: Cuerpo de pedido
- **WHEN** llega un pedido cuyo cuerpo trae datos de un paciente
- **THEN** el cuerpo no se registra

### Requirement: Redacción de credenciales y secretos
Los valores de contraseñas, tokens, códigos de verificación, cabeceras `authorization` y `cookie` y claves de API SHALL redactarse en todos los registros, incluidos los de error.

#### Scenario: Cabecera de autorización
- **WHEN** llega un pedido con la cabecera `authorization`
- **THEN** el registro del pedido muestra `[REDACTADO]` en lugar del valor

### Requirement: Errores registrados sin carga útil
Un error SHALL registrarse con su código, su identificador de pedido y su traza, sin incluir el cuerpo del pedido ni valores de datos personales.

#### Scenario: Error con datos personales en el mensaje
- **WHEN** una operación falla y el mensaje del error incluye un DNI
- **THEN** el registro conserva el código y el identificador del pedido
- **AND** el DNI aparece como `[REDACTADO]`

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
