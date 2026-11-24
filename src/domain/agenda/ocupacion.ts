import type { ProfesionalId, SillonId } from '../shared/ids.js';
import { error, ok, type Resultado } from '../shared/resultado.js';
import { esActivo, type EstadoTurno } from '../turno/estado.js';
import {
  ocupacionInvalida,
  turnoSolapadoProfesional,
  turnoSolapadoSillon,
} from './errores-agenda.js';
import { crearIntervalo, seSolapa, type Intervalo } from './intervalo.js';

const MINUTO_MS = 60_000;

/** Lo que un turno (candidato o existente) ocupa: profesional [inicio, fin) y sillón [inicio, finSillon). */
export interface OcupacionCandidata {
  readonly profesionalId: ProfesionalId;
  readonly sillonId: SillonId;
  readonly inicio: Date;
  readonly fin: Date;
  readonly finSillon: Date;
}

export interface OcupacionExistente extends OcupacionCandidata {
  readonly estado: EstadoTurno;
}

function esEnteroNoNegativo(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}

function rango(inicio: Date, duracionMinutos: number, bufferMinutos: number): Resultado<Intervalo> {
  if (!Number.isInteger(duracionMinutos) || duracionMinutos <= 0)
    return error(ocupacionInvalida('duración'));
  if (!esEnteroNoNegativo(bufferMinutos)) return error(ocupacionInvalida('buffer'));
  const r = crearIntervalo(
    inicio,
    new Date(inicio.getTime() + (duracionMinutos + bufferMinutos) * MINUTO_MS),
  );
  return r.ok ? r : error(ocupacionInvalida('inicio'));
}

/** RN-AG-04: [inicio, inicio + duración). El buffer nunca extiende al profesional (RN-AG-02). */
export function rangoProfesional(inicio: Date, duracionMinutos: number): Resultado<Intervalo> {
  return rango(inicio, duracionMinutos, 0);
}

/** RN-AG-05: [inicio, inicio + duración + buffer). */
export function rangoSillon(
  inicio: Date,
  duracionMinutos: number,
  bufferMinutos: number,
): Resultado<Intervalo> {
  return rango(inicio, duracionMinutos, bufferMinutos);
}

/**
 * Rechaza al candidato si choca con algún turno ACTIVO existente (RN-AG-01, RN-AG-02, RN-AG-09).
 * Si choca por profesional y por sillón informa primero el del profesional.
 */
export function detectarSolape(
  candidato: OcupacionCandidata,
  existentes: readonly OcupacionExistente[],
): Resultado<void> {
  const candProf = crearIntervalo(candidato.inicio, candidato.fin);
  const candSillon = crearIntervalo(candidato.inicio, candidato.finSillon);
  if (!candProf.ok || !candSillon.ok) return error(ocupacionInvalida('rango del candidato'));

  const activos = existentes.filter((t) => esActivo(t.estado));

  const chocaProfesional = activos.some((t) => {
    if (t.profesionalId !== candidato.profesionalId) return false;
    const r = crearIntervalo(t.inicio, t.fin);
    return r.ok && seSolapa(candProf.valor, r.valor);
  });
  if (chocaProfesional) return error(turnoSolapadoProfesional());

  const chocaSillon = activos.some((t) => {
    if (t.sillonId !== candidato.sillonId) return false;
    const r = crearIntervalo(t.inicio, t.finSillon);
    return r.ok && seSolapa(candSillon.valor, r.valor);
  });
  if (chocaSillon) return error(turnoSolapadoSillon());

  return ok(undefined);
}
