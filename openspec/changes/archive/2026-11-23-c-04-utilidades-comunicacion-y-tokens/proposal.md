# Proposal

## Why

El change C-04 `utilidades-comunicacion-y-tokens` construye las utilidades puras de comunicación en español y las primitivas criptográficas compartidas que desbloquean los módulos posteriores de pacientes (`C-10`), cola/email (`C-11`), enlace de WhatsApp (`C-12`), recordatorios de turnos (`C-14`) y reserva pública con validación por email y enlaces de acción (`C-15`). Implementa los fundamentos de `RN-NO-02`, `RN-NO-04`, `RN-PA-03`, `RN-RE-05`, `RN-RE-06`, `DD-03`, `DD-07` y `DD-12`. Depende únicamente de `C-01` (archivado) y se ejecuta en GATE 1 en paralelo con `C-02` y `C-03`; por su gobernanza **ALTO**, su diseño se acuerda antes de escribir código.

## What Changes

- **Normalización de teléfonos celulares argentinos (`normalizarTelefonoAr`)**: convierte entradas locales o internacionales argentinas al formato `549` + código de área + número local (13 dígitos, sin `+`, `0` inicial ni `15`) y rechaza números inválidos sin incluir el teléfono en mensajes de error (`RN-NO-04`, `RN-PA-03`).
- **Construcción de enlaces click-to-chat de WhatsApp (`construirEnlaceWhatsapp`)**: normaliza el teléfono y genera `https://wa.me/<numero>?text=<mensaje codificado>` con `encodeURIComponent` (`RN-NO-02`, Flujo 8).
- **Plantillas puras de comunicación en español**: funciones puras para creación de turno, confirmación, cancelación, reprogramación, recordatorio por email, código de verificación por email y recordatorio por WhatsApp, con formateo de fechas en la zona horaria IANA de la clínica (`RN-DA-03`, `DD-07`) y saneamiento de cabeceras de asunto.
- **Puerto de dominio y primitivas criptográficas (`src/infrastructure/crypto/`)**: define el puerto puro `CryptoComunicacion` en el dominio y su adaptador sobre `node:crypto` para generación aleatoria de tokens de 256 bits (`base64url`), códigos numéricos uniformes (`randomInt`), hash SHA-256 y comparación en tiempo constante segura ante longitudes distintas.
- **Tokens de acción de un solo uso**: emisión y validación pura para propósitos `confirmar` y `cancelar`, verificando hash en tiempo constante, propósito, uso único y vencimiento explícito (`RN-RE-06`, `DD-03`).
- **Códigos de verificación por email (OTP)**: emisión numérica (preservando ceros a la izquierda) y verificación pura con hash en tiempo constante, vencimiento, consumo único, límite de intentos y estado de agotamiento (`RN-RE-05`, `DD-12`).
- **Pruebas unitarias y basadas en propiedades (`fast-check`)**: verificación en `test/unit/comunicacion/**` con datos exclusivamente sintéticos (`RN-DA-01`).

## Capabilities

### New Capabilities

- `telefono-whatsapp`: normalización de teléfonos celulares argentinos a formato internacional `wa.me` (`549` + área + número sin `15`), validación sin exposición de PII y generación de enlaces click-to-chat.
- `plantillas-comunicacion`: plantillas puras de mensajes en español para email y WhatsApp con formateo de instantes UTC en zona horaria IANA, saneamiento de asunto y resguardo de privacidad.
- `tokens-de-accion`: primitivas criptográficas seguras y emisión/validación pura de tokens de acción aleatorios de 256 bits de un solo uso para `confirmar` y `cancelar`.
- `codigos-verificacion-email`: emisión y validación pura de códigos numéricos OTP por email con hash SHA-256, vencimiento y control de intentos.

### Modified Capabilities

<!-- Ninguna: no se modifican capabilities existentes en openspec/specs/. -->

## Impact

- **Código (zona exclusiva de C-04)**: `src/domain/comunicacion/**`, `src/infrastructure/crypto/**` y `test/unit/comunicacion/**`.
- **Base de datos y dependencias**: sin migraciones SQL, sin cambios en `package.json` ni `package-lock.json` (utiliza `node:crypto` e `Intl.DateTimeFormat` nativos de Node 22).
- **Interfaces / UI**: sin endpoints HTTP ni interfaz gráfica en este change.
- **Consumidores posteriores**: `C-10` (normalización de teléfonos de pacientes), `C-11` (base de notificaciones), `C-12` (`GET /turnos/{id}/enlace-whatsapp`), `C-14` (notificaciones automáticas de turno) y `C-15` (reserva pública con OTP y tokens de acción); la comparación en tiempo constante queda además disponible para `C-17` (`ADMIN_INTERNAL_KEY`).
- **Fuera de alcance**: cola `pg-boss` y envío real de emails (`C-11`), persistencia de `token_accion` y `codigo_verificacion` (`C-15`), rutas HTTP (`C-10`, `C-12`, `C-15`), autenticación JWT/argon2id del personal (`C-06`) y teléfonos extranjeros fuera de Argentina.
