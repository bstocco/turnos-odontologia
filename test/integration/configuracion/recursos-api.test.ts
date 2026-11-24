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

interface Recurso {
  readonly nombre: string;
  readonly ruta: string;
  readonly entidad: string;
  readonly campoActivo: 'activo' | 'activa';
  readonly alta: Record<string, unknown>;
  readonly altaOtra: Record<string, unknown>;
  readonly cambio: Record<string, unknown>;
  readonly dto: (alta: Record<string, unknown>) => Record<string, unknown>;
  readonly invalidos: readonly Record<string, unknown>[];
}

const RECURSOS: readonly Recurso[] = [
  {
    nombre: 'profesionales',
    ruta: '/api/v1/profesionales',
    entidad: 'profesional',
    campoActivo: 'activo',
    alta: { nombre: 'Ana', apellido: 'Sintética', matricula: 'MP-100' },
    altaOtra: { nombre: 'Beto', apellido: 'Ficticio' },
    cambio: { apellido: 'Modificada' },
    dto: (a) => ({
      nombre: a.nombre,
      apellido: a.apellido,
      matricula: a.matricula ?? null,
      activo: true,
    }),
    invalidos: [
      { nombre: '   ', apellido: 'X' },
      { nombre: 'X', apellido: '' },
      { nombre: 'X' },
      { nombre: 'X', apellido: 'Y', matricula: '' },
    ],
  },
  {
    nombre: 'sillones',
    ruta: '/api/v1/sillones',
    entidad: 'sillon',
    campoActivo: 'activo',
    alta: { nombre: 'Sillón Norte', bufferMinutos: 10 },
    altaOtra: { nombre: 'Sillón Sur' },
    cambio: { bufferMinutos: 5 },
    dto: (a) => ({ nombre: a.nombre, bufferMinutos: a.bufferMinutos ?? 0, activo: true }),
    invalidos: [
      { nombre: 'S', bufferMinutos: -1 },
      { nombre: 'S', bufferMinutos: 241 },
      { nombre: '  ' },
      { bufferMinutos: 5 },
    ],
  },
  {
    nombre: 'prestaciones',
    ruta: '/api/v1/prestaciones',
    entidad: 'prestacion',
    campoActivo: 'activa',
    alta: { nombre: 'Limpieza', duracionMinutos: 30 },
    altaOtra: { nombre: 'Blanqueamiento', duracionMinutos: 60 },
    cambio: { duracionMinutos: 45 },
    dto: (a) => ({ nombre: a.nombre, duracionMinutos: a.duracionMinutos, activa: true }),
    invalidos: [
      { nombre: 'P', duracionMinutos: 0 },
      { nombre: 'P', duracionMinutos: 481 },
      { nombre: 'P' },
      { nombre: ' ', duracionMinutos: 10 },
    ],
  },
];

async function alta(
  recurso: Recurso,
  clinicaId: string,
  cuerpo: Record<string, unknown>,
): Promise<Record<string, unknown> & { id: string }> {
  const r = await app.inject({
    method: 'POST',
    url: recurso.ruta,
    headers: await autorizacion('administrador', clinicaId),
    payload: cuerpo,
  });
  expect(r.statusCode).toBe(201);
  return r.json() as Record<string, unknown> & { id: string };
}

describe.each(RECURSOS)('/$nombre', (recurso) => {
  it('POST crea con 201, devuelve el DTO exacto y audita creacion', async () => {
    const creado = await alta(recurso, CLINICA_A.id, recurso.alta);
    expect(creado).toEqual({ id: expect.any(String) as unknown, ...recurso.dto(recurso.alta) });
    const registros = await auditoriaDe(CLINICA_A.id, recurso.entidad, creado.id);
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({
      accion: 'creacion',
      datos_antes: null,
      actor_tipo: 'usuario',
    });
  });

  it('POST aplica los valores por defecto', async () => {
    const creado = await alta(recurso, CLINICA_A.id, recurso.altaOtra);
    expect(creado).toMatchObject(recurso.dto(recurso.altaOtra));
  });

  it.each(['administrador', 'recepcionista', 'odontologo'] as const)(
    'GET lista y por id para el rol %s',
    async (rol) => {
      const creado = await alta(recurso, CLINICA_A.id, recurso.alta);
      const lista = await app.inject({
        method: 'GET',
        url: recurso.ruta,
        headers: await autorizacion(rol, CLINICA_A.id),
      });
      expect(lista.statusCode).toBe(200);
      expect((lista.json() as { id: string }[]).map((x) => x.id)).toContain(creado.id);
      const uno = await app.inject({
        method: 'GET',
        url: `${recurso.ruta}/${creado.id}`,
        headers: await autorizacion(rol, CLINICA_A.id),
      });
      expect(uno.statusCode).toBe(200);
      expect(uno.json()).toEqual(creado);
    },
  );

  it.each(['recepcionista', 'odontologo'] as const)(
    'el rol %s recibe 403 en POST y PATCH',
    async (rol) => {
      const creado = await alta(recurso, CLINICA_A.id, recurso.alta);
      const post = await app.inject({
        method: 'POST',
        url: recurso.ruta,
        headers: await autorizacion(rol, CLINICA_A.id),
        payload: recurso.alta,
      });
      expect(post.statusCode).toBe(403);
      expect(post.json()).toMatchObject({ codigo: 'ACCESO_PROHIBIDO' });
      const patch = await app.inject({
        method: 'PATCH',
        url: `${recurso.ruta}/${creado.id}`,
        headers: await autorizacion(rol, CLINICA_A.id),
        payload: recurso.cambio,
      });
      expect(patch.statusCode).toBe(403);
    },
  );

  it('PATCH modifica parcialmente y audita antes y después', async () => {
    const creado = await alta(recurso, CLINICA_A.id, recurso.alta);
    const r = await app.inject({
      method: 'PATCH',
      url: `${recurso.ruta}/${creado.id}`,
      headers: await autorizacion('administrador', CLINICA_A.id),
      payload: recurso.cambio,
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject(recurso.cambio);
    const registros = await auditoriaDe(CLINICA_A.id, recurso.entidad, creado.id);
    expect(registros.map((x) => x.accion)).toEqual(['creacion', 'modificacion']);
    expect(registros[1]?.datos_antes).not.toBeNull();
    expect(registros[1]?.datos_despues).not.toBeNull();
  });

  it('PATCH desactiva y reactiva sin borrar; el filtro ?activo= lo refleja', async () => {
    const creado = await alta(recurso, CLINICA_A.id, recurso.alta);
    const admin = await autorizacion('administrador', CLINICA_A.id);
    const baja = await app.inject({
      method: 'PATCH',
      url: `${recurso.ruta}/${creado.id}`,
      headers: admin,
      payload: { [recurso.campoActivo]: false },
    });
    expect(baja.json()).toMatchObject({ [recurso.campoActivo]: false });

    const inactivos = await app.inject({
      method: 'GET',
      url: `${recurso.ruta}?activo=false`,
      headers: admin,
    });
    const activos = await app.inject({
      method: 'GET',
      url: `${recurso.ruta}?activo=true`,
      headers: admin,
    });
    expect((inactivos.json() as { id: string }[]).map((x) => x.id)).toContain(creado.id);
    expect((activos.json() as { id: string }[]).map((x) => x.id)).not.toContain(creado.id);

    await app.inject({
      method: 'PATCH',
      url: `${recurso.ruta}/${creado.id}`,
      headers: admin,
      payload: { [recurso.campoActivo]: true },
    });
    const otra = await app.inject({
      method: 'GET',
      url: `${recurso.ruta}/${creado.id}`,
      headers: admin,
    });
    expect(otra.json()).toMatchObject({ [recurso.campoActivo]: true });
  });

  it('GET y PATCH devuelven 404 para un id ajeno, inexistente o mal formado', async () => {
    const deB = await alta(recurso, CLINICA_B.id, recurso.alta);
    const admin = await autorizacion('administrador', CLINICA_A.id);
    for (const id of [deB.id, randomUUID(), 'no-es-un-uuid']) {
      const get = await app.inject({ method: 'GET', url: `${recurso.ruta}/${id}`, headers: admin });
      expect(get.statusCode).toBe(404);
      expect(get.json()).toMatchObject({ codigo: 'RECURSO_NO_ENCONTRADO' });
      const patch = await app.inject({
        method: 'PATCH',
        url: `${recurso.ruta}/${id}`,
        headers: admin,
        payload: recurso.cambio,
      });
      expect(patch.statusCode).toBe(404);
    }
    // El recurso de B no cambió.
    const intacto = await app.inject({
      method: 'GET',
      url: `${recurso.ruta}/${deB.id}`,
      headers: await autorizacion('administrador', CLINICA_B.id),
    });
    expect(intacto.json()).toEqual(deB);
  });

  it('las listas están aisladas entre clínicas', async () => {
    const deA = await alta(recurso, CLINICA_A.id, recurso.alta);
    const deB = await alta(recurso, CLINICA_B.id, recurso.altaOtra);
    const listaA = await app.inject({
      method: 'GET',
      url: recurso.ruta,
      headers: await autorizacion('administrador', CLINICA_A.id),
    });
    const idsA = (listaA.json() as { id: string }[]).map((x) => x.id);
    expect(idsA).toContain(deA.id);
    expect(idsA).not.toContain(deB.id);
  });

  it('DELETE no existe: 404 RUTA_NO_ENCONTRADA y el recurso sigue ahí', async () => {
    const creado = await alta(recurso, CLINICA_A.id, recurso.alta);
    const admin = await autorizacion('administrador', CLINICA_A.id);
    const r = await app.inject({
      method: 'DELETE',
      url: `${recurso.ruta}/${creado.id}`,
      headers: admin,
    });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toMatchObject({ codigo: 'RUTA_NO_ENCONTRADA' });
    const sigue = await app.inject({
      method: 'GET',
      url: `${recurso.ruta}/${creado.id}`,
      headers: admin,
    });
    expect(sigue.statusCode).toBe(200);
  });

  it.each(recurso.invalidos.map((c) => [JSON.stringify(c), c] as const))(
    'POST con %s responde 400 SOLICITUD_INVALIDA',
    async (_n, cuerpo) => {
      const r = await app.inject({
        method: 'POST',
        url: recurso.ruta,
        headers: await autorizacion('administrador', CLINICA_A.id),
        payload: cuerpo,
      });
      expect(r.statusCode).toBe(400);
      expect(r.json()).toMatchObject({ codigo: 'SOLICITUD_INVALIDA' });
    },
  );

  it('PATCH con cuerpo vacío o solo campos desconocidos responde 400 CAMBIOS_VACIOS', async () => {
    const creado = await alta(recurso, CLINICA_A.id, recurso.alta);
    for (const payload of [{}, { desconocido: true }]) {
      const r = await app.inject({
        method: 'PATCH',
        url: `${recurso.ruta}/${creado.id}`,
        headers: await autorizacion('administrador', CLINICA_A.id),
        payload,
      });
      expect(r.statusCode).toBe(400);
      expect(r.json()).toMatchObject({ codigo: 'CAMBIOS_VACIOS' });
    }
  });

  it('sin token responde 401', async () => {
    const r = await app.inject({ method: 'GET', url: recurso.ruta });
    expect(r.statusCode).toBe(401);
  });
});

describe('reglas propias de cada recurso', () => {
  it('sillón: PATCH con bufferMinutos negativo y prestación con duración 0 responden 400', async () => {
    const sillon = await alta(RECURSOS[1] as Recurso, CLINICA_A.id, { nombre: 'S' });
    const prestacion = await alta(RECURSOS[2] as Recurso, CLINICA_A.id, {
      nombre: 'P',
      duracionMinutos: 10,
    });
    const admin = await autorizacion('administrador', CLINICA_A.id);
    const a = await app.inject({
      method: 'PATCH',
      url: `/api/v1/sillones/${sillon.id}`,
      headers: admin,
      payload: { bufferMinutos: -5 },
    });
    const b = await app.inject({
      method: 'PATCH',
      url: `/api/v1/prestaciones/${prestacion.id}`,
      headers: admin,
      payload: { duracionMinutos: 0 },
    });
    expect(a.statusCode).toBe(400);
    expect(b.statusCode).toBe(400);
  });

  it('profesional: matricula null borra la matrícula', async () => {
    const creado = await alta(RECURSOS[0] as Recurso, CLINICA_A.id, {
      nombre: 'A',
      apellido: 'B',
      matricula: 'MP-1',
    });
    const r = await app.inject({
      method: 'PATCH',
      url: `/api/v1/profesionales/${creado.id}`,
      headers: await autorizacion('administrador', CLINICA_A.id),
      payload: { matricula: null },
    });
    expect(r.json()).toMatchObject({ matricula: null });
  });

  it('el DTO no expone campos internos como clinica_id', async () => {
    const creado = await alta(RECURSOS[0] as Recurso, CLINICA_A.id, { nombre: 'A', apellido: 'B' });
    expect(Object.keys(creado).sort()).toEqual(['activo', 'apellido', 'id', 'matricula', 'nombre']);
  });
});
