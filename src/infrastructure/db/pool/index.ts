import pg from 'pg';

import { loadConfig } from '../../../config/index.js';

let pool: pg.Pool | undefined;

/** Pool de la aplicación: entrega clientes sin contexto de clínica. Se crea una sola vez. */
export function poolDeLaAplicacion(): pg.Pool {
  if (pool === undefined) {
    const config = loadConfig('app');
    if (config.databaseUrl === undefined) {
      throw new Error('Falta la conexión de la aplicación (DATABASE_URL, perfil app).');
    }
    pool = new pg.Pool({ connectionString: config.databaseUrl });
  }
  return pool;
}
