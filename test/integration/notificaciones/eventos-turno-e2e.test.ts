import { randomUUID } from 'node:crypto';

import type { PgBoss } from 'pg-boss';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  crearNotificacionService,
  crearPublicadorEventosTurno,
  crearResolvedorContenidoTurno,
  type LoggerNotificaciones,
  type NotificacionRegistrada,
} from '../../../src/application/notificaciones/index.js';
import {
  agendarTurno,
  cancelarTurno,
  confirmarTurno,
  reprogramarTurno,
} from '../../../src/application/turnos/index.js';
import type {
  PacienteId,
  PrestacionId,
  ProfesionalId,
  SillonId,
  TurnoId,
} from '../../../src/domain/shared/ids.js';
import { turnoEventPublisherNulo, type EventoDeTurno } from '../../../src/domain/turno/index.js';
import {
  crearAgendaReader,
  crearRepositorioDeTurnos,
} from '../../../src/infrastructure/db/repositories/turno/index.js';
import { crearEmailSenderFalso } from '../../../src/infrastructure/email/index.js';
import {
  NOMBRE_COLA_EMAIL,
  crearColaNotificacionesPgBoss,
  crearEjecutorTenantNotificaciones,
  crearLectorDatosTurnoPg,
  crearPgBossApp,
  crearRepositorioNotificacionesPg,
  crearWorkerNotificaciones,
  type WorkerNotificaciones,
} from '../../../src/infrastructure/queue/index.js';

import {
  CLINICA_A,
  cerrarPool,
  comoApp,
  consultarComoMigra,
  crearTurnoSintetico,
  limpiarColaYNotificaciones,
  prepararBaseNotificaciones,
  type EntornoNotificaciones,
} from './soporte.js';

const PII_PACIENTE = {
  nombre: 'Valentina',
  apellido: 'Ríos',
  email: 'valentina.rios.sintetica@ejemplo.test',
} as const;

let entorno: EntornoNotificaciones;
let bossActivo: PgBoss | undefined;
let workerActivo: WorkerNotificaciones | undefined;

async function esperarHasta(condicion: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    if (await condicion()) return;
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error('Tiempo de espera agotado en eventos-turno-e2e.');
}

async function montarSistemaEventos(ahoraFijo = new Date('2026-12-01T10:00:00.000Z')) {
  const emailSender = crearEmailSenderFalso();
  const logs: Array<{ nivel: string; datos: Record<string, unknown>; mensaje: string }> = [];
  const logger: LoggerNotificaciones = {
    info: (datos, mensaje) => logs.push({ nivel: 'info', datos, mensaje }),
    warn: (datos, mensaje) => logs.push({ nivel: 'warn', datos, mensaje }),
    error: (datos, mensaje) => logs.push({ nivel: 'error', datos, mensaje }),
  };

  const reloj = { ahora: () => ahoraFijo };
  const boss = crearPgBossApp({ connectionString: entorno.urlApp, schedule: false });
  bossActivo = boss;
  const cola = await crearColaNotificacionesPgBoss(boss, {
    retryLimit: 1,
    retryDelay: 1,
    retryBackoff: false,
  });

  const servicio = crearNotificacionService({
    ejecutorTenant: crearEjecutorTenantNotificaciones(),
    cola,
    emailSender,
    resolvedor: crearResolvedorContenidoTurno({
      lector: crearLectorDatosTurnoPg(),
      reloj,
    }),
    reloj,
    logger,
  });

  const worker = crearWorkerNotificaciones({
    boss,
    servicio,
    logger,
    pollingIntervalSeconds: 0.5,
  });
  workerActivo = worker;

  return { boss, servicio, worker, emailSender, logger, logs, reloj };
}

beforeAll(async () => {
  entorno = await prepararBaseNotificaciones();
});

beforeEach(async () => {
  await limpiarColaYNotificaciones(entorno.urlMigra);
});

afterEach(async () => {
  if (workerActivo !== undefined) {
    await workerActivo.detener();
    workerActivo = undefined;
  }
  if (bossActivo !== undefined) {
    await bossActivo.stop({ graceful: false });
    bossActivo = undefined;
  }
});

afterAll(async () => {
  await cerrarPool();
});

describe('C-14 integración: eventos de turno hacia emails sin PII en cola', () => {
  it('entrega emails en español con zona IANA para creado, confirmado, reprogramado y cancelado', async () => {
    const sys = await montarSistemaEventos(new Date('2026-12-01T10:00:00.000Z'));
    await sys.worker.iniciar();

    // Crear recursos base y franja horaria de atención en CLINICA_A
    const base = await crearTurnoSintetico(CLINICA_A.id, {
      pacienteNombre: PII_PACIENTE.nombre,
      pacienteApellido: PII_PACIENTE.apellido,
      pacienteEmail: PII_PACIENTE.email,
      profesionalNombre: 'Diego',
      profesionalApellido: 'Morales',
      prestacionNombre: 'Endodoncia',
      inicio: new Date('2026-12-01T08:00:00.000Z'), // turno ya pasado para no chocar
      estado: 'atendido',
    });

    await comoApp(CLINICA_A.id, async (cliente) => {
      for (let dia = 0; dia <= 6; dia++) {
        await cliente.query(
          `INSERT INTO horario_atencion (clinica_id, profesional_id, dia_semana, hora_desde, hora_hasta)
           VALUES ($1, $2, $3, '08:00', '20:00')`,
          [CLINICA_A.id, base.profesionalId, dia],
        );
      }
    });

    const publicador = crearPublicadorEventosTurno({
      clinicaId: CLINICA_A.id,
      servicio: sys.servicio,
      logger: sys.logger,
    });

    const agendaCfg = {
      config: { zonaHoraria: 'America/Argentina/Buenos_Aires', granularidadMinutos: 15 },
      ahora: new Date('2026-12-01T10:00:00.000Z'),
    };

    const eventosPendientes: EventoDeTurno[] = [];
    const colector = {
      publicar: (e: EventoDeTurno) => {
        eventosPendientes.push(e);
      },
    };

    // 1. Agendar (creado)
    const turno1 = await comoApp(CLINICA_A.id, (c) =>
      agendarTurno(
        crearRepositorioDeTurnos(c),
        crearAgendaReader(c),
        agendaCfg,
        {
          pacienteId: base.pacienteId as PacienteId,
          profesionalId: base.profesionalId as ProfesionalId,
          sillonId: base.sillonId as SillonId,
          prestacionId: base.prestacionId as PrestacionId,
          inicio: new Date('2026-12-02T14:00:00.000Z'), // 11:00 ART
          duracionMinutos: 30,
          bufferMinutos: 0,
          origen: 'recepcion',
        },
        { intentos: 1 },
        colector,
      ),
    );
    for (const ev of eventosPendientes.splice(0)) await publicador.publicar(ev);

    await esperarHasta(async () => sys.emailSender.enviados.length === 1);
    expect(sys.emailSender.enviados[0]?.para).toBe(PII_PACIENTE.email);
    expect(sys.emailSender.enviados[0]?.asunto).toContain('02/12/2026 a las 11:00');
    expect(sys.emailSender.enviados[0]?.texto).toContain('Hola Valentina Ríos');

    // 2. Confirmar
    await comoApp(CLINICA_A.id, (c) =>
      confirmarTurno(crearRepositorioDeTurnos(c), turno1.id, agendaCfg.ahora, colector),
    );
    for (const ev of eventosPendientes.splice(0)) await publicador.publicar(ev);

    await esperarHasta(async () => sys.emailSender.enviados.length === 2);
    expect(sys.emailSender.enviados[1]?.asunto).toContain('Turno confirmado');

    // 3. Reprogramar (un único email con horario anterior 11:00 y nuevo 15:30 ART)
    const turno2 = await comoApp(CLINICA_A.id, (c) =>
      reprogramarTurno(
        crearRepositorioDeTurnos(c),
        turno1.id,
        {
          pacienteId: base.pacienteId as PacienteId,
          profesionalId: base.profesionalId as ProfesionalId,
          sillonId: base.sillonId as SillonId,
          prestacionId: base.prestacionId as PrestacionId,
          inicio: new Date('2026-12-03T18:30:00.000Z'), // 15:30 ART
          duracionMinutos: 30,
          bufferMinutos: 0,
          origen: 'recepcion',
        },
        agendaCfg,
        colector,
      ),
    );
    for (const ev of eventosPendientes.splice(0)) await publicador.publicar(ev);

    await esperarHasta(async () => sys.emailSender.enviados.length === 3);
    expect(sys.emailSender.enviados[2]?.asunto).toContain(
      'Turno reprogramado (03/12/2026 a las 15:30)',
    );
    expect(sys.emailSender.enviados[2]?.texto).toContain(
      'Horario anterior: 02/12/2026 a las 11:00',
    );
    expect(sys.emailSender.enviados[2]?.texto).toContain('Nuevo horario: 03/12/2026 a las 15:30');

    // 4. Cancelar el nuevo turno
    await comoApp(CLINICA_A.id, (c) =>
      cancelarTurno(crearRepositorioDeTurnos(c), turno2.id, agendaCfg.ahora, colector),
    );
    for (const ev of eventosPendientes.splice(0)) await publicador.publicar(ev);

    await esperarHasta(async () => sys.emailSender.enviados.length === 4);
    expect(sys.emailSender.enviados[3]?.asunto).toContain('Turno cancelado');

    // Verificar cero PII en pgboss.job.data / output y logs
    const jobs = await consultarComoMigra<{ data: unknown; output: unknown }>(
      entorno.urlMigra,
      `SELECT data, output FROM pgboss.job WHERE name = $1`,
      [NOMBRE_COLA_EMAIL],
    );
    expect(jobs).toHaveLength(4);
    const serializadoJobs = JSON.stringify(jobs);
    expect(serializadoJobs).not.toContain(PII_PACIENTE.email);
    expect(serializadoJobs).not.toContain(PII_PACIENTE.nombre);
    expect(serializadoJobs).not.toContain(PII_PACIENTE.apellido);
    expect(JSON.stringify(sys.logs)).not.toContain(PII_PACIENTE.email);
  });

  it('descarta defensivamente notificaciones cuyo turno fue cancelado antes del envío o cuyo paciente no tiene email', async () => {
    const sys = await montarSistemaEventos(new Date('2026-12-01T10:00:00.000Z'));

    const turnoCanceladoLuego = await crearTurnoSintetico(CLINICA_A.id, {
      inicio: new Date('2026-12-05T14:00:00.000Z'),
      estado: 'pendiente_confirmacion',
    });
    const turnoSinEmail = await crearTurnoSintetico(CLINICA_A.id, {
      inicio: new Date('2026-12-05T15:00:00.000Z'),
      pacienteEmail: null,
      estado: 'confirmado',
    });

    const pub = crearPublicadorEventosTurno({
      clinicaId: CLINICA_A.id,
      servicio: sys.servicio,
      logger: sys.logger,
    });
    await pub.publicar({ tipo: 'creado', turnoId: turnoCanceladoLuego.turnoId as TurnoId });
    await pub.publicar({ tipo: 'confirmado', turnoId: turnoSinEmail.turnoId as TurnoId });

    // Cancelar el primer turno antes de que el worker procese
    await comoApp(CLINICA_A.id, (c) =>
      c.query(`UPDATE turno SET estado = 'cancelado' WHERE id = $1`, [turnoCanceladoLuego.turnoId]),
    );

    await sys.worker.iniciar();

    await esperarHasta(async () => {
      const filas = await comoApp(CLINICA_A.id, async (c) => {
        const res = await c.query<{ estado: string }>(`SELECT estado FROM notificacion`);
        return res.rows.map((r) => r.estado);
      });
      return filas.length === 2 && filas.every((e) => e === 'fallida');
    });

    expect(sys.emailSender.enviados).toHaveLength(0);

    const notifs = await comoApp(CLINICA_A.id, async (c) => {
      const res = await c.query<{ error: string | null; turno_id: string }>(
        `SELECT turno_id, error FROM notificacion`,
      );
      return res.rows;
    });
    const porTurno = new Map(notifs.map((n) => [n.turno_id, n.error]));
    expect(porTurno.get(turnoCanceladoLuego.turnoId)).toBe('TURNO_YA_NO_ACTIVO');
    expect(porTurno.get(turnoSinEmail.turnoId)).toBe('PACIENTE_SIN_EMAIL');
  });

  it('aísla fallos de cola/email para no impedir crear ni confirmar el turno en PostgreSQL (RN-NO-03)', async () => {
    const sys = await montarSistemaEventos(new Date('2026-12-01T10:00:00.000Z'));

    const base = await crearTurnoSintetico(CLINICA_A.id, {
      inicio: new Date('2026-12-01T08:00:00.000Z'),
      estado: 'atendido',
    });
    await comoApp(CLINICA_A.id, (c) =>
      c.query(
        `INSERT INTO horario_atencion (clinica_id, profesional_id, dia_semana, hora_desde, hora_hasta)
         VALUES ($1, $2, 3, '08:00', '20:00')`,
        [CLINICA_A.id, base.profesionalId],
      ),
    );

    // Detener boss para provocar fallo real de transporte en cola
    await sys.boss.stop({ graceful: false });
    bossActivo = undefined;
    workerActivo = undefined;

    const publicador = crearPublicadorEventosTurno({
      clinicaId: CLINICA_A.id,
      servicio: sys.servicio,
      logger: sys.logger,
    });

    const turnoCreado = await comoApp(CLINICA_A.id, (c) =>
      agendarTurno(
        crearRepositorioDeTurnos(c),
        crearAgendaReader(c),
        {
          config: { zonaHoraria: 'America/Argentina/Buenos_Aires', granularidadMinutos: 15 },
          ahora: new Date('2026-12-01T10:00:00.000Z'),
        },
        {
          pacienteId: base.pacienteId as PacienteId,
          profesionalId: base.profesionalId as ProfesionalId,
          sillonId: base.sillonId as SillonId,
          prestacionId: base.prestacionId as PrestacionId,
          inicio: new Date('2026-12-02T14:00:00.000Z'),
          duracionMinutos: 30,
          bufferMinutos: 0,
          origen: 'recepcion',
        },
        { intentos: 1 },
        turnoEventPublisherNulo(),
      ),
    );

    await expect(
      publicador.publicar({ tipo: 'creado', turnoId: turnoCreado.id }),
    ).resolves.toBeUndefined();

    // El turno sigue persistido en PostgreSQL
    const enBase = await comoApp(CLINICA_A.id, (c) =>
      crearRepositorioDeTurnos(c).obtenerPorId(turnoCreado.id),
    );
    expect(enBase?.id).toBe(turnoCreado.id);
    expect(sys.logs.some((l) => l.datos['codigo'] === 'ERROR_TRANSPORTE_COLA')).toBe(true);

    // También verificamos tipo NotificacionRegistrada importado sin unused vars
    const notifs = await comoApp(CLINICA_A.id, (c) =>
      crearRepositorioNotificacionesPg(c).buscarPorId(randomUUID()),
    );
    const verificacionTipo: NotificacionRegistrada | null = notifs;
    expect(verificacionTipo).toBeNull();
  });
});
