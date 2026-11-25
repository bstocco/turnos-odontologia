import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { abrirEntorno, type EntornoE2E } from './soporte/entorno.js';

describe('entorno e2e: la app real arranca con todos sus módulos', () => {
  let entorno: EntornoE2E;

  beforeAll(async () => {
    entorno = await abrirEntorno();
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  it('GET /salud responde ok', async () => {
    const respuesta = await entorno.inject({ method: 'GET', url: '/salud' });
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toEqual({ estado: 'ok' });
  });

  it('una ruta del personal sin token responde 401', async () => {
    const respuesta = await entorno.inject({ method: 'GET', url: '/api/v1/clinica' });
    expect(respuesta.statusCode).toBe(401);
  });

  it('los secretos de la ejecución son descartables y distintos entre sí', () => {
    const acceso = process.env.JWT_ACCESS_SECRET ?? '';
    const refresco = process.env.JWT_REFRESH_SECRET ?? '';
    expect(acceso.length).toBeGreaterThanOrEqual(32);
    expect(acceso).not.toBe(refresco);
  });
});
