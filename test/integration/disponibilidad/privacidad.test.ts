import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { conClinicaPublica } from '../../../src/interfaces/http/modules/publico-disponibilidad/dependencias.js';
import {
  CLINICA_A,
  CLINICA_B,
  cerrarPool,
  comoApp,
  crearAppPublica,
  insertarBloqueo,
  insertarHorario,
  insertarPaciente,
  insertarPrestacion,
  insertarProfesional,
  insertarSillon,
  insertarTurnoSintetico,
  prepararBaseDeDisponibilidad,
  type AppPublica,
} from './soporte.js';

let publica: AppPublica;
let app: FastifyInstance;
const A = {} as Record<string, string>;
const B = {} as Record<string, string>;

const NOMBRE_PACIENTE = 'PacienteReservadoUnico';
const NOMBRE_SILLON = 'SillonReservadoUnico';
const MOTIVO = 'motivo sintético reservado';

const url = (slug: string, p: string, r: string, desde = '2026-12-09', hasta = '2026-12-10') =>
  `/api/v1/publico/${slug}/disponibilidad?profesionalId=${p}&prestacionId=${r}&desde=${desde}&hasta=${hasta}`;

async function contarAuditoria(clinicaId: string): Promise<number> {
  return comoApp(clinicaId, async (c) => {
    const { rows } = await c.query<{ n: string }>('SELECT count(*)::text AS n FROM auditoria');
    return Number(rows[0]?.n);
  });
}

async function sembrar(
  clinicaId: string,
  ids: Record<string, string>,
  sufijo: string,
): Promise<void> {
  ids.prof = await insertarProfesional(clinicaId, { nombre: `Prof${sufijo}` });
  ids.prest = await insertarPrestacion(clinicaId, `Consulta ${sufijo}`, 30);
  ids.sillon = await insertarSillon(clinicaId, `${NOMBRE_SILLON}${sufijo}`, 0);
  ids.paciente = await insertarPaciente(clinicaId, `${NOMBRE_PACIENTE}${sufijo}`);
  await insertarHorario(clinicaId, ids.prof as string, 3, '08:00', '10:00');
  ids.turno = await insertarTurnoSintetico(clinicaId, {
    pacienteId: ids.paciente as string,
    profesionalId: ids.prof as string,
    sillonId: ids.sillon as string,
    prestacionId: ids.prest as string,
    inicio: '2026-12-09T11:00:00Z',
    minutos: 30,
  });
  await insertarBloqueo(
    clinicaId,
    ids.prof as string,
    '2026-12-09T12:30:00Z',
    '2026-12-09T13:00:00Z',
  );
}

beforeAll(async () => {
  await prepararBaseDeDisponibilidad();
  process.env.RATE_LIMIT_PUBLIC = '100000/h';
  await sembrar(CLINICA_A.id, A, 'A');
  await sembrar(CLINICA_B.id, B, 'B');
  publica = await crearAppPublica();
  app = publica.app;
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-12-01T12:00:00Z'));
});
afterAll(async () => {
  vi.useRealTimers();
  delete process.env.RATE_LIMIT_PUBLIC;
  await app.close();
  await cerrarPool();
});

describe('respuestas sin datos ajenos', () => {
  it('ninguna respuesta contiene ids ni nombres de pacientes, turnos, sillones ni motivos', async () => {
    const respuestas = await Promise.all([
      app.inject({ method: 'GET', url: url(CLINICA_A.slug, A.prof as string, A.prest as string) }),
      app.inject({ method: 'GET', url: `/api/v1/publico/${CLINICA_A.slug}/prestaciones` }),
      app.inject({ method: 'GET', url: `/api/v1/publico/${CLINICA_A.slug}/profesionales` }),
    ]);
    const texto = respuestas.map((r) => r.body).join('\n');
    expect(respuestas.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    for (const prohibido of [
      A.paciente,
      A.turno,
      A.sillon,
      B.paciente,
      B.turno,
      B.sillon,
      NOMBRE_PACIENTE,
      NOMBRE_SILLON,
      MOTIVO,
      'sillonesAsignables',
      'pacienteId',
    ]) {
      expect(texto).not.toContain(prohibido as string);
    }
    // La disponibilidad sí refleja la agenda: 09:00 ocupado por turno, 09:30 por bloqueo.
    const huecos = (respuestas[0]?.json() as { huecos: { inicio: string }[] }).huecos;
    expect(huecos.length).toBe(3);
  });
});

describe('aislamiento entre clínicas', () => {
  it('la disponibilidad de A no cambia al agregar turnos en B', async () => {
    const antes = await app.inject({
      method: 'GET',
      url: url(CLINICA_A.slug, A.prof as string, A.prest as string),
    });
    await insertarTurnoSintetico(CLINICA_B.id, {
      pacienteId: B.paciente as string,
      profesionalId: B.prof as string,
      sillonId: B.sillon as string,
      prestacionId: B.prest as string,
      inicio: '2026-12-09T12:00:00Z',
      minutos: 30,
    });
    const despues = await app.inject({
      method: 'GET',
      url: url(CLINICA_A.slug, A.prof as string, A.prest as string),
    });
    expect(despues.body).toBe(antes.body);
  });

  it('con ids de la clínica B y el slug de A: 404', async () => {
    for (const q of [
      url(CLINICA_A.slug, B.prof as string, A.prest as string),
      url(CLINICA_A.slug, A.prof as string, B.prest as string),
    ]) {
      const r = await app.inject({ method: 'GET', url: q });
      expect(r.statusCode).toBe(404);
      expect(r.json()).toMatchObject({ codigo: 'RECURSO_NO_ENCONTRADO' });
    }
  });
});

describe('solo lectura, sin auditoría y sin datos en logs', () => {
  it('la tabla auditoria no cambia tras consultas exitosas y fallidas', async () => {
    // Una fila de control prueba que el conteo realmente ve la tabla.
    await comoApp(CLINICA_A.id, (c) =>
      c.query(
        `INSERT INTO auditoria (clinica_id, actor_tipo, accion, entidad) VALUES ($1, 'sistema', 'control', 'prueba')`,
        [CLINICA_A.id],
      ),
    );
    const antesA = await contarAuditoria(CLINICA_A.id);
    const antesB = await contarAuditoria(CLINICA_B.id);
    expect(antesA).toBeGreaterThan(0);
    const pedidos = [
      url(CLINICA_A.slug, A.prof as string, A.prest as string),
      url(CLINICA_A.slug, B.prof as string, A.prest as string),
      url('no-existe', A.prof as string, A.prest as string),
      `/api/v1/publico/${CLINICA_A.slug}/disponibilidad?desde=x`,
      `/api/v1/publico/${CLINICA_A.slug}/prestaciones`,
    ];
    for (const p of pedidos) await app.inject({ method: 'GET', url: p });
    expect(await contarAuditoria(CLINICA_A.id)).toBe(antesA);
    expect(await contarAuditoria(CLINICA_B.id)).toBe(antesB);
  });

  it('los logs no contienen identificadores ni fechas de la consulta ni datos de pacientes', async () => {
    const q = url(CLINICA_A.slug, A.prof as string, A.prest as string, '2026-12-09', '2026-12-10');
    await app.inject({ method: 'GET', url: q });
    await app.inject({
      method: 'GET',
      url: url(CLINICA_A.slug, B.prof as string, A.prest as string),
    });
    const logs = publica.logs.texto();
    expect(logs).toContain('acceso');
    for (const prohibido of [
      A.prof,
      B.prof,
      A.prest,
      'profesionalId',
      'prestacionId',
      'desde=',
      'hasta=',
      NOMBRE_PACIENTE,
      A.paciente,
    ]) {
      expect(logs).not.toContain(prohibido as string);
    }
    // El registro de acceso guarda la ruta sin consulta.
    expect(logs).toContain(`/api/v1/publico/${CLINICA_A.slug}/disponibilidad"`);
  });

  it('una escritura forzada dentro de la transacción del módulo falla con 25006', async () => {
    await expect(
      conClinicaPublica(CLINICA_A.slug, (c) =>
        c.query(
          `INSERT INTO feriado (clinica_id, fecha, descripcion) VALUES ($1, '2026-12-25', 'x')`,
          [CLINICA_A.id],
        ),
      ),
    ).rejects.toMatchObject({ code: '25006' });
    const { rows } = await comoApp(CLINICA_A.id, (c) =>
      c.query('SELECT count(*)::int AS n FROM feriado'),
    );
    expect((rows[0] as { n: number }).n).toBe(0);
  });
});
