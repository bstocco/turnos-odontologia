import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import type pg from 'pg';

import { aplicarMigraciones } from '../../../src/infrastructure/db/ejecutor-de-migraciones.js';
import { poolDeLaAplicacion } from '../../../src/infrastructure/db/pool/index.js';
import { withTenant } from '../../../src/infrastructure/db/tenant/with-tenant.js';
import { CLINICA_A, CLINICA_B, insertarConfigDeClinica } from '../../support/aislamiento.js';
import {
  configDeBaseDePrueba,
  consultarComoMigra,
  reiniciarEsquema,
} from '../../support/base-de-datos.js';

export { CLINICA_A, CLINICA_B, consultarComoMigra };

export interface EntornoAuditoria {
  readonly urlMigra: string;
  readonly urlApp: string;
}

export interface ClinicaSintetica {
  readonly id: string;
  readonly slug: string;
  readonly nombre: string;
}

/**
 * Reinicia el esquema de pruebas, aplica todas las migraciones reales de `migrations/` como
 * `migra` y crea `CLINICA_A` y `CLINICA_B`. Como `TRUNCATE auditoria` está prohibido por el
 * trigger append-only (Q4), cada prueba puede aislarse además con `crearClinicaSintetica()`.
 */
export async function prepararBaseAuditoria(): Promise<EntornoAuditoria> {
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
  return { urlMigra, urlApp };
}

/** Crea una clínica sintética aislada para pruebas que no pueden truncar `auditoria` (Q4). */
export async function crearClinicaSintetica(
  prefijo = 'clinica-auditoria',
): Promise<ClinicaSintetica> {
  const id = randomUUID();
  const clinica: ClinicaSintetica = {
    id,
    slug: `${prefijo}-${id.slice(0, 8)}`,
    nombre: `Clínica sintética ${id.slice(0, 8)}`,
  };
  await insertarConfigDeClinica(clinica);
  return clinica;
}

/** Ejecuta `fn` como rol `app` dentro de `withTenant` (transacción con contexto de clínica). */
export function comoApp<T>(
  clinicaId: string,
  fn: (cliente: pg.PoolClient) => Promise<T>,
): Promise<T> {
  return withTenant(clinicaId, fn);
}

/** Ejecuta `fn` como rol `app` SIN contexto de clínica (transacción abierta sin `app.clinica_id`). */
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

/** Cierra el pool de la aplicación al finalizar el archivo de pruebas. */
export async function cerrarPool(): Promise<void> {
  await poolDeLaAplicacion().end();
}
