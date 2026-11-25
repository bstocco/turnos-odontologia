# puerto-y-adaptadores-email Specification

## Purpose

Define el puerto hexagonal de envío de correos electrónicos, la clasificación de errores transitorios frente a definitivos sin exposición de datos personales ni credenciales, el adaptador SMTP real neutral respecto al proveedor y el adaptador falso determinista para pruebas.

## Requirements

### Requirement: Puerto hexagonal de envío de email y errores tipados sin PII
The application layer SHALL define an infrastructure-agnostic email sender port accepting a recipient address, subject, and plain-text body (with optional HTML body) and returning a provider message identifier, along with a typed error class that indicates whether a delivery failure is retryable without exposing email addresses, message bodies, or API keys in error messages.

#### Scenario: Envío exitoso a través del puerto devuelve identificador de proveedor
- **WHEN** se invoca al puerto de envío de email con destinatario, asunto y cuerpo válidos
- **THEN** el adaptador realiza la entrega y devuelve un resultado con el identificador asignado por el proveedor

#### Scenario: Clasificación explícita de fallos transitorios y definitivos sin filtrar datos personales
- **WHEN** el proveedor falla por indisponibilidad temporal o límite de tasa frente a un fallo permanente de autenticación o dirección rechazada
- **THEN** el adaptador lanza un error tipado con código estable y marca `reintentable = true` para fallos transitorios o `reintentable = false` para fallos definitivos
- **AND** ni el mensaje ni las propiedades serializadas del error contienen direcciones de correo, claves de API ni el contenido del mensaje

### Requirement: Adaptador SMTP con nodemailer neutral entre proveedores
The email infrastructure SHALL provide an SMTP adapter built on `nodemailer` capable of operating with Resend or Brevo SMTP endpoints (defaulting to the Resend SMTP preset backed by `EMAIL_API_KEY` and `EMAIL_FROM`), failing fast on missing or invalid configuration without leaking secrets, sanitizing newline characters in email subjects, and mapping SMTP/network failures to retryable or permanent email errors.

#### Scenario: Validación temprana de configuración SMTP sin exponer secretos
- **WHEN** se construye el adaptador SMTP real faltando `EMAIL_API_KEY`, faltando `EMAIL_FROM` o con un formato de remitente inválido
- **THEN** la construcción falla de inmediato con un error tipado que nombra la configuración faltante o inválida
- **AND** el mensaje de error nunca incluye valores de `EMAIL_API_KEY` ni direcciones completas

#### Scenario: Saneamiento de saltos de línea en el asunto antes del envío SMTP
- **WHEN** se envía un mensaje cuyo asunto contiene caracteres `\r` o `\n`
- **THEN** el adaptador normaliza esos caracteres a espacios simples antes de entregarlo al transporte SMTP

#### Scenario: Mapeo de códigos SMTP y errores de red a reintentable o permanente
- **WHEN** el transporte SMTP responde con error temporal de red, timeout, código `4xx` o `429` frente a un código `5xx` o fallo de autenticación `535`
- **THEN** los errores temporales, de red y `4xx`/`429` se mapean con `reintentable = true`
- **AND** los errores `5xx` y credenciales inválidas se mapean con `reintentable = false`

### Requirement: Adaptador falso determinista para pruebas automatizadas
The email infrastructure SHALL provide a deterministic in-memory fake email sender adapter that records sent messages for assertions, supports configuring consecutive transient failures before succeeding as well as permanent failures, and allows resetting its state without network calls.

#### Scenario: Registro de mensajes y simulación de fallos transitorios seguidos de éxito
- **WHEN** se configura el adaptador falso para fallar de forma transitoria N veces antes de aceptar el envío
- **THEN** los primeros N intentos rechazan con error tipado `reintentable = true` sin registrar el mensaje como enviado
- **AND** el intento N+1 tiene éxito, devuelve un identificador sintético y registra el mensaje en memoria

#### Scenario: Simulación de fallo permanente y reinicio entre pruebas
- **WHEN** se configura el adaptador falso para rechazar con un fallo permanente o se invoca su limpieza entre pruebas
- **THEN** los envíos rechazan con `reintentable = false` sin quedar marcados como enviados
- **AND** tras reiniciar su estado el historial de mensajes y reglas de fallo queda vacío
