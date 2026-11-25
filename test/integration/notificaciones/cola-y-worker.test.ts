import { randomUUID } from 'node:crypto';

import type { PgBoss } from 'pg-boss';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  crearNotificacionService,
  type LoggerNotificaciones,
  type NotificacionRegistrada,
  type ResolvedorContenidoEmail,
} from '../../../src/application/notificaciones/index.js';
import { crearEmailSenderFalso } from '../../../src/infrastructure/email/index.js';
import {
  NOMBRE_COLA_EMAIL,
  crearColaNotificacionesPgBoss,
  crearEjecutorTenantNotificaciones,
  crearPgBossApp,
  crearRepositorioNotificacionesPg,
  crearWorkerNotificaciones,
  type PoliticaReintentosCola,
  type WorkerNotificaciones,
} from '../../../src/infrastructure/queue/index.js';

import {
  CLINICA_A,
  CLINICA_B,
  cerrarPool,
  comoApp,
  consultarComoMigra,
  crearTurnoSintetico,
  limpiarColaYNotificaciones,
  prepararBaseNotificaciones,
  type EntornoNotificaciones,
} from './soporte.js';

const EMAIL_PII = 'paciente.secreto@ejemplo.com';
const DNI_PII = '30999888';
const NOMBRE_PII = 'Juana Perez';

let entorno: EntornoNotificaciones;
let bossActivo: PgBoss | undefined;
let workerActivo: WorkerNotificaciones | undefined;

async function esperarHasta(condicion: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    if (await condicion()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Tiempo de espera agotado aguardando condición en cola pg-boss.');
}

async function montarSistemaCola(politica?: Partial<PoliticaReintentosCola>) {
  const emailSender = crearEmailSenderFalso();
  const logs: Array<{ nivel: string; datos: Record<string, unknown>; mensaje: string }> = [];
  const logger: LoggerNotificaciones = {
    info: (datos, mensaje) => logs.push({ nivel: 'info', datos, mensaje }),
    warn: (datos, mensaje) => logs.push({ nivel: 'warn', datos, mensaje }),
    error: (datos, mensaje) => logs.push({ nivel: 'error', datos, mensaje }),
  };

  const resolvedor: ResolvedorContenidoEmail = {
    async resolver({ clinicaId, notificacion }) {
      return {
        estado: 'listo',
        mensaje: {
          para: EMAIL_PII,
          asunto: `Notificación ${notificacion.tipo} (${clinicaId.slice(0, 8)})`,
          texto: `Hola ${NOMBRE_PII} (${DNI_PII}), tu turno está confirmado.`,
        },
      };
    },
  };

  const boss = crearPgBossApp({ connectionString: entorno.urlApp });
  bossActivo = boss;

  const politicaFinal: PoliticaReintentosCola = {
    retryLimit: politica?.retryLimit ?? 2,
    retryDelay: politica?.retryDelay ?? 1,
    retryBackoff: politica?.retryBackoff ?? true,
    retryDelayMax: politica?.retryDelayMax ?? 5,
  };

  const cola = await crearColaNotificacionesPgBoss(boss, politicaFinal);
  const ejecutorTenant = crearEjecutorTenantNotificaciones();
  const reloj = { ahora: () => new Date() };

  const servicio = crearNotificacionService({
    ejecutorTenant,
    cola,
    emailSender,
    resolvedor,
    reloj,
    logger,
  });

  const worker = crearWorkerNotificaciones({
    boss,
    servicio,
    logger,
    politica: politicaFinal,
    pollingIntervalSeconds: 0.5,
  });
  workerActivo = worker;

  return { boss, cola, servicio, worker, emailSender, logger, logs };
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

describe('C-11 integración cola pg-boss y worker dual', () => {
  it('encola, procesa en segundo plano, marca enviada y no persiste PII en pgboss.job ni en notificacion', async () => {
    const sys = await montarSistemaCola();
    await sys.worker.iniciar();

    const { turnoId } = await crearTurnoSintetico(CLINICA_A.id);
    const res = await sys.servicio.encolar({
      clinicaId: CLINICA_A.id,
      turnoId,
      tipo: 'creacion',
      claveIdempotencia: `creacion-${turnoId}`,
    });

    expect(res.estado).toBe('encolada');

    await esperarHasta(async () => {
      const fila = await comoApp(CLINICA_A.id, (c) =>
        crearRepositorioNotificacionesPg(c).buscarPorId(res.notificacionId!),
      );
      return fila?.estado === 'enviada';
    });

    const notificacion = (await comoApp(CLINICA_A.id, (c) =>
      crearRepositorioNotificacionesPg(c).buscarPorId(res.notificacionId!),
    )) as NotificacionRegistrada;

    expect(notificacion.estado).toBe('enviada');
    expect(notificacion.intentos).toBe(1);
    expect(notificacion.enviadaEn).toBeInstanceOf(Date);
    expect(notificacion.error).toBeNull();
    expect(sys.emailSender.enviados).toHaveLength(1);
    expect(sys.emailSender.enviados[0]?.para).toBe(EMAIL_PII);

    const jobs = await consultarComoMigra<{
      data: Record<string, unknown>;
      output: Record<string, unknown> | null;
      state: string;
    }>(entorno.urlMigra, `SELECT data, output, state::text FROM pgboss.job WHERE name = $1`, [
      NOMBRE_COLA_EMAIL,
    ]);

    expect(jobs).toHaveLength(1);
    expect(Object.keys(jobs[0]!.data).sort()).toEqual(['clinicaId', 'notificacionId']);
    expect(jobs[0]!.data).toEqual({
      clinicaId: CLINICA_A.id,
      notificacionId: res.notificacionId,
    });

    const serializado = JSON.stringify(jobs);
    expect(serializado).not.toContain(EMAIL_PII);
    expect(serializado).not.toContain(DNI_PII);
    expect(serializado).not.toContain(NOMBRE_PII);
  });

  it('reintenta con espera creciente ante fallos transitorios y entrega una sola vez al recuperarse', async () => {
    const sys = await montarSistemaCola({ retryLimit: 2, retryDelay: 1, retryBackoff: true });
    sys.emailSender.fallarTransitoriamente(2, 'EMAIL_TIMEOUT');
    await sys.worker.iniciar();

    const res = await sys.servicio.encolar({
      clinicaId: CLINICA_A.id,
      tipo: 'codigo',
      claveIdempotencia: `otp-retry-${randomUUID()}`,
    });

    await esperarHasta(async () => {
      const fila = await comoApp(CLINICA_A.id, (c) =>
        crearRepositorioNotificacionesPg(c).buscarPorId(res.notificacionId!),
      );
      return fila?.estado === 'enviada';
    }, 20_000);

    const notificacion = (await comoApp(CLINICA_A.id, (c) =>
      crearRepositorioNotificacionesPg(c).buscarPorId(res.notificacionId!),
    )) as NotificacionRegistrada;

    expect(notificacion.intentos).toBe(3);
    expect(notificacion.error).toBeNull();
    expect(sys.emailSender.enviados).toHaveLength(1);

    const jobs = await consultarComoMigra<{ retry_count: number; retry_backoff: boolean }>(
      entorno.urlMigra,
      `SELECT retry_count, retry_backoff FROM pgboss.job WHERE name = $1`,
      [NOMBRE_COLA_EMAIL],
    );
    expect(jobs[0]?.retry_backoff).toBe(true);
    expect(jobs[0]?.retry_count).toBe(2);
  });

  it('marca notificación como fallida al agotar los reintentos y no guarda PII en error ni output', async () => {
    const sys = await montarSistemaCola({ retryLimit: 1, retryDelay: 1, retryBackoff: false });
    sys.emailSender.fallarTransitoriamente(5, 'EMAIL_LIMITE_TASA');
    await sys.worker.iniciar();

    const res = await sys.servicio.encolar({
      clinicaId: CLINICA_A.id,
      tipo: 'codigo',
      claveIdempotencia: `otp-agotado-${randomUUID()}`,
    });

    await esperarHasta(async () => {
      const fila = await comoApp(CLINICA_A.id, (c) =>
        crearRepositorioNotificacionesPg(c).buscarPorId(res.notificacionId!),
      );
      return fila?.estado === 'fallida';
    }, 20_000);

    const notificacion = (await comoApp(CLINICA_A.id, (c) =>
      crearRepositorioNotificacionesPg(c).buscarPorId(res.notificacionId!),
    )) as NotificacionRegistrada;

    expect(notificacion.intentos).toBe(2);
    expect(notificacion.error).toBe('EMAIL_LIMITE_TASA');
    expect(notificacion.enviadaEn).toBeNull();
    expect(sys.emailSender.enviados).toHaveLength(0);
  });

  it('termina de inmediato en fallo permanente sin consumir los reintentos restantes', async () => {
    const sys = await montarSistemaCola({ retryLimit: 3, retryDelay: 1, retryBackoff: true });
    sys.emailSender.fallarPermanentemente('EMAIL_AUTENTICACION_INVALIDA');
    await sys.worker.iniciar();

    const res = await sys.servicio.encolar({
      clinicaId: CLINICA_A.id,
      tipo: 'codigo',
      claveIdempotencia: `otp-perm-${randomUUID()}`,
    });

    await esperarHasta(async () => {
      const fila = await comoApp(CLINICA_A.id, (c) =>
        crearRepositorioNotificacionesPg(c).buscarPorId(res.notificacionId!),
      );
      return fila?.estado === 'fallida';
    });

    const notificacion = (await comoApp(CLINICA_A.id, (c) =>
      crearRepositorioNotificacionesPg(c).buscarPorId(res.notificacionId!),
    )) as NotificacionRegistrada;

    expect(notificacion.intentos).toBe(1);
    expect(notificacion.error).toBe('EMAIL_AUTENTICACION_INVALIDA');

    const jobs = await consultarComoMigra<{ retry_count: number; state: string }>(
      entorno.urlMigra,
      `SELECT retry_count, state::text FROM pgboss.job WHERE name = $1`,
      [NOMBRE_COLA_EMAIL],
    );
    expect(jobs[0]?.state).toBe('failed');
    expect(jobs[0]?.retry_count).toBe(0);
  });

  it('garantiza idempotencia de encolado y de entrega, y aísla fallos de cola para el llamador (RN-NO-03)', async () => {
    const sys = await montarSistemaCola();
    await sys.worker.iniciar();

    const clave = `idemp-${randomUUID()}`;
    const primera = await sys.servicio.encolar({
      clinicaId: CLINICA_A.id,
      tipo: 'codigo',
      claveIdempotencia: clave,
    });
    const segunda = await sys.servicio.encolar({
      clinicaId: CLINICA_A.id,
      tipo: 'codigo',
      claveIdempotencia: clave,
    });

    expect(primera.estado).toBe('encolada');
    expect(segunda.estado).toBe('duplicada');
    expect(segunda.notificacionId).toBe(primera.notificacionId);

    await esperarHasta(async () => {
      const fila = await comoApp(CLINICA_A.id, (c) =>
        crearRepositorioNotificacionesPg(c).buscarPorId(primera.notificacionId!),
      );
      return fila?.estado === 'enviada';
    });

    // Reenvío manual de un segundo trabajo para la misma notificación ya enviada: no reenvía email
    await sys.cola.encolar({
      clinicaId: CLINICA_A.id,
      notificacionId: primera.notificacionId!,
    });

    await esperarHasta(async () => {
      const completados = await consultarComoMigra<{ count: string }>(
        entorno.urlMigra,
        `SELECT count(*)::text FROM pgboss.job WHERE name = $1 AND state = 'completed'`,
        [NOMBRE_COLA_EMAIL],
      );
      return Number(completados[0]?.count ?? 0) === 2;
    });

    expect(sys.emailSender.enviados).toHaveLength(1);

    // Aislamiento de fallo de cola (RN-NO-03): detener boss y encolar no lanza excepción
    await sys.worker.detener();
    await sys.boss.stop({ graceful: false });
    bossActivo = undefined;
    workerActivo = undefined;

    const flujoResiliente = await sys.servicio.encolar({
      clinicaId: CLINICA_B.id,
      tipo: 'codigo',
      claveIdempotencia: `fallo-cola-${randomUUID()}`,
    });
    expect(flujoResiliente.estado).toBe('no_encolada');
    if (flujoResiliente.estado !== 'no_encolada') expect.unreachable();
    expect(flujoResiliente.codigoError).toBe('ERROR_TRANSPORTE_COLA');
  });

  it('procesa trabajos de clínicas distintas manteniendo el aislamiento RLS y soporta iniciar/detener idempotentes', async () => {
    const sys = await montarSistemaCola();
    await sys.worker.iniciar();
    await sys.worker.iniciar();

    const rA = await sys.servicio.encolar({
      clinicaId: CLINICA_A.id,
      tipo: 'codigo',
      claveIdempotencia: `aislamiento-a-${randomUUID()}`,
    });
    const rB = await sys.servicio.encolar({
      clinicaId: CLINICA_B.id,
      tipo: 'codigo',
      claveIdempotencia: `aislamiento-b-${randomUUID()}`,
    });

    await esperarHasta(async () => sys.emailSender.enviados.length === 2);

    const vistaA = await comoApp(CLINICA_A.id, (c) =>
      crearRepositorioNotificacionesPg(c).buscarPorId(rB.notificacionId!),
    );
    const vistaB = await comoApp(CLINICA_B.id, (c) =>
      crearRepositorioNotificacionesPg(c).buscarPorId(rA.notificacionId!),
    );
    expect(vistaA).toBeNull();
    expect(vistaB).toBeNull();

    await sys.worker.detener();
    await sys.worker.detener();
  });
});
