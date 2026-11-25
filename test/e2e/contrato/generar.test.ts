import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { abrirEntorno, type EntornoE2E } from '../soporte/entorno.js';

import { generarContrato, normalizar, versionDelRegistro } from './generar.js';

const REGISTRO = `# Registro de cambios del contrato

## [1.2.0] - 2026-12-01

- Agrega \`GET /x\`.

## [2.0.0] - 2027-01-10

- **Rompiente**: quita \`GET /y\`.

## [1.0.0] - 2026-11-24

- Primera versión.
`;

describe('normalizar', () => {
  it('ordena las claves de forma recursiva, también dentro de arreglos', () => {
    const entrada = { b: 1, a: { d: [{ z: 1, y: 2 }], c: null } };
    const salida = normalizar(entrada);
    expect(JSON.stringify(salida)).toBe('{"a":{"c":null,"d":[{"y":2,"z":1}]},"b":1}');
  });

  it('no altera el orden de los arreglos ni los valores primitivos', () => {
    expect(normalizar({ k: [3, 1, 2], s: 'x', n: 0, t: true })).toEqual({
      k: [3, 1, 2],
      n: 0,
      s: 'x',
      t: true,
    });
  });
});

describe('versionDelRegistro', () => {
  it('toma la versión más alta declarada en los encabezados', () => {
    expect(versionDelRegistro(REGISTRO)).toBe('2.0.0');
  });

  it('con una sola entrada devuelve esa versión', () => {
    expect(versionDelRegistro('## [1.0.0] - 2026-11-24\n')).toBe('1.0.0');
  });

  it('compara numéricamente (1.10.0 es mayor que 1.9.0)', () => {
    expect(versionDelRegistro('## [1.9.0] - 2026-01-01\n## [1.10.0] - 2026-02-01\n')).toBe(
      '1.10.0',
    );
  });

  it('ignora los encabezados de ejemplo que no tienen fecha real', () => {
    const registro = ['## [1.0.0] - 2026-11-24', '', '```', '## [9.0.0] - AAAA-MM-DD', '```'].join(
      '\n',
    );
    expect(versionDelRegistro(registro)).toBe('1.0.0');
  });

  it('falla si el registro no declara ninguna versión', () => {
    expect(() => versionDelRegistro('# vacío\n')).toThrow(/versión/);
  });
});

describe('generarContrato', () => {
  let entorno: EntornoE2E;

  beforeAll(async () => {
    entorno = await abrirEntorno();
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  it('dos generaciones sobre el mismo código son idénticas byte a byte', () => {
    expect(generarContrato(entorno.app, REGISTRO)).toBe(generarContrato(entorno.app, REGISTRO));
  });

  it('fija info.version con la última versión del registro, sin datos variables', () => {
    const contrato = JSON.parse(generarContrato(entorno.app, REGISTRO)) as {
      openapi: string;
      info: { version: string };
      servers?: unknown;
    };
    expect(contrato.openapi).toMatch(/^3\./);
    expect(contrato.info.version).toBe('2.0.0');
    expect(contrato).not.toHaveProperty('servers');
  });

  it('termina con salto de línea y usa sangría de dos espacios', () => {
    const texto = generarContrato(entorno.app, REGISTRO);
    expect(texto.endsWith('}\n')).toBe(true);
    expect(texto).toContain('\n  "info"');
  });
});
