import { join } from 'node:path';

import pg from 'pg';

import { aplicarMigraciones } from '../../../src/infrastructure/db/ejecutor-de-migraciones.js';
import { poolDeLaAplicacion } from '../../../src/infrastructure/db/pool/index.js';
import { withTenant } from '../../../src/infrastructure/db/tenant/with-tenant.js';
import { CLINICA_A, CLINICA_B, insertarConfigDeClinica } from '../../support/aislamiento.js';
import {
  configDeBaseDePrueba,
  consultarComoMigra,
  reiniciarEsquema,
} from '../../support/base-de-datos.js';

export { CLINICA_A, CLINICA_B };

/** Identificadores fijos y sintéticos de recursos de prueba (no son datos reales, regla 2). */
export const ZONA_CLINICA_B = 'America/Santiago';

export interface EntornoDePrueba {
  readonly urlMigra: string;
  readonly urlApp: string;
}

/**
 * Reinicia el esquema, aplica las migraciones REALES de `migrations/` con el rol `migra` y deja
 * dos clínicas sintéticas (A y B) con `clinica_config` por defecto. La B queda en America/Santiago.
 * Apunta el pool de la aplicación a la base de pruebas (el arnés de C-03 lo lee de DATABASE_URL).
 */
export async function prepararBaseDeDatosClinica(): Promise<EntornoDePrueba> {
  const config = configDeBaseDePrueba();
  const urlMigra = config.testDatabaseMigrationUrl as string;
  const urlApp = config.testDatabaseUrl as string;
  process.env.DATABASE_URL = urlApp;

  await reiniciarEsquema(urlMigra);
  await aplicarMigraciones({
    urlDeMigracion: urlMigra,
    directorio: join(process.cwd(), 'migrations'),
  });
  await insertarConfigDeClinica(CLINICA_A);
  await insertarConfigDeClinica(CLINICA_B);
  await withTenant(CLINICA_B.id, (cliente) =>
    cliente.query('UPDATE clinica SET zona_horaria = $1 WHERE id = $2', [
      ZONA_CLINICA_B,
      CLINICA_B.id,
    ]),
  );
  return { urlMigra, urlApp };
}

/** Ejecuta `fn` como rol `app` dentro de `withTenant` (transacción con contexto de clínica). */
export function comoApp<T>(
  clinicaId: string,
  fn: (cliente: pg.PoolClient) => Promise<T>,
): Promise<T> {
  return withTenant(clinicaId, fn);
}

/** Ejecuta `fn` como rol `app` SIN contexto de clínica (transacción abierta, sin `app.clinica_id`). */
export async function comoAppSinContexto<T>(
  fn: (cliente: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const cliente = await poolDeLaAplicacion().connect();
  try {
    await cliente.query('BEGIN');
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

/** Cierra el pool de la aplicación al terminar el archivo de pruebas. */
export async function cerrarPool(): Promise<void> {
  await poolDeLaAplicacion().end();
}

export { consultarComoMigra };
