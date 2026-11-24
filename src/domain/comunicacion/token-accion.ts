import type { CryptoComunicacion } from './puertos.js';
import { exigirFechaValida, exigirTtlPositivo } from './validaciones.js';

export const TTL_TOKEN_ACCION_MS = 48 * 60 * 60 * 1000;

export type PropositoTokenAccion = 'confirmar' | 'cancelar';

export interface TokenAccionEmitido {
  readonly token: string;
  readonly hashToken: string;
  readonly proposito: PropositoTokenAccion;
  readonly venceEn: Date;
}

export interface RegistroTokenAccion {
  readonly proposito: PropositoTokenAccion;
  readonly hashToken: string;
  readonly venceEn: Date;
  readonly usadoEn: Date | null;
}

export type MotivoTokenAccionInvalido =
  'hash_invalido' | 'proposito_invalido' | 'ya_usado' | 'vencido';

export type ResultadoValidacionTokenAccion =
  | { readonly valido: true }
  | { readonly valido: false; readonly motivo: MotivoTokenAccionInvalido };

/**
 * Emite un token aleatorio de 256 bits de un solo uso para `confirmar` o `cancelar`,
 * devolviendo el token en claro para envío y su hash SHA-256 para persistencia.
 */
export function emitirTokenAccion(params: {
  readonly proposito: PropositoTokenAccion;
  readonly ahora: Date;
  readonly crypto: CryptoComunicacion;
  readonly ttlMs?: number;
}): TokenAccionEmitido {
  const ahoraMs = exigirFechaValida(
    params.ahora,
    'La fecha provista para el token de acción no es válida.',
  );
  const ttlMs = exigirTtlPositivo(
    params.ttlMs ?? TTL_TOKEN_ACCION_MS,
    'El tiempo de vigencia del token de acción debe ser mayor a cero.',
  );

  const token = params.crypto.generarTokenAleatorio();
  const hashToken = params.crypto.hashSha256(token);

  return {
    token,
    hashToken,
    proposito: params.proposito,
    venceEn: new Date(ahoraMs + ttlMs),
  };
}

/**
 * Valida en forma pura un token de acción comparando su hash en tiempo constante
 * y verificando propósito, uso único y vigencia estricta (`ahora < venceEn`).
 */
export function validarTokenAccion(params: {
  readonly tokenPlano: string;
  readonly propositoEsperado: PropositoTokenAccion;
  readonly registro: RegistroTokenAccion;
  readonly ahora: Date;
  readonly crypto: CryptoComunicacion;
}): ResultadoValidacionTokenAccion {
  const ahoraMs = exigirFechaValida(
    params.ahora,
    'La fecha provista para validar el token no es válida.',
  );
  const venceEnMs = exigirFechaValida(
    params.registro.venceEn,
    'La fecha de vencimiento del token no es válida.',
  );

  const hashRecibido = params.crypto.hashSha256(params.tokenPlano);
  if (!params.crypto.compararEnTiempoConstante(hashRecibido, params.registro.hashToken)) {
    return { valido: false, motivo: 'hash_invalido' };
  }

  if (params.registro.proposito !== params.propositoEsperado) {
    return { valido: false, motivo: 'proposito_invalido' };
  }

  if (params.registro.usadoEn !== null) {
    return { valido: false, motivo: 'ya_usado' };
  }

  if (ahoraMs >= venceEnMs) {
    return { valido: false, motivo: 'vencido' };
  }

  return { valido: true };
}
