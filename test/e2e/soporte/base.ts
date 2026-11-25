import { join } from 'node:path';

import pg from 'pg';

import type { Config } from '../../../src/config/index.js';
import { aplicarMigraciones } from '../../../src/infrastructure/db/ejecutor-de-migraciones.js';
import {
  asegurarBaseDePrueba,
  configDeBaseDePrueba,
  reiniciarEsquema,
} from '../../support/base-de-datos.js';

const TABLA_MARCA = 'e2e_preparado';

/**
 * Deja la base de pruebas lista para los e2e: guarda de host y de nombre ANTES de borrar nada,
 * esquema reiniciado y las migraciones REALES aplicadas con el rol `migra` (spec pruebas-e2e-flujos).
 */
export async function prepararBaseE2E(config: Config = configDeBaseDePrueba()): Promise<void> {
  asegurarBaseDePrueba(config);
  const urlMigra = config.testDatabaseMigrationUrl;
  if (urlMigra === undefined) throw new Error('Falta TEST_DATABASE_MIGRATION_URL.');

  await reiniciarEsquema(urlMigra);
  await aplicarMigraciones({
    urlDeMigracion: urlMigra,
    directorio: join(process.cwd(), 'migrations'),
  });

  const cliente = new pg.Client({ connectionString: urlMigra });
  await cliente.connect();
  try {
    await cliente.query(
      `CREATE TABLE ${TABLA_MARCA} (preparado_en timestamptz NOT NULL DEFAULT now())`,
    );
    await cliente.query(`INSERT INTO ${TABLA_MARCA} DEFAULT VALUES`);
  } finally {
    await cliente.end();
  }
}

/**
 * Garantiza el esquema migrado. En `npm test` el proyecto `integration` corre antes y deja el
 * esquema en otro estado: si falta la marca de este proyecto, se vuelve a preparar.
 */
export async function asegurarEsquemaE2E(config: Config = configDeBaseDePrueba()): Promise<void> {
  asegurarBaseDePrueba(config);
  const urlMigra = config.testDatabaseMigrationUrl;
  if (urlMigra === undefined) throw new Error('Falta TEST_DATABASE_MIGRATION_URL.');
  const cliente = new pg.Client({ connectionString: urlMigra });
  await cliente.connect();
  let preparado: boolean;
  try {
    const { rows } = await cliente.query<{ existe: string | null }>(
      `SELECT to_regclass('public.${TABLA_MARCA}')::text AS existe`,
    );
    preparado = rows[0]?.existe != null;
  } finally {
    await cliente.end();
  }
  if (!preparado) await prepararBaseE2E(config);
}
