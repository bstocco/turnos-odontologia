import {
  estadoTurnoInvalido,
  transicionTurnoInvalida,
  turnoAunNoIniciado,
} from '../agenda/errores-agenda.js';
import { rangoProfesional, rangoSillon } from '../agenda/ocupacion.js';
import type { PacienteId, PrestacionId, ProfesionalId, SillonId, TurnoId } from '../shared/ids.js';
import { error, ok, type Resultado } from '../shared/resultado.js';
import { ESTADOS_INICIALES, puedeTransicionar, type EstadoTurno } from './estado.js';

export type OrigenTurno = 'recepcion' | 'enlace_web';

/** Datos de un turno ya validado, listo para insertar (sin id ni auditoría: los asigna la base). */
export interface NuevoTurnoValidado {
  readonly pacienteId: PacienteId;
  readonly profesionalId: ProfesionalId;
  readonly sillonId: SillonId;
  readonly prestacionId: PrestacionId;
  readonly inicio: Date;
  readonly fin: Date;
  readonly bufferMinutos: number;
  readonly finSillon: Date;
  readonly estado: EstadoTurno;
  readonly origen: OrigenTurno;
  readonly reprogramadoDe: TurnoId | null;
}

/** Turno persistido. `clinicaId` no está: el tenant es implícito. */
export interface Turno extends NuevoTurnoValidado {
  readonly id: TurnoId;
  readonly duracionRealMinutos: number | null;
  readonly creadoEn: Date;
  readonly actualizadoEn: Date;
}

/** Entrada de `crearTurno`: la duración viene de la prestación y el buffer se copia del sillón. */
export interface NuevoTurno {
  readonly pacienteId: PacienteId;
  readonly profesionalId: ProfesionalId;
  readonly sillonId: SillonId;
  readonly prestacionId: PrestacionId;
  readonly inicio: Date;
  readonly duracionMinutos: number;
  readonly bufferMinutos: number;
  readonly estado: EstadoTurno;
  readonly origen: OrigenTurno;
  readonly reprogramadoDe: TurnoId | null;
}

export function crearTurno(nuevo: NuevoTurno): Resultado<NuevoTurnoValidado> {
  if (!ESTADOS_INICIALES.includes(nuevo.estado))
    return error(estadoTurnoInvalido('estado inicial no permitido'));
  const profesional = rangoProfesional(nuevo.inicio, nuevo.duracionMinutos);
  if (!profesional.ok) return profesional;
  const sillon = rangoSillon(nuevo.inicio, nuevo.duracionMinutos, nuevo.bufferMinutos);
  if (!sillon.ok) return sillon;
  return ok({
    pacienteId: nuevo.pacienteId,
    profesionalId: nuevo.profesionalId,
    sillonId: nuevo.sillonId,
    prestacionId: nuevo.prestacionId,
    inicio: profesional.valor.inicio,
    fin: profesional.valor.fin,
    bufferMinutos: nuevo.bufferMinutos,
    finSillon: sillon.valor.fin,
    estado: nuevo.estado,
    origen: nuevo.origen,
    reprogramadoDe: nuevo.reprogramadoDe,
  });
}

/** Devuelve un turno nuevo con el estado destino; el original no se modifica. `ahora` entra por parámetro. */
export function transicionar(turno: Turno, hacia: EstadoTurno, ahora: Date): Resultado<Turno> {
  if (!puedeTransicionar(turno.estado, hacia))
    return error(transicionTurnoInvalida(`${turno.estado} -> ${hacia}`));
  if ((hacia === 'atendido' || hacia === 'ausente') && ahora.getTime() < turno.inicio.getTime()) {
    return error(turnoAunNoIniciado());
  }
  return ok({ ...turno, estado: hacia, actualizadoEn: new Date(ahora.getTime()) });
}
