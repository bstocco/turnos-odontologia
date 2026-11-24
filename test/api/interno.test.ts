import type { FastifyInstance } from 'fastify';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { appDePrueba } from '../support/app-de-prueba.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const CLAVE = 'clave-interna-c17-test';

beforeAll(() => {
  // El endpoint lee la clave con `loadConfig('app')` (process.env); en las pruebas de API
  // se fija aquí.
  process.env.ADMIN_INTERNAL_KEY = CLAVE;
});

const BODY = {
  slug: 'clinica-api-test',
  nombre: 'Clínica de API de prueba',
  email: 'admin@clinica-api.local',
};

describe('POST /interno/clinicas', () => {
  it('sin clave → 401', async () => {
    ({ app } = await appDePrueba());
    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/v1/interno/clinicas',
      payload: BODY,
    });
    expect(respuesta.statusCode).toBe(401);
  });

  it('con clave incorrecta → 401', async () => {
    ({ app } = await appDePrueba());
    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/v1/interno/clinicas',
      headers: { authorization: 'Bearer clave-erronea' },
      payload: BODY,
    });
    expect(respuesta.statusCode).toBe(401);
  });
});
