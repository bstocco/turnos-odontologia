import type {
  PacienteId,
  PrestacionId,
  ProfesionalId,
  SillonId,
  TurnoId,
} from '../../domain/shared/index.js';
import {
  crearTurno,
  transicionar,
  type Turno,
  type TurnoRepository,
} from '../../domain/turno/index.js';
import { valorOLanzar } from '../../domain/shared/resultado.js';
import type { OrigenTurno } from '../../domain/turno/index.js';

import { turnoNoEncontrado } from './errores.js';
import type { AgendaFija } from './agendar-turno.js';

export interface DatosReprogramacion {
  readonly pacienteId: PacienteId;
  readonly profesionalId: ProfesionalId;
  readonly sillonId: SillonId;
  readonly prestacionId: PrestacionId;
  readonly inicio: Date;
  readonly duracionMinutos: number;
  readonly bufferMinutos: number;
  readonly origen: OrigenTurno;
}

/**
 * Caso `reprogramarTurno` (RN-TU-02): crea el turno nuevo con `reprogramadoDe` apuntando
 * al original y pasa el original a `reprogramado`.
 */
export async function reprogramarTurno(
  repositorio: TurnoRepository,
  turnoId: TurnoId,
  datos: DatosReprogramacion,
  ag: AgendaFija,
): Promise<Turno> {
  const original = await repositorio.obtenerPorId(turnoId);
  if (original === null) throw turnoNoEncontrado();

  const hacia = transicionar(original, 'reprogramado', ag.ahora);
  if (!hacia.ok) throw hacia.error;

  const nuevo = crearTurno({
    ...datos,
    estado: 'confirmado',
    reprogramadoDe: original.id,
  });
  if (!nuevo.ok) throw nuevo.error;

  const insertado = await repositorio.insertar(valorOLanzar(nuevo));
  await repositorio.actualizar(original, 'pendiente_confirmacion');
  return insertado;
}
