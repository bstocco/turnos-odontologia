import { resolve } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { appDePrueba } from '../support/app-de-prueba.js';

const MODULOS = resolve(process.cwd(), 'test/fixtures/modulos-prueba');

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('registro de acceso', () => {
  it('registra método, ruta sin consulta, estado y duración; no el DNI ni la consulta', async () => {
    const montado = await appDePrueba(MODULOS);
    app = montado.app;
    const r = await app.inject({ method: 'GET', url: '/api/v1/pacientes?dni=30111222' });
    expect(r.statusCode).toBe(200);

    const acceso = montado.logs.registros().find((l) => l.msg === 'acceso');
    expect(acceso).toBeDefined();
    expect(acceso).toMatchObject({ metodo: 'GET', ruta: '/api/v1/pacientes', estado: 200 });
    expect(typeof acceso?.duracionMs).toBe('number');
    expect(acceso?.reqId).toBe(r.headers['x-request-id']);

    const todo = montado.logs.texto();
    expect(todo).not.toContain('30111222');
    expect(todo).not.toContain('dni=');
    expect(todo).not.toContain('?');
  });

  it('cada línea es JSON con nivel e instante', async () => {
    const montado = await appDePrueba(MODULOS);
    app = montado.app;
    await app.inject({ method: 'GET', url: '/salud' });
    const registros = montado.logs.registros();
    expect(registros.length).toBeGreaterThan(0);
    for (const registro of registros) {
      expect(typeof registro.level).toBe('number');
      expect(typeof registro.time).toBe('string');
    }
  });
});

describe('datos que nunca se registran', () => {
  it('no registra el cuerpo del pedido, ni siquiera cuando es inválido', async () => {
    const montado = await appDePrueba(MODULOS);
    app = montado.app;
    await app.inject({
      method: 'POST',
      url: '/api/v1/errores/validacion',
      payload: {
        nombre: 'qq',
        dni: '30111222',
        email: 'ana@example.com',
        nota: 'valor-secreto-xyz',
      },
    });
    const todo = montado.logs.texto();
    expect(todo).not.toContain('valor-secreto-xyz');
    expect(todo).not.toContain('30111222');
    expect(todo).not.toContain('ana@example.com');
  });

  it('no registra la cabecera de autorización ni las cookies', async () => {
    const montado = await appDePrueba(MODULOS);
    app = montado.app;
    await app.inject({
      method: 'GET',
      url: '/api/v1/pacientes',
      headers: { authorization: 'Bearer token-super-secreto', cookie: 'sid=cookie-secreta' },
    });
    const todo = montado.logs.texto();
    expect(todo).not.toContain('token-super-secreto');
    expect(todo).not.toContain('cookie-secreta');
  });
});
