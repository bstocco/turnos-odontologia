import { ErrorDeDominio } from '../shared/errores.js';

/** Verifica que un valor sea una instancia `Date` finita y devuelve su marca Unix en ms. */
export function exigirFechaValida(fecha: Date, mensaje: string): number {
  if (!(fecha instanceof Date) || !Number.isFinite(fecha.getTime())) {
    throw new ErrorDeDominio('PARAMETRO_INVALIDO', 'solicitud_invalida', mensaje);
  }
  return fecha.getTime();
}

/** Verifica que un tiempo de vida (TTL) en milisegundos sea finito y estrictamente positivo. */
export function exigirTtlPositivo(ttlMs: number, mensaje: string): number {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new ErrorDeDominio('TTL_INVALIDO', 'solicitud_invalida', mensaje);
  }
  return ttlMs;
}
