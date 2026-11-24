import { describe, expect, it } from 'vitest';

import {
  PLANTILLAS_FERIADOS_NACIONALES,
  plantillaDeFeriados,
} from '../../../src/application/configuracion/index.js';
import { crearFechaLocal, diaSemanaDe } from '../../../src/domain/agenda/index.js';

const INAMOVIBLES = [
  '01-01',
  '03-24',
  '04-02',
  '05-01',
  '05-25',
  '06-20',
  '07-09',
  '12-08',
  '12-25',
];

describe.each([2026, 2027])('plantilla de feriados nacionales %i', (anio) => {
  const plantilla = PLANTILLAS_FERIADOS_NACIONALES[anio] ?? [];

  it('existe y no está vacía', () => {
    expect(plantilla.length).toBeGreaterThanOrEqual(15);
  });

  it('todas las fechas son fechas de calendario válidas del año indicado', () => {
    for (const { fecha } of plantilla) {
      const r = crearFechaLocal(fecha);
      expect(r.ok, fecha).toBe(true);
      expect(fecha.startsWith(`${anio}-`), fecha).toBe(true);
    }
  });

  it('las fechas son únicas y están ordenadas', () => {
    const fechas = plantilla.map((f) => f.fecha);
    expect(new Set(fechas).size).toBe(fechas.length);
    expect([...fechas].sort()).toEqual(fechas);
  });

  it('cada feriado tiene descripción no vacía', () => {
    for (const { descripcion } of plantilla) expect(descripcion.trim().length).toBeGreaterThan(0);
  });

  it.each(INAMOVIBLES)('incluye el inamovible %s', (mesDia) => {
    expect(plantilla.map((f) => f.fecha)).toContain(`${anio}-${mesDia}`);
  });
});

describe('fechas derivadas por la Ley 27.399 y la Pascua', () => {
  const fechas = (anio: number): string[] =>
    (PLANTILLAS_FERIADOS_NACIONALES[anio] ?? []).map((f) => f.fecha);

  it('2026: Carnaval, Viernes Santo y trasladables ya trasladados', () => {
    const f = fechas(2026);
    expect(f).toEqual(
      expect.arrayContaining([
        '2026-02-16',
        '2026-02-17',
        '2026-04-03',
        '2026-06-15',
        '2026-08-17',
        '2026-10-12',
        '2026-11-23',
      ]),
    );
    expect(f).not.toContain('2026-06-17');
    expect(f).not.toContain('2026-11-20');
  });

  it('2027: Carnaval, Viernes Santo y trasladables ya trasladados', () => {
    const f = fechas(2027);
    expect(f).toEqual(
      expect.arrayContaining([
        '2027-02-08',
        '2027-02-09',
        '2027-03-26',
        '2027-06-21',
        '2027-08-16',
        '2027-10-11',
        '2027-11-20',
      ]),
    );
    expect(f).not.toContain('2027-06-17');
    expect(f).not.toContain('2027-08-17');
    expect(f).not.toContain('2027-10-12');
  });

  it('no incluye días no laborables con fines turísticos (2026-03-23, 2026-07-10, 2026-12-07)', () => {
    expect(fechas(2026)).not.toEqual(expect.arrayContaining(['2026-03-23']));
    expect(fechas(2026)).not.toContain('2026-07-10');
    expect(fechas(2026)).not.toContain('2026-12-07');
  });

  it('los trasladables de 2026 y 2027 caen en lunes', () => {
    const dias = (f: string): number => {
      const r = crearFechaLocal(f);
      if (!r.ok) throw r.error;
      return diaSemanaDe(r.valor);
    };
    for (const f of [
      '2026-06-15',
      '2026-08-17',
      '2026-10-12',
      '2026-11-23',
      '2027-06-21',
      '2027-08-16',
      '2027-10-11',
    ]) {
      expect(dias(f), f).toBe(1);
    }
  });
});

describe('plantillaDeFeriados', () => {
  it('devuelve la plantilla del año o undefined si no existe', () => {
    expect(plantillaDeFeriados(2026)).toBe(PLANTILLAS_FERIADOS_NACIONALES[2026]);
    expect(plantillaDeFeriados(2027)?.length).toBeGreaterThan(0);
    expect(plantillaDeFeriados(2031)).toBeUndefined();
    expect(plantillaDeFeriados(1999)).toBeUndefined();
  });
});
