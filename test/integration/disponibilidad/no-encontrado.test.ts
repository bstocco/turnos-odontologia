import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  CLINICA_A,
  CLINICA_B,
  SLUG_INACTIVA,
  cerrarPool,
  crearAppPublica,
  crearClinicaInactiva,
  insertarPrestacion,
  insertarProfesional,
  prepararBaseDeDisponibilidad,
} from './soporte.js';

let app: FastifyInstance;
let profA: string;
let prestA: string;
let profB: string;
let prestB: string;
let profInactivo: string;
let prestInactiva: string;

const Q = (p: string, r: string) =>
  `profesionalId=${p}&prestacionId=${r}&desde=2026-12-09&hasta=2026-12-10`;
const get = (url: string) => app.inject({ method: 'GET', url });

beforeAll(async () => {
  const entorno = await prepararBaseDeDisponibilidad();
  await crearClinicaInactiva(entorno.urlMigra);
  process.env.RATE_LIMIT_PUBLIC = '100000/h';
  profA = await insertarProfesional(CLINICA_A.id);
  prestA = await insertarPrestacion(CLINICA_A.id, 'Consulta', 30);
  profB = await insertarProfesional(CLINICA_B.id);
  prestB = await insertarPrestacion(CLINICA_B.id, 'Consulta B', 30);
  profInactivo = await insertarProfesional(CLINICA_A.id, { activo: false });
  prestInactiva = await insertarPrestacion(CLINICA_A.id, 'Vieja', 30, false);
  ({ app } = await crearAppPublica());
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-12-01T12:00:00Z'));
});
afterAll(async () => {
  vi.useRealTimers();
  delete process.env.RATE_LIMIT_PUBLIC;
  await app.close();
  await cerrarPool();
});

describe('404 uniforme', () => {
  it.each(['prestaciones', 'profesionales'])(
    'slug inexistente, mal formado o de clínica inactiva en /%s: cuerpos byte a byte idénticos',
    async (ruta) => {
      const respuestas = await Promise.all(
        ['no-existe', 'MAYUS', '-x', SLUG_INACTIVA].map((s) => get(`/api/v1/publico/${s}/${ruta}`)),
      );
      for (const r of respuestas) {
        expect(r.statusCode).toBe(404);
        expect(r.headers['cache-control']).toBe('no-store');
        expect(r.json()).toEqual({
          codigo: 'RECURSO_NO_ENCONTRADO',
          mensaje: 'El recurso solicitado no existe.',
        });
      }
      expect(new Set(respuestas.map((r) => r.body)).size).toBe(1);
    },
  );

  it('slug inválido/inexistente/inactivo también en /disponibilidad', async () => {
    const q = Q(profA, prestA);
    const respuestas = await Promise.all(
      ['no-existe', 'MAYUS', SLUG_INACTIVA].map((s) =>
        get(`/api/v1/publico/${s}/disponibilidad?${q}`),
      ),
    );
    expect(respuestas.map((r) => r.statusCode)).toEqual([404, 404, 404]);
    expect(new Set(respuestas.map((r) => r.body)).size).toBe(1);
  });

  it('profesional o prestación inexistente, no UUID, inactivo o de la clínica B: el mismo cuerpo', async () => {
    const base = `/api/v1/publico/${CLINICA_A.slug}/disponibilidad?`;
    const casos = [
      Q(randomUUID(), prestA),
      Q('no-es-uuid', prestA),
      Q(profInactivo, prestA),
      Q(profB, prestA),
      Q(profA, randomUUID()),
      Q(profA, 'no-es-uuid'),
      Q(profA, prestInactiva),
      Q(profA, prestB),
    ];
    const respuestas = await Promise.all(casos.map((q) => get(base + q)));
    for (const r of respuestas) expect(r.statusCode).toBe(404);
    expect(new Set(respuestas.map((r) => r.body)).size).toBe(1);
    expect(respuestas[0]?.json()).toMatchObject({ codigo: 'RECURSO_NO_ENCONTRADO' });
    expect(respuestas[0]?.headers['cache-control']).toBe('no-store');
  });

  it('un profesional válido de la propia clínica sí responde 200', async () => {
    const r = await get(`/api/v1/publico/${CLINICA_A.slug}/disponibilidad?${Q(profA, prestA)}`);
    expect(r.statusCode).toBe(200);
  });
});
