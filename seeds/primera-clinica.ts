import { loadConfig, type Config } from '../src/config/index.js';
import { assertNoProduction } from '../src/infrastructure/seed/assert-no-production.js';
import {
  aprovisionarClinica,
  type ClinicaAprovisionada,
  type DatosDeNuevaClinica,
} from '../src/application/aprovisionamiento/index.js';
import { repositorioDeAprovisionamiento } from '../src/infrastructure/aprovisionamiento/repositorio-de-clinicas.js';

/**
 * Seed de la primera clínica (C-17): crea la primera clínica del producto.
 * RN-DA-02: solo fuera de producción (`assertNoProduction`) y con la bandera explícita
 * `--primera`; sin datos reales.
 */
export async function ejecutarSeedPrimeraClinica(
  datos: DatosDeNuevaClinica,
  log: (linea: string) => void = () => undefined,
): Promise<ClinicaAprovisionada> {
  const config: Config = loadConfig('seed');
  assertNoProduction(config);
  if (config.nodeEnv === 'production' && !process.argv.includes('--primera')) {
    throw new Error('Seed bloqueada en producción sin la bandera --primera.');
  }

  const resultado = await aprovisionarClinica(repositorioDeAprovisionamiento, datos);
  log(
    `Clínica creada: ${resultado.slug} (id ${resultado.id}); contraseña temporal del primer usuario asignada.`,
  );
  return resultado;
}
