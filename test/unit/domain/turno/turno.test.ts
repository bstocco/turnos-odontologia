import { describe, expect, it } from 'vitest';

import type {
  PacienteId,
  PrestacionId,
  ProfesionalId,
  SillonId,
  TurnoId,
} from '../../../../src/domain/shared/ids.js';
import type { EstadoTurno } from '../../../../src/domain/turno/estado.js';
import {
  crearTurno,
  transicionar,
  type NuevoTurno,
  type Turno,
} from '../../../../src/domain/turno/turno.js';
import { instanteEnMinutos as m } from '../arbitrarios.js';

const nuevo = (extra: Partial<NuevoTurno> = {}): NuevoTurno => ({
  pacienteId: 'pac-1' as PacienteId,
  profesionalId: 'prof-1' as ProfesionalId,
  sillonId: 'sil-1' as SillonId,
  prestacionId: 'pre-1' as PrestacionId,
  inicio: new Date('2026-03-10T12:00:00Z'),
  duracionMinutos: 45,
  bufferMinutos: 15,
  estado: 'pendiente_confirmacion',
  origen: 'recepcion',
  reprogramadoDe: null,
  ...extra,
});

function turnoEn(estado: EstadoTurno, inicio = m(600)): Turno {
  return {
    id: 't-1' as TurnoId,
    pacienteId: 'pac-1' as PacienteId,
    profesionalId: 'prof-1' as ProfesionalId,
    sillonId: 'sil-1' as SillonId,
    prestacionId: 'pre-1' as PrestacionId,
    inicio,
    fin: new Date(inicio.getTime() + 30 * 60_000),
    bufferMinutos: 0,
    finSillon: new Date(inicio.getTime() + 30 * 60_000),
    estado,
    origen: 'recepcion',
    reprogramadoDe: null,
    duracionRealMinutos: null,
    creadoEn: m(0),
    actualizadoEn: m(0),
  };
}

describe('crearTurno', () => {
  it('09:00 + 45 min + buffer 15 -> fin 09:45 y finSillon 10:00', () => {
    const r = crearTurno(nuevo({ inicio: new Date('2026-03-10T09:00:00Z') }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.fin.toISOString()).toBe('2026-03-10T09:45:00.000Z');
    expect(r.valor.bufferMinutos).toBe(15);
    expect(r.valor.finSillon.toISOString()).toBe('2026-03-10T10:00:00.000Z');
    expect(r.valor.estado).toBe('pendiente_confirmacion');
  });

  it('buffer 0: finSillon = fin; estado inicial confirmado aceptado', () => {
    const r = crearTurno(nuevo({ bufferMinutos: 0, estado: 'confirmado', duracionMinutos: 30 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.finSillon.getTime()).toBe(r.valor.fin.getTime());
    expect(r.valor.estado).toBe('confirmado');
  });

  it.each<EstadoTurno>(['atendido', 'ausente', 'cancelado', 'reprogramado'])(
    'rechaza el estado inicial %s con ESTADO_TURNO_INVALIDO',
    (estado) => {
      const r = crearTurno(nuevo({ estado }));
      expect(r.ok === false && r.error.codigo).toBe('ESTADO_TURNO_INVALIDO');
    },
  );

  it.each([
    ['duración cero', { duracionMinutos: 0 }],
    ['duración fraccionaria', { duracionMinutos: 30.5 }],
    ['buffer negativo', { bufferMinutos: -1 }],
    ['buffer fraccionario', { bufferMinutos: 0.5 }],
  ])('%s -> OCUPACION_INVALIDA', (_n, extra) => {
    const r = crearTurno(nuevo(extra));
    expect(r.ok === false && r.error.codigo).toBe('OCUPACION_INVALIDA');
  });

  it('copia el inicio: mutar la Date de entrada no altera el turno', () => {
    const entrada = nuevo();
    const r = crearTurno(entrada);
    if (!r.ok) throw r.error;
    const antes = r.valor.inicio.getTime();
    entrada.inicio.setTime(0);
    expect(r.valor.inicio.getTime()).toBe(antes);
  });
});

describe('transicionar', () => {
  const ahora = m(900);

  it('confirmar un pendiente devuelve un turno nuevo y no muta el original', () => {
    const original = turnoEn('pendiente_confirmacion');
    const r = transicionar(original, 'confirmado', ahora);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.estado).toBe('confirmado');
    expect(r.valor.actualizadoEn.getTime()).toBe(ahora.getTime());
    expect(r.valor).not.toBe(original);
    expect(original.estado).toBe('pendiente_confirmacion');
    expect(original.actualizadoEn.getTime()).toBe(m(0).getTime());
  });

  it('salir de un estado final -> TRANSICION_TURNO_INVALIDA', () => {
    const r = transicionar(turnoEn('cancelado'), 'confirmado', ahora);
    expect(r.ok === false && r.error.codigo).toBe('TRANSICION_TURNO_INVALIDA');
    expect(r.ok === false && r.error.tipo).toBe('regla_de_negocio');
  });

  it('atender sin confirmar -> TRANSICION_TURNO_INVALIDA (aunque ya haya empezado)', () => {
    const r = transicionar(turnoEn('pendiente_confirmacion'), 'atendido', m(700));
    expect(r.ok === false && r.error.codigo).toBe('TRANSICION_TURNO_INVALIDA');
  });

  it('transición a sí mismo rechazada', () => {
    const r = transicionar(turnoEn('confirmado'), 'confirmado', ahora);
    expect(r.ok === false && r.error.codigo).toBe('TRANSICION_TURNO_INVALIDA');
  });
});

describe('RN-TU-04: atendido/ausente solo desde el inicio', () => {
  const inicio = new Date('2026-03-10T13:00:00Z'); // 10:00 locales
  const minutosAntes = (n: number) => new Date(inicio.getTime() - n * 60_000);

  it('ausente un minuto antes del inicio -> TURNO_AUN_NO_INICIADO', () => {
    const r = transicionar(turnoEn('confirmado', inicio), 'ausente', minutosAntes(1));
    expect(r.ok === false && r.error.codigo).toBe('TURNO_AUN_NO_INICIADO');
    expect(r.ok === false && r.error.tipo).toBe('regla_de_negocio');
  });

  it('atendido un minuto antes del inicio -> TURNO_AUN_NO_INICIADO', () => {
    const r = transicionar(turnoEn('confirmado', inicio), 'atendido', minutosAntes(1));
    expect(r.ok === false && r.error.codigo).toBe('TURNO_AUN_NO_INICIADO');
  });

  it('atendido justo a la hora de inicio se acepta', () => {
    const r = transicionar(turnoEn('confirmado', inicio), 'atendido', inicio);
    expect(r.ok && r.valor.estado).toBe('atendido');
  });

  it('ausente después del inicio se acepta', () => {
    const r = transicionar(
      turnoEn('confirmado', inicio),
      'ausente',
      new Date(inicio.getTime() + 60_000),
    );
    expect(r.ok && r.valor.estado).toBe('ausente');
  });

  it('cancelar antes del inicio se acepta', () => {
    const r = transicionar(turnoEn('confirmado', inicio), 'cancelado', minutosAntes(60));
    expect(r.ok && r.valor.estado).toBe('cancelado');
  });
});
