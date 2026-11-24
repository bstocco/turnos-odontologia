import type { TurnoId } from '../shared/ids.js';
import type { EstadoTurno } from './estado.js';
import type { NuevoTurnoValidado, Turno } from './turno.js';

/**
 * Persistencia de turnos. CONTRATO CONGELADO (regla dura 14). Tenant implícito: sin `clinicaId`;
 * un turno de otra clínica se ve como inexistente (`null`).
 */
export interface TurnoRepository {
  obtenerPorId(id: TurnoId): Promise<Turno | null>;
  /**
   * Inserta un turno ya validado y lo devuelve persistido. Ante un solape detectado por la base
   * falla con `TURNO_SOLAPADO_PROFESIONAL` o `TURNO_SOLAPADO_SILLON` (409).
   */
  insertar(nuevo: NuevoTurnoValidado): Promise<Turno>;
  /**
   * Actualiza condicionado al estado leído (`UPDATE ... WHERE id = $1 AND estado = $2`). Si cambió,
   * falla con `TURNO_MODIFICADO_CONCURRENTEMENTE` (409) sin modificar nada.
   */
  actualizar(turno: Turno, estadoEsperado: EstadoTurno): Promise<Turno>;
}
