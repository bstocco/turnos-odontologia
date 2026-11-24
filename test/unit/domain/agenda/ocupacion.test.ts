import { describe, expect, it } from 'vitest';

import {
  detectarSolape,
  rangoProfesional,
  rangoSillon,
  type OcupacionCandidata,
  type OcupacionExistente,
} from '../../../../src/domain/agenda/ocupacion.js';
import type { ProfesionalId, SillonId } from '../../../../src/domain/shared/ids.js';
import type { EstadoTurno } from '../../../../src/domain/turno/estado.js';
import { instanteEnMinutos as m } from '../arbitrarios.js';

const P = 'prof-P' as ProfesionalId;
const Q = 'prof-Q' as ProfesionalId;
const S = 'sil-S' as SillonId;
const T = 'sil-T' as SillonId;

/** Minutos desde 00:00 UTC del día base: 09:00 = 540. */
function ocupacion(
  prof: ProfesionalId,
  sillon: SillonId,
  ini: number,
  dur: number,
  buffer = 0,
): OcupacionCandidata {
  return {
    profesionalId: prof,
    sillonId: sillon,
    inicio: m(ini),
    fin: m(ini + dur),
    finSillon: m(ini + dur + buffer),
  };
}
const existente = (
  o: OcupacionCandidata,
  estado: EstadoTurno = 'confirmado',
): OcupacionExistente => ({ ...o, estado });

describe('rangoProfesional / rangoSillon', () => {
  it('buffer 0: ambos rangos son [09:00, 09:30)', () => {
    const a = rangoProfesional(m(540), 30);
    const b = rangoSillon(m(540), 30, 0);
    expect(a.ok && a.valor.fin.getTime()).toBe(m(570).getTime());
    expect(b.ok && b.valor.fin.getTime()).toBe(m(570).getTime());
  });

  it('buffer 10: sillón [09:00, 09:40), profesional [09:00, 09:30)', () => {
    const a = rangoProfesional(m(540), 30);
    const b = rangoSillon(m(540), 30, 10);
    expect(a.ok && a.valor.fin.getTime()).toBe(m(570).getTime());
    expect(b.ok && b.valor.fin.getTime()).toBe(m(580).getTime());
    expect(b.ok && b.valor.inicio.getTime()).toBe(m(540).getTime());
  });

  it.each([
    ['duración 0', 0, 0],
    ['duración negativa', -5, 0],
    ['duración no entera', 30.5, 0],
    ['buffer negativo', 30, -1],
    ['buffer no entero', 30, 2.5],
    ['buffer NaN', 30, Number.NaN],
  ])('%s -> OCUPACION_INVALIDA', (_n, dur, buf) => {
    const r = rangoSillon(m(540), dur, buf);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe('OCUPACION_INVALIDA');
    expect(r.error.tipo).toBe('solicitud_invalida');
  });

  it('rangoProfesional rechaza duración inválida', () => {
    const r = rangoProfesional(m(540), 0);
    expect(r.ok === false && r.error.codigo).toBe('OCUPACION_INVALIDA');
  });
});

describe('detectarSolape', () => {
  it('mismo profesional superpuesto en otro sillón -> TURNO_SOLAPADO_PROFESIONAL', () => {
    const r = detectarSolape(ocupacion(P, T, 555, 30), [existente(ocupacion(P, S, 540, 30))]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe('TURNO_SOLAPADO_PROFESIONAL');
    expect(r.error.tipo).toBe('conflicto');
  });

  it.each<EstadoTurno>(['cancelado', 'reprogramado'])('turno existente %s se ignora', (estado) => {
    const r = detectarSolape(ocupacion(P, S, 540, 30), [
      existente(ocupacion(P, S, 540, 30), estado),
    ]);
    expect(r.ok).toBe(true);
  });

  it.each<EstadoTurno>(['pendiente_confirmacion', 'confirmado', 'atendido', 'ausente'])(
    'turno existente %s bloquea',
    (estado) => {
      const r = detectarSolape(ocupacion(P, S, 540, 30), [
        existente(ocupacion(P, S, 540, 30), estado),
      ]);
      expect(r.ok).toBe(false);
    },
  );

  it('el buffer no bloquea al profesional: 09:30 en otro sillón es válido', () => {
    const r = detectarSolape(ocupacion(P, T, 570, 30), [existente(ocupacion(P, S, 540, 30, 15))]);
    expect(r.ok).toBe(true);
  });

  it('el buffer ocupa el sillón: 09:30 en S (otro profesional) -> TURNO_SOLAPADO_SILLON', () => {
    const r = detectarSolape(ocupacion(Q, S, 570, 30), [existente(ocupacion(P, S, 540, 30, 10))]);
    expect(r.ok === false && r.error.codigo).toBe('TURNO_SOLAPADO_SILLON');
    expect(r.ok === false && r.error.tipo).toBe('conflicto');
  });

  it('el sillón queda libre al terminar el buffer: 09:40 en S es válido', () => {
    const r = detectarSolape(ocupacion(Q, S, 580, 30), [existente(ocupacion(P, S, 540, 30, 10))]);
    expect(r.ok).toBe(true);
  });

  it('el buffer del candidato también ocupa el sillón del turno siguiente', () => {
    // candidato 09:00-09:30 + buffer 15 -> sillón hasta 09:45; existente de otro profesional en S a las 09:40
    const r = detectarSolape(ocupacion(P, S, 540, 30, 15), [existente(ocupacion(Q, S, 580, 30))]);
    expect(r.ok === false && r.error.codigo).toBe('TURNO_SOLAPADO_SILLON');
  });

  it('turnos adyacentes del mismo profesional y sillón sin buffer son válidos', () => {
    const r = detectarSolape(ocupacion(P, S, 570, 30), [existente(ocupacion(P, S, 540, 30))]);
    expect(r.ok).toBe(true);
  });

  it('si choca por profesional y por sillón, informa el del profesional', () => {
    const r = detectarSolape(ocupacion(P, S, 540, 30), [existente(ocupacion(P, S, 540, 30))]);
    expect(r.ok === false && r.error.codigo).toBe('TURNO_SOLAPADO_PROFESIONAL');
  });

  it('prioriza el conflicto de profesional aunque el de sillón aparezca primero en la lista', () => {
    const r = detectarSolape(ocupacion(P, S, 540, 30), [
      existente(ocupacion(Q, S, 540, 30)),
      existente(ocupacion(P, T, 540, 30)),
    ]);
    expect(r.ok === false && r.error.codigo).toBe('TURNO_SOLAPADO_PROFESIONAL');
  });

  it('sin turnos existentes no hay conflicto', () => {
    expect(detectarSolape(ocupacion(P, S, 540, 30), []).ok).toBe(true);
  });

  it('otro profesional en otro sillón a la misma hora es válido', () => {
    expect(detectarSolape(ocupacion(Q, T, 540, 30), [existente(ocupacion(P, S, 540, 30))]).ok).toBe(
      true,
    );
  });

  it('rechaza un candidato con rango inválido (fin = inicio) con OCUPACION_INVALIDA', () => {
    const r = detectarSolape(ocupacion(P, S, 540, 0), []);
    expect(r.ok === false && r.error.codigo).toBe('OCUPACION_INVALIDA');
  });
});
