import pg from 'pg';

import { CLINICA_DEL_CONTEXTO_SQL } from '../../../src/infrastructure/db/repositories/compartido/index.js';

export interface NuevoTurnoParaPrueba {
  readonly profesionalId: string;
  readonly sillonId: string;
  readonly inicio: Date;
  readonly duracionMinutos: number;
  readonly bufferMinutos?: number;
  readonly estado?: string;
}

/** Datos sintéticos de un turno (solo para aislamiento por clínica, regla 2). */
export const PROFESIONAL_A = '33333333-3333-4333-8333-333333333333';
export const PROFESIONAL_B = '55555555-5555-4555-8555-555555555555';
export const SILLON_1 = '44444444-4444-4444-8444-444444444444';
export const SILLON_2 = '66666666-6666-4666-8666-666666666666';

/** Inserta un turno dentro de la transacción actual (RLS por contexto de clínica). */
export async function insertarTurno(
  cliente: pg.PoolClient,
  datos: NuevoTurnoParaPrueba,
): Promise<string> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO turno
       (id, clinica_id, profesional_id, sillon_id, inicio, fin, buffer_minutos, fin_sillon, estado, origen)
     VALUES (gen_random_uuid(), ${CLINICA_DEL_CONTEXTO_SQL}, $1, $2, $3::timestamptz,
             $3::timestamptz + make_interval(mins => $4), $5,
             $3::timestamptz + make_interval(mins => $4) + make_interval(mins => $5), $6, 'recepcion')
     RETURNING id`,
    [
      datos.profesionalId,
      datos.sillonId,
      datos.inicio,
      datos.duracionMinutos,
      datos.bufferMinutos ?? 0,
      datos.estado ?? 'pendiente_confirmacion',
    ],
  );
  return rows[0]?.id ?? '';
}

/** Captura el código SQLSTATE o la fila de constraint con que PostgreSQL rechaza la operación. */
export async function codigoDeError(operacion: () => Promise<unknown>): Promise<unknown> {
  try {
    await operacion();
  } catch (error) {
    return (error as { code?: string; constraint?: string }).code;
  }
  throw new Error('Se esperaba que PostgreSQL rechazara la operación');
}
