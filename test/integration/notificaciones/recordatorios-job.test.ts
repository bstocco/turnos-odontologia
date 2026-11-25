import { randomUUID } from 'node:crypto';

import type { PgBoss } from 'pg-boss';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  crearNotificacionService,
  crearPlanificadorRecordatorios,
  crearResolvedorContenidoTurno,
  type LoggerNotificaciones,
} from '../../../src/application/notificaciones/index.js';
import { crearEmailSenderFalso } from '../../../src/infrastructure/email/index.js';
import {
  NOMBRE_COLA_RECORDATORIOS,
  crearBuscadorTurnosRecordatorioPg,
  crearCatalogoClinicasActivasPg,
  crearColaNotificacionesPgBoss,
  crearEjecutorTenantNotificaciones,
  crearJobRecordatorios,
  crearLectorDatosTurnoPg,
  crearPgBossApp,
  crearWorkerNotificaciones,
  type JobRecordatorios,
  type WorkerNotificaciones,
} from '../../../src/infrastructure/queue/index.js';

import {
  CLINICA_A,
  CLINICA_B,
  cerrarPool,
  comoApp,
  consultarComoMigra,
  crearClinicaSintetica,
  crearTurnoSintetico,
  limpiarColaYNotificaciones,
  prepararBaseNotificaciones,
  type EntornoNotificaciones,
} from './soporte.js';

let entorno: EntornoNotificaciones;
let bossActivo: PgBoss | undefined;
let workerActivo: WorkerNotificaciones | undefined;
let jobActivo: JobRecordatorios | undefined;

async function esperarHasta(condicion: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    if (await condicion()) return;
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error('Tiempo de espera agotado en recordatorios-job.');
}

async function montarSistemaRecordatorios(ahoraFijo: Date, anticipacionHoras = 24) {
  const emailSender = crearEmailSenderFalso();
  const logs: Array<{ nivel: string; datos: Record<string, unknown>; mensaje: string }> = [];
  const logger: LoggerNotificaciones = {
    info: (datos, mensaje) => logs.push({ nivel: 'info', datos, mensaje }),
    warn: (datos, mensaje) => logs.push({ nivel: 'warn', datos, mensaje }),
    error: (datos, mensaje) => logs.push({ nivel: 'error', datos, mensaje }),
  };

  const reloj = { ahora: () => ahoraFijo };
  const boss = crearPgBossApp({ connectionString: entorno.urlApp, schedule: true });
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

  const planificador = crearPlanificadorRecordatorios({
    catalogoClinicas: crearCatalogoClinicasActivasPg(),
    buscadorTurnos: crearBuscadorTurnosRecordatorioPg(),
    servicio,
    reloj,
    logger,
    anticipacionHoras,
  });

  const worker = crearWorkerNotificaciones({
    boss,
    servicio,
    logger,
    pollingIntervalSeconds: 0.5,
  });
  workerActivo = worker;

  const job = crearJobRecordatorios({
    boss,
    planificador,
    logger,
    cron: '*/15 * * * *',
    pollingIntervalSeconds: 0.5,
  });
  jobActivo = job;

  return { boss, servicio, planificador, worker, job, emailSender, logs };
}

beforeAll(async () => {
  entorno = await prepararBaseNotificaciones();
});

beforeEach(async () => {
  await limpiarColaYNotificaciones(entorno.urlMigra);
  await consultarComoMigra(
    entorno.urlMigra,
    `UPDATE clinica SET zona_horaria = 'America/Argentina/Buenos_Aires', activa = TRUE
     WHERE id IN ($1, $2)`,
    [CLINICA_A.id, CLINICA_B.id],
  );
  await consultarComoMigra(
    entorno.urlMigra,
    `UPDATE clinica SET activa = FALSE WHERE id NOT IN ($1, $2)`,
    [CLINICA_A.id, CLINICA_B.id],
  );
});

afterEach(async () => {
  if (jobActivo !== undefined) {
    await jobActivo.detener();
    jobActivo = undefined;
  }
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

describe('C-14 integración: job periódico de recordatorios multi-tenant en pg-boss', () => {
  it('envía un único recordatorio por turno elegible, excluye cancelados/reprogramados/pasados y respeta schedule sin DDL bajo app', async () => {
    const ahora = new Date('2026-12-10T12:00:00.000Z');
    const sys = await montarSistemaRecordatorios(ahora, 24);

    // Arranque y detención idempotentes
    await sys.job.iniciar();
    await sys.job.iniciar();
    await sys.worker.iniciar();

    // Verificar registro en pgboss.schedule y pgboss.queue (partition = false) bajo rol app
    const colas = await consultarComoMigra<{ name: string; partition: boolean }>(
      entorno.urlMigra,
      `SELECT name, partition FROM pgboss.queue WHERE name = $1`,
      [NOMBRE_COLA_RECORDATORIOS],
    );
    expect(colas).toEqual([{ name: NOMBRE_COLA_RECORDATORIOS, partition: false }]);

    const schedules = await consultarComoMigra<{ name: string; cron: string }>(
      entorno.urlMigra,
      `SELECT name, cron FROM pgboss.schedule WHERE name = $1`,
      [NOMBRE_COLA_RECORDATORIOS],
    );
    expect(schedules).toEqual([{ name: NOMBRE_COLA_RECORDATORIOS, cron: '*/15 * * * *' }]);

    // Turnos elegibles en CLINICA_A
    const elegiblePendiente = await crearTurnoSintetico(CLINICA_A.id, {
      inicio: new Date('2026-12-11T10:00:00.000Z'), // dentro de 24h
      estado: 'pendiente_confirmacion',
      pacienteEmail: 'pendiente@ejemplo.test',
    });
    const elegibleConfirmado = await crearTurnoSintetico(CLINICA_A.id, {
      inicio: new Date('2026-12-11T12:00:00.000Z'), // justo en limiteSuperior
      estado: 'confirmado',
      pacienteEmail: 'confirmado@ejemplo.test',
    });

    // Turnos excluidos
    await crearTurnoSintetico(CLINICA_A.id, {
      inicio: new Date('2026-12-11T09:00:00.000Z'),
      estado: 'cancelado',
      pacienteEmail: 'cancelado@ejemplo.test',
    });
    const originalReprogramado = await crearTurnoSintetico(CLINICA_A.id, {
      inicio: new Date('2026-12-11T08:00:00.000Z'),
      estado: 'reprogramado',
      pacienteEmail: 'reprog.viejo@ejemplo.test',
    });
    const nuevoDeReprogramado = await crearTurnoSintetico(CLINICA_A.id, {
      inicio: new Date('2026-12-11T11:30:00.000Z'),
      estado: 'confirmado',
      reprogramadoDe: originalReprogramado.turnoId,
      pacienteEmail: 'reprog.nuevo@ejemplo.test',
    });
    await crearTurnoSintetico(CLINICA_A.id, {
      inicio: new Date('2026-12-10T11:00:00.000Z'), // pasado
      estado: 'confirmado',
      pacienteEmail: 'pasado@ejemplo.test',
    });
    await crearTurnoSintetico(CLINICA_A.id, {
      inicio: new Date('2026-12-11T12:05:00.000Z'), // fuera de ventana (> 24h)
      estado: 'confirmado',
      pacienteEmail: 'lejano@ejemplo.test',
    });

    // Clínica inactiva ignorada
    const clinicaInactiva = await crearClinicaSintetica('inactiva');
    await crearTurnoSintetico(clinicaInactiva.id, {
      inicio: new Date('2026-12-11T10:00:00.000Z'),
      estado: 'confirmado',
      pacienteEmail: 'inactiva@ejemplo.test',
    });
    await consultarComoMigra(entorno.urlMigra, `UPDATE clinica SET activa = FALSE WHERE id = $1`, [
      clinicaInactiva.id,
    ]);

    // Ejecutar dos veces seguidas el ciclo: debe encolar exactamente 3 y 0 en la segunda corrida
    const corrida1 = await sys.job.ejecutarAhora();
    expect(corrida1.recordatoriosEncolados).toBe(3);
    expect(corrida1.clinicasConError).toBe(0);

    const corrida2 = await sys.job.ejecutarAhora();
    expect(corrida2.recordatoriosEncolados).toBe(0);

    await esperarHasta(async () => sys.emailSender.enviados.length === 3);

    const destinatarios = sys.emailSender.enviados.map((e) => e.para).sort();
    expect(destinatarios).toEqual([
      'confirmado@ejemplo.test',
      'pendiente@ejemplo.test',
      'reprog.nuevo@ejemplo.test',
    ]);

    const notifsA = await comoApp(CLINICA_A.id, async (c) => {
      const res = await c.query<{ turno_id: string; tipo: string }>(
        `SELECT turno_id, tipo FROM notificacion WHERE tipo = 'recordatorio'`,
      );
      return res.rows.map((r) => r.turno_id).sort();
    });
    expect(notifsA).toEqual(
      [elegiblePendiente.turnoId, elegibleConfirmado.turnoId, nuevoDeReprogramado.turnoId].sort(),
    );

    // Verificar cero PII en pgboss.job
    const jobs = await consultarComoMigra<{ data: unknown }>(
      entorno.urlMigra,
      `SELECT data FROM pgboss.job`,
    );
    const serializado = JSON.stringify(jobs);
    expect(serializado).not.toContain('@ejemplo.test');

    await sys.job.detener();
    await sys.job.detener();
  });

  it('calcula la ventana de 24h según la zona horaria IANA de cada clínica (DST) y mantiene aislamiento multi-tenant', async () => {
    // 2026-03-07T15:00:00Z -> en NY (DST el 08/03) +1 día local = 2026-03-08T14:00:00Z (23h)
    // En Buenos Aires (sin DST) +1 día local = 2026-03-08T15:00:00Z (24h)
    const ahoraDst = new Date('2026-03-07T15:00:00.000Z');
    await consultarComoMigra(
      entorno.urlMigra,
      `UPDATE clinica SET zona_horaria = 'America/New_York' WHERE id = $1`,
      [CLINICA_B.id],
    );

    const sys = await montarSistemaRecordatorios(ahoraDst, 24);
    await sys.worker.iniciar();

    const inicioEnBorde = new Date('2026-03-08T14:30:00.000Z');
    await crearTurnoSintetico(CLINICA_A.id, {
      inicio: inicioEnBorde,
      estado: 'confirmado',
      pacienteEmail: 'clinica-a@ejemplo.test',
    });
    await crearTurnoSintetico(CLINICA_B.id, {
      inicio: inicioEnBorde,
      estado: 'confirmado',
      pacienteEmail: 'clinica-b@ejemplo.test',
    });

    const resumen = await sys.job.ejecutarAhora();
    expect(resumen.clinicasProcesadas).toBe(2);
    expect(resumen.recordatoriosEncolados).toBe(1);

    await esperarHasta(async () => sys.emailSender.enviados.length === 1);
    expect(sys.emailSender.enviados[0]?.para).toBe('clinica-a@ejemplo.test');

    // La notificación existe únicamente en CLINICA_A, invisible desde CLINICA_B
    const enB = await comoApp(CLINICA_B.id, async (c) => {
      const res = await c.query(`SELECT id FROM notificacion`);
      return res.rows;
    });
    expect(enB).toEqual([]);
    expect(randomUUID()).toBeDefined();
  });
});
