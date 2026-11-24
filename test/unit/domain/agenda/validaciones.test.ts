import { describe, expect, it } from 'vitest';

import { crearIntervaloOLanzar, type Intervalo } from '../../../../src/domain/agenda/intervalo.js';
import type {
  Bloqueo,
  ConfiguracionAgenda,
  FranjaAtencion,
} from '../../../../src/domain/agenda/puertos.js';
import {
  validarDentroDeHorario,
  validarGranularidad,
  validarInicioNoPasado,
  validarNoFeriado,
  validarSinBloqueo,
  validarTurnoPrevio,
} from '../../../../src/domain/agenda/validaciones.js';
import { crearFechaLocal, type FechaLocal } from '../../../../src/domain/agenda/zona-horaria.js';
import type { ProfesionalId } from '../../../../src/domain/shared/ids.js';

const BA = 'America/Argentina/Buenos_Aires';
const CONFIG: ConfiguracionAgenda = { zonaHoraria: BA, granularidadMinutos: 15 };

/** Martes 2026-03-10 en hora local de Buenos Aires (UTC-3). */
const local = (h: number, min = 0): Date => new Date(Date.UTC(2026, 2, 10, h + 3, min));
const rango = (h1: number, m1: number, h2: number, m2: number): Intervalo =>
  crearIntervaloOLanzar(local(h1, m1), local(h2, m2));
const fecha = (s: string): FechaLocal => {
  const r = crearFechaLocal(s);
  if (!r.ok) throw r.error;
  return r.valor;
};
const codigo = (r: { ok: boolean; error?: { codigo: string } }) => (r.ok ? 'OK' : r.error?.codigo);
const MARTES_8_A_12: FranjaAtencion = { diaSemana: 2, desdeMinutos: 480, hastaMinutos: 720 };

describe('validarInicioNoPasado', () => {
  it('inicio un minuto antes de ahora -> TURNO_INICIO_EN_PASADO (regla_de_negocio)', () => {
    const r = validarInicioNoPasado(local(9, 59), local(10));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe('TURNO_INICIO_EN_PASADO');
    expect(r.error.tipo).toBe('regla_de_negocio');
  });
  it('inicio == ahora se acepta (RN-AG-10)', () => {
    expect(validarInicioNoPasado(local(10), local(10)).ok).toBe(true);
  });
  it('inicio posterior se acepta', () => {
    expect(validarInicioNoPasado(local(10, 1), local(10)).ok).toBe(true);
  });
});

describe('validarGranularidad', () => {
  it('09:45 alineado con granularidad 15 pasa', () => {
    expect(validarGranularidad(local(9, 45), CONFIG).ok).toBe(true);
  });
  it('09:50 desalineado -> TURNO_NO_ALINEADO', () => {
    const r = validarGranularidad(local(9, 50), CONFIG);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe('TURNO_NO_ALINEADO');
    expect(r.error.tipo).toBe('regla_de_negocio');
  });
  it('se mide en hora local, no UTC: 09:30 local con granularidad 30 pasa', () => {
    expect(validarGranularidad(local(9, 30), { ...CONFIG, granularidadMinutos: 30 }).ok).toBe(true);
    expect(codigo(validarGranularidad(local(9, 15), { ...CONFIG, granularidadMinutos: 30 }))).toBe(
      'TURNO_NO_ALINEADO',
    );
  });
  it('rechaza inicios con segundos o milisegundos', () => {
    expect(codigo(validarGranularidad(new Date(local(9, 45).getTime() + 1000), CONFIG))).toBe(
      'TURNO_NO_ALINEADO',
    );
    expect(codigo(validarGranularidad(new Date(local(9, 45).getTime() + 1), CONFIG))).toBe(
      'TURNO_NO_ALINEADO',
    );
  });
  it.each([0, -15, 7, 15.5, 1441, Number.NaN])(
    'granularidad %s (no divide 1440 o no es entero positivo) se rechaza',
    (g) => {
      const r = validarGranularidad(local(9), { ...CONFIG, granularidadMinutos: g });
      expect(r.ok).toBe(false);
    },
  );
  it.each([5, 10, 20, 30, 60])(
    'acepta granularidad %i (divide 1440 y 09:00 está alineado)',
    (g) => {
      expect(validarGranularidad(local(9), { ...CONFIG, granularidadMinutos: g }).ok).toBe(true);
    },
  );
  it('zona inválida se propaga', () => {
    expect(codigo(validarGranularidad(local(9), { ...CONFIG, zonaHoraria: 'Nada/Nada' }))).toBe(
      'ZONA_HORARIA_INVALIDA',
    );
  });
});

describe('validarNoFeriado', () => {
  const feriados = [fecha('2026-05-25')];
  it('2026-05-25T13:00Z (10:00 local) en feriado -> TURNO_EN_FERIADO', () => {
    const r = validarNoFeriado(new Date('2026-05-25T13:00:00Z'), feriados, BA);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe('TURNO_EN_FERIADO');
    expect(r.error.tipo).toBe('regla_de_negocio');
  });
  it('2026-05-25T01:00Z (22:00 local del 24) pasa', () => {
    expect(validarNoFeriado(new Date('2026-05-25T01:00:00Z'), feriados, BA).ok).toBe(true);
  });
  it('2026-05-26T02:00Z (23:00 local del 25) sigue siendo feriado', () => {
    expect(codigo(validarNoFeriado(new Date('2026-05-26T02:00:00Z'), feriados, BA))).toBe(
      'TURNO_EN_FERIADO',
    );
  });
  it('sin feriados pasa', () => {
    expect(validarNoFeriado(new Date('2026-05-25T13:00:00Z'), [], BA).ok).toBe(true);
  });
});

describe('validarDentroDeHorario', () => {
  it('[11:30,12:00) en franja 08-12 pasa (termina al cierre)', () => {
    expect(validarDentroDeHorario(rango(11, 30, 12, 0), [MARTES_8_A_12], BA).ok).toBe(true);
  });
  it('[11:45,12:15) excede la franja -> TURNO_FUERA_DE_HORARIO', () => {
    const r = validarDentroDeHorario(rango(11, 45, 12, 15), [MARTES_8_A_12], BA);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe('TURNO_FUERA_DE_HORARIO');
    expect(r.error.tipo).toBe('regla_de_negocio');
  });
  it('[07:45,08:15) empieza antes de la apertura -> fuera de horario', () => {
    expect(codigo(validarDentroDeHorario(rango(7, 45, 8, 15), [MARTES_8_A_12], BA))).toBe(
      'TURNO_FUERA_DE_HORARIO',
    );
  });
  it('[08:00,08:30) al abrir pasa', () => {
    expect(validarDentroDeHorario(rango(8, 0, 8, 30), [MARTES_8_A_12], BA).ok).toBe(true);
  });
  it('día sin franjas -> TURNO_FUERA_DE_HORARIO', () => {
    const lunes: FranjaAtencion = { diaSemana: 1, desdeMinutos: 480, hastaMinutos: 720 };
    expect(codigo(validarDentroDeHorario(rango(9, 0, 9, 30), [lunes], BA))).toBe(
      'TURNO_FUERA_DE_HORARIO',
    );
    expect(codigo(validarDentroDeHorario(rango(9, 0, 9, 30), [], BA))).toBe(
      'TURNO_FUERA_DE_HORARIO',
    );
  });
  it('franjas contiguas: debe caber en UNA sola (08-12 y 12-16, turno 11:45-12:15)', () => {
    const franjas: FranjaAtencion[] = [
      MARTES_8_A_12,
      { diaSemana: 2, desdeMinutos: 720, hastaMinutos: 960 },
    ];
    expect(codigo(validarDentroDeHorario(rango(11, 45, 12, 15), franjas, BA))).toBe(
      'TURNO_FUERA_DE_HORARIO',
    );
    expect(validarDentroDeHorario(rango(12, 0, 12, 30), franjas, BA).ok).toBe(true);
  });
  it('usa el día de semana LOCAL: martes 22:00 local es miércoles UTC', () => {
    const franjaNoche: FranjaAtencion = { diaSemana: 2, desdeMinutos: 1260, hastaMinutos: 1380 };
    expect(validarDentroDeHorario(rango(22, 0, 22, 30), [franjaNoche], BA).ok).toBe(true);
  });
  it('franja que llega a 24:00 contiene un turno de 23:30 a 24:00', () => {
    const franja: FranjaAtencion = { diaSemana: 2, desdeMinutos: 1320, hastaMinutos: 1440 };
    const r = crearIntervaloOLanzar(local(23, 30), new Date(local(0).getTime() + 86_400_000));
    expect(validarDentroDeHorario(r, [franja], BA).ok).toBe(true);
  });
});

describe('validarSinBloqueo', () => {
  const bloqueo: Bloqueo = {
    id: 'b-1',
    profesionalId: 'prof-1' as ProfesionalId,
    intervalo: rango(10, 0, 11, 0),
  };
  it('[10:30,11:00) dentro del bloqueo -> TURNO_EN_BLOQUEO', () => {
    const r = validarSinBloqueo(rango(10, 30, 11, 0), [bloqueo]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe('TURNO_EN_BLOQUEO');
    expect(r.error.tipo).toBe('regla_de_negocio');
  });
  it('turno que empieza a las 11:00 (bloqueo adyacente) pasa', () => {
    expect(validarSinBloqueo(rango(11, 0, 11, 30), [bloqueo]).ok).toBe(true);
  });
  it('turno que termina a las 10:00 (adyacente por el otro lado) pasa', () => {
    expect(validarSinBloqueo(rango(9, 30, 10, 0), [bloqueo]).ok).toBe(true);
  });
  it('sin bloqueos pasa', () => {
    expect(validarSinBloqueo(rango(10, 30, 11, 0), []).ok).toBe(true);
  });
});

describe('validarTurnoPrevio (composición y orden)', () => {
  const base = {
    config: CONFIG,
    ahora: local(7),
    feriados: [] as FechaLocal[],
    franjas: [MARTES_8_A_12],
    bloqueos: [] as Bloqueo[],
  };
  const turno = (h: number, m: number, dur = 30) => {
    const inicio = local(h, m);
    return {
      inicio,
      rangoProfesional: crearIntervaloOLanzar(inicio, new Date(inicio.getTime() + dur * 60_000)),
    };
  };

  it('turno válido -> éxito', () => {
    expect(validarTurnoPrevio({ ...base, ...turno(9, 0) }).ok).toBe(true);
  });
  it('turno en el pasado y en feriado -> TURNO_INICIO_EN_PASADO', () => {
    const r = validarTurnoPrevio({
      ...base,
      ...turno(9, 0),
      ahora: local(12),
      feriados: [fecha('2026-03-10')],
    });
    expect(codigo(r)).toBe('TURNO_INICIO_EN_PASADO');
  });
  it('desalineado y en feriado -> TURNO_NO_ALINEADO (granularidad antes que feriado)', () => {
    const r = validarTurnoPrevio({ ...base, ...turno(9, 5), feriados: [fecha('2026-03-10')] });
    expect(codigo(r)).toBe('TURNO_NO_ALINEADO');
  });
  it('feriado y fuera de horario -> TURNO_EN_FERIADO (feriado antes que horario)', () => {
    const r = validarTurnoPrevio({ ...base, ...turno(13, 0), feriados: [fecha('2026-03-10')] });
    expect(codigo(r)).toBe('TURNO_EN_FERIADO');
  });
  it('fuera de horario y en bloqueo -> TURNO_FUERA_DE_HORARIO (horario antes que bloqueo)', () => {
    const bloqueo: Bloqueo = {
      id: 'b',
      profesionalId: 'p' as ProfesionalId,
      intervalo: rango(12, 0, 14, 0),
    };
    expect(codigo(validarTurnoPrevio({ ...base, ...turno(12, 0), bloqueos: [bloqueo] }))).toBe(
      'TURNO_FUERA_DE_HORARIO',
    );
  });
  it('solo en bloqueo -> TURNO_EN_BLOQUEO', () => {
    const bloqueo: Bloqueo = {
      id: 'b',
      profesionalId: 'p' as ProfesionalId,
      intervalo: rango(9, 0, 10, 0),
    };
    expect(codigo(validarTurnoPrevio({ ...base, ...turno(9, 30), bloqueos: [bloqueo] }))).toBe(
      'TURNO_EN_BLOQUEO',
    );
  });
});
