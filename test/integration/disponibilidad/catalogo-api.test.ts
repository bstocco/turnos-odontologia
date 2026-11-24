import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CLINICA_A,
  CLINICA_B,
  cerrarPool,
  crearAppPublica,
  insertarPrestacion,
  insertarProfesional,
  prepararBaseDeDisponibilidad,
} from './soporte.js';

let app: FastifyInstance;
const get = (url: string, headers: Record<string, string> = {}) =>
  app.inject({ method: 'GET', url, headers });

beforeAll(async () => {
  await prepararBaseDeDisponibilidad();
  process.env.RATE_LIMIT_PUBLIC = '100000/h';
  await insertarPrestacion(CLINICA_A.id, 'Limpieza', 45);
  await insertarPrestacion(CLINICA_A.id, 'Consulta', 30);
  await insertarPrestacion(CLINICA_A.id, 'Blanqueamiento', 60, false);
  await insertarPrestacion(CLINICA_B.id, 'Ortodoncia', 20);
  await insertarProfesional(CLINICA_A.id, {
    nombre: 'Ana',
    apellido: 'Zeta',
    matricula: 'MP-SINTETICA-1',
  });
  await insertarProfesional(CLINICA_A.id, { nombre: 'Beto', apellido: 'Alfa' });
  await insertarProfesional(CLINICA_A.id, { nombre: 'Inactivo', apellido: 'Baja', activo: false });
  await insertarProfesional(CLINICA_B.id, { nombre: 'Otra', apellido: 'Clinica' });
  ({ app } = await crearAppPublica());
});
afterAll(async () => {
  delete process.env.RATE_LIMIT_PUBLIC;
  await app.close();
  await cerrarPool();
});

describe('GET /publico/:slug/prestaciones', () => {
  const URL = `/api/v1/publico/${CLINICA_A.slug}/prestaciones`;

  it('200 sin token: solo activas, ordenadas por nombre, con exactamente id, nombre y duración', async () => {
    const r = await get(URL);
    expect(r.statusCode).toBe(200);
    const { prestaciones } = r.json() as { prestaciones: Record<string, unknown>[] };
    expect(prestaciones.map((p) => [p.nombre, p.duracionMinutos])).toEqual([
      ['Consulta', 30],
      ['Limpieza', 45],
    ]);
    for (const p of prestaciones)
      expect(Object.keys(p).sort()).toEqual(['duracionMinutos', 'id', 'nombre']);
    expect(r.body).not.toContain('Blanqueamiento');
    expect(r.body).not.toContain('Ortodoncia');
  });

  it('un Authorization inválido se ignora: mismo cuerpo que sin encabezado', async () => {
    const sin = await get(URL);
    const con = await get(URL, { authorization: 'Bearer basura' });
    expect(con.statusCode).toBe(200);
    expect(con.body).toBe(sin.body);
  });

  it('Cache-Control: private, max-age=60', async () => {
    expect((await get(URL)).headers['cache-control']).toBe('private, max-age=60');
  });

  it('la clínica B ve solo lo suyo', async () => {
    const r = await get(`/api/v1/publico/${CLINICA_B.slug}/prestaciones`);
    expect(
      (r.json() as { prestaciones: { nombre: string }[] }).prestaciones.map((p) => p.nombre),
    ).toEqual(['Ortodoncia']);
  });
});

describe('GET /publico/:slug/profesionales (Q2 aprobada)', () => {
  const URL = `/api/v1/publico/${CLINICA_A.slug}/profesionales`;

  it('200: activos por apellido/nombre, claves exactas y sin matrícula', async () => {
    const r = await get(URL);
    expect(r.statusCode).toBe(200);
    const { profesionales } = r.json() as { profesionales: Record<string, unknown>[] };
    expect(profesionales.map((p) => [p.apellido, p.nombre])).toEqual([
      ['Alfa', 'Beto'],
      ['Zeta', 'Ana'],
    ]);
    for (const p of profesionales)
      expect(Object.keys(p).sort()).toEqual(['apellido', 'id', 'nombre']);
    expect(r.body).not.toContain('MP-SINTETICA-1');
    expect(r.body).not.toContain('Baja');
    expect(r.body).not.toContain('Clinica');
  });

  it('Cache-Control: private, max-age=60 y sin token', async () => {
    const r = await get(URL, { authorization: 'Bearer basura' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('private, max-age=60');
  });

  it('404 uniforme para slug inexistente o mal formado', async () => {
    const a = await get('/api/v1/publico/no-existe/profesionales');
    const b = await get('/api/v1/publico/MAYUS/profesionales');
    expect(a.statusCode).toBe(404);
    expect(a.json()).toMatchObject({ codigo: 'RECURSO_NO_ENCONTRADO' });
    expect(b.body).toBe(a.body);
    expect(a.headers['cache-control']).toBe('no-store');
  });
});
