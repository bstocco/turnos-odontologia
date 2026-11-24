import pg from 'pg';

import { poolDeLaAplicacion } from '../pool/index.js';

/**
 * Ejecuta `fn` dentro de la transacción del tenant: fija `app.clinica_id` con
 * `set_config(..., true)` (equivale a `SET LOCAL`) y el efecto termina con la transacción.
 * El cliente que entrega al callback no tiene contexto de clínica.
 */
export async function withTenant<T>(
  clinicaId: string,
  fn: (cliente: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const cliente = await poolDeLaAplicacion().connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query('SELECT set_config($1, $2, true)', ['app.clinica_id', clinicaId]);
    try {
      const resultado = await fn(cliente);
      await cliente.query('COMMIT');
      return resultado;
    } catch (error) {
      await cliente.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  } finally {
    cliente.release();
  }
}
