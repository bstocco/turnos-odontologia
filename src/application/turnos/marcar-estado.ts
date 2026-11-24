import { type EstadoTurno, transicionar, type TurnoRepository } from '../../domain/turno/index.js';
import type { TurnoId } from '../../domain/shared/index.js';
import { turnoNoEncontrado } from './errores.js';

/** `marcarAtendido` / `marcarAusente`: RN-TU-04 — no antes de la hora de inicio. */
export async function marcarAsistencia(
  repositorio: TurnoRepository,
  turnoId: TurnoId,
  estado: 'atendido' | 'ausente',
  ahora: Date,
) {
  const turno = await repositorio.obtenerPorId(turnoId);
  if (turno === null) throw turnoNoEncontrado();
  const destino = transicionar(turno, estado as EstadoTurno, ahora);
  if (!destino.ok) throw destino.error;
  return repositorio.actualizar(destino.valor, turno.estado);
}

export async function marcarAtendido(repositorio: TurnoRepository, turnoId: TurnoId, ahora: Date) {
  return marcarAsistencia(repositorio, turnoId, 'atendido', ahora);
}

export async function marcarAusente(repositorio: TurnoRepository, turnoId: TurnoId, ahora: Date) {
  return marcarAsistencia(repositorio, turnoId, 'ausente', ahora);
}
