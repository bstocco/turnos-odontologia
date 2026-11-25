import { randomUUID } from 'node:crypto';

import { ErrorDeEnvioEmail, sanearCodigoError } from './errores.js';
import type {
  ColaNotificaciones,
  EjecutorTenant,
  EmailSender,
  LoggerNotificaciones,
  NotificacionRegistrada,
  PayloadColaEmail,
  RelojNotificaciones,
  ResolvedorContenidoEmail,
} from './puertos.js';
import {
  validarEntradaEncolar,
  validarPayloadColaEmail,
  type EntradaEncolarNotificacion,
} from './validaciones.js';

export interface DependenciasNotificacionService {
  readonly ejecutorTenant: EjecutorTenant;
  readonly cola: ColaNotificaciones;
  readonly emailSender: EmailSender;
  readonly resolvedor: ResolvedorContenidoEmail;
  readonly reloj: RelojNotificaciones;
  readonly logger: LoggerNotificaciones;
  readonly generarId?: () => string;
}

export type ResultadoEncolarNotificacion =
  | {
      readonly estado: 'encolada';
      readonly notificacionId: string;
      readonly notificacion: NotificacionRegistrada;
    }
  | {
      readonly estado: 'duplicada';
      readonly notificacionId: string;
      readonly notificacion: NotificacionRegistrada;
    }
  | {
      readonly estado: 'no_encolada';
      readonly notificacionId?: string;
      readonly codigoError: string;
    };

export interface ContextoIntentoTrabajo {
  readonly intentoActual: number;
  readonly maxIntentos: number;
}

export type ResultadoProcesarTrabajo =
  | { readonly accion: 'enviada'; readonly idProveedor: string }
  | { readonly accion: 'omitida'; readonly motivo: 'no_encontrada' | 'ya_enviada' }
  | { readonly accion: 'reintentar'; readonly codigo: string }
  | { readonly accion: 'fallida_definitiva'; readonly codigo: string };

export interface ServicioNotificaciones {
  encolar(entrada: EntradaEncolarNotificacion): Promise<ResultadoEncolarNotificacion>;
  procesarTrabajo(
    payloadCrudo: unknown,
    contexto: ContextoIntentoTrabajo,
  ): Promise<ResultadoProcesarTrabajo>;
}

const FORMATO_CODIGO = /^[A-Z][A-Z0-9_]*$/;

function codigoSeguro(valor: string, porDefecto: string): string {
  return FORMATO_CODIGO.test(valor) ? valor : porDefecto;
}

/**
 * Orquestador puro de notificaciones en la capa de aplicación:
 * - `encolar` deduplica por `(clinicaId, claveIdempotencia)` y aísla fallos de cola (RN-NO-03).
 * - `procesarTrabajo` resuelve contenido al vuelo, envía fuera de transacción DB y maneja reintentos.
 */
export function crearNotificacionService(
  deps: DependenciasNotificacionService,
): ServicioNotificaciones {
  const generarId = deps.generarId ?? randomUUID;

  return {
    async encolar(entrada: EntradaEncolarNotificacion): Promise<ResultadoEncolarNotificacion> {
      const validada = validarEntradaEncolar(entrada);
      let notificacionId: string | undefined;

      try {
        const id = generarId();
        const programadaPara = validada.programadaPara ?? deps.reloj.ahora();

        const { creada, notificacion } = await deps.ejecutorTenant.ejecutar(
          validada.clinicaId,
          (repo) =>
            repo.crearOEncontrarIdempotente({
              id,
              clinicaId: validada.clinicaId,
              turnoId: validada.turnoId,
              canal: 'email',
              tipo: validada.tipo,
              claveIdempotencia: validada.claveIdempotencia,
              programadaPara,
            }),
        );
        notificacionId = notificacion.id;

        if (!creada) {
          return {
            estado: 'duplicada',
            notificacionId: notificacion.id,
            notificacion,
          };
        }

        const payload = validarPayloadColaEmail({
          clinicaId: validada.clinicaId,
          notificacionId: notificacion.id,
        });

        await deps.cola.encolar(payload, {
          singletonKey: `${validada.clinicaId}:${validada.claveIdempotencia}`,
          ...(validada.programadaPara !== undefined ? { startAfter: validada.programadaPara } : {}),
        });

        return {
          estado: 'encolada',
          notificacionId: notificacion.id,
          notificacion,
        };
      } catch (error) {
        const codigoError = sanearCodigoError(error, 'ERROR_TRANSPORTE_COLA');
        deps.logger.error(
          {
            clinicaId: validada.clinicaId,
            ...(notificacionId !== undefined ? { notificacionId } : {}),
            tipo: validada.tipo,
            codigo: codigoError,
          },
          'No se pudo encolar la notificación de correo',
        );
        return {
          estado: 'no_encolada',
          ...(notificacionId !== undefined ? { notificacionId } : {}),
          codigoError,
        };
      }
    },

    async procesarTrabajo(
      payloadCrudo: unknown,
      contexto: ContextoIntentoTrabajo,
    ): Promise<ResultadoProcesarTrabajo> {
      let payload: PayloadColaEmail;
      try {
        payload = validarPayloadColaEmail(payloadCrudo);
      } catch {
        const codigo = 'PAYLOAD_NOTIFICACION_INVALIDO';
        deps.logger.warn({ codigo }, 'Trabajo de notificación descartado por payload inválido');
        return { accion: 'fallida_definitiva', codigo };
      }

      const preparacion = await deps.ejecutorTenant.ejecutar(payload.clinicaId, async (repo) => {
        const notificacion = await repo.buscarPorId(payload.notificacionId);
        if (notificacion === null) {
          return { tipo: 'omitida', motivo: 'no_encontrada' } as const;
        }
        if (notificacion.estado === 'enviada') {
          return { tipo: 'omitida', motivo: 'ya_enviada' } as const;
        }

        const resolucion = await deps.resolvedor.resolver({
          clinicaId: payload.clinicaId,
          notificacion,
        });
        if (resolucion.estado === 'descartar') {
          const codigo = codigoSeguro(resolucion.codigo, 'NOTIFICACION_DESCARTADA');
          await repo.registrarFalloIntento(notificacion.id, {
            definitivo: true,
            errorSeguro: codigo,
          });
          return { tipo: 'descartada', codigo } as const;
        }

        return {
          tipo: 'lista',
          notificacion,
          mensaje: resolucion.mensaje,
        } as const;
      });

      if (preparacion.tipo === 'omitida') {
        return { accion: 'omitida', motivo: preparacion.motivo };
      }
      if (preparacion.tipo === 'descartada') {
        return { accion: 'fallida_definitiva', codigo: preparacion.codigo };
      }

      // El envío externo siempre ocurre fuera de transacciones de base de datos.
      try {
        const resultado = await deps.emailSender.enviar(preparacion.mensaje);
        await deps.ejecutorTenant.ejecutar(payload.clinicaId, (repo) =>
          repo.marcarEnviada(preparacion.notificacion.id, deps.reloj.ahora()),
        );
        return { accion: 'enviada', idProveedor: resultado.idProveedor };
      } catch (error) {
        const reintentable = error instanceof ErrorDeEnvioEmail ? error.reintentable : true;
        const codigo = sanearCodigoError(error, 'ERROR_PROVEEDOR_EMAIL');
        const definitivo = !reintentable || contexto.intentoActual >= contexto.maxIntentos;

        await deps.ejecutorTenant.ejecutar(payload.clinicaId, (repo) =>
          repo.registrarFalloIntento(preparacion.notificacion.id, {
            definitivo,
            errorSeguro: codigo,
          }),
        );

        deps.logger.warn(
          {
            clinicaId: payload.clinicaId,
            notificacionId: payload.notificacionId,
            intento: contexto.intentoActual,
            maxIntentos: contexto.maxIntentos,
            definitivo,
            codigo,
          },
          'Fallo al entregar notificación por correo',
        );

        return definitivo
          ? { accion: 'fallida_definitiva', codigo }
          : { accion: 'reintentar', codigo };
      }
    },
  };
}
