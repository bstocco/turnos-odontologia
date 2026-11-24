import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import type { CryptoComunicacion } from '../../domain/comunicacion/puertos.js';
import { ErrorDeDominio } from '../../domain/shared/errores.js';

const BYTES_TOKEN_ACCION = 32;
const LONGITUD_CODIGO_POR_DEFECTO = 6;
const LONGITUD_MINIMA_CODIGO = 4;
const LONGITUD_MAXIMA_CODIGO = 12;

/** Genera un token aleatorio criptográficamente seguro de 256 bits en `base64url` (43 chars). */
export function generarTokenAleatorio(): string {
  return randomBytes(BYTES_TOKEN_ACCION).toString('base64url');
}

/**
 * Genera un código numérico uniforme en `[0, 10^longitud)` preservando ceros a la izquierda.
 * La longitud debe ser un entero entre 4 y 12.
 */
export function generarCodigoNumerico(longitud: number = LONGITUD_CODIGO_POR_DEFECTO): string {
  if (
    !Number.isInteger(longitud) ||
    longitud < LONGITUD_MINIMA_CODIGO ||
    longitud > LONGITUD_MAXIMA_CODIGO
  ) {
    throw new ErrorDeDominio(
      'PARAMETRO_INVALIDO',
      'solicitud_invalida',
      'La longitud del código de verificación debe ser un entero entre 4 y 12.',
    );
  }

  return randomInt(0, 10 ** longitud)
    .toString()
    .padStart(longitud, '0');
}

/** Calcula el hash SHA-256 en formato hexadecimal minúscula (64 caracteres). */
export function hashSha256(valor: string): string {
  return createHash('sha256').update(valor, 'utf8').digest('hex');
}

/**
 * Compara dos cadenas en tiempo constante mediante sus digests SHA-256 (32 bytes fijos),
 * evitando `RangeError` y filtración de longitud por retorno temprano.
 */
export function compararEnTiempoConstante(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a, 'utf8').digest();
  const digestB = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(digestA, digestB);
}

/** Adaptador de `CryptoComunicacion` respaldado por `node:crypto`. */
export const cryptoComunicacion: CryptoComunicacion = Object.freeze({
  generarTokenAleatorio,
  generarCodigoNumerico,
  hashSha256,
  compararEnTiempoConstante,
});
