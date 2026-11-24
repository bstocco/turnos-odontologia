import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  contiene,
  crearIntervalo,
  crearIntervaloOLanzar,
  esAdyacente,
  seSolapa,
} from '../../../../src/domain/agenda/intervalo.js';
import { arbIntervalo, instanteEnMinutos as m, intervaloEnMinutos as iv } from '../arbitrarios.js';

describe('crearIntervalo', () => {
  it('crea un intervalo válido con los extremos dados', () => {
    const r = crearIntervalo(new Date('2026-03-10T09:00:00Z'), new Date('2026-03-10T09:30:00Z'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.inicio.toISOString()).toBe('2026-03-10T09:00:00.000Z');
    expect(r.valor.fin.toISOString()).toBe('2026-03-10T09:30:00.000Z');
    expect(Object.isFrozen(r.valor)).toBe(true);
  });

  it('es inmutable: mutar las Date de entrada no lo altera', () => {
    const ini = new Date('2026-03-10T09:00:00Z');
    const fin = new Date('2026-03-10T09:30:00Z');
    const intervalo = crearIntervaloOLanzar(ini, fin);
    ini.setTime(0);
    fin.setTime(1);
    expect(intervalo.inicio.toISOString()).toBe('2026-03-10T09:00:00.000Z');
    expect(intervalo.fin.toISOString()).toBe('2026-03-10T09:30:00.000Z');
  });

  it.each([
    ['fin igual a inicio', '2026-03-10T09:00:00Z', '2026-03-10T09:00:00Z'],
    ['fin anterior a inicio', '2026-03-10T09:30:00Z', '2026-03-10T09:00:00Z'],
  ])('rechaza %s con INTERVALO_INVALIDO', (_n, a, b) => {
    const r = crearIntervalo(new Date(a), new Date(b));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe('INTERVALO_INVALIDO');
    expect(r.error.tipo).toBe('solicitud_invalida');
  });

  it('rechaza fechas inválidas (NaN)', () => {
    const r = crearIntervalo(new Date('x'), new Date('2026-03-10T09:00:00Z'));
    expect(r.ok === false && r.error.codigo).toBe('INTERVALO_INVALIDO');
  });

  it('crearIntervaloOLanzar lanza el error de dominio', () => {
    expect(() => crearIntervaloOLanzar(m(10), m(10))).toThrow(/inicio < fin/);
  });
});

describe('relaciones entre intervalos', () => {
  it('[09:00,10:00) y [10:00,10:30) son adyacentes y no se solapan', () => {
    const a = iv(540, 600);
    const b = iv(600, 630);
    expect(seSolapa(a, b)).toBe(false);
    expect(seSolapa(b, a)).toBe(false);
    expect(esAdyacente(a, b)).toBe(true);
    expect(esAdyacente(b, a)).toBe(true);
  });

  it('solape parcial en ambos órdenes', () => {
    const a = iv(540, 600);
    const b = iv(585, 615);
    expect(seSolapa(a, b)).toBe(true);
    expect(seSolapa(b, a)).toBe(true);
    expect(esAdyacente(a, b)).toBe(false);
  });

  it('intervalos separados no se solapan ni son adyacentes', () => {
    expect(seSolapa(iv(0, 10), iv(20, 30))).toBe(false);
    expect(esAdyacente(iv(0, 10), iv(20, 30))).toBe(false);
  });

  it('un intervalo contenido en otro se solapa', () => {
    expect(seSolapa(iv(0, 100), iv(10, 20))).toBe(true);
  });

  it('contención con extremos iguales', () => {
    expect(contiene(iv(480, 720), iv(690, 720))).toBe(true);
    expect(contiene(iv(480, 720), iv(690, 735))).toBe(false);
    expect(contiene(iv(480, 720), iv(480, 720))).toBe(true);
    expect(contiene(iv(480, 720), iv(470, 500))).toBe(false);
  });
});

describe('propiedades de intervalo', () => {
  it('seSolapa y esAdyacente son simétricas', () => {
    fc.assert(
      fc.property(arbIntervalo, arbIntervalo, (a, b) => {
        expect(seSolapa(a, b)).toBe(seSolapa(b, a));
        expect(esAdyacente(a, b)).toBe(esAdyacente(b, a));
      }),
    );
  });

  it('esAdyacente implica no solapar', () => {
    fc.assert(
      fc.property(arbIntervalo, arbIntervalo, (a, b) => {
        if (esAdyacente(a, b)) expect(seSolapa(a, b)).toBe(false);
      }),
    );
  });

  it('adyacentes se generan siempre: [a, b) y [b, c)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (x, d1, d2) => {
          const a = iv(x, x + d1);
          const b = iv(x + d1, x + d1 + d2);
          expect(esAdyacente(a, b)).toBe(true);
          expect(seSolapa(a, b)).toBe(false);
        },
      ),
    );
  });

  it('contiene(a,b) y seSolapa(b,c) implican seSolapa(a,c)', () => {
    fc.assert(
      fc.property(arbIntervalo, arbIntervalo, arbIntervalo, (a, b, c) => {
        if (contiene(a, b) && seSolapa(b, c)) expect(seSolapa(a, c)).toBe(true);
      }),
      { numRuns: 2000 },
    );
  });

  it('todo intervalo se solapa consigo mismo y se contiene a sí mismo', () => {
    fc.assert(
      fc.property(arbIntervalo, (a) => {
        expect(seSolapa(a, a)).toBe(true);
        expect(contiene(a, a)).toBe(true);
      }),
    );
  });
});
