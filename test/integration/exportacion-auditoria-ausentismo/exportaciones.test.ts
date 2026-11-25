import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CLINICA_A,
  CLINICA_B,
  autorizacion,
  auditoriaDe,
  cerrarPool,
  crearAppDePrueba,
  insertarPaciente,
  insertarProfesional,
  insertarTurno,
  prepararBaseDeExportacion,
} from './soporte.js';

let app: FastifyInstance;
let pacienteA: string;
let pacienteB: string;
let idExportacion: string;

const ADMIN_A = await autorizacion('administrador', CLINICA_A.id);
const ADMIN_B = await autorizacion('administrador', CLINICA_B.id);

beforeAll(async () => {
  await prepararBaseDeExportacion();
  app = await crearAppDePrueba();
  pacienteA = await insertarPaciente(CLINICA_A.id, 'PacienteDeA');
  pacienteB = await insertarPaciente(CLINICA_B.id, 'PacienteDeB');
  const profesionalA = await insertarProfesional(CLINICA_A.id, 'ProfesionalDeA');
  await insertarTurno(CLINICA_A.id, {
    pacienteId: pacienteA,
    profesionalId: profesionalA,
    estado: 'confirmado',
    inicio: '2026-12-09T10:00:00Z',
  });
});
afterAll(async () => {
  await app.close();
  await cerrarPool();
});

describe('exportaciones de la clínica (C-16, T3-T5, T7)', () => {
  it('POST /api/v1/exportaciones devuelve 201 con un id', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/v1/exportaciones',
      headers: ADMIN_A,
    });
    expect(respuesta.statusCode).toBe(201);
    const cuerpo = respuesta.json() as { id: string };
    expect(cuerpo.id).toBeTruthy();
    idExportacion = cuerpo.id;
  });

  it('GET /api/v1/exportaciones/{id} devuelve el archivo con los datos de su clínica', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: `/api/v1/exportaciones/${idExportacion}`,
      headers: ADMIN_A,
    });
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.headers['content-type']).toContain('application/json');
    const cuerpo = respuesta.json() as {
      formato: string;
      pacientes: { nombre: string }[];
      turnos: { estado: string }[];
    };
    expect(cuerpo.formato).toBe('json');
    expect(cuerpo.pacientes.map((p) => p.nombre)).toContain('PacienteDeA');
    expect(cuerpo.turnos).toHaveLength(1);
  });

  it('la exportación no incluye datos de la otra clínica (RLS, regla 3)', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: `/api/v1/exportaciones/${idExportacion}`,
      headers: ADMIN_A,
    });
    const texto = respuesta.body;
    const respuestaB = await app.inject({
      method: 'GET',
      url: `/api/v1/exportaciones/${idExportacion}`,
      headers: ADMIN_B,
    });
    expect(respuestaB.statusCode).toBe(200);
    expect(respuestaB.body).not.toContain(pacienteA);
    expect(respuestaB.body).toContain(pacienteB);
    expect(texto).not.toContain('PacienteDeB');
    expect(texto).toContain('PacienteDeA');
  });

  it('cada exportación queda auditada (T7)', async () => {
    const registros = await auditoriaDe(CLINICA_A.id);
    expect(registros.some((r) => r.entidad === 'exportacion')).toBe(true);
  });

  it('sin rol administrador → 403 (T3, T7)', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/api/v1/exportaciones',
      headers: await autorizacion('recepcionista', CLINICA_A.id),
    });
    const get = await app.inject({
      method: 'GET',
      url: `/api/v1/exportaciones/${idExportacion}`,
      headers: await autorizacion('recepcionista', CLINICA_A.id),
    });
    expect(post.statusCode).toBe(403);
    expect(get.statusCode).toBe(403);
  });

  it('sin contexto de clínica → 403 (T3)', async () => {
    const post = await app.inject({ method: 'POST', url: '/api/v1/exportaciones' });
    expect(post.statusCode).toBe(403);
  });
});
