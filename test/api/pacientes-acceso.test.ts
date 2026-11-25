import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { firmarTokenDeAcceso } from '../../src/infrastructure/auth/jwt.js';
import { appDePrueba } from '../support/app-de-prueba.js';

/*
 * Acceso al módulo `/pacientes` (C-10) sin base de datos: autenticación (401), permisos por rol
 * (403) y validaciones de forma y de negocio que ocurren antes de abrir `withTenant`.
 */
const SECRETO = 'secreto-de-prueba-acceso-c10-0123456789abcdef0123456789';
const CLINICA = '11111111-1111-4111-8111-111111111111';
const ID = randomUUID();

let app: FastifyInstance;

beforeAll(async () => {
  process.env.JWT_ACCESS_SECRET = SECRETO;
  process.env.DATABASE_URL = 'postgres://app:ficticia-123@127.0.0.1:1/ninguna_base';
  app = (await appDePrueba(undefined, { JWT_ACCESS_SECRET: SECRETO })).app;
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

async function cabecera(rol: string, secreto = SECRETO): Promise<{ authorization: string }> {
  const token = await firmarTokenDeAcceso(secreto, {
    clinicaId: CLINICA,
    usuarioId: randomUUID(),
    rol,
  });
  return { authorization: `Bearer ${token}` };
}

const ALTA = { nombre: 'Ana', apellido: 'Prueba', dni: '30111222', telefono: '011 15 5555-1234' };

const ENDPOINTS = [
  { metodo: 'POST', url: '/api/v1/pacientes', cuerpo: ALTA },
  { metodo: 'GET', url: '/api/v1/pacientes?apellido=Prueba' },
  { metodo: 'GET', url: `/api/v1/pacientes/${ID}` },
  { metodo: 'PATCH', url: `/api/v1/pacientes/${ID}`, cuerpo: { nombre: 'Otra' } },
] as const;

describe('acceso a /pacientes (sin base de datos)', () => {
  it.each(ENDPOINTS.map((e) => [`${e.metodo} ${e.url.replace(ID, ':id')}`, e] as const))(
    '%s sin token responde 401 AUTENTICACION_REQUERIDA',
    async (_n, e) => {
      const r = await app.inject({
        method: e.metodo,
        url: e.url,
        payload: 'cuerpo' in e ? e.cuerpo : undefined,
      });
      expect(r.statusCode).toBe(401);
      expect(r.json()).toMatchObject({ codigo: 'AUTENTICACION_REQUERIDA' });
    },
  );

  it.each([
    [
      'firmado con otro secreto',
      () => cabecera('administrador', 'otro-secreto-distinto-0123456789abcdef0123'),
    ],
    ['con basura', async () => ({ authorization: 'Bearer esto.no.es-un-jwt' })],
  ])('un token %s responde 401 TOKEN_INVALIDO en las cuatro rutas', async (_n, crear) => {
    for (const e of ENDPOINTS) {
      const r = await app.inject({
        method: e.metodo,
        url: e.url,
        headers: await crear(),
        payload: 'cuerpo' in e ? e.cuerpo : undefined,
      });
      expect(r.statusCode, e.url).toBe(401);
      expect(r.json()).toMatchObject({ codigo: 'TOKEN_INVALIDO' });
    }
  });

  it('sin token responde 401 aunque el cuerpo sea inválido', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/pacientes', payload: { x: 1 } });
    expect(r.statusCode).toBe(401);
  });

  it('el odontólogo recibe 403 ACCESO_PROHIBIDO en POST y PATCH', async () => {
    const headers = await cabecera('odontologo');
    const alta = await app.inject({
      method: 'POST',
      url: '/api/v1/pacientes',
      headers,
      payload: ALTA,
    });
    expect(alta.statusCode).toBe(403);
    expect(alta.json()).toMatchObject({ codigo: 'ACCESO_PROHIBIDO' });
    const mod = await app.inject({
      method: 'PATCH',
      url: `/api/v1/pacientes/${ID}`,
      headers,
      payload: { nombre: 'Otra' },
    });
    expect(mod.statusCode).toBe(403);
    expect(mod.json()).toMatchObject({ codigo: 'ACCESO_PROHIBIDO' });
  });

  it('un rol desconocido recibe 403 también en lectura', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/pacientes?apellido=Prueba',
      headers: await cabecera('paciente'),
    });
    expect(r.statusCode).toBe(403);
  });

  it.each([
    ['sin criterio', '/api/v1/pacientes'],
    ['con ambos criterios', '/api/v1/pacientes?dni=30111222&apellido=Prueba'],
    ['con apellido de un carácter', '/api/v1/pacientes?apellido=P'],
  ])('búsqueda %s: 400 BUSQUEDA_INVALIDA', async (_n, url) => {
    const r = await app.inject({ method: 'GET', url, headers: await cabecera('recepcionista') });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ codigo: 'BUSQUEDA_INVALIDA' });
  });

  it('búsqueda con DNI inválido: 400 DNI_INVALIDO', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/pacientes?dni=12',
      headers: await cabecera('recepcionista'),
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ codigo: 'DNI_INVALIDO' });
  });

  it('limite=500: 400 SOLICITUD_INVALIDA', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/pacientes?apellido=Prueba&limite=500',
      headers: await cabecera('recepcionista'),
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ codigo: 'SOLICITUD_INVALIDA' });
  });

  it('PATCH con cuerpo vacío: 400 CAMBIOS_VACIOS', async () => {
    const r = await app.inject({
      method: 'PATCH',
      url: `/api/v1/pacientes/${ID}`,
      headers: await cabecera('recepcionista'),
      payload: {},
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ codigo: 'CAMBIOS_VACIOS' });
  });

  it.each([
    ['DNI con letras', { ...ALTA, dni: '30.111.22A' }, 'DNI_INVALIDO'],
    ['teléfono inválido', { ...ALTA, telefono: '123' }, 'TELEFONO_INVALIDO'],
    ['nombre en blanco', { ...ALTA, nombre: '   ' }, 'SOLICITUD_INVALIDA'],
    ['falta el teléfono', { nombre: 'A', apellido: 'B', dni: '30111222' }, 'SOLICITUD_INVALIDA'],
  ])('POST con %s: 400 %s antes de tocar la base', async (_n, cuerpo, codigo) => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/pacientes',
      headers: await cabecera('administrador'),
      payload: cuerpo,
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ codigo });
    expect(r.body).not.toContain('30111222');
    expect(r.body).not.toContain('123');
  });

  it('DELETE no existe: 404 RUTA_NO_ENCONTRADA (con y sin token)', async () => {
    for (const headers of [await cabecera('administrador'), {}]) {
      const r = await app.inject({ method: 'DELETE', url: `/api/v1/pacientes/${ID}`, headers });
      expect(r.statusCode).toBe(404);
      expect(r.json()).toMatchObject({ codigo: 'RUTA_NO_ENCONTRADA' });
    }
  });
});
