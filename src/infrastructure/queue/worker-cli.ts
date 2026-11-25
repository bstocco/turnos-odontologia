import { pathToFileURL } from 'node:url';

import {
  crearNotificacionService,
  crearPlanificadorRecordatorios,
  crearResolvedorContenidoTurno,
  type LoggerNotificaciones,
  type ProveedorEnlacesTurno,
  type RelojNotificaciones,
  type ResolvedorContenidoEmail,
} from '../../application/notificaciones/index.js';
import { ConfigError, loadConfig } from '../../config/index.js';
import { poolDeLaAplicacion } from '../db/pool/index.js';
import { crearEmailSenderSmtp } from '../email/index.js';
import { crearLogger } from '../logging/logger.js';

import { crearColaNotificacionesPgBoss, crearPgBossApp } from './cola-pg-boss.js';
import {
  crearBuscadorTurnosRecordatorioPg,
  crearCatalogoClinicasActivasPg,
  crearJobRecordatorios,
  crearLectorDatosTurnoPg,
  type JobRecordatorios,
} from './jobs/index.js';
import { crearEjecutorTenantNotificaciones } from './notificacion-repositorio-pg.js';
import { crearWorkerNotificaciones } from './worker.js';

export interface OpcionesWorkerStandalone {
  readonly resolvedor?: ResolvedorContenidoEmail;
  readonly proveedorEnlaces?: ProveedorEnlacesTurno;
  readonly habilitarRecordatorios?: boolean;
  readonly anticipacionHoras?: number;
  readonly cronRecordatorios?: string;
  readonly reloj?: RelojNotificaciones;
}

/**
 * Arranca el worker de notificaciones en proceso independiente (Q6) usando `loadConfig('app')`
 * junto al resolvedor de turnos y el job periódico de recordatorios (`C-14`), cerrando
 * ordenadamente ante `SIGINT` o `SIGTERM`.
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

  const reloj = opciones.reloj ?? { ahora: () => new Date() };
  const emailSender = crearEmailSenderSmtp({
    emailApiKey: config.emailApiKey,
    emailFrom: config.emailFrom,
  });

  const resolvedor =
    opciones.resolvedor ??
    crearResolvedorContenidoTurno({
      lector: crearLectorDatosTurnoPg(),
      reloj,
      ...(opciones.proveedorEnlaces !== undefined
        ? { proveedorEnlaces: opciones.proveedorEnlaces }
        : {}),
    });

  const habilitarRecordatorios = opciones.habilitarRecordatorios ?? true;
  const boss = crearPgBossApp({
    connectionString: config.databaseUrl,
    schedule: habilitarRecordatorios,
  });
  const cola = await crearColaNotificacionesPgBoss(boss);
  const servicio = crearNotificacionService({
    ejecutorTenant: crearEjecutorTenantNotificaciones(),
    cola,
    emailSender,
    resolvedor,
    reloj,
    logger,
  });

  const worker = crearWorkerNotificaciones({ boss, servicio, logger });
  await worker.iniciar();

  let jobRecordatorios: JobRecordatorios | undefined;
  if (habilitarRecordatorios) {
    const planificador = crearPlanificadorRecordatorios({
      catalogoClinicas: crearCatalogoClinicasActivasPg(),
      buscadorTurnos: crearBuscadorTurnosRecordatorioPg(),
      servicio,
      reloj,
      logger,
      ...(opciones.anticipacionHoras !== undefined
        ? { anticipacionHoras: opciones.anticipacionHoras }
        : {}),
    });
    jobRecordatorios = crearJobRecordatorios({
      boss,
      planificador,
      logger,
      ...(opciones.cronRecordatorios !== undefined ? { cron: opciones.cronRecordatorios } : {}),
    });
    await jobRecordatorios.iniciar();
  }

  logger.info({ habilitarRecordatorios }, 'Worker de notificaciones iniciado');

  return async () => {
    if (jobRecordatorios !== undefined) {
      await jobRecordatorios.detener();
    }
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
