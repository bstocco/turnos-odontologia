import { pathToFileURL } from 'node:url';

import {
  crearNotificacionService,
  type LoggerNotificaciones,
  type ResolvedorContenidoEmail,
} from '../../application/notificaciones/index.js';
import { ConfigError, loadConfig } from '../../config/index.js';
import { poolDeLaAplicacion } from '../db/pool/index.js';
import { crearEmailSenderSmtp } from '../email/index.js';
import { crearLogger } from '../logging/logger.js';

import { crearColaNotificacionesPgBoss, crearPgBossApp } from './cola-pg-boss.js';
import { crearEjecutorTenantNotificaciones } from './notificacion-repositorio-pg.js';
import { crearWorkerNotificaciones } from './worker.js';

function resolvedorSinDominio(): ResolvedorContenidoEmail {
  return {
    async resolver() {
      return { estado: 'descartar', codigo: 'RESOLVEDOR_NO_CONFIGURADO' };
    },
  };
}

export interface OpcionesWorkerStandalone {
  readonly resolvedor?: ResolvedorContenidoEmail;
}

/**
 * Arranca el worker de notificaciones en proceso independiente (Q6) usando `loadConfig('app')`
 * y cierra ordenadamente ante `SIGINT` o `SIGTERM`.
 */
export async function ejecutarWorkerStandalone(
  opciones: OpcionesWorkerStandalone = {},
): Promise<() => Promise<void>> {
  const config = loadConfig('app');
  if (config.databaseUrl === undefined) {
    throw new ConfigError([{ variable: 'DATABASE_URL', motivo: 'falta' }]);
  }

  const loggerPino = crearLogger(config);
  const logger: LoggerNotificaciones = {
    info: (datos, mensaje) => loggerPino.info(datos, mensaje),
    warn: (datos, mensaje) => loggerPino.warn(datos, mensaje),
    error: (datos, mensaje) => loggerPino.error(datos, mensaje),
  };

  const emailSender = crearEmailSenderSmtp({
    emailApiKey: config.emailApiKey,
    emailFrom: config.emailFrom,
  });

  const boss = crearPgBossApp({ connectionString: config.databaseUrl });
  const cola = await crearColaNotificacionesPgBoss(boss);
  const servicio = crearNotificacionService({
    ejecutorTenant: crearEjecutorTenantNotificaciones(),
    cola,
    emailSender,
    resolvedor: opciones.resolvedor ?? resolvedorSinDominio(),
    reloj: { ahora: () => new Date() },
    logger,
  });

  const worker = crearWorkerNotificaciones({ boss, servicio, logger });
  await worker.iniciar();
  logger.info({}, 'Worker de notificaciones iniciado');

  return async () => {
    await worker.detener();
    await boss.stop({ graceful: true });
    await poolDeLaAplicacion().end();
  };
}

const esPrincipal =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esPrincipal) {
  ejecutarWorkerStandalone()
    .then((cerrar) => {
      const manejarSenal = (senal: string): void => {
        void cerrar()
          .then(() => process.exit(0))
          .catch((error: unknown) => {
            console.error(
              `Error al cerrar el worker tras ${senal}:`,
              error instanceof Error ? error.message : error,
            );
            process.exit(1);
          });
      };
      process.once('SIGINT', () => manejarSenal('SIGINT'));
      process.once('SIGTERM', () => manejarSenal('SIGTERM'));
    })
    .catch((error: unknown) => {
      if (error instanceof ConfigError) {
        console.error(error.message);
      } else {
        console.error(
          'El worker de notificaciones no pudo arrancar:',
          error instanceof Error ? error.message : error,
        );
      }
      process.exit(1);
    });
}
