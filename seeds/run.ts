import { loadConfig } from '../src/config/index.js';
import { poolDeLaAplicacion } from '../src/infrastructure/db/pool/index.js';
import { assertNoProduction } from '../src/infrastructure/seed/assert-no-production.js';
import { ejecutarSeedDemo } from './demo-clinica.js';

/**
 * Ejecutor de seeds. Aplica las guardas de RN-DA-02 antes de cualquier acceso a la base.
 * C-05 registra el seed de la clínica de demostración; C-17 el de la primera clínica.
 */
async function main(): Promise<void> {
  const config = loadConfig('seed');
  assertNoProduction(config);
  try {
    await ejecutarSeedDemo(config, (linea) => console.log(linea));
  } finally {
    // El pool mantiene el proceso vivo: se cierra al terminar (si se llegó a abrir).
    await poolDeLaAplicacion().end();
  }
}

try {
  await main();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Error desconocido al ejecutar los seeds.',
  );
  process.exit(1);
}
