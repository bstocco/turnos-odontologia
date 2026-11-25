import { sanearCodigoError } from '../errores.js';
import type { LoggerNotificaciones, RelojNotificaciones } from '../puertos.js';
import type { ServicioNotificaciones } from '../servicio.js';
import type {
  BuscadorTurnosRecordatorio,
  CatalogoClinicasActivas,
  ResultadoCicloRecordatorios,
} from './puertos.js';
import { claveIdempotenciaTurno } from './suscriptor-turnos.js';
import {
  ANTICIPACION_RECORDATORIO_HORAS_DEFECTO,
  calcularVentanaRecordatorio,
} from './ventana-recordatorio.js';

export interface DependenciasPlanificadorRecordatorios {
  readonly catalogoClinicas: CatalogoClinicasActivas;
  readonly buscadorTurnos: BuscadorTurnosRecordatorio;
  readonly servicio: Pick<ServicioNotificaciones, 'encolar'>;
  readonly reloj: RelojNotificaciones;
  readonly logger: LoggerNotificaciones;
  readonly anticipacionHoras?: number;
}

export interface PlanificadorRecordatorios {
  ejecutarCiclo(): Promise<ResultadoCicloRecordatorios>;
}

/**
 * Orquestador multi-tenant del ciclo periódico de recordatorios.
 * Recorre las clínicas activas, calcula la ventana en la zona IANA de cada clínica y encola
 * exactamente un recordatorio idempotente por turno elegible aislando errores por clínica.
 */
export function crearPlanificadorRecordatorios(
  deps: DependenciasPlanificadorRecordatorios,
): PlanificadorRecordatorios {
  const anticipacionHoras = deps.anticipacionHoras ?? ANTICIPACION_RECORDATORIO_HORAS_DEFECTO;

  return {
    async ejecutarCiclo(): Promise<ResultadoCicloRecordatorios> {
      const clinicas = await deps.catalogoClinicas.listarActivas();
      const ahora = deps.reloj.ahora();

      let clinicasProcesadas = 0;
      let clinicasConError = 0;
      let recordatoriosEncolados = 0;
      let duplicados = 0;
      let fallosEncolado = 0;

      for (const clinica of clinicas) {
        try {
          const ventana = calcularVentanaRecordatorio({
            ahora,
            zonaHoraria: clinica.zonaHoraria,
            anticipacionHoras,
          });
          const turnosElegibles = await deps.buscadorTurnos.buscarElegiblesEnVentana(
            clinica.id,
            ventana,
          );

          for (const turnoId of turnosElegibles) {
            const resultado = await deps.servicio.encolar({
              clinicaId: clinica.id,
              turnoId,
              tipo: 'recordatorio',
              claveIdempotencia: claveIdempotenciaTurno(turnoId, 'recordatorio'),
            });

            if (resultado.estado === 'encolada') {
              recordatoriosEncolados += 1;
            } else if (resultado.estado === 'duplicada') {
              duplicados += 1;
            } else {
              fallosEncolado += 1;
            }
          }

          clinicasProcesadas += 1;
        } catch (error) {
          clinicasConError += 1;
          const codigo = sanearCodigoError(error, 'ERROR_CICLO_RECORDATORIOS');
          deps.logger.error(
            { clinicaId: clinica.id, codigo },
            'Error al procesar recordatorios periódicos de clínica',
          );
        }
      }

      return {
        clinicasProcesadas,
        clinicasConError,
        recordatoriosEncolados,
        duplicados,
        fallosEncolado,
      };
    },
  };
}
