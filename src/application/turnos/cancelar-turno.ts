import { transicionar, type TurnoRepository } from '../../domain/turno/index.js';
import type { TurnoId } from '../../domain/shared/index.js';
import { turnoNoEncontrado } from './errores.js';

export async function cancelarTurno(repositorio: TurnoRepository, turnoId: TurnoId, ahora: Date) {
  const turno = await repositorio.obtenerPorId(turnoId);
  if (turno === null) throw turnoNoEncontrado();
  const destino = transicionar(turno, 'cancelado', ahora);
  if (!destino.ok) throw destino.error;
  return repositorio.actualizar(destino.valor, turno.estado);
}
