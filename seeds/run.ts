import { loadConfig } from '../src/config/index.js';
import { assertNoProduction } from '../src/infrastructure/seed/assert-no-production.js';

/**
 * Ejecutor de seeds. Aplica las guardas de RN-DA-02 antes de cualquier acceso a la base.
 * C-05 agrega los seeds de datos sintéticos; C-17 el de la primera clínica.
 */
function main(): void {
  const config = loadConfig('seed');
  assertNoProduction(config);
  console.log('Guardas superadas. Todavía no hay seeds registrados.');
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Error desconocido al ejecutar los seeds.',
  );
  process.exit(1);
}
