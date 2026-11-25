import {
  transicionar,
  turnoEventPublisherNulo,
  type TurnoEventPublisher,
  type TurnoRepository,
} from '../../domain/turno/index.js';
import type { TurnoId } from '../../domain/shared/index.js';
import { turnoNoEncontrado } from './errores.js';

export async function cancelarTurno(
  repositorio: TurnoRepository,
  turnoId: TurnoId,
  ahora: Date,
  publicador: TurnoEventPublisher = turnoEventPublisherNulo(),
) {
  const turno = await repositorio.obtenerPorId(turnoId);
  if (turno === null) throw turnoNoEncontrado();
  const destino = transicionar(turno, 'cancelado', ahora);
  if (!destino.ok) throw destino.error;
  const actualizado = await repositorio.actualizar(destino.valor, turno.estado);
  await publicador.publicar({ tipo: 'cancelado', turnoId: actualizado.id });
  return actualizado;
}
