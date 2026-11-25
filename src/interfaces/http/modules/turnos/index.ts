import type { FastifyInstance } from 'fastify';
import type { PgBoss } from 'pg-boss';
import Type, { type Static } from 'typebox';

import {
  ErrorDeEnvioEmail,
  crearNotificacionService,
  crearPublicadorEventosTurno,
  crearResolvedorContenidoTurno,
  sanearCodigoError,
  type LoggerNotificaciones,
  type ServicioNotificaciones,
} from '../../../../application/notificaciones/index.js';
import type { RequestContext } from '../../../../application/shared/request-context.js';
import {
  agendarTurno,
  cancelarTurno,
  confirmarTurno,
  marcarAusente,
  marcarAtendido,
  reprogramarTurno,
  type AgendaFija,
} from '../../../../application/turnos/index.js';
import { loadConfig } from '../../../../config/index.js';
import { ErrorDeDominio } from '../../../../domain/shared/errores.js';
import type {
  PacienteId,
  PrestacionId,
  ProfesionalId,
  SillonId,
  TurnoId,
} from '../../../../domain/shared/index.js';
import { type EventoDeTurno, type TurnoEventPublisher } from '../../../../domain/turno/index.js';
import { contextoDePedido, requireRole } from '../../../../infrastructure/auth/rbac.js';
import {
  crearAgendaReader,
  crearRepositorioDeTurnos,
} from '../../../../infrastructure/db/repositories/turno/index.js';
import { withTenant } from '../../../../infrastructure/db/tenant/with-tenant.js';
import {
  crearColaNotificacionesPgBoss,
  crearEjecutorTenantNotificaciones,
  crearLectorDatosTurnoPg,
  crearPgBossApp,
} from '../../../../infrastructure/queue/index.js';

const CosaNueva = Type.Object({
  pacienteId: Type.String({ format: 'uuid' }),
  profesionalId: Type.String({ format: 'uuid' }),
  sillonId: Type.String({ format: 'uuid' }),
  prestacionId: Type.String({ format: 'uuid' }),
  inicio: Type.String({ format: 'date-time' }),
  duracionMinutos: Type.Integer({ minimum: 1 }),
  bufferMinutos: Type.Integer({ minimum: 0 }),
  origen: Type.Union([Type.Literal('recepcion'), Type.Literal('enlace_web')]),
});
type CosaNueva = Static<typeof CosaNueva>;

const Params = Type.Object({
  id: Type.String({ format: 'uuid' }),
  accion: Type.Union([
    Type.Literal('cancelar'),
    Type.Literal('reprogramar'),
    Type.Literal('confirmar'),
    Type.Literal('atendido'),
    Type.Literal('ausente'),
  ]),
});

function agendaFija(): AgendaFija {
  const config = loadConfig('app');
  return {
    config: { zonaHoraria: config.defaultTimezone, granularidadMinutos: 15 },
    ahora: new Date(),
  };
}

/** Matriz de roles de turno según `03_actores_y_roles.md` (creador del turno). */
function exigirRolDeTurno(contexto: RequestContext): void {
  if (contexto.actor.rol !== 'administrador' && contexto.actor.rol !== 'recepcionista') {
    throw new ErrorDeDominio('ACCESO_PROHIBIDO', 'prohibido', 'El rol no puede gestionar turnos.');
  }
}

export interface OpcionesModuloTurnos {
  readonly publicadorParaClinica?: (clinicaId: string) => TurnoEventPublisher;
}

function crearColectorDeEventos(): {
  readonly colector: TurnoEventPublisher;
  readonly eventos: EventoDeTurno[];
} {
  const eventos: EventoDeTurno[] = [];
  return {
    eventos,
    colector: {
      publicar(evento: EventoDeTurno): void {
        eventos.push(evento);
      },
    },
  };
}

function crearResolutorPublicadorPerezoso(
  app: FastifyInstance,
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
        const reloj = { ahora: () => new Date() };
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
          }),
          reloj,
          logger,
        });
      } catch (error) {
        const codigo = sanearCodigoError(error, 'ERROR_INICIAR_COLA_TURNOS');
        logger.warn({ codigo }, 'No se pudo inicializar la cola de notificaciones en HTTP');
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

/** Módulo HTTP de turnos (C-12 + C-14): handlers delgados, publicación post-commit (RN-NO-03). */
export default async function moduloTurnos(
  app: FastifyInstance,
  opciones: OpcionesModuloTurnos = {},
): Promise<void> {
  const resolverPublicador =
    opciones.publicadorParaClinica ?? crearResolutorPublicadorPerezoso(app);

  app.post('/turnos', { schema: { body: CosaNueva } }, async (request, reply) => {
    const contexto = contextoDePedido(request);
    exigirRolDeTurno(contexto);
    const nuevo = request.body as CosaNueva;
    const { colector, eventos } = crearColectorDeEventos();

    const turno = await withTenant(contexto.clinicaId, async (cliente) =>
      agendarTurno(
        crearRepositorioDeTurnos(cliente),
        crearAgendaReader(cliente),
        agendaFija(),
        {
          pacienteId: nuevo.pacienteId as PacienteId,
          profesionalId: nuevo.profesionalId as ProfesionalId,
          sillonId: nuevo.sillonId as SillonId,
          prestacionId: nuevo.prestacionId as PrestacionId,
          inicio: new Date(nuevo.inicio),
          duracionMinutos: nuevo.duracionMinutos,
          bufferMinutos: nuevo.bufferMinutos,
          origen: nuevo.origen,
        },
        { intentos: 3 },
        colector,
      ),
    );

    const publicador = resolverPublicador(contexto.clinicaId);
    for (const evento of eventos) {
      await publicador.publicar(evento);
    }

    return reply.code(201).send(turno);
  });

  app.get('/turnos/:id', async (request) => {
    const contexto = contextoDePedido(request);
    const id = (request.params as { id: string }).id;
    const turno = await withTenant(contexto.clinicaId, (cliente) =>
      crearRepositorioDeTurnos(cliente).obtenerPorId(id as TurnoId),
    );
    if (turno === null) {
      throw new ErrorDeDominio('TURNO_NO_ENCONTRADO', 'no_encontrado', 'Turno no encontrado');
    }
    return turno;
  });

  app.post('/turnos/:id/:accion', { schema: { params: Params } }, async (request) => {
    const contexto = contextoDePedido(request);
    requireRole(contexto, 'odontologo');
    const { id, accion } = request.params as { id: string; accion: string };
    const turnoId = id as TurnoId;
    const ahora = new Date();
    const { colector, eventos } = crearColectorDeEventos();

    const resultado = await withTenant(contexto.clinicaId, async (cliente) => {
      switch (accion) {
        case 'cancelar':
          return cancelarTurno(crearRepositorioDeTurnos(cliente), turnoId, ahora, colector);
        case 'reprogramar': {
          const turno = await crearRepositorioDeTurnos(cliente).obtenerPorId(turnoId);
          if (turno === null)
            throw new ErrorDeDominio('TURNO_NO_ENCONTRADO', 'no_encontrado', 'Turno no encontrado');
          return reprogramarTurno(
            crearRepositorioDeTurnos(cliente),
            turnoId,
            {
              pacienteId: turno.pacienteId,
              profesionalId: turno.profesionalId,
              sillonId: turno.sillonId,
              prestacionId: turno.prestacionId,
              inicio: new Date(),
              duracionMinutos: 30,
              bufferMinutos: turno.bufferMinutos,
              origen: turno.origen,
            },
            agendaFija(),
            colector,
          );
        }
        case 'confirmar':
          return confirmarTurno(crearRepositorioDeTurnos(cliente), turnoId, ahora, colector);
        case 'atendido':
          return marcarAtendido(crearRepositorioDeTurnos(cliente), turnoId, ahora);
        case 'ausente':
          return marcarAusente(crearRepositorioDeTurnos(cliente), turnoId, ahora);
        default:
          throw new ErrorDeDominio(
            'ACCION_TURNO_NO_SOPORTADA',
            'regla_de_negocio',
            'Acción de turno no soportada.',
          );
      }
    });

    const publicador = resolverPublicador(contexto.clinicaId);
    for (const evento of eventos) {
      await publicador.publicar(evento);
    }

    return resultado;
  });
}
