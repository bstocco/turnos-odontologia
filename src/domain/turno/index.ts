/** API pública de `turno`. CONTRATO CONGELADO (regla dura 14): cambios solo por PR del dueño con aviso. */
export {
  ESTADOS_INICIALES,
  ESTADOS_TURNO,
  TRANSICIONES,
  esActivo,
  parsearEstado,
  puedeTransicionar,
  type EstadoTurno,
} from './estado.js';
export type { TurnoRepository } from './puertos.js';
export {
  crearTurno,
  transicionar,
  type NuevoTurno,
  type NuevoTurnoValidado,
  type OrigenTurno,
  type Turno,
} from './turno.js';
export type { TurnoEventPublisher, EventoDeTurno } from './turno-eventos.js';
export { turnoEventPublisherNulo } from './turno-eventos.js';
