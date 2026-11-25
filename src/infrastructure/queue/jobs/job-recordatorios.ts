import type { JobResult, JobWithMetadata, PgBoss } from 'pg-boss';

import {
  sanearCodigoError,
  type LoggerNotificaciones,
  type PlanificadorRecordatorios,
  type ResultadoCicloRecordatorios,
} from '../../../application/notificaciones/index.js';

import { NOMBRE_COLA_RECORDATORIOS, asegurarColaRecordatorios } from '../cola-pg-boss.js';

export const CRON_RECORDATORIOS_POR_DEFECTO = '*/15 * * * *';

export interface DependenciasJobRecordatorios {
  readonly boss: PgBoss;
  readonly planificador: PlanificadorRecordatorios;
  readonly logger: LoggerNotificaciones;
  readonly cron?: string;
  readonly pollingIntervalSeconds?: number;
}

export interface JobRecordatorios {
  iniciar(): Promise<void>;
  detener(): Promise<void>;
  ejecutarAhora(): Promise<ResultadoCicloRecordatorios>;
}

/**
 * Controlador del job periódico de recordatorios en `pg-boss` bajo rol `app` sin DDL.
 * Registra el schedule cron en `pgboss.schedule` y consume `notificaciones.recordatorios`.
 */
export function crearJobRecordatorios(deps: DependenciasJobRecordatorios): JobRecordatorios {
  const cron = deps.cron ?? CRON_RECORDATORIOS_POR_DEFECTO;
  let activo = false;
  let workId: string | undefined;

  return {
    async iniciar(): Promise<void> {
      if (activo) return;

      await deps.boss.start();
      await asegurarColaRecordatorios(deps.boss);
      await deps.boss.schedule(NOMBRE_COLA_RECORDATORIOS, cron, {}, { tz: 'UTC' });

      workId = await deps.boss.work(
        NOMBRE_COLA_RECORDATORIOS,
        {
          includeMetadata: true,
          perJobResults: true,
          batchSize: 1,
          pollingIntervalSeconds: deps.pollingIntervalSeconds ?? 5,
        },
        async (trabajos: JobWithMetadata<Record<string, never>>[]): Promise<JobResult[]> => {
          const resultados: JobResult[] = [];
          for (const trabajo of trabajos) {
            try {
              const resumen = await deps.planificador.ejecutarCiclo();
              deps.logger.info(
                {
                  trabajoId: trabajo.id,
                  clinicasProcesadas: resumen.clinicasProcesadas,
                  clinicasConError: resumen.clinicasConError,
                  recordatoriosEncolados: resumen.recordatoriosEncolados,
                  duplicados: resumen.duplicados,
                  fallosEncolado: resumen.fallosEncolado,
                },
                'Ciclo periódico de recordatorios completado',
              );
              resultados.push({ id: trabajo.id, status: 'completed' });
            } catch (error) {
              const codigo = sanearCodigoError(error, 'ERROR_JOB_RECORDATORIOS');
              deps.logger.error(
                { trabajoId: trabajo.id, codigo },
                'Error inesperado ejecutando el job periódico de recordatorios',
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
      await deps.boss.offWork(NOMBRE_COLA_RECORDATORIOS, {
        ...(idActual !== undefined ? { id: idActual } : {}),
        wait: true,
      });
    },

    async ejecutarAhora(): Promise<ResultadoCicloRecordatorios> {
      return deps.planificador.ejecutarCiclo();
    },
  };
}
