import { describe, expect, it, vi } from 'vitest';

import {
  LONGITUD_CODIGO_VERIFICACION,
  MAX_INTENTOS_CODIGO_VERIFICACION,
  TTL_CODIGO_VERIFICACION_MS,
  emitirCodigoVerificacion,
  verificarCodigoVerificacion,
} from '../../../src/domain/comunicacion/codigo-verificacion.js';
import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';
import { cryptoComunicacion } from '../../../src/infrastructure/crypto/index.js';

describe('códigos de verificación por email (OTP)', () => {
  const ahoraBase = new Date('2026-11-23T15:00:00Z');

  it('emite código de 6 dígitos, hash SHA-256, intentos = 0 y vencimiento por defecto de 10 minutos', () => {
    const emitido = emitirCodigoVerificacion({
      ahora: ahoraBase,
      crypto: cryptoComunicacion,
    });

    expect(LONGITUD_CODIGO_VERIFICACION).toBe(6);
    expect(TTL_CODIGO_VERIFICACION_MS).toBe(10 * 60 * 1000);
    expect(MAX_INTENTOS_CODIGO_VERIFICACION).toBe(5);
    expect(emitido.codigo).toMatch(/^\d{6}$/);
    expect(emitido.hashCodigo).toBe(cryptoComunicacion.hashSha256(emitido.codigo));
    expect(emitido.hashCodigo).not.toBe(emitido.codigo);
    expect(emitido.intentos).toBe(0);
    expect(emitido.venceEn.getTime()).toBe(ahoraBase.getTime() + TTL_CODIGO_VERIFICACION_MS);
  });

  it('preserva ceros a la izquierda al emitir y calcular el hash', () => {
    const cryptoConCeros = {
      ...cryptoComunicacion,
      generarCodigoNumerico: () => '004219',
    };

    const emitido = emitirCodigoVerificacion({
      ahora: ahoraBase,
      crypto: cryptoConCeros,
    });

    expect(emitido.codigo).toBe('004219');
    expect(emitido.hashCodigo).toBe(cryptoComunicacion.hashSha256('004219'));

    const verificado = verificarCodigoVerificacion({
      codigoIngresado: '004219',
      registro: {
        hashCodigo: emitido.hashCodigo,
        venceEn: emitido.venceEn,
        intentos: 0,
        consumidoEn: null,
      },
      ahora: new Date(ahoraBase.getTime() + 1_000),
      crypto: cryptoComunicacion,
    });

    expect(verificado).toEqual({
      valido: true,
      consumidoEn: new Date(ahoraBase.getTime() + 1_000),
      intentosActualizados: 0,
      agotado: false,
    });
  });

  it.each([0, -5000, Number.NaN, Number.POSITIVE_INFINITY])(
    'rechaza ttlMs inválido (%s) con TTL_INVALIDO',
    (ttlInvalido) => {
      let capturado: unknown;
      try {
        emitirCodigoVerificacion({
          ahora: ahoraBase,
          crypto: cryptoComunicacion,
          ttlMs: ttlInvalido,
        });
      } catch (error) {
        capturado = error;
      }

      expect(capturado).toBeInstanceOf(ErrorDeDominio);
      expect((capturado as ErrorDeDominio).codigo).toBe('TTL_INVALIDO');
      expect((capturado as ErrorDeDominio).tipo).toBe('solicitud_invalida');
    },
  );

  it.each([3, 13, 0, -1, 6.5])(
    'rechaza longitud inválida (%s) con PARAMETRO_INVALIDO',
    (longitudInvalida) => {
      let capturado: unknown;
      try {
        emitirCodigoVerificacion({
          ahora: ahoraBase,
          crypto: cryptoComunicacion,
          longitud: longitudInvalida,
        });
      } catch (error) {
        capturado = error;
      }

      expect(capturado).toBeInstanceOf(ErrorDeDominio);
      expect((capturado as ErrorDeDominio).codigo).toBe('PARAMETRO_INVALIDO');
      expect((capturado as ErrorDeDominio).tipo).toBe('solicitud_invalida');
    },
  );

  it('verifica un código válido sin mutar el registro y usando comparación en tiempo constante', () => {
    const emitido = emitirCodigoVerificacion({
      ahora: ahoraBase,
      crypto: cryptoComunicacion,
    });
    const registro = Object.freeze({
      hashCodigo: emitido.hashCodigo,
      venceEn: emitido.venceEn,
      intentos: 2,
      consumidoEn: null,
    });
    const compararSpy = vi.fn(cryptoComunicacion.compararEnTiempoConstante);
    const momento = new Date(emitido.venceEn.getTime() - 1);

    const resultado = verificarCodigoVerificacion({
      codigoIngresado: emitido.codigo,
      registro,
      ahora: momento,
      crypto: {
        ...cryptoComunicacion,
        compararEnTiempoConstante: compararSpy,
      },
    });

    expect(compararSpy).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual({
      valido: true,
      consumidoEn: momento,
      intentosActualizados: 2,
      agotado: false,
    });
    expect(registro.intentos).toBe(2);
    expect(registro.consumidoEn).toBeNull();
  });

  it('incrementa intentos ante código incorrecto y marca agotado al alcanzar maxIntentos', () => {
    const emitido = emitirCodigoVerificacion({
      ahora: ahoraBase,
      crypto: cryptoComunicacion,
    });
    const momento = new Date(ahoraBase.getTime() + 5_000);
    const incorrecto = emitido.codigo === '000000' ? '111111' : '000000';

    const parcial = verificarCodigoVerificacion({
      codigoIngresado: incorrecto,
      registro: {
        hashCodigo: emitido.hashCodigo,
        venceEn: emitido.venceEn,
        intentos: 3,
        consumidoEn: null,
      },
      ahora: momento,
      crypto: cryptoComunicacion,
    });
    expect(parcial).toEqual({
      valido: false,
      motivo: 'codigo_invalido',
      intentosActualizados: 4,
      agotado: false,
    });

    const ultimo = verificarCodigoVerificacion({
      codigoIngresado: incorrecto,
      registro: {
        hashCodigo: emitido.hashCodigo,
        venceEn: emitido.venceEn,
        intentos: 4,
        consumidoEn: null,
      },
      ahora: momento,
      crypto: cryptoComunicacion,
    });
    expect(ultimo).toEqual({
      valido: false,
      motivo: 'codigo_invalido',
      intentosActualizados: 5,
      agotado: true,
    });
  });

  it('rechaza cualquier intento cuando los intentos ya están agotados incluso con código correcto', () => {
    const emitido = emitirCodigoVerificacion({
      ahora: ahoraBase,
      crypto: cryptoComunicacion,
    });

    const resultado = verificarCodigoVerificacion({
      codigoIngresado: emitido.codigo,
      registro: {
        hashCodigo: emitido.hashCodigo,
        venceEn: emitido.venceEn,
        intentos: 5,
        consumidoEn: null,
      },
      ahora: new Date(ahoraBase.getTime() + 5_000),
      crypto: cryptoComunicacion,
    });

    expect(resultado).toEqual({
      valido: false,
      motivo: 'intentos_agotados',
      intentosActualizados: 5,
      agotado: true,
    });
  });

  it('rechaza código vencido o ya consumido incluso con código correcto sin alterar intentos', () => {
    const emitido = emitirCodigoVerificacion({
      ahora: ahoraBase,
      crypto: cryptoComunicacion,
    });

    const vencidoExacto = verificarCodigoVerificacion({
      codigoIngresado: emitido.codigo,
      registro: {
        hashCodigo: emitido.hashCodigo,
        venceEn: emitido.venceEn,
        intentos: 1,
        consumidoEn: null,
      },
      ahora: new Date(emitido.venceEn.getTime()),
      crypto: cryptoComunicacion,
    });
    expect(vencidoExacto).toEqual({
      valido: false,
      motivo: 'vencido',
      intentosActualizados: 1,
      agotado: false,
    });

    const yaConsumido = verificarCodigoVerificacion({
      codigoIngresado: emitido.codigo,
      registro: {
        hashCodigo: emitido.hashCodigo,
        venceEn: emitido.venceEn,
        intentos: 1,
        consumidoEn: new Date(ahoraBase.getTime() + 2_000),
      },
      ahora: new Date(ahoraBase.getTime() + 3_000),
      crypto: cryptoComunicacion,
    });
    expect(yaConsumido).toEqual({
      valido: false,
      motivo: 'ya_consumido',
      intentosActualizados: 1,
      agotado: false,
    });
  });

  it('rechaza parámetros inválidos al verificar sin exponer el código', () => {
    expect(() =>
      verificarCodigoVerificacion({
        codigoIngresado: '123456',
        registro: {
          hashCodigo: cryptoComunicacion.hashSha256('123456'),
          venceEn: new Date(ahoraBase.getTime() + 60_000),
          intentos: -1,
          consumidoEn: null,
        },
        ahora: ahoraBase,
        crypto: cryptoComunicacion,
      }),
    ).toThrowError(ErrorDeDominio);

    expect(() =>
      verificarCodigoVerificacion({
        codigoIngresado: '123456',
        registro: {
          hashCodigo: cryptoComunicacion.hashSha256('123456'),
          venceEn: new Date(ahoraBase.getTime() + 60_000),
          intentos: 0,
          consumidoEn: null,
        },
        ahora: ahoraBase,
        crypto: cryptoComunicacion,
        maxIntentos: 0,
      }),
    ).toThrowError(ErrorDeDominio);
  });
});
