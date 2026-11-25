import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import type { Contrato } from './comparar.js';
import { verificarRespuestasDeclaradas } from './respuestas.js';
import { RUTA_CONTRATO, RUTA_EXCEPCIONES } from './soporte-contrato.js';

const conEsquema = {
  responses: { '200': { content: { 'application/json': { schema: { type: 'object' } } } } },
};
const sinEsquema = { responses: { '200': { description: 'Default Response' } } };

function contrato(paths: Contrato['paths']): Contrato {
  return { openapi: '3.0.3', info: { title: 't', version: '1.0.0' }, paths };
}

describe('verificarRespuestasDeclaradas (lógica)', () => {
  it('pasa cuando toda operación tiene esquema o está exceptuada con motivo', () => {
    const resultado = verificarRespuestasDeclaradas(
      contrato({ '/a': { get: conEsquema }, '/b': { post: sinEsquema } }),
      { 'POST /b': 'respuesta sin cuerpo (C-99)' },
    );
    expect(resultado).toEqual({ sinEsquema: [], sobrantes: [] });
  });

  it('una operación nueva sin esquema y sin excepción falla y se nombra', () => {
    const resultado = verificarRespuestasDeclaradas(
      contrato({ '/a': { get: conEsquema }, '/nueva': { get: sinEsquema } }),
      {},
    );
    expect(resultado.sinEsquema).toEqual(['GET /nueva']);
  });

  it('una excepción sobrante (la operación ya tiene esquema) falla', () => {
    const resultado = verificarRespuestasDeclaradas(contrato({ '/a': { get: conEsquema } }), {
      'GET /a': 'ya no hace falta',
    });
    expect(resultado.sobrantes).toEqual(['GET /a']);
  });

  it('una excepción de una operación que ya no existe también es sobrante', () => {
    const resultado = verificarRespuestasDeclaradas(contrato({ '/a': { get: conEsquema } }), {
      'GET /eliminada': 'motivo',
    });
    expect(resultado.sobrantes).toEqual(['GET /eliminada']);
  });

  it('un esquema en una respuesta que no es 2xx no cuenta como respuesta exitosa', () => {
    const soloError = {
      responses: {
        '200': { description: 'Default Response' },
        '404': { content: { 'application/json': { schema: { type: 'object' } } } },
      },
    };
    expect(
      verificarRespuestasDeclaradas(contrato({ '/a': { get: soloError } }), {}).sinEsquema,
    ).toEqual(['GET /a']);
  });

  it('una excepción sin motivo no vale', () => {
    const resultado = verificarRespuestasDeclaradas(contrato({ '/b': { post: sinEsquema } }), {
      'POST /b': '  ',
    });
    expect(resultado.sinEsquema).toEqual(['POST /b']);
  });
});

describe('respuestas declaradas en el contrato real', () => {
  it('toda operación declara su respuesta exitosa salvo las de docs/api/excepciones-de-respuesta.json', async () => {
    const real = JSON.parse(await readFile(RUTA_CONTRATO, 'utf8')) as Contrato;
    const excepciones = JSON.parse(await readFile(RUTA_EXCEPCIONES, 'utf8')) as Record<
      string,
      string
    >;
    const resultado = verificarRespuestasDeclaradas(real, excepciones);
    expect({
      'operaciones sin esquema de respuesta y sin excepción': resultado.sinEsquema,
      'excepciones sobrantes (quitarlas del archivo)': resultado.sobrantes,
    }).toEqual({
      'operaciones sin esquema de respuesta y sin excepción': [],
      'excepciones sobrantes (quitarlas del archivo)': [],
    });
  });
});
