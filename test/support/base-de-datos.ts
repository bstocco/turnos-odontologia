import pg from 'pg';

import { loadConfig, type Config } from '../../src/config/index.js';
import { hostDeLaBase } from '../../src/infrastructure/seed/assert-no-production.js';

/** Configuración de la base de pruebas (perfil `test`); falla con una guía si falta algo. */
export function configDeBaseDePrueba(): Config {
  try {
    return loadConfig('test');
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${detalle}\n\nLas pruebas de integración necesitan una base PostgreSQL de pruebas.\n` +
        'Levantala (docker compose up -d --wait, o PostgreSQL nativo con docker/postgres/init/01-roles.sql)\n' +
        'y definí TEST_DATABASE_URL y TEST_DATABASE_MIGRATION_URL. Ver README.',
      { cause: error },
    );
  }
}

function nombreDeLaBase(url: string): string {
  return new URL(url).pathname.replace(/^\//, '');
}

/**
 * Antes de borrar nada: el host debe estar en la lista permitida y la base debe terminar en
 * `_test`. Es la misma idea que assertNoProduction (RN-DA-02) aplicada a las pruebas.
 */
export function asegurarBaseDePrueba(config: Config): void {
  const urls = [config.testDatabaseUrl, config.testDatabaseMigrationUrl];
  for (const url of urls) {
    const host = hostDeLaBase(url);
    if (host === undefined || !config.seedAllowedHosts.includes(host)) {
      throw new Error(
        `La base de pruebas está en un host no permitido ('${host ?? 'desconocido'}'). ` +
          'Las pruebas solo corren contra hosts de SEED_ALLOWED_HOSTS.',
      );
    }
    const base = url === undefined ? '' : nombreDeLaBase(url);
    if (!base.endsWith('_test')) {
      throw new Error(
        `El nombre de la base de pruebas debe terminar en _test (recibido: '${base}').`,
      );
    }
  }
}

/** Deja el esquema `public` vacío, propiedad de `migra` y con USO para `app`. */
export async function reiniciarEsquema(urlDeMigracion: string): Promise<void> {
  const cliente = new pg.Client({ connectionString: urlDeMigracion });
  await cliente.connect();
  try {
    await cliente.query('DROP SCHEMA IF EXISTS public CASCADE');
    await cliente.query('CREATE SCHEMA public');
    await cliente.query('GRANT USAGE ON SCHEMA public TO app');
  } finally {
    await cliente.end();
  }
}

/** Ejecuta una consulta con el rol de migraciones (para verificar el estado de la base). */
export async function consultarComoMigra<T extends Record<string, unknown>>(
  urlDeMigracion: string,
  sql: string,
  parametros: unknown[] = [],
): Promise<T[]> {
  const cliente = new pg.Client({ connectionString: urlDeMigracion });
  await cliente.connect();
  try {
    return (await cliente.query(sql, parametros)).rows as T[];
  } finally {
    await cliente.end();
  }
}
