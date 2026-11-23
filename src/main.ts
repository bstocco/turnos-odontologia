import { ConfigError, describirConfig, loadConfig } from './config/index.js';
import { buildApp } from './interfaces/http/app.js';

async function main(): Promise<void> {
  const config = loadConfig('app');
  const app = await buildApp(config);

  app.log.info({ configuracion: describirConfig(config) }, 'Configuración cargada');

  const cerrar = async (senal: string): Promise<void> => {
    app.log.info({ senal }, 'Cierre ordenado');
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void cerrar('SIGINT'));
  process.once('SIGTERM', () => void cerrar('SIGTERM'));

  // En producción escucha en todas las interfaces (PaaS); en local, solo en loopback.
  const host = config.nodeEnv === 'production' ? '0.0.0.0' : '127.0.0.1';
  await app.listen({ host, port: config.port });
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(error.message);
  } else {
    console.error('El servicio no pudo arrancar:', error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
