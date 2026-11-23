import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { appDePrueba } from '../support/app-de-prueba.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('GET /salud', () => {
  it('responde 200 {"estado":"ok"} sin credenciales', async () => {
    ({ app } = await appDePrueba());
    const respuesta = await app.inject({ method: 'GET', url: '/salud' });
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toEqual({ estado: 'ok' });
    expect(respuesta.headers['content-type']).toContain('application/json');
  });

  it('no filtra versiones, rutas del servidor ni configuración', async () => {
    ({ app } = await appDePrueba());
    const respuesta = await app.inject({ method: 'GET', url: '/salud' });

    expect(respuesta.headers['x-powered-by']).toBeUndefined();
    expect(respuesta.headers.server).toBeUndefined();

    const todo = JSON.stringify({ cuerpo: respuesta.body, cabeceras: respuesta.headers });
    expect(todo).not.toMatch(/\d+\.\d+\.\d+/); // ninguna versión de dependencias
    expect(todo.toLowerCase()).not.toContain('fastify');
    expect(todo).not.toContain(process.cwd());
    expect(todo).not.toContain('DATABASE_URL');
    expect(todo).not.toContain('postgres');
    expect(todo).not.toContain('secreto-123');
  });

  it('incluye un identificador de pedido para correlacionar con el log', async () => {
    ({ app } = await appDePrueba());
    const respuesta = await app.inject({ method: 'GET', url: '/salud' });
    expect(respuesta.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
