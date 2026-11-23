import { resolve } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { ErrorDeDominio } from '../../src/domain/shared/errores.js';
import { ESTADO_POR_TIPO } from '../../src/interfaces/http/errores.js';
import { appDePrueba } from '../support/app-de-prueba.js';

const MODULOS = resolve(process.cwd(), 'test/fixtures/modulos-prueba');

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('errores de dominio', () => {
  it('un conflicto responde 409 con su código y mensaje', async () => {
    ({ app } = await appDePrueba(MODULOS));
    const r = await app.inject({ method: 'GET', url: '/api/v1/errores/dominio' });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toEqual({
      codigo: 'TURNO_SOLAPADO_SILLON',
      mensaje: 'El sillón ya está ocupado en ese horario.',
    });
  });

  it.each(Object.entries(ESTADO_POR_TIPO))('el tipo %s responde %i', async (tipo, estado) => {
    ({ app } = await appDePrueba(MODULOS));
    const r = await app.inject({ method: 'GET', url: `/api/v1/errores/tipo/${tipo}` });
    expect(r.statusCode).toBe(estado);
    expect(r.json()).toMatchObject({ codigo: 'CODIGO_DE_PRUEBA' });
  });

  it('rechaza códigos con formato inválido', () => {
    expect(() => new ErrorDeDominio('codigo en minusculas', 'conflicto', 'x')).toThrow(TypeError);
  });
});

describe('ruta inexistente', () => {
  it('responde 404 RUTA_NO_ENCONTRADA', async () => {
    ({ app } = await appDePrueba(MODULOS));
    const r = await app.inject({ method: 'GET', url: '/no/existe' });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toMatchObject({ codigo: 'RUTA_NO_ENCONTRADA' });
  });
});

describe('solicitud con forma inválida', () => {
  it('responde 400 con campo y regla, sin repetir los valores recibidos', async () => {
    ({ app } = await appDePrueba(MODULOS));
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/errores/validacion',
      payload: { nombre: 'qq' },
    });
    expect(r.statusCode).toBe(400);
    const cuerpo = r.json() as { codigo: string; campos: unknown[] };
    expect(cuerpo.codigo).toBe('SOLICITUD_INVALIDA');
    expect(cuerpo.campos).toEqual([{ ubicacion: 'body', campo: 'nombre', regla: 'minLength' }]);
    expect(r.body).not.toContain('qq');
  });

  it('falta un campo obligatorio: lo indica sin eco', async () => {
    ({ app } = await appDePrueba(MODULOS));
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/errores/validacion',
      payload: { otro: 'valor-secreto' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ codigo: 'SOLICITUD_INVALIDA' });
    expect(r.body).not.toContain('valor-secreto');
  });

  it('un JSON mal formado responde 400 SOLICITUD_INVALIDA', async () => {
    ({ app } = await appDePrueba(MODULOS));
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/errores/validacion',
      headers: { 'content-type': 'application/json' },
      payload: '{"nombre": ',
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ codigo: 'SOLICITUD_INVALIDA' });
  });
});

describe('errores inesperados', () => {
  it('responde 500 ERROR_INTERNO genérico, sin traza ni mensaje original', async () => {
    ({ app } = await appDePrueba(MODULOS));
    const r = await app.inject({ method: 'GET', url: '/api/v1/errores/inesperado' });
    expect(r.statusCode).toBe(500);
    const cuerpo = r.json() as Record<string, unknown>;
    expect(cuerpo.codigo).toBe('ERROR_INTERNO');
    expect(Object.keys(cuerpo).sort()).toEqual(['codigo', 'mensaje']);
    expect(r.body).not.toContain('SELECT');
    expect(r.body).not.toContain('30111222');
    expect(r.body.toLowerCase()).not.toContain('stack');
    expect(r.body).not.toContain('at ');
  });

  it('deja el detalle en el log con el identificador del pedido y sin datos personales', async () => {
    const montado = await appDePrueba(MODULOS);
    app = montado.app;
    const r = await app.inject({ method: 'GET', url: '/api/v1/errores/inesperado' });
    const idDelPedido = r.headers['x-request-id'];

    const error = montado.logs.registros().find((l) => l.level === 50);
    expect(error).toBeDefined();
    expect(error?.reqId).toBe(idDelPedido);
    const texto = JSON.stringify(error);
    expect(texto).toContain('SELECT'); // el detalle queda en el log...
    expect(texto).not.toContain('30111222'); // ...pero el DNI no
    expect(texto).toContain('[REDACTADO]');
  });
});
