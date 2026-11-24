# Design

## Context

Punto de partida (ver `proposal.md` para motivación y `specs/*/spec.md` para el contrato observable):

- `C-01` (`c-01-foundation-setup`) ya fusionado: proyecto TypeScript estricto sobre Node 22 (ESM con resolución `NodeNext`), `ErrorDeDominio` en `src/domain/shared/errores.ts`, redactor de logs en `src/infrastructure/logging/redactor.ts` y suites Vitest + `fast-check` en `test/unit/**`.
- KB: `RN-NO-02`, `RN-NO-04`, `RN-PA-03`, `RN-RE-05`, `RN-RE-06`, `RN-DA-01`, `RN-DA-03`, `DD-03`, `DD-06`, `DD-07`, `DD-08` y `DD-12`.
- Restricciones del proyecto:
  - Frontera hexagonal verificada por ESLint (`eslint.config.mjs`): `src/domain/**` no puede importar `infrastructure`, `application` ni `interfaces`; `src/application/**` tampoco puede importar `infrastructure` ni `interfaces`.
  - Ley 25.326 (regla dura 1) y hallazgo en `src/infrastructure/logging/redactor.ts`: `limpiarTexto` enmascara emails y DNIs de 7–8 dígitos en mensajes de error, pero **no** enmascara teléfonos de 10–13 dígitos ni códigos OTP de 6 dígitos; por ello ningún error de C-04 debe interpolar teléfonos, enlaces, tokens ni códigos.
  - Sin nuevas dependencias de npm (regla 14): C-04 utiliza exclusivamente `node:crypto` e `Intl.DateTimeFormat` nativos de Node 22.
  - Zona exclusiva del change: `src/domain/comunicacion/**`, `src/infrastructure/crypto/**` y `test/unit/comunicacion/**`.

## Goals / Non-Goals

**Goals:**
- Proveer utilidades puras en TypeScript sin I/O ni lectura implícita del reloj para normalización de celulares argentinos, enlaces `wa.me`, plantillas en español con zona horaria IANA y reglas de tokens de acción y códigos OTP por email.
- Aislar las primitivas criptográficas (`node:crypto`) detrás de un puerto de dominio para mantener intactas las fronteras hexagonales tanto en C-04 como en futuros casos de uso (`C-14`, `C-15`).
- Garantizar trazabilidad sin filtración de PII en errores ni resultados discriminados.

**Non-Goals:**
- No implementar cola `pg-boss`, worker ni cliente SMTP/Resend/Brevo (`C-11`).
- No definir migraciones SQL ni persistencia de `notificacion`, `token_accion` o `codigo_verificacion` (`C-11`, `C-15`).
- No exponer endpoints HTTP (`C-10`, `C-12`, `C-15`) ni implementar JWT/argon2id (`C-06`).
- No normalizar teléfonos internacionales fuera de Argentina ni líneas fijas no celulares en el MVP.

## UI Mockups

Decision: no (no UI)

El MVP es una API REST sin interfaz gráfica y este change provee únicamente utilidades puras de dominio y primitivas criptográficas.

## Decisions

### D1. Separación hexagonal con puerto `CryptoComunicacion`
- `src/domain/comunicacion/puertos.ts` define la interfaz `CryptoComunicacion` (`generarTokenAleatorio`, `generarCodigoNumerico`, `hashSha256`, `compararEnTiempoConstante`).
- `src/infrastructure/crypto/index.ts` implementa el adaptador concreto `cryptoComunicacion` sobre `node:crypto` y exporta además sus funciones individuales (reutilizable también para comparar `ADMIN_INTERNAL_KEY` en `C-17`).
- *Justificación*: `eslint.config.mjs` prohíbe que `src/domain/**` y `src/application/**` importen `**/infrastructure/**`. Definir el puerto en dominio permite que la lógica pura de tokens/OTP y los futuros casos de uso en `src/application/**` (`C-15`) consuman criptografía segura sin romper capas y con dobles determinísticos simples en pruebas unitarias.
- *Alternativa descartada*: importar `node:crypto` dentro de `src/domain/comunicacion/` (acoplaría el dominio al runtime de Node y dificultaría testear casos límite como ceros iniciales en OTP).

### D2. Normalización determinística de celulares argentinos (`normalizarTelefonoAr`)
- Según el Plan de Numeración Nacional (ENACOM), todo celular argentino válido posee 10 dígitos significativos tras el prefijo internacional móvil `549`: código de área (`2`, `3` o `4` dígitos) seguido del número local (`8`, `7` o `6` dígitos), dando siempre un resultado canónico de 13 dígitos (`^549\d{10}$`).
- Reglas de normalización:
  1. Validar caracteres permitidos (solo dígitos, espacios, guiones, paréntesis y un `+` opcional al inicio). Rechazar de inmediato prefijos internacionales distintos de `+54` o entradas vacías/con letras.
  2. Quitar `+54` o `54` inicial cuando corresponda, el indicador `9` móvil internacional si acompaña a `54` con longitud suficiente, y el `0` de discado nacional.
  3. Detectar el código de área nacional:
     - `11` (AMBA, 2 dígitos).
     - Lista explícita de los 37 códigos de área de 3 dígitos vigentes en Argentina: `220, 221, 223, 230, 236, 237, 249, 260, 261, 263, 264, 266, 280, 291, 294, 297, 298, 299, 341, 342, 343, 345, 348, 351, 353, 358, 362, 364, 370, 376, 379, 380, 381, 383, 385, 387, 388`.
     - Códigos de área de 4 dígitos que comienzan con `2` o `3` y no coinciden con la lista de 3 dígitos ni con `11`.
  4. Quitar una única vez el prefijo `15` si abre la porción local posterior al área.
  5. Exigir longitud exacta `codigoArea.length + abonado.length === 10` y que `abonado` no comience con `0` ni con `15` (detecta entradas truncadas o con doble prefijo manteniendo compatibilidad con datos sintéticos como `11 1234-5678`), devolviendo `549${codigoArea}${abonado}`.
- *Justificación*: soporta todas las variantes locales e internacionales argentinas (`011 15...`, `0351 15...`, `02920 15...`, `+54 9 11...`, `549...` idempotente) con reglas explícitas y cero dependencias externas.
- *Alternativa descartada*: sumar `libphonenumber-js` (agregaría una dependencia a `package.json`, contra la convención de no modificar dependencias desde los changes de implementadores).

### D3. Enlaces click-to-chat de WhatsApp (`construirEnlaceWhatsapp`)
- Reutiliza `normalizarTelefonoAr(telefono)`, exige mensaje no vacío tras `trim()` (`MENSAJE_VACIO`) y retorna `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`.
- *Justificación*: cumple el formato oficial `wa.me` sin `+` y codifica de manera uniforme espacios, tildes, `ñ`, saltos de línea y símbolos reservados.
- *Alternativa descartada*: `URLSearchParams` (convierte espacios en `+`, comportamiento menos uniforme entre clientes móviles de WhatsApp que `%20`).

### D4. Plantillas puras en español y formateo de tiempo IANA (`plantillas.ts`)
- Se implementan 7 funciones puras en español: `plantillaCreacionTurno`, `plantillaConfirmacionTurno`, `plantillaCancelacionTurno`, `plantillaReprogramacionTurno`, `plantillaRecordatorioTurno`, `plantillaCodigoVerificacion` y `plantillaRecordatorioWhatsapp`. Se incluye reprogramación de forma preventiva para `C-14` (Flujo 5).
- Formateo de instantes UTC con `Intl.DateTimeFormat('es-AR', { timeZone, ... })` validando que `zonaHoraria` sea una zona IANA válida (por defecto `America/Argentina/Buenos_Aires`) o lanzando `ZONA_HORARIA_INVALIDA` (`RN-DA-03`, `DD-07`).
- Todo `asunto` reemplaza `[\r\n]+` por espacio simple y recorta extremos para evitar inyección de cabeceras; los tipos de entrada no aceptan DNI ni obra social.
- *Alternativa descartada*: librerías de fechas (`luxon`, `date-fns-tz`), innecesarias con el soporte IANA nativo de Node 22.

### D5. Primitivas criptográficas sobre `node:crypto` (`src/infrastructure/crypto/index.ts`)
- `generarTokenAleatorio()`: `randomBytes(32).toString('base64url')` (256 bits exactos, 43 caracteres URL-safe sin relleno `=`).
- `generarCodigoNumerico(longitud = 6)`: valida entero en `[4, 12]` (`PARAMETRO_INVALIDO`) y usa `randomInt(0, 10 ** longitud).toString().padStart(longitud, '0')` (uniforme, sin sesgo de módulo, dentro del límite seguro de `randomInt`).
- `hashSha256(valor)`: `createHash('sha256').update(valor, 'utf8').digest('hex')`.
- `compararEnTiempoConstante(a, b)`: calcula el digest SHA-256 (32 bytes fijos) de ambos strings UTF-8 y ejecuta `timingSafeEqual`.
- *Justificación*: comparar digests de longitud fija evita el `RangeError` de `timingSafeEqual` y no filtra la longitud de secretos mediante un retorno temprano.
- *Alternativa descartada*: codificación `hex` para tokens (64 caracteres frente a 43 de `base64url` para la misma entropía de 256 bits) o retorno temprano si `a.length !== b.length`.

### D6. Defaults operativos, reloj explícito y resultados discriminados
- Constantes exportadas como valores por defecto (parametrizables por el llamador y sujetas a confirmación en revisión de este diseño **ALTO**):
  - `TTL_TOKEN_ACCION_MS`: 48 horas (`48 * 60 * 60 * 1000`).
  - `LONGITUD_CODIGO_VERIFICACION`: `6` dígitos.
  - `TTL_CODIGO_VERIFICACION_MS`: 10 minutos (`10 * 60 * 1000`).
  - `MAX_INTENTOS_CODIGO_VERIFICACION`: `5` intentos.
- Toda función recibe `ahora: Date` y `crypto: CryptoComunicacion` de forma explícita.
- En `validarTokenAccion`, la comparación en tiempo constante del hash se ejecuta siempre en primer lugar (`hash_invalido`), seguida por `proposito_invalido`, `ya_usado` y `vencido` (`ahora >= venceEn`).
- En `verificarCodigoVerificacion`, los estados terminales (`ya_consumido`, `vencido`, `intentos_agotados`) no incrementan `intentos`; los códigos incorrectos incrementan `intentosActualizados` y señalan `agotado = intentosActualizados >= maxIntentos`; el acierto devuelve `consumidoEn: ahora` sin mutar el registro recibido.
- *Justificación*: los resultados discriminados permiten a `C-15` auditar la causa exacta internamente mientras devuelve respuestas HTTP genéricas (`404`/`410`/`422`) hacia el cliente público.

### D7. Errores tipados y estructura de archivos
- Se utilizan instancias de `ErrorDeDominio` de `src/domain/shared/errores.ts` con tipo `'solicitud_invalida'` y códigos `TELEFONO_INVALIDO`, `MENSAJE_VACIO`, `ZONA_HORARIA_INVALIDA`, `TTL_INVALIDO` y `PARAMETRO_INVALIDO`, siempre con mensajes estáticos sin datos del usuario.
- Archivos previstos dentro de la zona de C-04:
  - Dominio: `src/domain/comunicacion/{telefono,whatsapp,plantillas,puertos,token-accion,codigo-verificacion,index}.ts`
  - Infraestructura: `src/infrastructure/crypto/index.ts`
  - Tests unitarios y de propiedades: `test/unit/comunicacion/{telefono,whatsapp,plantillas,crypto,token-accion,codigo-verificacion}.test.ts`

## Risks / Trade-offs

- **Mantenimiento manual de códigos de área de 3 dígitos (ENACOM)** → Mitigación: lista explícita con pruebas sobre áreas de 2, 3 y 4 dígitos y propiedades `fast-check`; ampliar un prefijo nuevo es un cambio de una línea.
- **Teléfonos internacionales o líneas fijas no celulares rechazados en MVP** → Mitigación: responde a `RN-NO-04` y al alcance argentino del MVP; una eventual expansión internacional agregará una variante separada sin romper `normalizarTelefonoAr`.
- **Concurrencia al consumir tokens o incrementar intentos OTP** → Mitigación: C-04 provee transiciones puras sin estado; `C-15` debe ejecutar lectura y actualización bajo transacción con bloqueo de fila (`SELECT ... FOR UPDATE`) dentro de `withTenant`.
- **Vigencias y topes definidos por defecto (48 hs, 10 min, 6 dígitos, 5 intentos)** → Mitigación: son opciones parametrizables en cada función y se destacan en la revisión de gobernanza ALTO para validación del equipo.

## Migration Plan

1. Revisión y aprobación de este diseño (`ALTO`) antes de iniciar `openspec-apply-change`.
2. Implementación con ciclo TDD estricto en la rama `change/C-04-utilidades-comunicacion-y-tokens` (sin migraciones SQL ni cambios en esquemas de PostgreSQL).
3. Verificación con `npm run lint`, `npm run format:check`, `npm run typecheck` y `npm run test:unit`.
4. Rollback: en caso de necesitar revertir antes de integrar consumidores (`C-10`, `C-11`, `C-12`, `C-14`, `C-15`), basta con eliminar los archivos nuevos en `src/domain/comunicacion/`, `src/infrastructure/crypto/` y `test/unit/comunicacion/`.
