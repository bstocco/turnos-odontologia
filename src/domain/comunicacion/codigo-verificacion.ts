import { ErrorDeDominio } from '../shared/errores.js';
import type { CryptoComunicacion } from './puertos.js';
import { exigirFechaValida, exigirTtlPositivo } from './validaciones.js';

export const LONGITUD_CODIGO_VERIFICACION = 6;
export const TTL_CODIGO_VERIFICACION_MS = 10 * 60 * 1000;
export const MAX_INTENTOS_CODIGO_VERIFICACION = 5;

const LONGITUD_MINIMA_CODIGO = 4;
const LONGITUD_MAXIMA_CODIGO = 12;

export interface CodigoVerificacionEmitido {
  readonly codigo: string;
  readonly hashCodigo: string;
  readonly venceEn: Date;
  readonly intentos: 0;
}

export interface RegistroCodigoVerificacion {
  readonly hashCodigo: string;
  readonly venceEn: Date;
  readonly intentos: number;
  readonly consumidoEn: Date | null;
}

export type MotivoCodigoVerificacionInvalido =
  'codigo_invalido' | 'intentos_agotados' | 'vencido' | 'ya_consumido';

export type ResultadoVerificacionCodigo =
  | {
      readonly valido: true;
      readonly consumidoEn: Date;
      readonly intentosActualizados: number;
      readonly agotado: false;
    }
  | {
      readonly valido: false;
      readonly motivo: MotivoCodigoVerificacionInvalido;
      readonly intentosActualizados: number;
      readonly agotado: boolean;
    };

/**
 * Emite un código numérico de verificación por email preservando ceros a la izquierda,
 * devolviendo el código en claro, su hash SHA-256, `intentos = 0` y su vencimiento.
 */
export function emitirCodigoVerificacion(params: {
  readonly ahora: Date;
  readonly crypto: CryptoComunicacion;
  readonly longitud?: number;
  readonly ttlMs?: number;
}): CodigoVerificacionEmitido {
  const ahoraMs = exigirFechaValida(
    params.ahora,
    'La fecha provista para el código de verificación no es válida.',
  );
  const longitud = params.longitud ?? LONGITUD_CODIGO_VERIFICACION;
  const ttlMs = exigirTtlPositivo(
    params.ttlMs ?? TTL_CODIGO_VERIFICACION_MS,
    'El tiempo de vigencia del código de verificación debe ser mayor a cero.',
  );

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

  const codigo = params.crypto.generarCodigoNumerico(longitud);
  const hashCodigo = params.crypto.hashSha256(codigo);

  return {
    codigo,
    hashCodigo,
    venceEn: new Date(ahoraMs + ttlMs),
    intentos: 0,
  };
}

/**
 * Verifica en forma pura un código OTP comparando su hash en tiempo constante
 * y controlando consumo previo, vencimiento y límite de intentos sin mutar el registro.
 */
export function verificarCodigoVerificacion(params: {
  readonly codigoIngresado: string;
  readonly registro: RegistroCodigoVerificacion;
  readonly ahora: Date;
  readonly crypto: CryptoComunicacion;
  readonly maxIntentos?: number;
}): ResultadoVerificacionCodigo {
  const ahoraMs = exigirFechaValida(
    params.ahora,
    'La fecha provista para verificar el código no es válida.',
  );
  const venceEnMs = exigirFechaValida(
    params.registro.venceEn,
    'La fecha de vencimiento del código de verificación no es válida.',
  );
  const maxIntentos = params.maxIntentos ?? MAX_INTENTOS_CODIGO_VERIFICACION;

  if (!Number.isInteger(maxIntentos) || maxIntentos < 1) {
    throw new ErrorDeDominio(
      'PARAMETRO_INVALIDO',
      'solicitud_invalida',
      'El límite máximo de intentos debe ser un entero positivo.',
    );
  }

  if (!Number.isInteger(params.registro.intentos) || params.registro.intentos < 0) {
    throw new ErrorDeDominio(
      'PARAMETRO_INVALIDO',
      'solicitud_invalida',
      'El contador de intentos del código de verificación es inválido.',
    );
  }

  if (params.registro.consumidoEn !== null) {
    return {
      valido: false,
      motivo: 'ya_consumido',
      intentosActualizados: params.registro.intentos,
      agotado: params.registro.intentos >= maxIntentos,
    };
  }

  if (ahoraMs >= venceEnMs) {
    return {
      valido: false,
      motivo: 'vencido',
      intentosActualizados: params.registro.intentos,
      agotado: params.registro.intentos >= maxIntentos,
    };
  }

  if (params.registro.intentos >= maxIntentos) {
    return {
      valido: false,
      motivo: 'intentos_agotados',
      intentosActualizados: params.registro.intentos,
      agotado: true,
    };
  }

  const hashIngresado = params.crypto.hashSha256(params.codigoIngresado);
  if (!params.crypto.compararEnTiempoConstante(hashIngresado, params.registro.hashCodigo)) {
    const intentosActualizados = params.registro.intentos + 1;
    return {
      valido: false,
      motivo: 'codigo_invalido',
      intentosActualizados,
      agotado: intentosActualizados >= maxIntentos,
    };
  }

  return {
    valido: true,
    consumidoEn: new Date(ahoraMs),
    intentosActualizados: params.registro.intentos,
    agotado: false,
  };
}
