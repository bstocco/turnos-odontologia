import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify';
import type { PgBoss } from 'pg-boss';

import { validarSlug } from '../../../../application/disponibilidad/index.js';
import {
  ErrorDeEnvioEmail,
  crearNotificacionService,
  crearPublicadorEventosTurno,
  crearResolvedorContenidoTurno,
  sanearCodigoError,
  type EmailSender,
  type LoggerNotificaciones,
  type RelojNotificaciones,
  type ServicioNotificaciones,
} from '../../../../application/notificaciones/index.js';
import {
  datosPublicosInvalidos,
  ejecutarAccionPublicaTurno,
  normalizarEmailPublico,
  recursoPublicoNoEncontrado,
  reservarTurnoPublico,
  solicitarCodigoVerificacion,
} from '../../../../application/reserva-publica/index.js';
import { loadConfig } from '../../../../config/index.js';
import type { EventoDeTurno, TurnoEventPublisher } from '../../../../domain/turno/index.js';
import { cryptoComunicacion } from '../../../../infrastructure/crypto/index.js';
import { poolDeLaAplicacion } from '../../../../infrastructure/db/pool/index.js';
import { resolverClinicaPorSlug } from '../../../../infrastructure/db/repositories/clinica-publica/index.js';
import {
  crearEjecutorAccionPublicaPg,
  crearEjecutorReservaPublicaPg,
  crearEjecutorSolicitudCodigoPg,
  crearProveedorEnlacesTurnoPg,
  resolverClinicaPorHashTokenConPool,
} from '../../../../infrastructure/db/repositories/reserva-publica/index.js';
import { crearEmailSenderSmtp } from '../../../../infrastructure/email/index.js';
import {
  crearColaNotificacionesPgBoss,
  crearEjecutorTenantNotificaciones,
  crearLectorDatosTurnoPg,
  crearPgBossApp,
} from '../../../../infrastructure/queue/index.js';
import { parsearLimiteDeTasa } from '../publico-disponibilidad/limite-de-tasa.js';

import {
  AccionTurnoBody,
  ErrorPublicoDto,
  ParamsDeClinica,
  RespuestaAccionTurnoDto,
  RespuestaCodigoDto,
  RespuestaReservaDto,
  SolicitudCodigoBody,
  SolicitudReservaBody,
} from './esquemas.js';
import { LimiteDeTasaPorEmail, type OpcionesLimitePorEmail } from './limite-email.js';

const CAPACIDAD_POR_DEFECTO = 10_000;
const LIMITE_IP_POR_DEFECTO = '30/min';
const VENTANA_EMAIL_MS = 15 * 60_000;

export interface OpcionesModuloPublicoReservas {
  readonly cache?: number;
  readonly limiteIp?: string;
  readonly limiteEmailCodigo?: Partial<OpcionesLimitePorEmail>;
  readonly limiteEmailReserva?: Partial<OpcionesLimitePorEmail>;
  readonly emailSender?: EmailSender;
  readonly publicadorParaClinica?: (clinicaId: string) => TurnoEventPublisher;
  readonly reloj?: RelojNotificaciones;
}

function limiteIpConfigurado(override?: string): string {
  if (override !== undefined) return override;
  try {
    return loadConfig('app').rateLimitPublic;
  } catch {
    return LIMITE_IP_POR_DEFECTO;
  }
}

function crearEmailSenderPerezoso(emailSenderFijo?: EmailSender): EmailSender {
  let instancia: EmailSender | undefined = emailSenderFijo;
  return {
    async enviar(mensaje) {
      if (instancia === undefined) {
        const config = loadConfig('app');
        instancia = crearEmailSenderSmtp({
          emailApiKey: config.emailApiKey,
          emailFrom: config.emailFrom,
        });
      }
      return instancia.enviar(mensaje);
    },
  };
}

function crearResolutorPublicadorPerezoso(
  app: FastifyInstance,
  reloj: RelojNotificaciones,
): (clinicaId: string) => TurnoEventPublisher {
  let bossActivo: PgBoss | undefined;
  let servicioPromesa: Promise<ServicioNotificaciones | null> | undefined;

  const logger: LoggerNotificaciones = {
    info: (datos, mensaje) => app.log.info(datos, mensaje),
    warn: (datos, mensaje) => app.log.warn(datos, mensaje),
    error: (datos, mensaje) => app.log.error(datos, mensaje),
  };

  const obtenerServicio = async (): Promise<ServicioNotificaciones | null> => {
    if (servicioPromesa !== undefined) return servicioPromesa;

    servicioPromesa = (async (): Promise<ServicioNotificaciones | null> => {
      const config = loadConfig('app');
      if (config.databaseUrl === undefined) return null;

      try {
        const boss = crearPgBossApp({ connectionString: config.databaseUrl, schedule: false });
        const cola = await crearColaNotificacionesPgBoss(boss);
        bossActivo = boss;
        const proveedorEnlaces =
          config.publicBaseUrl !== undefined
            ? crearProveedorEnlacesTurnoPg({ publicBaseUrl: config.publicBaseUrl, reloj })
            : undefined;
        return crearNotificacionService({
          ejecutorTenant: crearEjecutorTenantNotificaciones(),
          cola,
          emailSender: {
            async enviar() {
              throw new ErrorDeEnvioEmail(
                'EMAIL_SOLO_EN_WORKER',
                false,
                'El proceso HTTP solo encola notificaciones.',
              );
            },
          },
          resolvedor: crearResolvedorContenidoTurno({
            lector: crearLectorDatosTurnoPg(),
            reloj,
            ...(proveedorEnlaces !== undefined ? { proveedorEnlaces } : {}),
          }),
          reloj,
          logger,
        });
      } catch (error) {
        const codigo = sanearCodigoError(error, 'ERROR_INICIAR_COLA_RESERVAS');
        logger.warn(
          { codigo },
          'No se pudo inicializar la cola de notificaciones en reserva pública',
        );
        servicioPromesa = undefined;
        return null;
      }
    })();

    return servicioPromesa;
  };

  app.addHook('onClose', async () => {
    if (bossActivo !== undefined) {
      const aCerrar = bossActivo;
      bossActivo = undefined;
      await aCerrar.stop({ graceful: false }).catch(() => undefined);
    }
  });

  return (clinicaId: string): TurnoEventPublisher => ({
    async publicar(evento: EventoDeTurno): Promise<void> {
      const servicio = await obtenerServicio();
      if (servicio === null) return;
      await crearPublicadorEventosTurno({ clinicaId, servicio, logger }).publicar(evento);
    },
  });
}

async function resolverClinicaActivaPorSlug(slug: string): Promise<string> {
  if (!validarSlug(slug)) throw recursoPublicoNoEncontrado();
  const clinicaId = await resolverClinicaPorSlug(poolDeLaAplicacion(), slug);
  if (clinicaId === null) throw recursoPublicoNoEncontrado();
  return clinicaId;
}

function exigirCupoEmail(
  limitador: LimiteDeTasaPorEmail,
  email: string,
  reply: FastifyReply,
): boolean {
  const estado = limitador.consumir(email);
  if (estado.permitido) return true;
  reply.header('retry-after', String(estado.retryAfterSegundos));
  void reply.code(429).send({
    codigo: 'DEMASIADOS_PEDIDOS',
    mensaje: 'Hay demasiados pedidos para este correo. Intentá de nuevo más tarde.',
  });
  return false;
}

/**
 * `/publico/:slug/codigo`, `/publico/:slug/reservas` y `/publico/turnos/accion` (C-15):
 * rutas públicas sin sesión con rate limit dual (IP + email), `Cache-Control: no-store`,
 * verificación OTP, tope `PO-09`, tokens de un solo uso y cero PII en logs o respuestas.
 */
export function crearModuloPublicoReservas(
  opciones: OpcionesModuloPublicoReservas = {},
): FastifyPluginAsync {
  return async function moduloPublicoReservas(app: FastifyInstance): Promise<void> {
    const { max, ventanaMs } = parsearLimiteDeTasa(limiteIpConfigurado(opciones.limiteIp));
    await app.register(rateLimit, {
      global: true,
      hook: 'onRequest',
      max,
      timeWindow: ventanaMs,
      cache: opciones.cache ?? CAPACIDAD_POR_DEFECTO,
      errorResponseBuilder: (_request, contexto) =>
        Object.assign(new Error('Rate limit exceeded'), { statusCode: contexto.statusCode }),
    });

    app.addHook('onSend', async (_request, reply) => {
      reply.header('cache-control', 'no-store');
    });

    const reloj = opciones.reloj ?? { ahora: () => new Date() };
    const logger: LoggerNotificaciones = {
      info: (datos, mensaje) => app.log.info(datos, mensaje),
      warn: (datos, mensaje) => app.log.warn(datos, mensaje),
      error: (datos, mensaje) => app.log.error(datos, mensaje),
    };

    const emailSender = crearEmailSenderPerezoso(opciones.emailSender);
    const resolverPublicador =
      opciones.publicadorParaClinica ?? crearResolutorPublicadorPerezoso(app, reloj);

    const limiteEmailCodigo = new LimiteDeTasaPorEmail({
      maximo: opciones.limiteEmailCodigo?.maximo ?? 5,
      ventanaMs: opciones.limiteEmailCodigo?.ventanaMs ?? VENTANA_EMAIL_MS,
      capacidad: opciones.limiteEmailCodigo?.capacidad ?? CAPACIDAD_POR_DEFECTO,
      reloj: opciones.limiteEmailCodigo?.reloj ?? (() => reloj.ahora().getTime()),
    });

    const limiteEmailReserva = new LimiteDeTasaPorEmail({
      maximo: opciones.limiteEmailReserva?.maximo ?? 10,
      ventanaMs: opciones.limiteEmailReserva?.ventanaMs ?? VENTANA_EMAIL_MS,
      capacidad: opciones.limiteEmailReserva?.capacidad ?? CAPACIDAD_POR_DEFECTO,
      reloj: opciones.limiteEmailReserva?.reloj ?? (() => reloj.ahora().getTime()),
    });

    const ejecutorCodigo = crearEjecutorSolicitudCodigoPg();
    const ejecutorReserva = crearEjecutorReservaPublicaPg();
    const ejecutorAccion = crearEjecutorAccionPublicaPg();

    app.post(
      '/publico/:slug/codigo',
      {
        schema: {
          params: ParamsDeClinica,
          body: SolicitudCodigoBody,
          response: {
            202: RespuestaCodigoDto,
            429: ErrorPublicoDto,
            503: ErrorPublicoDto,
          },
        },
      },
      async (request, reply) => {
        const { slug } = request.params as ParamsDeClinica;
        const { email } = request.body as SolicitudCodigoBody;
        const emailNormalizado = normalizarEmailPublico(email);
        if (!exigirCupoEmail(limiteEmailCodigo, emailNormalizado, reply)) return;

        const clinicaId = await resolverClinicaActivaPorSlug(slug);
        const resultado = await solicitarCodigoVerificacion(
          {
            ejecutor: ejecutorCodigo,
            emailSender,
            crypto: cryptoComunicacion,
            reloj,
            logger,
          },
          { clinicaId, email: emailNormalizado },
        );

        if (resultado.estado === 'error_envio') {
          return reply.code(503).send({
            codigo: resultado.codigo,
            mensaje:
              'No pudimos enviar el código de verificación en este momento. Intentá de nuevo más tarde.',
          });
        }

        return reply.code(202).send({
          enviado: true,
          vigenciaMinutos: resultado.vigenciaMinutos,
        });
      },
    );

    app.post(
      '/publico/:slug/reservas',
      {
        schema: {
          params: ParamsDeClinica,
          body: SolicitudReservaBody,
          response: {
            201: RespuestaReservaDto,
            429: ErrorPublicoDto,
          },
        },
      },
      async (request, reply) => {
        const { slug } = request.params as ParamsDeClinica;
        const cuerpo = request.body as SolicitudReservaBody;
        const emailNormalizado = normalizarEmailPublico(cuerpo.paciente.email);
        if (!exigirCupoEmail(limiteEmailReserva, emailNormalizado, reply)) return;

        const inicio = new Date(cuerpo.inicio);
        if (Number.isNaN(inicio.getTime())) {
          throw datosPublicosInvalidos('La fecha y hora de inicio no es válida.');
        }

        const clinicaId = await resolverClinicaActivaPorSlug(slug);
        const reserva = await reservarTurnoPublico(
          {
            ejecutor: ejecutorReserva,
            crypto: cryptoComunicacion,
            reloj,
            publicadorPorClinica: resolverPublicador,
            logger,
          },
          {
            clinicaId,
            profesionalId: cuerpo.profesionalId,
            prestacionId: cuerpo.prestacionId,
            inicio,
            codigoVerificacion: cuerpo.codigoVerificacion,
            paciente: cuerpo.paciente,
            ip: request.ip,
          },
        );

        return reply.code(201).send({
          turnoId: reserva.turnoId,
          estado: reserva.estado,
          inicio: reserva.inicio.toISOString(),
          fin: reserva.fin.toISOString(),
          zonaHoraria: reserva.zonaHoraria,
          profesionalId: reserva.profesionalId,
          prestacionId: reserva.prestacionId,
        });
      },
    );

    app.post(
      '/publico/turnos/accion',
      {
        schema: {
          body: AccionTurnoBody,
          response: { 200: RespuestaAccionTurnoDto },
        },
      },
      async (request, reply) => {
        const cuerpo = request.body as AccionTurnoBody;
        const resultado = await ejecutarAccionPublicaTurno(
          {
            resolverClinicaPorHashToken: resolverClinicaPorHashTokenConPool,
            ejecutor: ejecutorAccion,
            crypto: cryptoComunicacion,
            reloj,
            publicadorPorClinica: resolverPublicador,
            logger,
          },
          {
            token: cuerpo.token,
            ...(cuerpo.accion !== undefined ? { accion: cuerpo.accion } : {}),
            ip: request.ip,
          },
        );

        return reply.code(200).send({
          turnoId: resultado.turnoId,
          accion: resultado.accion,
          estado: resultado.estado,
          inicio: resultado.inicio.toISOString(),
          fin: resultado.fin.toISOString(),
        });
      },
    );
  };
}

export default crearModuloPublicoReservas();
