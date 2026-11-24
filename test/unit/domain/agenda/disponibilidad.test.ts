import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  calcularDisponibilidad,
  type EntradaDisponibilidad,
} from '../../../../src/domain/agenda/disponibilidad.js';
import { crearIntervaloOLanzar } from '../../../../src/domain/agenda/intervalo.js';
import {
  detectarSolape,
  rangoSillon,
  type OcupacionExistente,
} from '../../../../src/domain/agenda/ocupacion.js';
import type { Bloqueo, FranjaAtencion, Sillon } from '../../../../src/domain/agenda/puertos.js';
import { validarTurnoPrevio } from '../../../../src/domain/agenda/validaciones.js';
import {
  crearFechaLocal,
  instanteALocal,
  type FechaLocal,
} from '../../../../src/domain/agenda/zona-horaria.js';
import type { ProfesionalId, SillonId } from '../../../../src/domain/shared/ids.js';
import type { EstadoTurno } from '../../../../src/domain/turno/estado.js';

const BA = 'America/Argentina/Buenos_Aires';
const P = 'prof-P' as ProfesionalId;
const Q = 'prof-Q' as ProfesionalId;
const S1 = 'sil-1' as SillonId;
const S2 = 'sil-2' as SillonId;

const fecha = (s: string): FechaLocal => {
  const r = crearFechaLocal(s);
  if (!r.ok) throw r.error;
  return r.valor;
};
/** Hora local de Buenos Aires (UTC-3) del día `dia` de marzo de 2026. */
const local = (h: number, min = 0, dia = 10): Date => new Date(Date.UTC(2026, 2, dia, h + 3, min));
const hhmm = (d: Date): string => {
  const r = instanteALocal(d, BA);
  if (!r.ok) throw r.error;
  return `${String(Math.floor(r.valor.minutos / 60)).padStart(2, '0')}:${String(r.valor.minutos % 60).padStart(2, '0')}`;
};
const sillon = (id: SillonId, bufferMinutos = 0, activo = true): Sillon => ({
  id,
  bufferMinutos,
  activo,
});
const martes = (desdeMinutos: number, hastaMinutos: number): FranjaAtencion => ({
  diaSemana: 2,
  desdeMinutos,
  hastaMinutos,
});
const turno = (
  prof: ProfesionalId,
  sil: SillonId,
  inicio: Date,
  durMin: number,
  bufferMin = 0,
  estado: EstadoTurno = 'confirmado',
): OcupacionExistente => ({
  profesionalId: prof,
  sillonId: sil,
  inicio,
  fin: new Date(inicio.getTime() + durMin * 60_000),
  finSillon: new Date(inicio.getTime() + (durMin + bufferMin) * 60_000),
  estado,
});

function entrada(extra: Partial<EntradaDisponibilidad> = {}): EntradaDisponibilidad {
  return {
    profesionalId: P,
    duracionMinutos: 30,
    desde: fecha('2026-03-10'),
    hasta: fecha('2026-03-11'),
    franjas: [martes(480, 600)],
    feriados: [],
    bloqueos: [],
    turnos: [],
    sillones: [sillon(S1)],
    config: { zonaHoraria: BA, granularidadMinutos: 15 },
    ahora: local(0),
    ...extra,
  };
}

function inicios(e: EntradaDisponibilidad): string[] {
  const r = calcularDisponibilidad(e);
  if (!r.ok) throw r.error;
  return r.valor.map((h) => hhmm(h.intervalo.inicio));
}

describe('calcularDisponibilidad', () => {
  it('día libre: franja 08-10, 30 min, granularidad 15 -> 7 huecos de 08:00 a 09:30; el último termina 10:00', () => {
    const r = calcularDisponibilidad(entrada());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.map((h) => hhmm(h.intervalo.inicio))).toEqual([
      '08:00',
      '08:15',
      '08:30',
      '08:45',
      '09:00',
      '09:15',
      '09:30',
    ]);
    expect(hhmm(r.valor[6]?.intervalo.fin ?? new Date(0))).toBe('10:00');
    expect(r.valor[0]?.sillonesAsignables).toEqual([S1]);
  });

  it('la duración se respeta: 45 min en franja 08-10 -> el último inicio es 09:15', () => {
    expect(inicios(entrada({ duracionMinutos: 45 })).at(-1)).toBe('09:15');
  });

  it('feriado: no hay huecos en esa fecha local', () => {
    expect(inicios(entrada({ feriados: [fecha('2026-03-10')] }))).toEqual([]);
  });

  it('huecos en el pasado: con ahora 09:10 solo quedan 09:15 y 09:30', () => {
    expect(inicios(entrada({ ahora: local(9, 10) }))).toEqual(['09:15', '09:30']);
  });

  it('turno del profesional [09:00,09:30) excluye 08:45, 09:00 y 09:15 y conserva 08:30 y 09:30', () => {
    const lista = inicios(entrada({ turnos: [turno(P, S1, local(9), 30)] }));
    expect(lista).toEqual(['08:00', '08:15', '08:30', '09:30']);
  });

  it('turno cancelado del profesional no ocupa', () => {
    const lista = inicios(entrada({ turnos: [turno(P, S1, local(9), 30, 0, 'cancelado')] }));
    expect(lista).toHaveLength(7);
  });

  it('bloqueo [09:00,10:00) excluye huecos superpuestos; los adyacentes quedan', () => {
    const bloqueo: Bloqueo = {
      id: 'b',
      profesionalId: P,
      intervalo: crearIntervaloOLanzar(local(9), local(10)),
    };
    expect(inicios(entrada({ bloqueos: [bloqueo] }))).toEqual(['08:00', '08:15', '08:30']);
  });

  it('dos sillones, S1 ocupado por otro profesional a las 09:00 -> ese hueco solo con S2', () => {
    const r = calcularDisponibilidad(
      entrada({ sillones: [sillon(S1), sillon(S2)], turnos: [turno(Q, S1, local(9), 30)] }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.valor.find((h) => hhmm(h.intervalo.inicio) === '09:00');
    const b = r.valor.find((h) => hhmm(h.intervalo.inicio) === '08:00');
    expect(a?.sillonesAsignables).toEqual([S2]);
    expect(b?.sillonesAsignables).toEqual([S1, S2]);
  });

  it('un sillón con buffer 15 y turno ajeno [09:00,09:30): 09:30 no se ofrece y 09:45 sí', () => {
    const lista = inicios(
      entrada({
        franjas: [martes(480, 660)],
        sillones: [sillon(S1, 15)],
        turnos: [turno(Q, S1, local(9), 30, 15)],
      }),
    );
    expect(lista).not.toContain('09:30');
    expect(lista).toContain('09:45');
  });

  it('el buffer del candidato también cuenta: 08:30 con buffer 15 choca con el turno de 09:00 en el sillón', () => {
    const lista = inicios(
      entrada({
        franjas: [martes(480, 660)],
        sillones: [sillon(S1, 15)],
        turnos: [turno(Q, S1, local(9), 30, 15)],
      }),
    );
    expect(lista).toContain('08:15');
    expect(lista).not.toContain('08:30');
  });

  it('el buffer no necesita caber en la franja: 09:30 con buffer 15 en franja 08-10 se ofrece', () => {
    const lista = inicios(entrada({ sillones: [sillon(S1, 15)] }));
    expect(lista.at(-1)).toBe('09:30');
  });

  it('sin sillones activos no hay huecos (los inactivos se ignoran)', () => {
    expect(inicios(entrada({ sillones: [] }))).toEqual([]);
    expect(inicios(entrada({ sillones: [sillon(S1, 0, false)] }))).toEqual([]);
  });

  it('solo se asignan sillones activos', () => {
    const r = calcularDisponibilidad(entrada({ sillones: [sillon(S1, 0, false), sillon(S2)] }));
    expect(r.ok && r.valor[0]?.sillonesAsignables).toEqual([S2]);
  });

  it('día sin franjas -> vacío', () => {
    expect(inicios(entrada({ desde: fecha('2026-03-09'), hasta: fecha('2026-03-10') }))).toEqual(
      [],
    );
  });

  it('rango vacío o invertido -> vacío', () => {
    expect(inicios(entrada({ desde: fecha('2026-03-10'), hasta: fecha('2026-03-10') }))).toEqual(
      [],
    );
    expect(inicios(entrada({ desde: fecha('2026-03-11'), hasta: fecha('2026-03-10') }))).toEqual(
      [],
    );
  });

  it('entradas inválidas: duración, granularidad y zona', () => {
    const cod = (e: EntradaDisponibilidad) => {
      const r = calcularDisponibilidad(e);
      return r.ok ? 'OK' : r.error.codigo;
    };
    expect(cod(entrada({ duracionMinutos: 0 }))).toBe('OCUPACION_INVALIDA');
    expect(cod(entrada({ config: { zonaHoraria: BA, granularidadMinutos: 0 } }))).toBe(
      'OCUPACION_INVALIDA',
    );
    expect(cod(entrada({ config: { zonaHoraria: BA, granularidadMinutos: 7 } }))).toBe(
      'OCUPACION_INVALIDA',
    );
    expect(cod(entrada({ config: { zonaHoraria: 'Nada/Nada', granularidadMinutos: 15 } }))).toBe(
      'ZONA_HORARIA_INVALIDA',
    );
  });

  describe('triangulación', () => {
    it('varias fechas: solo los martes del rango [lunes 9, jueves 12) tienen huecos', () => {
      const r = calcularDisponibilidad(
        entrada({ desde: fecha('2026-03-09'), hasta: fecha('2026-03-12') }),
      );
      expect(r.ok && r.valor).toHaveLength(7);
      const dos = calcularDisponibilidad(
        entrada({ desde: fecha('2026-03-10'), hasta: fecha('2026-03-18') }),
      );
      expect(dos.ok && dos.valor).toHaveLength(14); // martes 10 y martes 17
    });

    it('cambio de día local vs UTC: franja 21:00-23:00 local cae al día siguiente en UTC', () => {
      const r = calcularDisponibilidad(entrada({ franjas: [martes(1260, 1380)] }));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.valor.map((h) => hhmm(h.intervalo.inicio))).toEqual([
        '21:00',
        '21:15',
        '21:30',
        '21:45',
        '22:00',
        '22:15',
        '22:30',
      ]);
      expect(r.valor[0]?.intervalo.inicio.toISOString()).toBe('2026-03-11T00:00:00.000Z');
    });

    it('varias franjas en el mismo día salen ordenadas por inicio', () => {
      const lista = inicios(entrada({ franjas: [martes(840, 900), martes(480, 540)] }));
      expect(lista).toEqual(['08:00', '08:15', '08:30', '14:00', '14:15', '14:30']);
    });

    it('granularidad 30 y franja que empieza desalineada (08:10): el primer hueco es 08:30', () => {
      const lista = inicios(
        entrada({
          franjas: [martes(490, 600)],
          config: { zonaHoraria: BA, granularidadMinutos: 30 },
        }),
      );
      expect(lista).toEqual(['08:30', '09:00', '09:30']);
    });

    it('los sillones salen en el orden recibido', () => {
      const r = calcularDisponibilidad(entrada({ sillones: [sillon(S2), sillon(S1)] }));
      expect(r.ok && r.valor[0]?.sillonesAsignables).toEqual([S2, S1]);
    });
  });
});

describe('coherencia entre disponibilidad y validación (propiedad)', () => {
  const arbEntrada = fc
    .record({
      franjas: fc.array(
        fc
          .tuple(fc.integer({ min: 0, max: 40 }), fc.integer({ min: 1, max: 24 }))
          .map(([d, l]): FranjaAtencion =>
            martes(d * 15 + 240, Math.min(1440, d * 15 + 240 + l * 15)),
          ),
        { minLength: 1, maxLength: 1 },
      ),
      feriado: fc.boolean(),
      duracion: fc.integer({ min: 1, max: 90 }),
      ahoraMin: fc.integer({ min: 0, max: 1200 }),
      bloqueos: fc.array(
        fc.tuple(fc.integer({ min: 0, max: 1380 }), fc.integer({ min: 1, max: 120 })),
        { maxLength: 3 },
      ),
      sillones: fc.array(
        fc.record({ buffer: fc.integer({ min: 0, max: 30 }), activo: fc.boolean() }),
        { maxLength: 3 },
      ),
      turnos: fc.array(
        fc.record({
          prof: fc.constantFrom(P, Q),
          sil: fc.integer({ min: 0, max: 2 }),
          inicio: fc.integer({ min: 0, max: 1380 }),
          dur: fc.integer({ min: 1, max: 90 }),
          buffer: fc.integer({ min: 0, max: 30 }),
          estado: fc.constantFrom<EstadoTurno>(
            'confirmado',
            'cancelado',
            'atendido',
            'pendiente_confirmacion',
          ),
        }),
        { maxLength: 8 },
      ),
    })
    .map((g): EntradaDisponibilidad => {
      const ids = [S1, S2, 'sil-3' as SillonId];
      return entrada({
        franjas: g.franjas,
        feriados: g.feriado ? [fecha('2026-03-10')] : [],
        duracionMinutos: g.duracion,
        ahora: new Date(local(0).getTime() + g.ahoraMin * 60_000),
        bloqueos: g.bloqueos.map(([i, l], n) => ({
          id: `b${String(n)}`,
          profesionalId: P,
          intervalo: crearIntervaloOLanzar(
            new Date(local(0).getTime() + i * 60_000),
            new Date(local(0).getTime() + (i + l) * 60_000),
          ),
        })),
        sillones: g.sillones.map((s, n) => sillon(ids[n] ?? S1, s.buffer, s.activo)),
        turnos: g.turnos.map((t) =>
          turno(
            t.prof,
            ids[t.sil] ?? S1,
            new Date(local(0).getTime() + t.inicio * 60_000),
            t.dur,
            t.buffer,
            t.estado,
          ),
        ),
      });
    });

  it('todo hueco ofrecido, con cualquiera de sus sillones, pasa las validaciones y no solapa', () => {
    fc.assert(
      fc.property(arbEntrada, (e) => {
        const r = calcularDisponibilidad(e);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        for (const hueco of r.valor) {
          expect(hueco.sillonesAsignables.length).toBeGreaterThan(0);
          const previa = validarTurnoPrevio({
            inicio: hueco.intervalo.inicio,
            rangoProfesional: hueco.intervalo,
            ahora: e.ahora,
            config: e.config,
            feriados: e.feriados,
            franjas: e.franjas,
            bloqueos: e.bloqueos,
          });
          expect(previa.ok).toBe(true);
          for (const id of hueco.sillonesAsignables) {
            const s = e.sillones.find((x) => x.id === id);
            expect(s?.activo).toBe(true);
            const rs = rangoSillon(
              hueco.intervalo.inicio,
              0 + (hueco.intervalo.fin.getTime() - hueco.intervalo.inicio.getTime()) / 60_000,
              s?.bufferMinutos ?? 0,
            );
            expect(rs.ok).toBe(true);
            if (!rs.ok) continue;
            const choque = detectarSolape(
              {
                profesionalId: e.profesionalId,
                sillonId: id,
                inicio: hueco.intervalo.inicio,
                fin: hueco.intervalo.fin,
                finSillon: rs.valor.fin,
              },
              e.turnos,
            );
            expect(choque.ok).toBe(true);
            // verificación independiente (milisegundos crudos), sin usar el dominio
            for (const t of e.turnos) {
              if (t.estado === 'cancelado' || t.estado === 'reprogramado') continue;
              if (t.profesionalId === e.profesionalId) {
                expect(
                  hueco.intervalo.inicio.getTime() < t.fin.getTime() &&
                    t.inicio.getTime() < hueco.intervalo.fin.getTime(),
                ).toBe(false);
              }
              if (t.sillonId === id) {
                expect(
                  hueco.intervalo.inicio.getTime() < t.finSillon.getTime() &&
                    t.inicio.getTime() < rs.valor.fin.getTime(),
                ).toBe(false);
              }
            }
          }
        }
        const inicios = r.valor.map((h) => h.intervalo.inicio.getTime());
        expect([...inicios].sort((a, b) => a - b)).toEqual(inicios);
      }),
      { numRuns: 300 },
    );
  });
});
