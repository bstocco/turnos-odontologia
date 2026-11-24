import { describe, expect, it } from 'vitest';

import {
  ESTADOS_TURNO,
  TRANSICIONES,
  esActivo,
  parsearEstado,
  puedeTransicionar,
  type EstadoTurno,
} from '../../../../src/domain/turno/estado.js';

describe('parsearEstado', () => {
  it('rechaza un estado desconocido con ESTADO_TURNO_INVALIDO', () => {
    const r = parsearEstado('en_curso');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe('ESTADO_TURNO_INVALIDO');
    expect(r.error.tipo).toBe('solicitud_invalida');
  });

  it('rechaza valores que no son texto', () => {
    expect(parsearEstado(7).ok).toBe(false);
    expect(parsearEstado(undefined).ok).toBe(false);
  });

  it.each(ESTADOS_TURNO)('acepta el estado %s', (e) => {
    expect(parsearEstado(e)).toEqual({ ok: true, valor: e });
  });

  it('hay exactamente 6 estados', () => {
    expect(ESTADOS_TURNO).toHaveLength(6);
  });
});

describe('esActivo', () => {
  it.each<[EstadoTurno, boolean]>([
    ['pendiente_confirmacion', true],
    ['confirmado', true],
    ['atendido', true],
    ['ausente', true],
    ['cancelado', false],
    ['reprogramado', false],
  ])('%s -> %s', (estado, esperado) => {
    expect(esActivo(estado)).toBe(esperado);
  });
});

describe('tabla de transiciones (RN-TU-01)', () => {
  const aceptados: ReadonlyArray<[EstadoTurno, EstadoTurno]> = [
    ['pendiente_confirmacion', 'confirmado'],
    ['pendiente_confirmacion', 'cancelado'],
    ['pendiente_confirmacion', 'reprogramado'],
    ['confirmado', 'cancelado'],
    ['confirmado', 'reprogramado'],
    ['confirmado', 'atendido'],
    ['confirmado', 'ausente'],
  ];

  it('de los 36 pares, exactamente los 7 de RN-TU-01 son aceptados', () => {
    const pares = ESTADOS_TURNO.flatMap((d) => ESTADOS_TURNO.map((h) => [d, h] as const));
    expect(pares).toHaveLength(36);
    const permitidos = pares.filter(([d, h]) => puedeTransicionar(d, h));
    expect(permitidos).toHaveLength(7);
    expect(new Set(permitidos.map(([d, h]) => `${d}>${h}`))).toEqual(
      new Set(aceptados.map(([d, h]) => `${d}>${h}`)),
    );
  });

  it.each(ESTADOS_TURNO)('%s no puede pasar a sí mismo', (e) => {
    expect(puedeTransicionar(e, e)).toBe(false);
  });

  it.each(['atendido', 'ausente', 'cancelado', 'reprogramado'] as const)('%s es final', (e) => {
    expect(TRANSICIONES[e]).toEqual([]);
  });
});
