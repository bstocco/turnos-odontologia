import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { abrirEntorno, type EntornoE2E } from '../soporte/entorno.js';

describe('contrato: swagger registrado en la app real', () => {
  let entorno: EntornoE2E;

  beforeAll(async () => {
    entorno = await abrirEntorno();
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  it('el documento derivado incluye GET /salud y POST /api/v1/auth/login', () => {
    const documento = entorno.app.swagger() as { paths: Record<string, Record<string, unknown>> };
    expect(documento.paths['/salud']).toHaveProperty('get');
    expect(documento.paths['/api/v1/auth/login']).toHaveProperty('post');
  });

  it('no incluye operaciones HEAD ni OPTIONS', () => {
    const documento = entorno.app.swagger() as { paths: Record<string, Record<string, unknown>> };
    const metodos = new Set(Object.values(documento.paths).flatMap((ruta) => Object.keys(ruta)));
    expect(metodos).not.toContain('head');
    expect(metodos).not.toContain('options');
  });

  it('no expone ninguna ruta de documentación (sin interfaz ni documento público)', async () => {
    for (const url of [
      '/documentation',
      '/documentation/json',
      '/docs',
      '/openapi.json',
      '/api/v1/openapi.json',
      '/swagger.json',
    ]) {
      const respuesta = await entorno.inject({ method: 'GET', url });
      expect({ url, estado: respuesta.statusCode }).toEqual({ url, estado: 404 });
    }
  });
});
