import type { JobResult, JobWithMetadata, PgBoss } from 'pg-boss';

import {
  sanearCodigoError,
  type LoggerNotificaciones,
  type PayloadColaEmail,
  type ServicioNotificaciones,
} from '../../application/notificaciones/index.js';

import {
  NOMBRE_COLA_EMAIL,
  asegurarColaEmail,
  type PoliticaReintentosCola,
} from './cola-pg-boss.js';

export interface DependenciasWorkerNotificaciones {
  readonly boss: PgBoss;
  readonly servicio: ServicioNotificaciones;
  readonly logger: LoggerNotificaciones;
  readonly politica?: Partial<PoliticaReintentosCola>;
  readonly pollingIntervalSeconds?: number;
  readonly batchSize?: number;
}

export interface WorkerNotificaciones {
  iniciar(): Promise<void>;
  detener(): Promise<void>;
}

/**
 * Worker de notificaciones sobre `pg-boss` v12 (`perJobResults: true`, `includeMetadata: true`).
 * Soporta arranque y detención idempotentes para uso embebido o standalone.
 */
export function crearWorkerNotificaciones(
  deps: DependenciasWorkerNotificaciones,
): WorkerNotificaciones {
  let activo = false;
  let workId: string | undefined;

  return {
    async iniciar(): Promise<void> {
      if (activo) return;

      await deps.boss.start();
      await asegurarColaEmail(deps.boss, deps.politica);

      workId = await deps.boss.work(
        NOMBRE_COLA_EMAIL,
        {
          includeMetadata: true,
          perJobResults: true,
          batchSize: deps.batchSize ?? 1,
          pollingIntervalSeconds: deps.pollingIntervalSeconds ?? 2,
        },
        async (trabajos: JobWithMetadata<PayloadColaEmail>[]): Promise<JobResult[]> => {
          const resultados: JobResult[] = [];
          for (const trabajo of trabajos) {
            const intentoActual = trabajo.retryCount + 1;
            const maxIntentos = trabajo.retryLimit + 1;
            try {
              const res = await deps.servicio.procesarTrabajo(trabajo.data, {
                intentoActual,
                maxIntentos,
              });

              if (res.accion === 'enviada' || res.accion === 'omitida') {
                resultados.push({ id: trabajo.id, status: 'completed' });
              } else if (res.accion === 'reintentar') {
                resultados.push({
                  id: trabajo.id,
                  status: 'failed',
                  output: { codigo: res.codigo },
                });
              } else {
                resultados.push({
                  id: trabajo.id,
                  status: 'deadletter',
                  output: { codigo: res.codigo },
                });
              }
            } catch (error) {
              const codigo = sanearCodigoError(error, 'ERROR_PROCESAMIENTO_COLA');
              deps.logger.error(
                { trabajoId: trabajo.id, codigo },
                'Error inesperado procesando trabajo de notificación',
              );
              resultados.push({
                id: trabajo.id,
                status: 'failed',
                output: { codigo },
              });
            }
          }
          return resultados;
        },
      );

      activo = true;
    },

    async detener(): Promise<void> {
      if (!activo) return;
      activo = false;
      const idActual = workId;
      workId = undefined;
      await deps.boss.offWork(NOMBRE_COLA_EMAIL, {
        ...(idActual !== undefined ? { id: idActual } : {}),
        wait: true,
      });
    },
  };
}
