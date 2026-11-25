import { describe, expect, it } from 'vitest';

import { compararContratos, operacionesDiferentes, type Contrato } from './comparar.js';

type Esquema = Record<string, unknown>;

function operacion(opciones: {
  readonly respuestas?: Record<string, Esquema | null>;
  readonly cuerpo?: Esquema;
  readonly cuerpoObligatorio?: boolean;
  readonly parametros?: Record<string, unknown>[];
}): Record<string, unknown> {
  const respuestas: Record<string, unknown> = {};
  for (const [codigo, esquema] of Object.entries(opciones.respuestas ?? { '200': null })) {
    respuestas[codigo] =
      esquema === null
        ? { description: 'Default Response' }
        : { description: 'ok', content: { 'application/json': { schema: esquema } } };
  }
  return {
    ...(opciones.parametros === undefined ? {} : { parameters: opciones.parametros }),
    ...(opciones.cuerpo === undefined
      ? {}
      : {
          requestBody: {
            ...(opciones.cuerpoObligatorio === true ? { required: true } : {}),
            content: { 'application/json': { schema: opciones.cuerpo } },
          },
        }),
    responses: respuestas,
  };
}

function contrato(operaciones: Record<string, Record<string, unknown>>): Contrato {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [clave, valor] of Object.entries(operaciones)) {
    const [metodo = '', ruta = ''] = clave.split(' ');
    paths[ruta] = { ...(paths[ruta] ?? {}), [metodo.toLowerCase()]: valor };
  }
  return { openapi: '3.0.3', info: { title: 't', version: '1.0.0' }, paths };
}

const objeto = (props: Record<string, Esquema>, requeridas: string[] = []): Esquema => ({
  type: 'object',
  properties: props,
  ...(requeridas.length > 0 ? { required: requeridas } : {}),
});

const rompientes = (base: Contrato, actual: Contrato) =>
  compararContratos(base, actual).filter((c) => c.rompiente);

describe('compararContratos: cambios rompientes', () => {
  it('una operación quitada es rompiente y se nombra', () => {
    const base = contrato({ 'GET /a': operacion({}), 'GET /b': operacion({}) });
    const actual = contrato({ 'GET /a': operacion({}) });
    expect(rompientes(base, actual)).toEqual([
      expect.objectContaining({ operacion: 'GET /b', rompiente: true }),
    ]);
  });

  it('una operación quitada de una ruta que conserva otros métodos también', () => {
    const base = contrato({ 'GET /a': operacion({}), 'POST /a': operacion({}) });
    const actual = contrato({ 'GET /a': operacion({}) });
    expect(rompientes(base, actual).map((c) => c.operacion)).toEqual(['POST /a']);
  });

  it('un código de respuesta quitado es rompiente', () => {
    const base = contrato({ 'GET /a': operacion({ respuestas: { '200': null, '404': null } }) });
    const actual = contrato({ 'GET /a': operacion({ respuestas: { '200': null } }) });
    const cambios = rompientes(base, actual);
    expect(cambios).toHaveLength(1);
    expect(cambios[0]?.detalle).toContain('404');
  });

  it('quitar el código 201 y dejar solo el 200 es rompiente', () => {
    const base = contrato({ 'POST /a': operacion({ respuestas: { '201': null } }) });
    const actual = contrato({ 'POST /a': operacion({ respuestas: { '200': null } }) });
    expect(rompientes(base, actual)).toHaveLength(1);
  });

  it('una propiedad de la respuesta quitada es rompiente', () => {
    const base = contrato({
      'GET /a': operacion({
        respuestas: { '200': objeto({ id: { type: 'string' }, nombre: { type: 'string' } }) },
      }),
    });
    const actual = contrato({
      'GET /a': operacion({ respuestas: { '200': objeto({ id: { type: 'string' } }) } }),
    });
    const cambios = rompientes(base, actual);
    expect(cambios).toHaveLength(1);
    expect(cambios[0]?.detalle).toContain('nombre');
  });

  it('una propiedad quitada dentro de un arreglo de la respuesta es rompiente', () => {
    const item = (props: string[]) =>
      objeto(Object.fromEntries(props.map((p) => [p, { type: 'string' }])));
    const base = contrato({
      'GET /a': operacion({ respuestas: { '200': { type: 'array', items: item(['id', 'x']) } } }),
    });
    const actual = contrato({
      'GET /a': operacion({ respuestas: { '200': { type: 'array', items: item(['id']) } } }),
    });
    expect(rompientes(base, actual)).toHaveLength(1);
  });

  it('un campo de entrada que pasa a obligatorio es rompiente', () => {
    const base = contrato({
      'POST /a': operacion({ cuerpo: objeto({ x: { type: 'string' } }) }),
    });
    const actual = contrato({
      'POST /a': operacion({ cuerpo: objeto({ x: { type: 'string' } }, ['x']) }),
    });
    expect(rompientes(base, actual)).toHaveLength(1);
  });

  it('un campo de entrada nuevo y obligatorio es rompiente', () => {
    const base = contrato({
      'POST /a': operacion({ cuerpo: objeto({ x: { type: 'string' } }) }),
    });
    const actual = contrato({
      'POST /a': operacion({
        cuerpo: objeto({ x: { type: 'string' }, y: { type: 'string' } }, ['y']),
      }),
    });
    const cambios = rompientes(base, actual);
    expect(cambios).toHaveLength(1);
    expect(cambios[0]?.detalle).toContain('y');
  });

  it('un cuerpo que pasa a ser obligatorio es rompiente', () => {
    const base = contrato({ 'POST /a': operacion({ cuerpo: objeto({}) }) });
    const actual = contrato({
      'POST /a': operacion({ cuerpo: objeto({}), cuerpoObligatorio: true }),
    });
    expect(rompientes(base, actual)).toHaveLength(1);
  });

  it('un parámetro nuevo obligatorio es rompiente; uno que pasa a obligatorio también', () => {
    const base = contrato({
      'GET /a': operacion({
        parametros: [{ name: 'q', in: 'query', schema: { type: 'string' } }],
      }),
    });
    const nuevo = contrato({
      'GET /a': operacion({
        parametros: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'p', in: 'query', required: true, schema: { type: 'string' } },
        ],
      }),
    });
    const obligatorio = contrato({
      'GET /a': operacion({
        parametros: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }],
      }),
    });
    expect(rompientes(base, nuevo)).toHaveLength(1);
    expect(rompientes(base, obligatorio)).toHaveLength(1);
  });

  it('un tipo cambiado es rompiente en la entrada y en la salida', () => {
    const base = contrato({
      'POST /a': operacion({
        cuerpo: objeto({ n: { type: 'string' } }),
        respuestas: { '200': objeto({ m: { type: 'string' } }) },
      }),
    });
    const actual = contrato({
      'POST /a': operacion({
        cuerpo: objeto({ n: { type: 'integer' } }),
        respuestas: { '200': objeto({ m: { type: 'integer' } }) },
      }),
    });
    expect(rompientes(base, actual)).toHaveLength(2);
  });

  it('un enumerado achicado es rompiente', () => {
    const base = contrato({
      'POST /a': operacion({ cuerpo: objeto({ r: { type: 'string', enum: ['a', 'b', 'c'] } }) }),
    });
    const actual = contrato({
      'POST /a': operacion({ cuerpo: objeto({ r: { type: 'string', enum: ['a', 'b'] } }) }),
    });
    const cambios = rompientes(base, actual);
    expect(cambios).toHaveLength(1);
    expect(cambios[0]?.detalle).toContain('c');
  });

  it('un enumerado achicado en la respuesta también es rompiente', () => {
    const base = contrato({
      'GET /a': operacion({
        respuestas: { '200': objeto({ r: { type: 'string', enum: ['a', 'b'] } }) },
      }),
    });
    const actual = contrato({
      'GET /a': operacion({
        respuestas: { '200': objeto({ r: { type: 'string', enum: ['a'] } }) },
      }),
    });
    expect(rompientes(base, actual)).toHaveLength(1);
  });

  it('resuelve referencias a components.schemas antes de comparar', () => {
    const con = (props: Record<string, Esquema>): Contrato => ({
      ...contrato({
        'GET /a': operacion({ respuestas: { '200': { $ref: '#/components/schemas/Dto' } } }),
      }),
      components: { schemas: { Dto: objeto(props) } },
    });
    const base = con({ id: { type: 'string' }, x: { type: 'string' } });
    const actual = con({ id: { type: 'string' } });
    expect(rompientes(base, actual)).toHaveLength(1);
  });
});

describe('compararContratos: cambios no rompientes', () => {
  it('una operación nueva no es rompiente', () => {
    const base = contrato({ 'GET /a': operacion({}) });
    const actual = contrato({ 'GET /a': operacion({}), 'GET /nueva': operacion({}) });
    expect(rompientes(base, actual)).toEqual([]);
    expect(compararContratos(base, actual)).toEqual([
      expect.objectContaining({ operacion: 'GET /nueva', rompiente: false }),
    ]);
  });

  it('una propiedad opcional nueva en la respuesta o en la entrada no es rompiente', () => {
    const base = contrato({
      'POST /a': operacion({
        cuerpo: objeto({ x: { type: 'string' } }),
        respuestas: { '200': objeto({ id: { type: 'string' } }) },
      }),
    });
    const actual = contrato({
      'POST /a': operacion({
        cuerpo: objeto({ x: { type: 'string' }, y: { type: 'string' } }),
        respuestas: { '200': objeto({ id: { type: 'string' }, extra: { type: 'string' } }) },
      }),
    });
    expect(rompientes(base, actual)).toEqual([]);
  });

  it('una respuesta nueva, una descripción distinta y un enumerado ampliado no son rompientes', () => {
    const base = contrato({
      'GET /a': operacion({
        respuestas: { '200': objeto({ r: { type: 'string', enum: ['a'] } }) },
      }),
    });
    const actual = contrato({
      'GET /a': operacion({
        respuestas: {
          '200': objeto({ r: { type: 'string', enum: ['a', 'b'], description: 'nuevo texto' } }),
          '404': null,
        },
      }),
    });
    expect(rompientes(base, actual)).toEqual([]);
  });

  it('dos contratos iguales no producen cambios', () => {
    const base = contrato({ 'GET /a': operacion({ respuestas: { '200': objeto({}) } }) });
    expect(compararContratos(base, structuredClone(base))).toEqual([]);
  });

  it('quitar una propiedad de la ENTRADA no figura como rompiente (spec: solo respuesta)', () => {
    const base = contrato({
      'POST /a': operacion({ cuerpo: objeto({ x: { type: 'string' }, y: { type: 'string' } }) }),
    });
    const actual = contrato({
      'POST /a': operacion({ cuerpo: objeto({ x: { type: 'string' } }) }),
    });
    expect(rompientes(base, actual)).toEqual([]);
  });
});

describe('operacionesDiferentes', () => {
  it('lista las operaciones agregadas, quitadas y modificadas, ordenadas', () => {
    const base = contrato({
      'GET /a': operacion({}),
      'GET /b': operacion({ respuestas: { '200': objeto({ x: { type: 'string' } }) } }),
      'GET /c': operacion({}),
    });
    const actual = contrato({
      'GET /b': operacion({ respuestas: { '200': objeto({ x: { type: 'integer' } }) } }),
      'GET /c': operacion({}),
      'GET /d': operacion({}),
    });
    expect(operacionesDiferentes(base, actual)).toEqual(['GET /a', 'GET /b', 'GET /d']);
  });

  it('un contrato idéntico no tiene diferencias', () => {
    const base = contrato({ 'GET /a': operacion({}) });
    expect(operacionesDiferentes(base, structuredClone(base))).toEqual([]);
  });
});
