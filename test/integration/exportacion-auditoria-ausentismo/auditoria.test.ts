import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CLINICA_A,
  CLINICA_B,
  autorizacion,
  cerrarPool,
  comoApp,
  crearAppDePrueba,
  prepararBaseDeExportacion,
} from './soporte.js';

let app: FastifyInstance;

const ADMIN_A = await autorizacion('administrador', CLINICA_A.id);
const RECEPCIONISTA_A = await autorizacion('recepcionista', CLINICA_A.id);

beforeAll(async () => {
  await prepararBaseDeExportacion();
  app = await crearAppDePrueba();
  await comoApp(CLINICA_A.id, (c) =>
    c.query(
      `INSERT INTO auditoria (clinica_id, ocurrio_en, actor_tipo, actor_id, accion, entidad, entidad_id, ip)
       VALUES ($1, $2, 'usuario', $3, 'creacion', 'paciente', $4, '127.0.0.1')`,
      [CLINICA_A.id, new Date('2026-11-24T10:00:00Z'), 'usr-admin-a', randomUUID()],
    ),
  );
  await comoApp(CLINICA_A.id, (c) =>
    c.query(
      `INSERT INTO auditoria (clinica_id, ocurrio_en, actor_tipo, actor_id, accion, entidad)
       VALUES ($1, $2, 'usuario', $3, 'modificacion', 'turno')`,
      [CLINICA_A.id, new Date('2026-11-24T11:00:00Z'), 'usr-admin-a'],
    ),
  );
});
afterAll(async () => {
  await app.close();
  await cerrarPool();
});

describe('GET /api/v1/auditoria (C-16, T1)', () => {
  it('devuelve los registros de la clínica comoadministrador', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: '/api/v1/auditoria',
      headers: ADMIN_A,
    });
    expect(respuesta.statusCode).toBe(200);
    const cuerpo = respuesta.json() as { accion: string; entidad: string }[];
    expect(cuerpo.length).toBeGreaterThanOrEqual(2);
    expect(cuerpo.map((r) => r.accion)).toContain('creacion');
    expect(cuerpo.map((r) => r.entidad)).toContain('turno');
  });

  it('filtra por entidad', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: '/api/v1/auditoria?entidad=turno',
      headers: ADMIN_A,
    });
    expect(respuesta.statusCode).toBe(200);
    const cuerpo = respuesta.json() as { entidad: string }[];
    expect(cuerpo.length).toBeGreaterThan(0);
    expect(cuerpo.every((r) => r.entidad === 'turno')).toBe(true);
  });

  it('filtra por actor', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: '/api/v1/auditoria?actorId=usr-admin-a',
      headers: ADMIN_A,
    });
    expect(respuesta.statusCode).toBe(200);
    const cuerpo = respuesta.json() as { actorId: string | null }[];
    expect(cuerpo.length).toBeGreaterThan(0);
    expect(cuerpo.every((r) => r.actorId === 'usr-admin-a')).toBe(true);
  });

  it('los datos son los de la propia clínica (RLS, regla 3)', async () => {
    const respuestaA = await app.inject({
      method: 'GET',
      url: '/api/v1/auditoria',
      headers: ADMIN_A,
    });
    const cuerpoA = respuestaA.json() as { clinicaId: string }[];
    expect(cuerpoA.every((r) => r.clinicaId === CLINICA_A.id)).toBe(true);
    const respuestaB = await app.inject({
      method: 'GET',
      url: '/api/v1/auditoria',
      headers: await autorizacion('administrador', CLINICA_B.id),
    });
    expect(respuestaB.statusCode).toBe(200);
    const cuerpoB = respuestaB.json() as { clinicaId: string }[];
    expect(cuerpoB.every((r) => r.clinicaId === CLINICA_B.id)).toBe(true);
    expect(cuerpoB.length).toBeLessThan(cuerpoA.length + 1);
  });

  it('sin rol administrador → 403 (T2)', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: '/api/v1/auditoria',
      headers: RECEPCIONISTA_A,
    });
    expect(respuesta.statusCode).toBe(403);
  });

  it('sin contexto de clínica → 403 (T2)', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/api/v1/auditoria' });
    expect(respuesta.statusCode).toBe(403);
  });
});
