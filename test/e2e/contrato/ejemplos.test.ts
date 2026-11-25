import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { operacionesDe, type Contrato } from './comparar.js';
import { analizarEjemplos } from './ejemplos.js';
import { DIRECTORIO_EJEMPLOS, RUTA_CONTRATO } from './soporte-contrato.js';

const contrato: Contrato = {
  openapi: '3.0.3',
  info: { title: 't', version: '1.0.0' },
  paths: {
    '/salud': { get: { responses: {} } },
    '/api/v1/pacientes': { get: { responses: {} }, post: { responses: {} } },
    '/api/v1/pacientes/{id}': { get: { responses: {} }, patch: { responses: {} } },
  },
};

const VALIDO = [
  '@baseUrl = http://localhost:3000',
  '',
  '### Estado del servicio',
  'GET {{baseUrl}}/salud',
  '',
  '### Alta de un paciente sintético',
  'POST {{baseUrl}}/api/v1/pacientes',
  'Authorization: Bearer {{token}}',
  'Content-Type: application/json',
  '',
  '{ "email": "paciente@ejemplo.invalid", "password": "{{password}}" }',
  '',
  '### Detalle',
  'GET {{baseUrl}}/api/v1/pacientes/{{pacienteId}}?x=1',
].join('\n');

describe('analizarEjemplos', () => {
  it('un archivo válido corresponde a operaciones del contrato y no tiene problemas', () => {
    const resultado = analizarEjemplos('valido.http', VALIDO, contrato);
    expect(resultado.problemas).toEqual([]);
    expect(resultado.operaciones).toEqual([
      'GET /salud',
      'POST /api/v1/pacientes',
      'GET /api/v1/pacientes/{id}',
    ]);
  });

  it('un ejemplo de una ruta que el contrato ya no tiene falla y nombra el ejemplo', () => {
    const texto =
      'GET {{baseUrl}}/api/v1/pacientes\n\n###\nDELETE {{baseUrl}}/api/v1/pacientes/{{id}}';
    const resultado = analizarEjemplos('viejo.http', texto, contrato);
    expect(resultado.problemas).toHaveLength(1);
    expect(resultado.problemas[0]).toContain('viejo.http:4');
    expect(resultado.problemas[0]).toContain('DELETE /api/v1/pacientes/{param}');
  });

  it('un método que no existe para la ruta también falla', () => {
    const resultado = analizarEjemplos('m.http', 'PUT {{baseUrl}}/salud', contrato);
    expect(resultado.problemas[0]).toContain('PUT /salud');
  });

  it('un token literal en Authorization falla', () => {
    const texto = [
      'GET {{baseUrl}}/salud',
      ['Authorization: Bearer', 'abc123literal'].join(' '),
    ].join('\n');
    const resultado = analizarEjemplos('t.http', texto, contrato);
    expect(resultado.problemas.join('\n')).toContain('t.http:2');
    expect(resultado.problemas.join('\n')).toMatch(/Bearer/);
  });

  it('un JWT literal falla aunque no esté en un encabezado', () => {
    const jwt = ['eyJhbGciOiJub25lIn0', 'eyJzdWIiOiJwcnVlYmEifQ', 'firma'].join('.');
    const texto = `GET {{baseUrl}}/salud\n# probar con ${jwt}`;
    expect(analizarEjemplos('j.http', texto, contrato).problemas.join('\n')).toMatch(/JWT/);
  });

  it('una contraseña o clave literal en el cuerpo falla; con variable pasa', () => {
    const literal = analizarEjemplos(
      'p.http',
      'POST {{baseUrl}}/api/v1/pacientes\n\n{ "password": "UnaClaveLiteral1" }',
      contrato,
    );
    expect(literal.problemas.join('\n')).toContain('password');

    const clave = analizarEjemplos(
      'c.http',
      'POST {{baseUrl}}/api/v1/pacientes\n\n{ "claveInterna": "otraLiteral" }',
      contrato,
    );
    expect(clave.problemas.join('\n')).toContain('claveInterna');

    const conVariable = analizarEjemplos(
      'v.http',
      'POST {{baseUrl}}/api/v1/pacientes\n\n{ "password": "{{password}}", "token": "{{refresco}}" }',
      contrato,
    );
    expect(conVariable.problemas).toEqual([]);
  });

  it('una variable de secreto con valor literal falla; la URL base no', () => {
    const texto = '@baseUrl = http://localhost:3000\n@token = valorLiteral\nGET {{baseUrl}}/salud';
    const resultado = analizarEjemplos('v.http', texto, contrato);
    expect(resultado.problemas).toHaveLength(1);
    expect(resultado.problemas[0]).toContain('@token');
  });

  it('un email fuera del dominio reservado .invalid falla (datos sintéticos)', () => {
    const texto = 'POST {{baseUrl}}/api/v1/pacientes\n\n{ "email": "alguien@gmail.com" }';
    expect(analizarEjemplos('e.http', texto, contrato).problemas.join('\n')).toContain('email');
  });
});

describe('ejemplos de uso de la API (docs/api/ejemplos)', () => {
  it('cada ejemplo corresponde a una operación del contrato versionado y no contiene secretos', async () => {
    const real = JSON.parse(await readFile(RUTA_CONTRATO, 'utf8')) as Contrato;
    const archivos = (await readdir(DIRECTORIO_EJEMPLOS)).filter((a) => a.endsWith('.http')).sort();
    expect(archivos.length).toBeGreaterThan(0);

    const problemas: string[] = [];
    let pedidos = 0;
    for (const archivo of archivos) {
      const texto = await readFile(join(DIRECTORIO_EJEMPLOS, archivo), 'utf8');
      const resultado = analizarEjemplos(archivo, texto, real);
      problemas.push(...resultado.problemas);
      pedidos += resultado.operaciones.length;
    }
    expect(pedidos).toBeGreaterThan(0);
    expect(problemas).toEqual([]);
  });

  it('toda operación del contrato tiene al menos un ejemplo (cierre del change)', async () => {
    const real = JSON.parse(await readFile(RUTA_CONTRATO, 'utf8')) as Contrato;
    const archivos = (await readdir(DIRECTORIO_EJEMPLOS)).filter((a) => a.endsWith('.http')).sort();
    const cubiertas = new Set<string>();
    for (const archivo of archivos) {
      const texto = await readFile(join(DIRECTORIO_EJEMPLOS, archivo), 'utf8');
      for (const operacion of analizarEjemplos(archivo, texto, real).operaciones) {
        cubiertas.add(operacion);
      }
    }
    const sinEjemplo = [...operacionesDe(real).keys()].filter((o) => !cubiertas.has(o)).sort();
    expect(sinEjemplo).toEqual([]);
  });
});
