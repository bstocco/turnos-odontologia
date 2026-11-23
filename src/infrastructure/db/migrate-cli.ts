import { fileURLToPath } from 'node:url';

import { ConfigError, loadConfig } from '../../config/index.js';

import { aplicarMigraciones } from './ejecutor-de-migraciones.js';
import { ErrorDeMigracion } from './migraciones.js';

/** `npm run db:migrate`: usa DATABASE_MIGRATION_URL (perfil `migrate`). */
async function main(): Promise<void> {
  const config = loadConfig('migrate');
  const resultado = await aplicarMigraciones({
    urlDeMigracion: config.databaseMigrationUrl,
    // Raíz del repositorio: funciona igual desde src/ y desde dist/.
    directorio: fileURLToPath(new URL('../../../migrations', import.meta.url)),
    log: (mensaje) => console.log(mensaje),
  });

  if (resultado.fueraDeOrden.length > 0) {
    console.warn(
      `Aviso: se aplicaron fuera de orden (changes independientes): ${resultado.fueraDeOrden.join(', ')}`,
    );
  }
  console.log(
    `Migraciones: ${resultado.aplicadas.length} aplicadas, ${resultado.yaAplicadas} ya estaban aplicadas.`,
  );
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError || error instanceof ErrorDeMigracion) {
    console.error(error.message);
  } else {
    console.error(
      'Falló la ejecución de migraciones:',
      error instanceof Error ? error.message : error,
    );
  }
  process.exit(1);
});
