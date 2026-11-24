import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  crearFechaLocal,
  diaSemanaDe,
  instanteALocal,
  localAInstante,
  parsearHoraLocal,
  sumarDias,
  type FechaLocal,
} from '../../../../src/domain/agenda/zona-horaria.js';

const BA = 'America/Argentina/Buenos_Aires';
const SCL = 'America/Santiago';

function fecha(s: string): FechaLocal {
  const r = crearFechaLocal(s);
  if (!r.ok) throw r.error;
  return r.valor;
}

function aInstante(f: string, minutos: number, zona: string) {
  return localAInstante(fecha(f), minutos, zona);
}

describe('zona horaria IANA', () => {
  it('rechaza una zona desconocida con ZONA_HORARIA_INVALIDA', () => {
    const r = aInstante('2026-03-10', 540, 'America/Atlantida');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe('ZONA_HORARIA_INVALIDA');
    expect(r.error.tipo).toBe('solicitud_invalida');
  });

  it.each(['', 'Argentina', '-03:00', '+05:30', 'UTC+3'])(
    'rechaza %j (no es un identificador IANA)',
    (zona) => {
      const r = instanteALocal(new Date('2026-03-10T12:00:00Z'), zona);
      expect(r.ok === false && r.error.codigo).toBe('ZONA_HORARIA_INVALIDA');
    },
  );
});

describe('localAInstante', () => {
  it('Buenos Aires 2026-03-10 09:00 -> 12:00Z', () => {
    const r = aInstante('2026-03-10', 540, BA);
    expect(r.ok && r.valor.toISOString()).toBe('2026-03-10T12:00:00.000Z');
  });

  it('Buenos Aires 00:00 y 23:45 del mismo día', () => {
    expect(aInstante('2026-03-10', 0, BA)).toEqual({
      ok: true,
      valor: new Date('2026-03-10T03:00:00Z'),
    });
    const r = aInstante('2026-03-10', 1425, BA);
    expect(r.ok && r.valor.toISOString()).toBe('2026-03-11T02:45:00.000Z');
  });

  it('1440 minutos equivale a la medianoche del día siguiente', () => {
    const r = aInstante('2026-03-10', 1440, BA);
    expect(r.ok && r.valor.toISOString()).toBe('2026-03-11T03:00:00.000Z');
  });

  it('rechaza una fecha imposible con FECHA_HORA_LOCAL_INVALIDA', () => {
    const r = crearFechaLocal('2026-02-30');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe('FECHA_HORA_LOCAL_INVALIDA');
    expect(r.error.tipo).toBe('solicitud_invalida');
  });

  it.each(['2026-2-3', '20260310', '2026-13-01', '2026-00-10', 'hola', '2026-03-10T00:00'])(
    'rechaza la fecha mal formada %j',
    (s) => {
      expect(crearFechaLocal(s).ok).toBe(false);
    },
  );

  it('acepta 2028-02-29 (bisiesto) y rechaza 2026-02-29', () => {
    expect(crearFechaLocal('2028-02-29').ok).toBe(true);
    expect(crearFechaLocal('2026-02-29').ok).toBe(false);
  });

  it.each([-1, 1441, 30.5, Number.NaN])(
    'rechaza minutos fuera de rango o no enteros (%s)',
    (min) => {
      const r = aInstante('2026-03-10', min, BA);
      expect(r.ok === false && r.error.codigo).toBe('FECHA_HORA_LOCAL_INVALIDA');
    },
  );

  describe('America/Santiago (horario de verano)', () => {
    it('09:00 del 2026-01-15 es -03:00 y el del 2026-07-15 es -04:00', () => {
      const verano = aInstante('2026-01-15', 540, SCL);
      const invierno = aInstante('2026-07-15', 540, SCL);
      expect(verano.ok && verano.valor.toISOString()).toBe('2026-01-15T12:00:00.000Z');
      expect(invierno.ok && invierno.valor.toISOString()).toBe('2026-07-15T13:00:00.000Z');
    });

    it('hora que se saltea: 2026-09-06 00:30 -> HORA_LOCAL_INEXISTENTE', () => {
      const r = aInstante('2026-09-06', 30, SCL);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.codigo).toBe('HORA_LOCAL_INEXISTENTE');
      expect(r.error.tipo).toBe('regla_de_negocio');
    });

    it('la hora siguiente al salto existe: 2026-09-06 01:00', () => {
      const r = aInstante('2026-09-06', 60, SCL);
      expect(r.ok && r.valor.toISOString()).toBe('2026-09-06T04:00:00.000Z');
    });

    it('hora repetida: 2026-04-04 23:30 -> primera ocurrencia 2026-04-05T02:30Z', () => {
      const r = aInstante('2026-04-04', 23 * 60 + 30, SCL);
      expect(r.ok && r.valor.toISOString()).toBe('2026-04-05T02:30:00.000Z');
    });
  });

  it('ida y vuelta en Buenos Aires: instanteALocal(localAInstante(x)) = x', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2024, max: 2030 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 0, max: 1439 }),
        (a, mes, dia, minutos) => {
          const f = fecha(
            `${String(a)}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
          );
          const inst = localAInstante(f, minutos, BA);
          expect(inst.ok).toBe(true);
          if (!inst.ok) return;
          const local = instanteALocal(inst.valor, BA);
          expect(local.ok && local.valor.fecha).toBe(f);
          expect(local.ok && local.valor.minutos).toBe(minutos);
        },
      ),
    );
  });

  it('ida y vuelta en Santiago para horas que existen (cuando la conversión es posible)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 0, max: 1439 }),
        (mes, dia, minutos) => {
          const f = fecha(`2026-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`);
          const inst = localAInstante(f, minutos, SCL);
          if (!inst.ok) {
            expect(inst.error.codigo).toBe('HORA_LOCAL_INEXISTENTE');
            return;
          }
          const local = instanteALocal(inst.valor, SCL);
          expect(local.ok && local.valor.fecha).toBe(f);
          expect(local.ok && local.valor.minutos).toBe(minutos);
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('instanteALocal', () => {
  it('2026-03-11T01:30Z en Buenos Aires -> 2026-03-10, 22:30, martes (2)', () => {
    const r = instanteALocal(new Date('2026-03-11T01:30:00Z'), BA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.fecha).toBe('2026-03-10');
    expect(r.valor.minutos).toBe(22 * 60 + 30);
    expect(r.valor.diaSemana).toBe(2);
  });

  it('medianoche local se informa como 00:00 (no 24:00) y domingo es 0', () => {
    const r = instanteALocal(new Date('2026-03-08T03:00:00Z'), BA);
    expect(r.ok && r.valor).toMatchObject({ fecha: '2026-03-08', minutos: 0, diaSemana: 0 });
  });

  it('sábado es 6 y los segundos se informan', () => {
    const r = instanteALocal(new Date('2026-03-14T15:00:20Z'), BA);
    expect(r.ok && r.valor).toMatchObject({
      fecha: '2026-03-14',
      minutos: 720,
      segundos: 20,
      diaSemana: 6,
    });
  });

  it('la misma hora UTC cae en días locales distintos según la zona', () => {
    const inst = new Date('2026-07-15T02:00:00Z');
    const ba = instanteALocal(inst, BA);
    const scl = instanteALocal(inst, SCL);
    expect(ba.ok && ba.valor.fecha).toBe('2026-07-14');
    expect(scl.ok && scl.valor.fecha).toBe('2026-07-14');
    expect(ba.ok && ba.valor.minutos).toBe(23 * 60);
    expect(scl.ok && scl.valor.minutos).toBe(22 * 60);
  });

  it('rechaza un instante inválido', () => {
    const r = instanteALocal(new Date('x'), BA);
    expect(r.ok === false && r.error.codigo).toBe('FECHA_HORA_LOCAL_INVALIDA');
  });
});

describe('parsearHoraLocal', () => {
  it.each([
    ['08:00', 480],
    ['08:00:00', 480],
    ['00:00', 0],
    ['23:59', 1439],
    ['24:00', 1440],
    ['12:15:00', 735],
  ])('%s -> %i', (s, esperado) => {
    expect(parsearHoraLocal(s)).toEqual({ ok: true, valor: esperado });
  });

  it.each(['8:00', '25:00', '12:60', '12:00:30', 'abc', '', '24:01'])('rechaza %j', (s) => {
    const r = parsearHoraLocal(s);
    expect(r.ok === false && r.error.codigo).toBe('FECHA_HORA_LOCAL_INVALIDA');
  });
});

describe('sumarDias', () => {
  it('cruza fin de mes y de año', () => {
    expect(sumarDias(fecha('2026-02-28'), 1)).toBe('2026-03-01');
    expect(sumarDias(fecha('2026-12-31'), 1)).toBe('2027-01-01');
    expect(sumarDias(fecha('2026-03-01'), -1)).toBe('2026-02-28');
    expect(sumarDias(fecha('2026-03-10'), 0)).toBe('2026-03-10');
  });
});

describe('diaSemanaDe', () => {
  it.each([
    ['2026-03-08', 0],
    ['2026-03-10', 2],
    ['2026-03-14', 6],
    ['2028-02-29', 2],
  ])('%s -> %i', (f, esperado) => {
    expect(diaSemanaDe(fecha(f))).toBe(esperado);
  });
});
