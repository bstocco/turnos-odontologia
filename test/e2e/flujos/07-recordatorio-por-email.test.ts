import type { PgBoss } from 'pg-boss';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  crearNotificacionService,
  crearPlanificadorRecordatorios,
  crearResolvedorContenidoTurno,
  type LoggerNotificaciones,
} from '../../../src/application/notificaciones/index.js';
import { crearEmailSenderFalso } from '../../../src/infrastructure/email/index.js';
import {
  crearBuscadorTurnosRecordatorioPg,
  crearCatalogoClinicasActivasPg,
  crearColaNotificacionesPgBoss,
  crearEjecutorTenantNotificaciones,
  crearLectorDatosTurnoPg,
  crearPgBossApp,
  crearWorkerNotificaciones,
  type WorkerNotificaciones,
} from '../../../src/infrastructure/queue/index.js';
import { withTenant } from '../../../src/infrastructure/db/tenant/with-tenant.js';
import { configDeBaseDePrueba, consultarComoMigra } from '../../support/base-de-datos.js';
import { abrirEntorno, type EntornoE2E } from '../soporte/entorno.js';
import {
  afirmarSinDatosPersonales,
  valoresSensibles,
  type ValoresSensibles,
} from '../soporte/privacidad.js';
import { ponerEnMarchaUnaClinica, type ClinicaConfigurada } from '../soporte/puesta-en-marcha.js';
import { insertarTurnoPorFixture } from '../soporte/turnos.js';

/*
 * Flujo 7 de 07_flujos_principales.md: recordatorio por email (C-14).
 *
 * El proceso HTTP solo ENCOLA y el envío vive en el worker, así que el flujo compone las piezas
 * reales (planificador, servicio, cola pg-boss y worker sobre PostgreSQL real) con el reloj y el
 * proveedor de email SIMULADOS (adaptador falso en memoria). El turno se inserta por fixture porque
 * `POST /turnos` no autentica (F6). La clínica y el paciente salen de la puesta en marcha por la API.
 */
interface NotificacionFila {
  readonly estado: string;
  readonly intentos: number;
  readonly error: string | null;
}

async function esperarHasta(condicion: () => Promise<boolean>, timeoutMs = 25_000): Promise<void> {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    if (await condicion()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Tiempo de espera agotado esperando la notificación.');
}

describe('Flujo 7: recordatorio por email con reloj y proveedor simulados', () => {
  let entorno: EntornoE2E;
  let lista: ClinicaConfigurada;
  let urlApp: string;
  let urlMigra: string;
  let boss: PgBoss | undefined;
  let worker: WorkerNotificaciones | undefined;
  const logsDelFlujo: string[] = [];

  beforeAll(async () => {
    const config = configDeBaseDePrueba();
    urlApp = config.testDatabaseUrl as string;
    urlMigra = config.testDatabaseMigrationUrl as string;
    entorno = await abrirEntorno();
    lista = await ponerEnMarchaUnaClinica(entorno, 'recordatorio');
    // Otras ejecuciones o proyectos pueden haber dejado trabajos huérfanos en la cola compartida.
    await consultarComoMigra(
      urlMigra,
      `DO $$ BEGIN
         IF to_regclass('pgboss.job') IS NOT NULL THEN DELETE FROM pgboss.job; END IF;
       END $$;`,
    );
  });

  afterEach(async () => {
    if (worker !== undefined) await worker.detener();
    worker = undefined;
    if (boss !== undefined) await boss.stop({ graceful: false });
    boss = undefined;
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  async function montar(ahora: Date) {
    const emailSender = crearEmailSenderFalso();
    const logger: LoggerNotificaciones = {
      info: (datos, mensaje) => logsDelFlujo.push(JSON.stringify({ datos, mensaje })),
      warn: (datos, mensaje) => logsDelFlujo.push(JSON.stringify({ datos, mensaje })),
      error: (datos, mensaje) => logsDelFlujo.push(JSON.stringify({ datos, mensaje })),
    };
    const reloj = { ahora: () => ahora };
    boss = crearPgBossApp({ connectionString: urlApp, schedule: false });
    const cola = await crearColaNotificacionesPgBoss(boss, {
      retryLimit: 1,
      retryDelay: 1,
      retryBackoff: false,
    });
    const servicio = crearNotificacionService({
      ejecutorTenant: crearEjecutorTenantNotificaciones(),
      cola,
      emailSender,
      resolvedor: crearResolvedorContenidoTurno({ lector: crearLectorDatosTurnoPg(), reloj }),
      reloj,
      logger,
    });
    const planificador = crearPlanificadorRecordatorios({
      catalogoClinicas: crearCatalogoClinicasActivasPg(),
      buscadorTurnos: crearBuscadorTurnosRecordatorioPg(),
      servicio,
      reloj,
      logger,
      anticipacionHoras: 24,
    });
    worker = crearWorkerNotificaciones({ boss, servicio, logger, pollingIntervalSeconds: 0.5 });
    return { emailSender, planificador, worker };
  }

  async function notificacionesDelTurno(turnoId: string): Promise<NotificacionFila[]> {
    // La tabla tiene RLS forzada: se lee como `app` dentro del contexto de la clínica.
    return withTenant(lista.clinica.id, async (cliente) => {
      const { rows } = await cliente.query(
        `SELECT estado, intentos, error FROM notificacion
         WHERE turno_id = $1 AND tipo = 'recordatorio'`,
        [turnoId],
      );
      return rows as NotificacionFila[];
    });
  }

  const sensibles = (): ValoresSensibles => valoresSensibles(lista.paciente);

  it('pasa de pendiente a enviada: un único email al paciente y nada de datos personales en cola ni logs', async () => {
    const ahora = new Date('2035-03-09T12:00:00.000Z');
    const turnoId = await insertarTurnoPorFixture(lista.clinica.id, lista, {
      inicio: new Date('2035-03-10T10:00:00.000Z'),
      estado: 'confirmado',
    });
    const sistema = await montar(ahora);
    await sistema.worker.iniciar();

    const ciclo = await sistema.planificador.ejecutarCiclo();
    expect(ciclo.recordatoriosEncolados).toBeGreaterThanOrEqual(1);
    const [pendiente] = await notificacionesDelTurno(turnoId);
    expect(pendiente).toBeDefined();

    await esperarHasta(
      async () => (await notificacionesDelTurno(turnoId))[0]?.estado === 'enviada',
    );
    const [enviada] = await notificacionesDelTurno(turnoId);
    expect(enviada).toMatchObject({ estado: 'enviada', error: null });

    const alPaciente = sistema.emailSender.enviados.filter((m) => m.para === lista.paciente.email);
    expect(alPaciente).toHaveLength(1);

    // Un segundo ciclo no duplica el recordatorio (idempotencia por turno).
    await sistema.planificador.ejecutarCiclo();
    expect(await notificacionesDelTurno(turnoId)).toHaveLength(1);

    const trabajos = await consultarComoMigra<{ data: unknown }>(
      urlMigra,
      `SELECT data FROM pgboss.job WHERE data->>'notificacionId' IS NOT NULL`,
    );
    const textoDeLaCola = JSON.stringify(trabajos);
    for (const [campo, valor] of Object.entries(sensibles())) {
      expect(textoDeLaCola.includes(valor), `la cola contiene ${campo}`).toBe(false);
    }
    afirmarSinDatosPersonales({ texto: () => logsDelFlujo.join('\n') }, sensibles());
    afirmarSinDatosPersonales(entorno.logs, sensibles());
  }, 60_000);

  it('queda fallida tras agotar los reintentos y no envía nada', async () => {
    const ahora = new Date('2035-04-09T12:00:00.000Z');
    const turnoId = await insertarTurnoPorFixture(lista.clinica.id, lista, {
      inicio: new Date('2035-04-10T10:00:00.000Z'),
      estado: 'confirmado',
    });
    const sistema = await montar(ahora);
    sistema.emailSender.fallarTransitoriamente(10, 'EMAIL_LIMITE_TASA');
    await sistema.worker.iniciar();

    await sistema.planificador.ejecutarCiclo();
    await esperarHasta(
      async () => (await notificacionesDelTurno(turnoId))[0]?.estado === 'fallida',
    );

    const [fallida] = await notificacionesDelTurno(turnoId);
    expect(fallida).toMatchObject({ estado: 'fallida', intentos: 2, error: 'EMAIL_LIMITE_TASA' });
    expect(
      sistema.emailSender.enviados.filter((m) => m.para === lista.paciente.email),
    ).toHaveLength(0);
    afirmarSinDatosPersonales({ texto: () => logsDelFlujo.join('\n') }, sensibles());
  }, 60_000);
});
