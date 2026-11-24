/**
 * Puerto criptográfico para tokens de acción, códigos de verificación y comparación segura.
 * Mantiene `src/domain` y `src/application` aislados de `node:crypto` e infraestructura.
 */
export interface CryptoComunicacion {
  generarTokenAleatorio(): string;
  generarCodigoNumerico(longitud?: number): string;
  hashSha256(valor: string): string;
  compararEnTiempoConstante(a: string, b: string): boolean;
}
