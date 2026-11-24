import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  detectarSolapeDeFranjas,
  esGranularidadValida,
  formatearMinutos,
  validarFranjas,
} from '../../../src/application/configuracion/index.js';
import { validarGranularidad } from '../../../src/domain/agenda/index.js';
import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';

describe('esGranularidadValida', () => {
  it.each([15, 30, 60, 5, 1440])('%i es válida', (g) => {
    expect(esGranularidadValida(g)).toBe(true);
  });

  it.each([7, 0, -15, 2.5, 1441, Number.NaN, Number.POSITIVE_INFINITY])('%s es inválida', (g) => {
    expect(esGranularidadValida(g)).toBe(false);
  });

  it('coincide con validarGranularidad del dominio para todo g de 1 a 1440', () => {
    const medianoche = new Date(Date.UTC(2030, 0, 1, 0, 0, 0));
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1440 }), (g) => {
        const dominio = validarGranularidad(medianoche, {
          zonaHoraria: 'UTC',
          granularidadMinutos: g,
        });
        const invalidaEnDominio = !dominio.ok && dominio.error.codigo === 'OCUPACION_INVALIDA';
        expect(esGranularidadValida(g)).toBe(!invalidaEnDominio);
      }),
      { numRuns: 1440 },
    );
  });
});

function capturar(fn: () => unknown): ErrorDeDominio {
  try {
    fn();
  } catch (error) {
    if (error instanceof ErrorDeDominio) return error;
    throw error;
  }
  throw new Error('No lanzó');
}

describe('formatearMinutos', () => {
  it.each([
    [0, '00:00'],
    [545, '09:05'],
    [1200, '20:00'],
    [1440, '24:00'],
  ])('%i -> %s', (minutos, esperado) => {
    expect(formatearMinutos(minutos)).toBe(esperado);
  });
});

describe('validarFranjas', () => {
  it('convierte HH:MM a minutos y ordena por día y desde', () => {
    const franjas = validarFranjas([
      { diaSemana: 3, horaDesde: '14:00', horaHasta: '18:00' },
      { diaSemana: 1, horaDesde: '09:00', horaHasta: '13:00' },
    ]);
    expect(franjas).toEqual([
      { diaSemana: 1, desdeMinutos: 540, hastaMinutos: 780 },
      { diaSemana: 3, desdeMinutos: 840, hastaMinutos: 1080 },
    ]);
  });

  it('acepta hasta 24:00', () => {
    expect(validarFranjas([{ diaSemana: 5, horaDesde: '20:00', horaHasta: '24:00' }])).toEqual([
      { diaSemana: 5, desdeMinutos: 1200, hastaMinutos: 1440 },
    ]);
  });

  it('acepta una lista vacía', () => {
    expect(validarFranjas([])).toEqual([]);
  });

  it.each([
    ['desde == hasta', '09:00', '09:00'],
    ['desde > hasta', '13:00', '09:00'],
  ])('FRANJA_INVALIDA cuando %s', (_n, desde, hasta) => {
    const error = capturar(() =>
      validarFranjas([{ diaSemana: 1, horaDesde: desde, horaHasta: hasta }]),
    );
    expect(error).toMatchObject({ codigo: 'FRANJA_INVALIDA', tipo: 'solicitud_invalida' });
  });

  it('rechaza una hora que no existe', () => {
    const error = capturar(() =>
      validarFranjas([{ diaSemana: 1, horaDesde: '09:60', horaHasta: '13:00' }]),
    );
    expect(error.tipo).toBe('solicitud_invalida');
  });

  it('FRANJA_SOLAPADA cuando se solapan en el mismo día', () => {
    const error = capturar(() =>
      validarFranjas([
        { diaSemana: 1, horaDesde: '09:00', horaHasta: '13:00' },
        { diaSemana: 1, horaDesde: '12:00', horaHasta: '16:00' },
      ]),
    );
    expect(error).toMatchObject({ codigo: 'FRANJA_SOLAPADA', tipo: 'conflicto' });
  });

  it('acepta franjas contiguas (intervalos [desde, hasta))', () => {
    expect(() =>
      validarFranjas([
        { diaSemana: 1, horaDesde: '09:00', horaHasta: '13:00' },
        { diaSemana: 1, horaDesde: '13:00', horaHasta: '17:00' },
      ]),
    ).not.toThrow();
  });

  it('acepta el mismo horario en días distintos', () => {
    expect(() =>
      validarFranjas([
        { diaSemana: 1, horaDesde: '09:00', horaHasta: '13:00' },
        { diaSemana: 2, horaDesde: '09:00', horaHasta: '13:00' },
      ]),
    ).not.toThrow();
  });
});

describe('detectarSolapeDeFranjas', () => {
  const franja = fc
    .record({
      diaSemana: fc.integer({ min: 0, max: 2 }),
      desde: fc.integer({ min: 0, max: 1439 }),
      largo: fc.integer({ min: 1, max: 300 }),
    })
    .map(({ diaSemana, desde, largo }) => ({
      diaSemana,
      desdeMinutos: desde,
      hastaMinutos: Math.min(1440, desde + largo),
    }));

  it('coincide con la verificación por pares', () => {
    fc.assert(
      fc.property(fc.array(franja, { maxLength: 8 }), (franjas) => {
        let porPares = false;
        for (let i = 0; i < franjas.length; i++) {
          for (let j = i + 1; j < franjas.length; j++) {
            const a = franjas[i];
            const b = franjas[j];
            if (
              a !== undefined &&
              b !== undefined &&
              a.diaSemana === b.diaSemana &&
              a.desdeMinutos < b.hastaMinutos &&
              b.desdeMinutos < a.hastaMinutos
            ) {
              porPares = true;
            }
          }
        }
        expect(detectarSolapeDeFranjas(franjas)).toBe(porPares);
      }),
      { numRuns: 500 },
    );
  });
});
