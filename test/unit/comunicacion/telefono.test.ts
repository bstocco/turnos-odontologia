import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { normalizarTelefonoAr } from '../../../src/domain/comunicacion/telefono.js';
import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';

describe('normalizarTelefonoAr', () => {
  it('normaliza números locales con 0 y 15 para áreas de 2, 3 y 4 dígitos', () => {
    expect(normalizarTelefonoAr('011 15 5555-1234')).toBe('5491155551234');
    expect(normalizarTelefonoAr('0351 15 512-3456')).toBe('5493515123456');
    expect(normalizarTelefonoAr('0220 15 412-3456')).toBe('5492204123456');
    expect(normalizarTelefonoAr('02920 15 41-2345')).toBe('5492920412345');
    expect(normalizarTelefonoAr('02202 15 41-2345')).toBe('5492202412345');
  });

  it('normaliza números locales sin 0 ni 15 incluyendo paréntesis', () => {
    expect(normalizarTelefonoAr('11 5555-1234')).toBe('5491155551234');
    expect(normalizarTelefonoAr('11 1234-5678')).toBe('5491112345678');
    expect(normalizarTelefonoAr('341 512-3456')).toBe('5493415123456');
    expect(normalizarTelefonoAr('(2920) 41-2345')).toBe('5492920412345');
  });

  it('normaliza números con prefijo internacional argentino (+54, 54, +54 9 y 0054)', () => {
    expect(normalizarTelefonoAr('+54 11 15 5555-1234')).toBe('5491155551234');
    expect(normalizarTelefonoAr('+54 9 11 5555-1234')).toBe('5491155551234');
    expect(normalizarTelefonoAr('54 351 5123456')).toBe('5493515123456');
    expect(normalizarTelefonoAr('+54 9 11 15 5555-1234')).toBe('5491155551234');
    expect(normalizarTelefonoAr('+54 9 011 15 5555-1234')).toBe('5491155551234');
    expect(normalizarTelefonoAr('0054 9 11 5555-1234')).toBe('5491155551234');
    expect(normalizarTelefonoAr('+54 9 351 15 512-3456')).toBe('5493515123456');
  });

  it('es idempotente sobre teléfonos ya normalizados', () => {
    expect(normalizarTelefonoAr('5491155551234')).toBe('5491155551234');
    expect(normalizarTelefonoAr('5493515123456')).toBe('5493515123456');
    expect(normalizarTelefonoAr('5492920412345')).toBe('5492920412345');
  });

  it.each([
    '',
    '   ',
    'abc',
    '11-abcd-5678',
    '15 5555-1234',
    '+1 555 123 4567',
    '001 555 123 4567',
    '0800 555 1234',
    '11 15 123456',
    '11 0123-4567',
    '11 5555-123',
    '11 99 5555-1234',
    '11 15 15 5555-1234',
    '+54+91155551234',
    '45551234',
  ])('rechaza entrada inválida (%s) con TELEFONO_INVALIDO sin exponer el número', (invalido) => {
    let capturado: unknown;
    try {
      normalizarTelefonoAr(invalido);
    } catch (error) {
      capturado = error;
    }

    expect(capturado).toBeInstanceOf(ErrorDeDominio);
    const errorDominio = capturado as ErrorDeDominio;
    expect(errorDominio.codigo).toBe('TELEFONO_INVALIDO');
    expect(errorDominio.tipo).toBe('solicitud_invalida');
    expect(errorDominio.message).not.toMatch(/\d/);
    if (invalido.trim().length > 0) {
      expect(errorDominio.message).not.toContain(invalido.trim());
    }
  });

  it('propiedad: preserva formato 549 + 10 dígitos y es idempotente para cualquier variante argentina válida', () => {
    const area2 = fc.constant('11');
    const area3 = fc.constantFrom('220', '221', '261', '299', '341', '351', '381', '387');
    const area4 = fc.constantFrom('2202', '2323', '2920', '3492');

    const casoArea = fc.oneof(
      area2.chain((area) =>
        fc.tuple(fc.constant(area), fc.integer({ min: 2, max: 9 }), fc.stringMatching(/^\d{7}$/)),
      ),
      area3.chain((area) =>
        fc.tuple(fc.constant(area), fc.integer({ min: 2, max: 9 }), fc.stringMatching(/^\d{6}$/)),
      ),
      area4.chain((area) =>
        fc.tuple(fc.constant(area), fc.integer({ min: 2, max: 9 }), fc.stringMatching(/^\d{5}$/)),
      ),
    );

    const prefijo = fc.constantFrom('', '0', '54', '+54', '549', '+54 9 ', '0054 9 ');
    const separador = fc.constantFrom('', ' ', '-');
    const conQuince = fc.boolean();

    fc.assert(
      fc.property(
        casoArea,
        prefijo,
        separador,
        conQuince,
        ([area, primero, resto], pref, sep, usar15) => {
          const abonado = `${primero}${resto}`;
          const medio = usar15 ? `15${sep}` : '';
          const entrada = `${pref}${sep}${area}${sep}${medio}${abonado}`;
          const normalizado = normalizarTelefonoAr(entrada);

          expect(normalizado).toBe(`549${area}${abonado}`);
          expect(normalizado).toMatch(/^549\d{10}$/);
          expect(normalizarTelefonoAr(normalizado)).toBe(normalizado);
        },
      ),
    );
  });
});
