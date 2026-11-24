import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CLINICA_A,
  CLINICA_B,
  auditoriaDe,
  autorizacion,
  cerrarPool,
  crearAppDePrueba,
  insertarProfesional,
  insertarUsuario,
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

const ruta = (id: string): string => `/api/v1/profesionales/${id}/horarios`;

async function put(
  profesionalId: string,
  franjas: unknown,
  rol: 'administrador' | 'recepcionista' | 'odontologo' = 'administrador',
) {
  return app.inject({
    method: 'PUT',
    url: ruta(profesionalId),
    headers: await autorizacion(rol, CLINICA_A.id),
    payload: { franjas },
  });
}

async function leer(profesionalId: string) {
  const r = await app.inject({
    method: 'GET',
    url: ruta(profesionalId),
    headers: await autorizacion('administrador', CLINICA_A.id),
  });
  return r.json() as {
    profesionalId: string;
    franjas: { diaSemana: number; horaDesde: string; horaHasta: string }[];
  };
}

describe('PUT /profesionales/:id/horarios', () => {
  it('reemplaza las franjas, las devuelve ordenadas y audita antes y después', async () => {
    const id = await insertarProfesional(CLINICA_A.id);
    const primera = await put(id, [
      { diaSemana: 3, horaDesde: '14:00', horaHasta: '18:00' },
      { diaSemana: 1, horaDesde: '09:00', horaHasta: '13:00' },
    ]);
    expect(primera.statusCode).toBe(200);
    expect(primera.json()).toEqual({
      profesionalId: id,
      franjas: [
        { diaSemana: 1, horaDesde: '09:00', horaHasta: '13:00' },
        { diaSemana: 3, horaDesde: '14:00', horaHasta: '18:00' },
      ],
    });
    const segunda = await put(id, [{ diaSemana: 5, horaDesde: '08:00', horaHasta: '12:00' }]);
    expect(segunda.statusCode).toBe(200);
    expect((await leer(id)).franjas).toEqual([
      { diaSemana: 5, horaDesde: '08:00', horaHasta: '12:00' },
    ]);

    const registros = await auditoriaDe(CLINICA_A.id, 'horario_atencion', id);
    expect(registros).toHaveLength(2);
    expect(registros[1]).toMatchObject({
      accion: 'modificacion',
      datos_antes: { franjas: [{ diaSemana: 1 }, { diaSemana: 3 }] },
      datos_despues: { franjas: [{ diaSemana: 5, horaDesde: '08:00', horaHasta: '12:00' }] },
    });
  });

  it('una lista vacía borra todas las franjas', async () => {
    const id = await insertarProfesional(CLINICA_A.id);
    await put(id, [{ diaSemana: 2, horaDesde: '09:00', horaHasta: '10:00' }]);
    const r = await put(id, []);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ profesionalId: id, franjas: [] });
    expect((await leer(id)).franjas).toEqual([]);
  });

  it('acepta una franja que termina a las 24:00 y la devuelve igual', async () => {
    const id = await insertarProfesional(CLINICA_A.id);
    const r = await put(id, [{ diaSemana: 6, horaDesde: '20:00', horaHasta: '24:00' }]);
    expect(r.statusCode).toBe(200);
    expect((await leer(id)).franjas).toEqual([
      { diaSemana: 6, horaDesde: '20:00', horaHasta: '24:00' },
    ]);
  });

  it('acepta franjas contiguas del mismo día', async () => {
    const id = await insertarProfesional(CLINICA_A.id);
    const r = await put(id, [
      { diaSemana: 1, horaDesde: '09:00', horaHasta: '13:00' },
      { diaSemana: 1, horaDesde: '13:00', horaHasta: '17:00' },
    ]);
    expect(r.statusCode).toBe(200);
  });

  it('FRANJA_INVALIDA (400) con horaDesde >= horaHasta conserva las franjas anteriores', async () => {
    const id = await insertarProfesional(CLINICA_A.id);
    await put(id, [{ diaSemana: 1, horaDesde: '09:00', horaHasta: '13:00' }]);
    for (const franja of [
      { diaSemana: 1, horaDesde: '13:00', horaHasta: '09:00' },
      { diaSemana: 1, horaDesde: '09:00', horaHasta: '09:00' },
    ]) {
      const r = await put(id, [franja]);
      expect(r.statusCode).toBe(400);
      expect(r.json()).toMatchObject({ codigo: 'FRANJA_INVALIDA' });
    }
    expect((await leer(id)).franjas).toEqual([
      { diaSemana: 1, horaDesde: '09:00', horaHasta: '13:00' },
    ]);
  });

  it('FRANJA_SOLAPADA (409) conserva las franjas anteriores', async () => {
    const id = await insertarProfesional(CLINICA_A.id);
    await put(id, [{ diaSemana: 2, horaDesde: '08:00', horaHasta: '12:00' }]);
    const r = await put(id, [
      { diaSemana: 1, horaDesde: '09:00', horaHasta: '13:00' },
      { diaSemana: 1, horaDesde: '12:00', horaHasta: '16:00' },
    ]);
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ codigo: 'FRANJA_SOLAPADA' });
    expect((await leer(id)).franjas).toEqual([
      { diaSemana: 2, horaDesde: '08:00', horaHasta: '12:00' },
    ]);
  });

  it.each([
    [{ diaSemana: 7, horaDesde: '09:00', horaHasta: '10:00' }],
    [{ diaSemana: -1, horaDesde: '09:00', horaHasta: '10:00' }],
    [{ diaSemana: 1, horaDesde: '9:00', horaHasta: '10:00' }],
    [{ diaSemana: 1, horaDesde: '09:00', horaHasta: '24:30' }],
    [{ diaSemana: 1, horaDesde: '09:60', horaHasta: '10:00' }],
    [{ diaSemana: 1, horaDesde: '09:00' }],
  ])('responde 400 SOLICITUD_INVALIDA por forma: %j', async (franja) => {
    const id = await insertarProfesional(CLINICA_A.id);
    const r = await put(id, [franja]);
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ codigo: 'SOLICITUD_INVALIDA' });
  });

  it('rechaza más de 50 franjas y un cuerpo sin franjas', async () => {
    const id = await insertarProfesional(CLINICA_A.id);
    const demasiadas = Array.from({ length: 51 }, (_v, i) => ({
      diaSemana: i % 7,
      horaDesde: '09:00',
      horaHasta: '10:00',
    }));
    expect((await put(id, demasiadas)).statusCode).toBe(400);
    const sinCuerpo = await app.inject({
      method: 'PUT',
      url: ruta(id),
      headers: await autorizacion('administrador', CLINICA_A.id),
      payload: {},
    });
    expect(sinCuerpo.statusCode).toBe(400);
  });

  it('404 para un profesional de la clínica B, inexistente o mal formado', async () => {
    const deB = await insertarProfesional(CLINICA_B.id);
    for (const id of [deB, randomUUID(), 'no-es-un-uuid']) {
      const r = await put(id, [{ diaSemana: 1, horaDesde: '09:00', horaHasta: '10:00' }]);
      expect(r.statusCode).toBe(404);
      expect(r.json()).toMatchObject({ codigo: 'RECURSO_NO_ENCONTRADO' });
      const g = await app.inject({
        method: 'GET',
        url: ruta(id),
        headers: await autorizacion('administrador', CLINICA_A.id),
      });
      expect(g.statusCode).toBe(404);
    }
  });

  it.each(['recepcionista', 'odontologo'] as const)('403 al rol %s', async (rol) => {
    const id = await insertarProfesional(CLINICA_A.id);
    const r = await put(id, [{ diaSemana: 1, horaDesde: '09:00', horaHasta: '10:00' }], rol);
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ codigo: 'ACCESO_PROHIBIDO' });
  });
});

describe('GET /profesionales/:id/horarios', () => {
  it('administrador y recepcionista leen cualquier profesional de su clínica', async () => {
    const id = await insertarProfesional(CLINICA_A.id);
    await put(id, [{ diaSemana: 4, horaDesde: '10:30', horaHasta: '12:00' }]);
    for (const rol of ['administrador', 'recepcionista'] as const) {
      const r = await app.inject({
        method: 'GET',
        url: ruta(id),
        headers: await autorizacion(rol, CLINICA_A.id),
      });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({
        profesionalId: id,
        franjas: [{ diaSemana: 4, horaDesde: '10:30', horaHasta: '12:00' }],
      });
    }
  });

  it('el odontólogo vinculado lee lo propio y recibe 403 en lo ajeno', async () => {
    const propio = await insertarProfesional(CLINICA_A.id, 'Propio', 'Odontólogo');
    const ajeno = await insertarProfesional(CLINICA_A.id, 'Ajeno', 'Odontólogo');
    await put(propio, [{ diaSemana: 1, horaDesde: '09:00', horaHasta: '12:00' }]);
    const usuario = await insertarUsuario(CLINICA_A.id, 'odontologo', propio);
    const headers = await autorizacion('odontologo', CLINICA_A.id, usuario);

    const mio = await app.inject({ method: 'GET', url: ruta(propio), headers });
    expect(mio.statusCode).toBe(200);
    expect((mio.json() as { franjas: unknown[] }).franjas).toHaveLength(1);

    const otro = await app.inject({ method: 'GET', url: ruta(ajeno), headers });
    expect(otro.statusCode).toBe(403);
    expect(otro.json()).toMatchObject({ codigo: 'ACCESO_PROHIBIDO' });
  });

  it('un odontólogo sin vínculo o con usuario inactivo recibe 403', async () => {
    const profesional = await insertarProfesional(CLINICA_A.id);
    const sinVinculo = await insertarUsuario(CLINICA_A.id, 'odontologo', null);
    const inactivo = await insertarUsuario(CLINICA_A.id, 'odontologo', profesional, false);
    for (const usuario of [sinVinculo, inactivo]) {
      const r = await app.inject({
        method: 'GET',
        url: ruta(profesional),
        headers: await autorizacion('odontologo', CLINICA_A.id, usuario),
      });
      expect(r.statusCode).toBe(403);
    }
  });

  it('un odontólogo cuyo usuario no existe recibe 403 (token con usuario ajeno)', async () => {
    const profesional = await insertarProfesional(CLINICA_A.id);
    const r = await app.inject({
      method: 'GET',
      url: ruta(profesional),
      headers: await autorizacion('odontologo', CLINICA_A.id, randomUUID()),
    });
    expect(r.statusCode).toBe(403);
  });

  it('un profesional inexistente da 404 también al odontólogo', async () => {
    const r = await app.inject({
      method: 'GET',
      url: ruta(randomUUID()),
      headers: await autorizacion('odontologo', CLINICA_A.id),
    });
    expect(r.statusCode).toBe(404);
  });

  it('sin franjas devuelve lista vacía', async () => {
    const id = await insertarProfesional(CLINICA_A.id);
    expect((await leer(id)).franjas).toEqual([]);
  });
});
