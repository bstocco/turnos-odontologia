import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { firmarTokenDeAcceso } from '../../src/infrastructure/auth/jwt.js';
import { appDePrueba, capturarLogs } from '../support/app-de-prueba.js';

/*
 * Acceso a los módulos de C-08 sin base de datos: autenticación (401) y permisos por rol (403).
 * El chequeo de rol ocurre antes de abrir `withTenant`, así que estos pedidos nunca tocan la base.
 * `pluginDeAutenticacion` lee `loadConfig('app')` del entorno del proceso: se fija un secreto de
 * prueba (no real) y una URL de base ficticia.
 */
const SECRETO = 'secreto-de-prueba-acceso-c08-0123456789abcdef0123456789';
const CLINICA = '11111111-1111-4111-8111-111111111111';

let app: FastifyInstance;
let logs: ReturnType<typeof capturarLogs>;

beforeAll(async () => {
  process.env.JWT_ACCESS_SECRET = SECRETO;
  process.env.DATABASE_URL = 'postgres://app:ficticia-123@127.0.0.1:1/ninguna_base';
  const construida = await appDePrueba(undefined, { JWT_ACCESS_SECRET: SECRETO });
  app = construida.app;
  logs = construida.logs;
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

interface Endpoint {
  readonly metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly url: string;
  readonly cuerpo?: unknown;
  readonly escritura: boolean;
}

const ID = randomUUID();
const ENDPOINTS: readonly Endpoint[] = [
  { metodo: 'GET', url: '/api/v1/clinica', escritura: false },
  { metodo: 'PATCH', url: '/api/v1/clinica', cuerpo: { granularidadMinutos: 30 }, escritura: true },
  { metodo: 'GET', url: '/api/v1/profesionales', escritura: false },
  { metodo: 'GET', url: `/api/v1/profesionales/${ID}`, escritura: false },
  {
    metodo: 'POST',
    url: '/api/v1/profesionales',
    cuerpo: { nombre: 'A', apellido: 'B' },
    escritura: true,
  },
  { metodo: 'PATCH', url: `/api/v1/profesionales/${ID}`, cuerpo: { nombre: 'A' }, escritura: true },
  { metodo: 'GET', url: `/api/v1/profesionales/${ID}/horarios`, escritura: false },
  {
    metodo: 'PUT',
    url: `/api/v1/profesionales/${ID}/horarios`,
    cuerpo: { franjas: [] },
    escritura: true,
  },
  { metodo: 'GET', url: '/api/v1/sillones', escritura: false },
  { metodo: 'GET', url: `/api/v1/sillones/${ID}`, escritura: false },
  { metodo: 'POST', url: '/api/v1/sillones', cuerpo: { nombre: 'S' }, escritura: true },
  { metodo: 'PATCH', url: `/api/v1/sillones/${ID}`, cuerpo: { activo: false }, escritura: true },
  { metodo: 'GET', url: '/api/v1/prestaciones', escritura: false },
  { metodo: 'GET', url: `/api/v1/prestaciones/${ID}`, escritura: false },
  {
    metodo: 'POST',
    url: '/api/v1/prestaciones',
    cuerpo: { nombre: 'P', duracionMinutos: 10 },
    escritura: true,
  },
  {
    metodo: 'PATCH',
    url: `/api/v1/prestaciones/${ID}`,
    cuerpo: { activa: false },
    escritura: true,
  },
  { metodo: 'GET', url: '/api/v1/feriados', escritura: false },
  {
    metodo: 'POST',
    url: '/api/v1/feriados',
    cuerpo: { fecha: '2030-01-01', descripcion: 'X' },
    escritura: true,
  },
  { metodo: 'DELETE', url: `/api/v1/feriados/${ID}`, escritura: true },
  { metodo: 'GET', url: '/api/v1/feriados/plantilla-nacional?anio=2026', escritura: false },
  {
    metodo: 'POST',
    url: '/api/v1/feriados/plantilla-nacional',
    cuerpo: { anio: 2026 },
    escritura: true,
  },
];

const etiqueta = (e: Endpoint): string => `${e.metodo} ${e.url.replace(ID, ':id')}`;

describe('acceso a los módulos de configuración (sin base de datos)', () => {
  it.each(ENDPOINTS.map((e) => [etiqueta(e), e] as const))(
    '%s sin token responde 401 AUTENTICACION_REQUERIDA',
    async (_n, e) => {
      const r = await app.inject({
        method: e.metodo,
        url: e.url,
        payload: e.cuerpo as object | undefined,
      });
      expect(r.statusCode).toBe(401);
      expect(r.json()).toMatchObject({ codigo: 'AUTENTICACION_REQUERIDA' });
    },
  );

  it('sin token responde 401 aunque el cuerpo sea inválido (antes que la validación)', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/sillones',
      payload: { bufferMinutos: -1 },
    });
    expect(r.statusCode).toBe(401);
  });

  it.each([
    [
      'firmado con otro secreto',
      async () => cabecera('administrador', 'otro-secreto-distinto-0123456789abcdef0123'),
    ],
    ['con basura', async () => ({ authorization: 'Bearer esto.no.es-un-jwt' })],
  ])('un token %s responde 401 TOKEN_INVALIDO sin respuesta doble', async (_n, crear) => {
    const antes = logs.lineas.length;
    for (const e of ENDPOINTS) {
      const r = await app.inject({
        method: e.metodo,
        url: e.url,
        headers: await crear(),
        payload: e.cuerpo as object | undefined,
      });
      expect(r.statusCode, etiqueta(e)).toBe(401);
      expect(r.json(), etiqueta(e)).toMatchObject({ codigo: 'TOKEN_INVALIDO' });
    }
    const avisos = logs
      .registros()
      .slice(antes)
      .filter((l) => typeof l['level'] === 'number' && l['level'] >= 40)
      .filter((l) => /already sent|FST_ERR|undefined/i.test(JSON.stringify(l)));
    expect(avisos).toEqual([]);
  });

  describe.each(['recepcionista', 'odontologo'])('rol %s', (rol) => {
    it.each(ENDPOINTS.filter((e) => e.escritura).map((e) => [etiqueta(e), e] as const))(
      '%s responde 403 ACCESO_PROHIBIDO',
      async (_n, e) => {
        const r = await app.inject({
          method: e.metodo,
          url: e.url,
          headers: await cabecera(rol),
          payload: e.cuerpo as object | undefined,
        });
        expect(r.statusCode).toBe(403);
        expect(r.json()).toMatchObject({ codigo: 'ACCESO_PROHIBIDO' });
      },
    );
  });

  it('un rol desconocido en un token válido recibe 403 también en lecturas', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/clinica',
      headers: await cabecera('superusuario'),
    });
    expect(r.statusCode).toBe(403);
  });

  it('los métodos sin ruta (DELETE de recursos) responden 404 RUTA_NO_ENCONTRADA', async () => {
    for (const recurso of ['profesionales', 'sillones', 'prestaciones']) {
      const r = await app.inject({
        method: 'DELETE',
        url: `/api/v1/${recurso}/${ID}`,
        headers: await cabecera('administrador'),
      });
      expect(r.statusCode).toBe(404);
      expect(r.json()).toMatchObject({ codigo: 'RUTA_NO_ENCONTRADA' });
    }
  });
});
