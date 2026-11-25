import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CLINICA_A,
  autorizacion,
  cerrarPool,
  crearAppDePrueba,
  insertarPaciente,
  insertarProfesional,
  insertarTurno,
  prepararBaseDeExportacion,
} from './soporte.js';

let app: FastifyInstance;
let pacienteAusente: string;
let profesionalA: string;
let turnoAusente: string;

const ADMIN_A = await autorizacion('administrador', CLINICA_A.id);

beforeAll(async () => {
  await prepararBaseDeExportacion();
  app = await crearAppDePrueba();
  pacienteAusente = await insertarPaciente(CLINICA_A.id, 'PacienteAusente');
  profesionalA = await insertarProfesional(CLINICA_A.id, 'ProfesionalA');
  turnoAusente = await insertarTurno(CLINICA_A.id, {
    pacienteId: pacienteAusente,
    profesionalId: profesionalA,
    estado: 'ausente',
    inicio: '2026-12-09T10:00:00Z',
  });
  await insertarTurno(CLINICA_A.id, {
    profesionalId: profesionalA,
    estado: 'confirmado',
    inicio: '2026-12-09T11:00:00Z',
  });
});
afterAll(async () => {
  await app.close();
  await cerrarPool();
});

describe('GET /api/v1/ausentismo (C-16, T6)', () => {
  it('devuelve el listado y el conteo de ausentes', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: '/api/v1/ausentismo',
      headers: ADMIN_A,
    });
    expect(respuesta.statusCode).toBe(200);
    const cuerpo = respuesta.json() as {
      total: number;
      ausentes: { id: string; pacienteId: string | null; profesionalId: string | null }[];
    };
    expect(cuerpo.total).toBe(1);
    expect(cuerpo.ausentes.map((a) => a.id)).toContain(turnoAusente);
    expect(cuerpo.ausentes[0]?.pacienteId).toBe(pacienteAusente);
  });

  it('filtra por profesional', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: `/api/v1/ausentismo?profesionalId=${profesionalA}`,
      headers: ADMIN_A,
    });
    expect(respuesta.statusCode).toBe(200);
    expect((respuesta.json() as { total: number }).total).toBe(1);
  });

  it('filtra por período (desde futuro) → sin ausentes', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: '/api/v1/ausentismo?desde=2026-12-10T00:00:00Z',
      headers: ADMIN_A,
    });
    expect(respuesta.statusCode).toBe(200);
    expect((respuesta.json() as { total: number }).total).toBe(0);
  });

  it('filtra por paciente sin ausentes → total 0', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: '/api/v1/ausentismo?pacienteId=00000000-0000-4000-8000-000000000000',
      headers: ADMIN_A,
    });
    expect(respuesta.statusCode).toBe(200);
    expect((respuesta.json() as { total: number }).total).toBe(0);
  });

  it('sin rol administrador → 403 (T6)', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: '/api/v1/ausentismo',
      headers: await autorizacion('recepcionista', CLINICA_A.id),
    });
    expect(respuesta.statusCode).toBe(403);
  });

  it('sin contexto de clínica → 403 (T6)', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/api/v1/ausentismo' });
    expect(respuesta.statusCode).toBe(403);
  });
});
