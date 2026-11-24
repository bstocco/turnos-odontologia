import { randomBytes } from 'node:crypto';

import { hashSha256 } from '../crypto/index.js';

/**
 * Tokens de refresco del personal (diseño DD-03): opaques, rotativos y revocables.
 * Se guarda en `token_refresco` solo su hash (`hashSha256`); el token lleva su clínica
 * embebida para que el repositorio lo abra con `withTenant`.
 */

interface TokenRefrescoPlano {
  readonly c: string;
  readonly t: string;
}

export interface TokenDeRefrescoCreado {
  /** Token opaco que va al cliente. */
  readonly token: string;
  /** Hash del token: lo que busca el repositorio en `token_refresco`. */
  readonly hash: string;
  /** Fecha de vencimiento del token. */
  readonly venceEn: Date;
}

/** Crea el token de refresco para una clínica: devuelve el token opaco y su hash. */
export function crearTokenDeRefresco(clinicaId: string): TokenDeRefrescoCreado {
  const tokenPlano: TokenRefrescoPlano = {
    c: clinicaId,
    t: randomBytes(32).toString('hex'),
  };
  const token = Buffer.from(JSON.stringify(tokenPlano), 'utf8').toString('base64url');
  return {
    token,
    hash: hashSha256(token),
    venceEn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };
}

/** Extrae la clínica embebida en el token de refresco (el contexto del repositorio). */
export function clinicaDeTokenDeRefresco(token: string): string | undefined {
  try {
    const decodificado = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
      c?: string;
    };
    return typeof decodificado.c === 'string' ? decodificado.c : undefined;
  } catch {
    return undefined;
  }
}
