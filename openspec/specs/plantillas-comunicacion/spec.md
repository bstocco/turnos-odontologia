# plantillas-comunicacion Specification

## Purpose

Define plantillas puras en español para mensajes de email y WhatsApp de turnos y verificación, con formateo de fechas en la zona horaria IANA de la clínica.

## Requirements

### Requirement: Plantillas puras de mensajes en español
El dominio SHALL proveer funciones puras en español para construir mensajes de creación de turno, confirmación, cancelación, reprogramación, recordatorio por email, código de verificación por email y recordatorio por WhatsApp, sin operaciones de I/O ni lectura implícita del reloj o zona del sistema.

#### Scenario: Plantilla de creación de turno
- **WHEN** se genera el mensaje de creación de turno para estado `pendiente_confirmacion` o `confirmado` con clínica, paciente, profesional, prestación, instante y enlaces opcionales de acción
- **THEN** devuelve `asunto` y `cuerpo` en español reflejando el estado inicial e incluyendo únicamente los enlaces provistos

#### Scenario: Plantillas de confirmación, cancelación y reprogramación
- **WHEN** se generan mensajes de confirmación, cancelación (con o sin motivo) o reprogramación (con fecha/hora anterior y nueva)
- **THEN** cada función devuelve `asunto` y `cuerpo` en español con los datos propios de la operación

#### Scenario: Plantillas de recordatorio por email y por WhatsApp
- **WHEN** se generan los mensajes de recordatorio por email (con enlaces opcionales) y de recordatorio manual por WhatsApp
- **THEN** el recordatorio por email devuelve `asunto` y `cuerpo` en español y el de WhatsApp devuelve un texto en español listo para `wa.me`

#### Scenario: Plantilla de código de verificación por email
- **WHEN** se genera el mensaje de verificación con el nombre de la clínica, el código numérico y la vigencia en minutos
- **THEN** devuelve `asunto` y `cuerpo` en español mostrando el código exacto con sus ceros a la izquierda y el tiempo de expiración

### Requirement: Formateo de fechas en zona horaria IANA
El sistema SHALL interpretar y formatear todos los instantes UTC de turnos en la zona horaria IANA explícita de la clínica (por defecto `America/Argentina/Buenos_Aires`), sin desplazamientos fijos, rechazando zonas horarias inválidas con un error tipado.

#### Scenario: Cruce de día respecto a UTC
- **WHEN** se formatea el instante `2026-06-15T01:30:00Z` en la zona `America/Argentina/Buenos_Aires`
- **THEN** el texto generado muestra la fecha `14/06/2026` y la hora `22:30` en la zona local de la clínica

#### Scenario: Rechazo de zona horaria IANA inválida
- **WHEN** se pasa una zona horaria inexistente o un desplazamiento fijo inválido como `America/NoExiste`
- **THEN** la operación falla con el error tipado `ZONA_HORARIA_INVALIDA` de tipo solicitud inválida

### Requirement: Saneamiento de asunto y privacidad en plantillas
El asunto de todo email generado MUST NOT contener caracteres de salto de línea (`\r` o `\n`), y las plantillas MUST NOT incluir el DNI ni la obra social del paciente.

#### Scenario: Saneamiento de saltos de línea en el asunto
- **WHEN** el nombre de la clínica o dato interpolado en el asunto contiene `\r` o `\n`
- **THEN** el `asunto` devuelto normaliza esos caracteres a espacio simple y no contiene `\r` ni `\n`

#### Scenario: Exclusión de DNI y obra social
- **WHEN** se genera cualquiera de las plantillas de email o WhatsApp
- **THEN** el contrato de entrada y el texto resultante no solicitan ni emiten DNI ni obra social del paciente
