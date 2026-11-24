import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CLINICA_A,
  cerrarPool,
  comoApp,
  crearAppPublica,
  fijarGranularidad,
  insertarBloqueo,
  insertarFeriado,
  insertarHorario,
  insertarPaciente,
  insertarPrestacion,
  insertarProfesional,
  insertarSillon,
  insertarTurnoSintetico,
  prepararBaseDeDisponibilidad,
} from './soporte.js';

/*
 * Agenda sembrada: el miércoles 2026-12-09 (dia_semana 3) el profesional atiende de 08:00 a 10:00
 * hora de Buenos Aires (UTC-3: 11:00Z a 13:00Z). "Hoy" es 2026-12-01 09:00 locales.
 */
let app: FastifyInstance;
let prof: string;
let otroProf: string;
let prest: string;
let sillon: string;
let paciente: string;

const RUTA = `/api/v1/publico/${CLINICA_A.slug}/disponibilidad`;
const consultar = (extra: Record<string, string> = {}) => {
  const params = new URLSearchParams({
    profesionalId: prof,
    prestacionId: prest,
    desde: '2026-12-09',
    hasta: '2026-12-10',
    ...extra,
  });
  return app.inject({ method: 'GET', url: `${RUTA}?${params.toString()}` });
};
const inicios = async (extra: Record<string, string> = {}): Promise<string[]> => {
  const r = await consultar(extra);
  expect(r.statusCode).toBe(200);
  return (r.json() as { huecos: { inicio: string }[] }).huecos.map((h) => h.inicio);
};

async function limpiarAgenda(): Promise<void> {
  await comoApp(CLINICA_A.id, async (c) => {
    await c.query('DELETE FROM turno');
    await c.query('DELETE FROM bloqueo');
    await c.query('DELETE FROM feriado');
  });
}

beforeAll(async () => {
  await prepararBaseDeDisponibilidad();
  process.env.RATE_LIMIT_PUBLIC = '100000/h';
  prof = await insertarProfesional(CLINICA_A.id);
  otroProf = await insertarProfesional(CLINICA_A.id, { nombre: 'Otro' });
  prest = await insertarPrestacion(CLINICA_A.id, 'Consulta', 30);
  sillon = await insertarSillon(CLINICA_A.id, 'Sillón 1', 0);
  paciente = await insertarPaciente(CLINICA_A.id, 'Paciente');
  await insertarHorario(CLINICA_A.id, prof, 3, '08:00', '10:00');
  await insertarHorario(CLINICA_A.id, otroProf, 3, '08:00', '10:00');
  ({ app } = await crearAppPublica());
});
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-12-01T12:00:00Z'));
  await limpiarAgenda();
});
afterEach(() => vi.useRealTimers());
afterAll(async () => {
  delete process.env.RATE_LIMIT_PUBLIC;
  await app.close();
  await cerrarPool();
});

describe('GET /publico/:slug/disponibilidad', () => {
  it('día libre de 08:00 a 10:00: 7 huecos en UTC con zonaHoraria, sin caché', async () => {
    const r = await consultar();
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    const cuerpo = r.json() as Record<string, unknown> & {
      huecos: { inicio: string; fin: string }[];
    };
    expect(cuerpo).toMatchObject({
      zonaHoraria: 'America/Argentina/Buenos_Aires',
      profesionalId: prof,
      prestacionId: prest,
      desde: '2026-12-09',
      hasta: '2026-12-10',
    });
    expect(cuerpo.huecos).toHaveLength(7);
    expect(cuerpo.huecos[0]).toEqual({
      inicio: '2026-12-09T11:00:00.000Z',
      fin: '2026-12-09T11:30:00.000Z',
    });
    expect(cuerpo.huecos[6]).toEqual({
      inicio: '2026-12-09T12:30:00.000Z',
      fin: '2026-12-09T13:00:00.000Z',
    });
    for (const h of cuerpo.huecos) expect(Object.keys(h).sort()).toEqual(['fin', 'inicio']);
  });

  it('feriado: sin huecos ese día; otro día de la semana sin franjas: vacío', async () => {
    await insertarFeriado(CLINICA_A.id, '2026-12-09');
    expect(await inicios()).toEqual([]);
    expect(await inicios({ desde: '2026-12-10', hasta: '2026-12-11' })).toEqual([]);
  });

  it('bloqueo 09:00 a 10:00 locales: ningún hueco solapado', async () => {
    await insertarBloqueo(CLINICA_A.id, prof, '2026-12-09T12:00:00Z', '2026-12-09T13:00:00Z');
    expect(await inicios()).toEqual([
      '2026-12-09T11:00:00.000Z',
      '2026-12-09T11:15:00.000Z',
      '2026-12-09T11:30:00.000Z',
    ]);
  });

  it('turno del profesional: sus huecos solapados desaparecen', async () => {
    await insertarTurnoSintetico(CLINICA_A.id, {
      pacienteId: paciente,
      profesionalId: prof,
      sillonId: sillon,
      prestacionId: prest,
      inicio: '2026-12-09T11:00:00Z',
      minutos: 30,
    });
    expect(await inicios()).toEqual([
      '2026-12-09T11:30:00.000Z',
      '2026-12-09T11:45:00.000Z',
      '2026-12-09T12:00:00.000Z',
      '2026-12-09T12:15:00.000Z',
      '2026-12-09T12:30:00.000Z',
    ]);
  });

  it('turno cancelado libera el horario', async () => {
    await insertarTurnoSintetico(CLINICA_A.id, {
      pacienteId: paciente,
      profesionalId: prof,
      sillonId: sillon,
      prestacionId: prest,
      inicio: '2026-12-09T12:00:00Z',
      minutos: 30,
      estado: 'cancelado',
    });
    expect(await inicios()).toContain('2026-12-09T12:00:00.000Z');
  });

  it('buffer de 15 en sillón único ocupado por otro profesional: 09:30 no, 09:45 sí', async () => {
    const unico = await insertarSillon(CLINICA_A.id, 'Sillón con buffer', 15);
    // Este profesional atiende hasta las 11:00 para que el hueco de las 09:45 entre en su franja.
    const largo = await insertarProfesional(CLINICA_A.id, { nombre: 'Franja larga' });
    await insertarHorario(CLINICA_A.id, largo, 3, '08:00', '11:00');
    await comoApp(CLINICA_A.id, (c) =>
      c.query('UPDATE sillon SET activo = FALSE WHERE id = $1', [sillon]),
    );
    try {
      await insertarTurnoSintetico(CLINICA_A.id, {
        pacienteId: paciente,
        profesionalId: otroProf,
        sillonId: unico,
        prestacionId: prest,
        inicio: '2026-12-09T12:00:00Z',
        minutos: 30,
        buffer: 15,
      });
      const lista = await inicios({ profesionalId: largo });
      expect(lista).not.toContain('2026-12-09T12:30:00.000Z'); // 09:30 locales
      expect(lista).toContain('2026-12-09T12:45:00.000Z'); // 09:45 locales
    } finally {
      await comoApp(CLINICA_A.id, async (c) => {
        await c.query('DELETE FROM turno');
        await c.query('UPDATE sillon SET activo = TRUE WHERE id = $1', [sillon]);
        await c.query('UPDATE sillon SET activo = FALSE WHERE id = $1', [unico]);
      });
    }
  });

  it('inicios pasados excluidos: a las 09:10 locales no hay huecos antes', async () => {
    vi.setSystemTime(new Date('2026-12-09T12:10:00Z'));
    const lista = await inicios();
    expect(lista[0]).toBe('2026-12-09T12:15:00.000Z');
    expect(lista.every((i) => i >= '2026-12-09T12:10:00.000Z')).toBe(true);
  });

  it('respeta la granularidad de la clínica (PO-06)', async () => {
    await fijarGranularidad(CLINICA_A.id, 30);
    try {
      expect(await inicios()).toEqual([
        '2026-12-09T11:00:00.000Z',
        '2026-12-09T11:30:00.000Z',
        '2026-12-09T12:00:00.000Z',
        '2026-12-09T12:30:00.000Z',
      ]);
    } finally {
      await fijarGranularidad(CLINICA_A.id, 15);
    }
  });

  it('sin franjas en el rango: 200 con huecos vacíos', async () => {
    expect(await inicios({ desde: '2026-12-10', hasta: '2026-12-12' })).toEqual([]);
  });
});

describe('validación', () => {
  it('sin prestacionId: 400 SOLICITUD_INVALIDA con el campo y sin valores', async () => {
    const q = `profesionalId=${prof}&desde=2026-12-09&hasta=2026-12-10`;
    const r = await app.inject({ method: 'GET', url: `${RUTA}?${q}` });
    expect(r.statusCode).toBe(400);
    const cuerpo = r.json() as { codigo: string; campos: { campo: string }[] };
    expect(cuerpo.codigo).toBe('SOLICITUD_INVALIDA');
    expect(cuerpo.campos.some((c) => c.campo === 'prestacionId' || c.campo === '')).toBe(true);
    expect(r.body).not.toContain(prof);
    expect(r.headers['cache-control']).toBe('no-store');
  });

  it('fecha con forma inválida: 400 SOLICITUD_INVALIDA', async () => {
    const r = await consultar({ desde: '9-12-2026' });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ codigo: 'SOLICITUD_INVALIDA' });
  });

  it('un parámetro no declarado se descarta (no cambia la respuesta)', async () => {
    const sin = await consultar();
    const con = await consultar({ extra: 'x' });
    expect(con.statusCode).toBe(200);
    expect(con.body).toBe(sin.body);
  });

  it.each([
    ['rango invertido', { desde: '2026-12-10', hasta: '2026-12-10' }],
    ['15 días', { desde: '2026-12-01', hasta: '2026-12-16' }],
    ['fecha inexistente', { desde: '2026-02-30', hasta: '2026-03-02' }],
    ['más de 90 días', { desde: '2027-02-25', hasta: '2027-03-02' }],
  ])('%s: 400 RANGO_FECHAS_INVALIDO', async (_n, extra) => {
    const r = await consultar(extra);
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ codigo: 'RANGO_FECHAS_INVALIDO' });
  });
});
