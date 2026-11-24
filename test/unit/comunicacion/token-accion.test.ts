import { describe, expect, it, vi } from 'vitest';

import {
  TTL_TOKEN_ACCION_MS,
  emitirTokenAccion,
  validarTokenAccion,
} from '../../../src/domain/comunicacion/token-accion.js';
import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';
import { cryptoComunicacion } from '../../../src/infrastructure/crypto/index.js';

describe('tokens de acción de un solo uso', () => {
  const ahoraBase = new Date('2026-11-23T12:00:00Z');

  it('emite tokens para confirmar y cancelar con hash SHA-256 y vencimiento por defecto de 48 horas', () => {
    const emitido = emitirTokenAccion({
      proposito: 'confirmar',
      ahora: ahoraBase,
      crypto: cryptoComunicacion,
    });

    expect(emitido.proposito).toBe('confirmar');
    expect(emitido.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(emitido.hashToken).toBe(cryptoComunicacion.hashSha256(emitido.token));
    expect(emitido.hashToken).not.toBe(emitido.token);
    expect(emitido.venceEn.getTime()).toBe(ahoraBase.getTime() + TTL_TOKEN_ACCION_MS);

    const emitidoCancelar = emitirTokenAccion({
      proposito: 'cancelar',
      ahora: ahoraBase,
      crypto: cryptoComunicacion,
      ttlMs: 60_000,
    });
    expect(emitidoCancelar.proposito).toBe('cancelar');
    expect(emitidoCancelar.venceEn.getTime()).toBe(ahoraBase.getTime() + 60_000);
  });

  it.each([0, -1000, Number.NaN, Number.POSITIVE_INFINITY])(
    'rechaza ttlMs inválido (%s) con TTL_INVALIDO',
    (ttlInvalido) => {
      let capturado: unknown;
      try {
        emitirTokenAccion({
          proposito: 'confirmar',
          ahora: ahoraBase,
          crypto: cryptoComunicacion,
          ttlMs: ttlInvalido,
        });
      } catch (error) {
        capturado = error;
      }

      expect(capturado).toBeInstanceOf(ErrorDeDominio);
      const errorDominio = capturado as ErrorDeDominio;
      expect(errorDominio.codigo).toBe('TTL_INVALIDO');
      expect(errorDominio.tipo).toBe('solicitud_invalida');
    },
  );

  it('valida un token vigente incluso 1 ms antes del vencimiento usando comparación en tiempo constante', () => {
    const emitido = emitirTokenAccion({
      proposito: 'confirmar',
      ahora: ahoraBase,
      crypto: cryptoComunicacion,
    });
    const compararSpy = vi.fn(cryptoComunicacion.compararEnTiempoConstante);
    const cryptoConEspia = {
      ...cryptoComunicacion,
      compararEnTiempoConstante: compararSpy,
    };

    const resultado = validarTokenAccion({
      tokenPlano: emitido.token,
      propositoEsperado: 'confirmar',
      registro: {
        proposito: emitido.proposito,
        hashToken: emitido.hashToken,
        venceEn: emitido.venceEn,
        usadoEn: null,
      },
      ahora: new Date(emitido.venceEn.getTime() - 1),
      crypto: cryptoConEspia,
    });

    expect(resultado).toEqual({ valido: true });
    expect(compararSpy).toHaveBeenCalledTimes(1);
  });

  it('rechaza un token con hash inválido y conserva esa prioridad frente a otros motivos', () => {
    const emitido = emitirTokenAccion({
      proposito: 'confirmar',
      ahora: ahoraBase,
      crypto: cryptoComunicacion,
    });

    const resultado = validarTokenAccion({
      tokenPlano: 'token-incorrecto-que-no-coincide',
      propositoEsperado: 'cancelar',
      registro: {
        proposito: emitido.proposito,
        hashToken: emitido.hashToken,
        venceEn: emitido.venceEn,
        usadoEn: new Date('2026-11-23T13:00:00Z'),
      },
      ahora: new Date(emitido.venceEn.getTime() + 1_000),
      crypto: cryptoComunicacion,
    });

    expect(resultado).toEqual({ valido: false, motivo: 'hash_invalido' });
  });

  it('rechaza cuando el propósito no coincide y conserva prioridad sobre usado y vencido', () => {
    const emitido = emitirTokenAccion({
      proposito: 'confirmar',
      ahora: ahoraBase,
      crypto: cryptoComunicacion,
    });

    const resultado = validarTokenAccion({
      tokenPlano: emitido.token,
      propositoEsperado: 'cancelar',
      registro: {
        proposito: emitido.proposito,
        hashToken: emitido.hashToken,
        venceEn: emitido.venceEn,
        usadoEn: new Date('2026-11-23T13:00:00Z'),
      },
      ahora: new Date(emitido.venceEn.getTime() + 1_000),
      crypto: cryptoComunicacion,
    });

    expect(resultado).toEqual({ valido: false, motivo: 'proposito_invalido' });
  });

  it('rechaza token ya usado y respeta prioridad sobre vencimiento', () => {
    const emitido = emitirTokenAccion({
      proposito: 'cancelar',
      ahora: ahoraBase,
      crypto: cryptoComunicacion,
    });

    const resultado = validarTokenAccion({
      tokenPlano: emitido.token,
      propositoEsperado: 'cancelar',
      registro: {
        proposito: emitido.proposito,
        hashToken: emitido.hashToken,
        venceEn: emitido.venceEn,
        usadoEn: new Date('2026-11-23T15:00:00Z'),
      },
      ahora: new Date(emitido.venceEn.getTime() + 1_000),
      crypto: cryptoComunicacion,
    });

    expect(resultado).toEqual({ valido: false, motivo: 'ya_usado' });
  });

  it('rechaza token vencido tanto en el instante exacto de vencimiento como después', () => {
    const emitido = emitirTokenAccion({
      proposito: 'confirmar',
      ahora: ahoraBase,
      crypto: cryptoComunicacion,
    });
    const registro = {
      proposito: emitido.proposito,
      hashToken: emitido.hashToken,
      venceEn: emitido.venceEn,
      usadoEn: null,
    };

    expect(
      validarTokenAccion({
        tokenPlano: emitido.token,
        propositoEsperado: 'confirmar',
        registro,
        ahora: new Date(emitido.venceEn.getTime()),
        crypto: cryptoComunicacion,
      }),
    ).toEqual({ valido: false, motivo: 'vencido' });

    expect(
      validarTokenAccion({
        tokenPlano: emitido.token,
        propositoEsperado: 'confirmar',
        registro,
        ahora: new Date(emitido.venceEn.getTime() + 1),
        crypto: cryptoComunicacion,
      }),
    ).toEqual({ valido: false, motivo: 'vencido' });
  });

  it('rechaza fechas inválidas con PARAMETRO_INVALIDO sin exponer tokens', () => {
    let capturado: unknown;
    try {
      emitirTokenAccion({
        proposito: 'confirmar',
        ahora: new Date('invalida'),
        crypto: cryptoComunicacion,
      });
    } catch (error) {
      capturado = error;
    }

    expect(capturado).toBeInstanceOf(ErrorDeDominio);
    expect((capturado as ErrorDeDominio).codigo).toBe('PARAMETRO_INVALIDO');
  });
});
