import { describe, expect, it } from 'vitest';

import { parsearLimiteDeTasa } from '../../../src/interfaces/http/modules/publico-disponibilidad/limite-de-tasa.js';

describe('parsearLimiteDeTasa', () => {
  it.each([
    ['30/min', { max: 30, ventanaMs: 60_000 }],
    ['5/s', { max: 5, ventanaMs: 1_000 }],
    ['100/h', { max: 100, ventanaMs: 3_600_000 }],
    ['3/min', { max: 3, ventanaMs: 60_000 }],
  ])('%s', (texto, esperado) => {
    expect(parsearLimiteDeTasa(texto)).toEqual(esperado);
  });

  it.each([
    '',
    '30',
    '0/min',
    '-1/min',
    '30/d',
    '30/ min',
    'abc/min',
    '1.5/s',
    '30/min ',
    '030/min',
  ])('lanza con %j (la configuración ya los rechaza al arrancar)', (texto) => {
    expect(() => parsearLimiteDeTasa(texto)).toThrow();
  });
});
