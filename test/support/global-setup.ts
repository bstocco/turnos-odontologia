import { asegurarBaseDePrueba, configDeBaseDePrueba, reiniciarEsquema } from './base-de-datos.js';

/** Preparación global del proyecto `integration`: guarda de host y esquema limpio. */
export default async function preparar(): Promise<void> {
  const config = configDeBaseDePrueba();
  asegurarBaseDePrueba(config);
  if (config.testDatabaseMigrationUrl === undefined) {
    throw new Error('Falta TEST_DATABASE_MIGRATION_URL.');
  }
  await reiniciarEsquema(config.testDatabaseMigrationUrl);
}
