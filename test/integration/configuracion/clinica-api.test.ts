import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  CLINICA_A,
  CLINICA_B,
  auditoriaDe,
  autorizacion,
  cerrarPool,
  comoApp,
  crearAppDePrueba,
  prepararBaseDeConfiguracion,
} from './soporte.js';

let app: FastifyInstance;

beforeAll(async () => {
  await prepararBaseDeConfiguracion();
  app = await crearAppDePrueba();
});
afterAll(async () => {
  await app.close();
  await cerrarPool();
});

beforeEach(async () => {
  for (const clinica of [CLINICA_A, CLINICA_B]) {
    await comoApp(clinica.id, (c) =>
      c.query(
        `UPDATE clinica_config SET reserva_requiere_confirmacion = FALSE,
           cancelacion_anticipacion_horas = 24, granularidad_minutos = 15`,
      ),
    );
  }
});

describe('GET /api/v1/clinica', () => {
  it('devuelve los valores por defecto a los tres roles', async () => {
    for (const rol of ['administrador', 'recepcionista', 'odontologo'] as const) {
      const respuesta = await app.inject({
        method: 'GET',
        url: '/api/v1/clinica',
        headers: await autorizacion(rol, CLINICA_A.id),
      });
      expect(respuesta.statusCode).toBe(200);
      expect(respuesta.json()).toEqual({
        id: CLINICA_A.id,
        nombre: CLINICA_A.nombre,
        slug: CLINICA_A.slug,
        zonaHoraria: 'America/Argentina/Buenos_Aires',
        reservaRequiereConfirmacion: false,
        cancelacionAnticipacionHoras: 24,
        granularidadMinutos: 15,
      });
    }
  });

  it('cada clínica ve solo la suya', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: '/api/v1/clinica',
      headers: await autorizacion('administrador', CLINICA_B.id),
    });
    expect(respuesta.json()).toMatchObject({ id: CLINICA_B.id, slug: CLINICA_B.slug });
  });

  it('sin token responde 401 AUTENTICACION_REQUERIDA', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/api/v1/clinica' });
    expect(respuesta.statusCode).toBe(401);
    expect(respuesta.json()).toMatchObject({ codigo: 'AUTENTICACION_REQUERIDA' });
  });
});

describe('PATCH /api/v1/clinica', () => {
  it('modifica parcialmente, conserva el resto y audita con actor e ip', async () => {
    const usuarioId = '44444444-4444-4444-8444-444444444444';
    const respuesta = await app.inject({
      method: 'PATCH',
      url: '/api/v1/clinica',
      headers: await autorizacion('administrador', CLINICA_A.id, usuarioId),
      payload: { granularidadMinutos: 30, reservaRequiereConfirmacion: true },
      remoteAddress: '203.0.113.9',
    });
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toMatchObject({
      reservaRequiereConfirmacion: true,
      cancelacionAnticipacionHoras: 24,
      granularidadMinutos: 30,
    });

    const siguiente = await app.inject({
      method: 'PATCH',
      url: '/api/v1/clinica',
      headers: await autorizacion('administrador', CLINICA_A.id, usuarioId),
      payload: { cancelacionAnticipacionHoras: 0 },
    });
    expect(siguiente.json()).toMatchObject({
      reservaRequiereConfirmacion: true,
      cancelacionAnticipacionHoras: 0,
      granularidadMinutos: 30,
    });

    const registros = await auditoriaDe(CLINICA_A.id, 'clinica_config', CLINICA_A.id);
    const primero = registros.find((r) => r.ip === '203.0.113.9');
    expect(primero).toMatchObject({
      accion: 'modificacion',
      actor_id: usuarioId,
      actor_tipo: 'usuario',
      datos_antes: expect.objectContaining({ granularidadMinutos: 15 }) as unknown,
      datos_despues: expect.objectContaining({ granularidadMinutos: 30 }) as unknown,
    });
  });

  it.each([
    ['recepcionista', 'recepcionista' as const],
    ['odontologo', 'odontologo' as const],
  ])('responde 403 al rol %s y no cambia nada', async (_n, rol) => {
    const respuesta = await app.inject({
      method: 'PATCH',
      url: '/api/v1/clinica',
      headers: await autorizacion(rol, CLINICA_A.id),
      payload: { granularidadMinutos: 60 },
    });
    expect(respuesta.statusCode).toBe(403);
    expect(respuesta.json()).toMatchObject({ codigo: 'ACCESO_PROHIBIDO' });
    const lectura = await app.inject({
      method: 'GET',
      url: '/api/v1/clinica',
      headers: await autorizacion('administrador', CLINICA_A.id),
    });
    expect(lectura.json()).toMatchObject({ granularidadMinutos: 15 });
  });

  it.each([
    { granularidadMinutos: 4 },
    { granularidadMinutos: 241 },
    { cancelacionAnticipacionHoras: -1 },
    { cancelacionAnticipacionHoras: 721 },
    { reservaRequiereConfirmacion: 'quizas' },
  ])('responde 400 SOLICITUD_INVALIDA por rango o tipo: %j', async (payload) => {
    const respuesta = await app.inject({
      method: 'PATCH',
      url: '/api/v1/clinica',
      headers: await autorizacion('administrador', CLINICA_A.id),
      payload,
    });
    expect(respuesta.statusCode).toBe(400);
    expect(respuesta.json()).toMatchObject({ codigo: 'SOLICITUD_INVALIDA' });
  });

  it.each([{}, { campoDesconocido: 1 }])(
    'responde 400 CAMBIOS_VACIOS con cuerpo %j',
    async (payload) => {
      const respuesta = await app.inject({
        method: 'PATCH',
        url: '/api/v1/clinica',
        headers: await autorizacion('administrador', CLINICA_A.id),
        payload,
      });
      expect(respuesta.statusCode).toBe(400);
      expect(respuesta.json()).toMatchObject({ codigo: 'CAMBIOS_VACIOS' });
    },
  );

  it.each([7, 11, 25])('responde 422 GRANULARIDAD_INVALIDA para %i', async (granularidad) => {
    const respuesta = await app.inject({
      method: 'PATCH',
      url: '/api/v1/clinica',
      headers: await autorizacion('administrador', CLINICA_A.id),
      payload: { granularidadMinutos: granularidad },
    });
    expect(respuesta.statusCode).toBe(422);
    expect(respuesta.json()).toMatchObject({ codigo: 'GRANULARIDAD_INVALIDA' });
  });

  it('modificar la clínica A no cambia la B', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/clinica',
      headers: await autorizacion('administrador', CLINICA_A.id),
      payload: { granularidadMinutos: 60 },
    });
    const b = await app.inject({
      method: 'GET',
      url: '/api/v1/clinica',
      headers: await autorizacion('administrador', CLINICA_B.id),
    });
    expect(b.json()).toMatchObject({ granularidadMinutos: 15 });
  });
});
