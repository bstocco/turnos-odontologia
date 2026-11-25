import {
  type AgendaReader,
  type ConfiguracionAgenda,
  crearIntervaloOLanzar,
  instanteALocal,
  sumarDias,
  validarTurnoPrevio,
} from '../../domain/agenda/index.js';
import type {
  PacienteId,
  PrestacionId,
  ProfesionalId,
  SillonId,
} from '../../domain/shared/index.js';
import { valorOLanzar } from '../../domain/shared/resultado.js';
import {
  crearTurno,
  turnoEventPublisherNulo,
  type OrigenTurno,
  type Turno,
  type TurnoEventPublisher,
  type TurnoRepository,
} from '../../domain/turno/index.js';

/** Agenda de la clínica para el turno: granularidad y zona, y la fecha de "hoy" del dominio. */
export interface AgendaFija {
  readonly config: ConfiguracionAgenda;
  readonly ahora: Date;
}

/** Datos de un turno nuevo (sin id, sin fin): la base calcula `fin` y `fin_sillon`. */
export interface NuevoTurnoDelCaso {
  readonly pacienteId: PacienteId;
  readonly profesionalId: ProfesionalId;
  readonly sillonId: SillonId;
  readonly prestacionId: PrestacionId;
  readonly inicio: Date;
  readonly duracionMinutos: number;
  readonly bufferMinutos: number;
  readonly origen: OrigenTurno;
}

export interface RetrasoDeRetries {
  /** Intentos de inserción antes de devolver el error de solape de sillón (3.2). */
  readonly intentos: number;
  readonly esperaMs?: number;
}

/**
 * Caso `agendarTurno`: valida con el dominio (RN-AG-06 a RN-AG-11), inserta el turno y,
 * ante un solape detectado por la base, reintenta la inserción antes de devolver el
 * error (asignación automática de sillón libre con reintentos, 3.2).
 */
export async function agendarTurno(
  repositorio: TurnoRepository,
  agenda: AgendaReader,
  ag: AgendaFija,
  nuevo: NuevoTurnoDelCaso,
  opciones: RetrasoDeRetries = { intentos: 3 },
  publicador: TurnoEventPublisher = turnoEventPublisherNulo(),
): Promise<Turno> {
  const validado = valorOLanzar(
    crearTurno({ ...nuevo, estado: 'pendiente_confirmacion', reprogramadoDe: null }),
  );

  const rango = crearIntervaloOLanzar(validado.inicio, validado.fin);
  const local = valorOLanzar(instanteALocal(validado.inicio, ag.config.zonaHoraria));
  const [franjas, feriados, bloqueos] = await Promise.all([
    agenda.franjasDeAtencion(validado.profesionalId),
    agenda.feriados(local.fecha, sumarDias(local.fecha, 1)),
    agenda.bloqueos(validado.profesionalId, rango),
  ]);

  const validacion = validarTurnoPrevio({
    inicio: validado.inicio,
    rangoProfesional: rango,
    ahora: ag.ahora,
    config: ag.config,
    feriados,
    franjas,
    bloqueos,
  });
  if (!validacion.ok) throw validacion.error;

  const intentos = Math.max(1, opciones.intentos);
  for (let i = 0; i < intentos; i++) {
    try {
      const insertado = await repositorio.insertar(validado);
      await publicador.publicar({ tipo: 'creado', turnoId: insertado.id });
      return insertado;
    } catch (error) {
      if (i === intentos - 1) throw error;
      await new Promise((resolver) => setTimeout(resolver, opciones.esperaMs ?? 30));
    }
  }
  throw new Error('agendarTurno: no se alcanzó el intento final');
}
