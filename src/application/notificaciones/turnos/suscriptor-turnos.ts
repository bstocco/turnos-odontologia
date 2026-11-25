import type { EventoDeTurno, TurnoEventPublisher } from '../../../domain/turno/index.js';
import { sanearCodigoError } from '../errores.js';
import type { LoggerNotificaciones, TipoNotificacion } from '../puertos.js';
import type { ServicioNotificaciones } from '../servicio.js';

export type TipoNotificacionEventoTurno = Exclude<TipoNotificacion, 'codigo' | 'recordatorio'>;

const MAPA_EVENTO_A_TIPO: Record<EventoDeTurno['tipo'], TipoNotificacionEventoTurno> = {
  creado: 'creacion',
  confirmado: 'confirmacion',
  cancelado: 'cancelacion',
  reprogramado: 'reprogramacion',
};

export interface DependenciasSuscriptorTurnos {
  readonly clinicaId: string;
  readonly servicio: Pick<ServicioNotificaciones, 'encolar'>;
  readonly logger: LoggerNotificaciones;
}

/** Construye una clave de idempotencia determinista acotada al turno y tipo de notificación. */
export function claveIdempotenciaTurno(
  turnoId: string,
  tipo: Exclude<TipoNotificacion, 'codigo'>,
): string {
  return `turno:${turnoId}:${tipo}`;
}

/**
 * Suscriptor de `TurnoEventPublisher` (contrato congelado C-09) por clínica.
 * Encola emails de ciclo de vida de turno con deduplicación y aislamiento *fail-open* (`RN-NO-03`).
 */
export function crearPublicadorEventosTurno(
  deps: DependenciasSuscriptorTurnos,
): TurnoEventPublisher {
  return {
    async publicar(evento: EventoDeTurno): Promise<void> {
      const tipo = MAPA_EVENTO_A_TIPO[evento.tipo];
      try {
        const resultado = await deps.servicio.encolar({
          clinicaId: deps.clinicaId,
          turnoId: evento.turnoId,
          tipo,
          claveIdempotencia: claveIdempotenciaTurno(evento.turnoId, tipo),
        });

        if (resultado.estado === 'no_encolada') {
          deps.logger.warn(
            {
              clinicaId: deps.clinicaId,
              turnoId: evento.turnoId,
              tipo,
              codigo: resultado.codigoError,
            },
            'No se pudo encolar notificación de evento de turno',
          );
        }
      } catch (error) {
        const codigo = sanearCodigoError(error, 'ERROR_PUBLICAR_EVENTO_TURNO');
        deps.logger.error(
          {
            clinicaId: deps.clinicaId,
            turnoId: evento.turnoId,
            tipo,
            codigo,
          },
          'Fallo inesperado al publicar evento de turno hacia notificaciones',
        );
      }
    },
  };
}
