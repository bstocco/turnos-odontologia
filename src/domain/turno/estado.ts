import { estadoTurnoInvalido } from '../agenda/errores-agenda.js';
import { error, ok, type Resultado } from '../shared/resultado.js';

export const ESTADOS_TURNO = [
  'pendiente_confirmacion',
  'confirmado',
  'cancelado',
  'reprogramado',
  'atendido',
  'ausente',
] as const;

export type EstadoTurno = (typeof ESTADOS_TURNO)[number];

/** RN-TU-01: única fuente de verdad de las transiciones permitidas. */
export const TRANSICIONES: Readonly<Record<EstadoTurno, readonly EstadoTurno[]>> = {
  pendiente_confirmacion: ['confirmado', 'cancelado', 'reprogramado'],
  confirmado: ['cancelado', 'reprogramado', 'atendido', 'ausente'],
  cancelado: [],
  reprogramado: [],
  atendido: [],
  ausente: [],
};

/** Estados con los que puede nacer un turno. */
export const ESTADOS_INICIALES: readonly EstadoTurno[] = ['pendiente_confirmacion', 'confirmado'];

const ESTADOS_ACTIVOS: ReadonlySet<EstadoTurno> = new Set([
  'pendiente_confirmacion',
  'confirmado',
  'atendido',
  'ausente',
]);

/** Un turno activo ocupa al profesional y al sillón (RN-AG-09). */
export function esActivo(estado: EstadoTurno): boolean {
  return ESTADOS_ACTIVOS.has(estado);
}

export function puedeTransicionar(desde: EstadoTurno, hacia: EstadoTurno): boolean {
  return TRANSICIONES[desde].includes(hacia);
}

export function parsearEstado(valor: unknown): Resultado<EstadoTurno> {
  const encontrado = ESTADOS_TURNO.find((e) => e === valor);
  return encontrado === undefined ? error(estadoTurnoInvalido()) : ok(encontrado);
}
