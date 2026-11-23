import type { Config } from '../../config/index.js';

/** La guarda rechazó la ejecución. El mensaje nunca incluye usuario ni contraseña. */
export class SeedBloqueadoError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'SeedBloqueadoError';
  }
}

/** Extrae el host de una URL de conexión, sin credenciales ni corchetes IPv6. */
export function hostDeLaBase(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return host === '' ? undefined : host;
  } catch {
    return undefined;
  }
}

/**
 * RN-DA-02: los seeds solo corren si se habilitan de forma explícita, fuera de producción y
 * contra un host permitido (por defecto, solo hosts locales). No abre ninguna conexión.
 */
export function assertNoProduction(config: Config): void {
  if (!config.allowSeed) {
    throw new SeedBloqueadoError(
      'Los seeds están deshabilitados. Definí ALLOW_SEED=true para habilitarlos (nunca en producción).',
    );
  }
  if (config.nodeEnv === 'production') {
    throw new SeedBloqueadoError('Entorno de producción: los seeds no pueden ejecutarse.');
  }
  const host = hostDeLaBase(config.databaseUrl);
  if (host === undefined) {
    throw new SeedBloqueadoError(
      'No se pudo determinar el host de la base de datos: seed rechazado.',
    );
  }
  if (!config.seedAllowedHosts.includes(host)) {
    throw new SeedBloqueadoError(
      `El host '${host}' no está en SEED_ALLOWED_HOSTS: seed rechazado.`,
    );
  }
}
