# Tasks

## 1. Normalización de teléfonos argentinos y enlace WhatsApp

- [ ] 1.1 Implementar `normalizarTelefonoAr` en `src/domain/comunicacion/telefono.ts` con tabla de prefijos ENACOM (2, 3 y 4 dígitos), eliminación de `+`, `0` y `15` y error tipado `TELEFONO_INVALIDO` sin interpolar el número; cubrir con pruebas unitarias y basadas en propiedades (`fast-check`) en `test/unit/comunicacion/telefono.test.ts` (formatos con/sin `15`, `0`, `+54`, `+54 9`, idempotencia y rechazos). Verificar: `npx vitest run --project unit test/unit/comunicacion/telefono.test.ts` en verde y el mensaje de `ErrorDeDominio` no contiene dígitos del teléfono de entrada.
- [ ] 1.2 Implementar `construirEnlaceWhatsapp` en `src/domain/comunicacion/whatsapp.ts` reutilizando `normalizarTelefonoAr`, validación `MENSAJE_VACIO` y codificación `encodeURIComponent`; cubrir con pruebas en `test/unit/comunicacion/whatsapp.test.ts` (tildes, `ñ`, saltos de línea, `&`, `?`, `#`, errores). Verificar: `npx vitest run --project unit test/unit/comunicacion/whatsapp.test.ts` en verde.

## 2. Plantillas puras de comunicación en español

- [ ] 2.1 Implementar el formateador de fechas en zona horaria IANA (`ZONA_HORARIA_INVALIDA`), el saneamiento de asunto (sin `\r` ni `\n`) y las 7 plantillas puras en español (`plantillaCreacionTurno`, `plantillaConfirmacionTurno`, `plantillaCancelacionTurno`, `plantillaReprogramacionTurno`, `plantillaRecordatorioTurno`, `plantillaCodigoVerificacion`, `plantillaRecordatorioWhatsapp`) en `src/domain/comunicacion/plantillas.ts`; probar todos los casos en `test/unit/comunicacion/plantillas.test.ts` (incluyendo cruce de día UTC→`America/Argentina/Buenos_Aires`, ceros a la izquierda en OTP, ausencia de DNI/obra social y saneamiento de saltos de línea). Verificar: `npx vitest run --project unit test/unit/comunicacion/plantillas.test.ts` en verde.

## 3. Puerto de dominio y primitivas criptográficas

- [ ] 3.1 Definir la interfaz `CryptoComunicacion` en `src/domain/comunicacion/puertos.ts` e implementar las primitivas criptográficas sobre `node:crypto` (`generarTokenAleatorio` de 256 bits en `base64url`, `generarCodigoNumerico` con `randomInt`, `hashSha256`, `compararEnTiempoConstante` por comparación de digests de 32 bytes con `timingSafeEqual`, y el adaptador `cryptoComunicacion`) en `src/infrastructure/crypto/index.ts`; probar entropía, formato, preservación de ceros, longitudes distintas y UTF-8 multibyte en `test/unit/comunicacion/crypto.test.ts`. Verificar: `npx vitest run --project unit test/unit/comunicacion/crypto.test.ts` y `npm run lint` en verde (sin imports cruzados en `domain`).

## 4. Tokens de acción y códigos de verificación por email

- [ ] 4.1 Implementar `emitirTokenAccion` y `validarTokenAccion` en `src/domain/comunicacion/token-accion.ts` (defaults `48` horas, propósitos `confirmar` | `cancelar`, reloj explícito `ahora: Date`, validación de `TTL_INVALIDO`, precedencia `hash_invalido` → `proposito_invalido` → `ya_usado` → `vencido`); probar todos los escenarios y bordes temporales (`venceEn - 1ms` vs `venceEn`) en `test/unit/comunicacion/token-accion.test.ts`. Verificar: `npx vitest run --project unit test/unit/comunicacion/token-accion.test.ts` en verde.
- [ ] 4.2 Implementar `emitirCodigoVerificacion` y `verificarCodigoVerificacion` en `src/domain/comunicacion/codigo-verificacion.ts` (defaults `6` dígitos, `10` minutos y `5` intentos; validación de `TTL_INVALIDO` / `PARAMETRO_INVALIDO`; resultado discriminado con `intentosActualizados`, `agotado` y `consumidoEn` sin mutar entrada); probar casos válidos, ceros iniciales, intentos progresivos, agotamiento, vencimiento y reuso en `test/unit/comunicacion/codigo-verificacion.test.ts`. Verificar: `npx vitest run --project unit test/unit/comunicacion/codigo-verificacion.test.ts` en verde.
- [ ] 4.3 Exportar la API pública del módulo de comunicación desde `src/domain/comunicacion/index.ts` verificando compatibilidad con `verbatimModuleSyntax` y extensión `.js` (`NodeNext`). Verificar: `npm run typecheck` en verde.

## 5. Verificación integral y cierre de calidad

- [ ] 5.1 Ejecutar la batería completa de verificación del proyecto (`npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run test:unit`) y confirmar que ningún archivo fuera de la zona de C-04 (`src/domain/comunicacion/**`, `src/infrastructure/crypto/**`, `test/unit/comunicacion/**`) fue modificado, que `src/domain/comunicacion/**` no importa `node:crypto` ni `infrastructure`, y que los errores de dominio no exponen PII ni secretos. Verificar: todos los comandos salen con código `0` y `openspec status --change c-04-utilidades-comunicacion-y-tokens --json` confirma todos los artefactos completos.
