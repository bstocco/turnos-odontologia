import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PLANTILLAS_FERIADOS_NACIONALES } from '../../../src/application/configuracion/index.js';
import {
  CLINICA_A,
  CLINICA_B,
  auditoriaDe,
  autorizacion,
  cerrarPool,
  comoApp,
  crearAppDePrueba,
  prepararBaseDeConfiguracion,
} from './soporte.js';

let app: FastifyInstance;

beforeAll(async () => {
  await prepararBaseDeConfiguracion();
  app = await crearAppDePrueba();
});
afterAll(async () => {
  await app.close();
  await cerrarPool();
});

async function admin(clinicaId: string = CLINICA_A.id) {
  return autorizacion('administrador', clinicaId);
}

async function crear(clinicaId: string, fecha: string, descripcion = 'Feriado sintético') {
  return app.inject({
    method: 'POST',
    url: '/api/v1/feriados',
    headers: await admin(clinicaId),
    payload: { fecha, descripcion },
  });
}

async function limpiar(clinicaId: string): Promise<void> {
  await comoApp(clinicaId, (c) => c.query('DELETE FROM feriado'));
}

describe('/feriados', () => {
  it('POST crea con 201 y devuelve { id, fecha, descripcion }; audita creacion manual', async () => {
    await limpiar(CLINICA_A.id);
    const r = await crear(CLINICA_A.id, '2030-03-10', '  Aniversario  ');
    expect(r.statusCode).toBe(201);
    const creado = r.json() as { id: string };
    expect(r.json()).toEqual({
      id: expect.any(String) as unknown,
      fecha: '2030-03-10',
      descripcion: 'Aniversario',
    });
    const registros = await auditoriaDe(CLINICA_A.id, 'feriado', creado.id);
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({
      accion: 'creacion',
      datos_antes: null,
      datos_despues: { fecha: '2030-03-10', origen: 'manual' },
    });
  });

  it('GET lista por fecha y filtra por año', async () => {
    await limpiar(CLINICA_A.id);
    await crear(CLINICA_A.id, '2031-06-01');
    await crear(CLINICA_A.id, '2030-01-15');
    await crear(CLINICA_A.id, '2030-12-24');
    for (const rol of ['administrador', 'recepcionista', 'odontologo'] as const) {
      const todos = await app.inject({
        method: 'GET',
        url: '/api/v1/feriados',
        headers: await autorizacion(rol, CLINICA_A.id),
      });
      expect(todos.statusCode).toBe(200);
      expect((todos.json() as { fecha: string }[]).map((f) => f.fecha)).toEqual([
        '2030-01-15',
        '2030-12-24',
        '2031-06-01',
      ]);
    }
    const de2030 = await app.inject({
      method: 'GET',
      url: '/api/v1/feriados?anio=2030',
      headers: await admin(),
    });
    expect((de2030.json() as { fecha: string }[]).map((f) => f.fecha)).toEqual([
      '2030-01-15',
      '2030-12-24',
    ]);
    const de2031 = await app.inject({
      method: 'GET',
      url: '/api/v1/feriados?anio=2031',
      headers: await admin(),
    });
    expect(de2031.json()).toHaveLength(1);
  });

  it('GET rechaza un año fuera de rango con 400', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/feriados?anio=1900',
      headers: await admin(),
    });
    expect(r.statusCode).toBe(400);
  });

  it('una fecha repetida responde 409 FERIADO_DUPLICADO', async () => {
    await limpiar(CLINICA_A.id);
    await crear(CLINICA_A.id, '2030-05-05');
    const r = await crear(CLINICA_A.id, '2030-05-05', 'Otro');
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ codigo: 'FERIADO_DUPLICADO' });
  });

  it('la misma fecha en otra clínica es aceptada y las listas no se mezclan', async () => {
    await limpiar(CLINICA_A.id);
    await limpiar(CLINICA_B.id);
    expect((await crear(CLINICA_A.id, '2030-07-07')).statusCode).toBe(201);
    expect((await crear(CLINICA_B.id, '2030-07-07')).statusCode).toBe(201);
    await crear(CLINICA_B.id, '2030-08-08');
    const listaA = await app.inject({
      method: 'GET',
      url: '/api/v1/feriados',
      headers: await admin(CLINICA_A.id),
    });
    expect((listaA.json() as { fecha: string }[]).map((f) => f.fecha)).toEqual(['2030-07-07']);
  });

  it.each(['2026-02-30', '2026-13-01', '2026-2-3', 'hoy'])(
    'POST con fecha %s responde 400',
    async (fecha) => {
      const r = await crear(CLINICA_A.id, fecha);
      expect(r.statusCode).toBe(400);
    },
  );

  it('POST con descripción en blanco o ausente responde 400', async () => {
    expect((await crear(CLINICA_A.id, '2030-09-09', '   ')).statusCode).toBe(400);
    const sin = await app.inject({
      method: 'POST',
      url: '/api/v1/feriados',
      headers: await admin(),
      payload: { fecha: '2030-09-09' },
    });
    expect(sin.statusCode).toBe(400);
  });

  it('DELETE borra uno propio (204) y audita eliminacion; uno ajeno o inexistente da 404', async () => {
    await limpiar(CLINICA_A.id);
    await limpiar(CLINICA_B.id);
    const propio = (await crear(CLINICA_A.id, '2030-10-10', 'A borrar')).json() as { id: string };
    const ajeno = (await crear(CLINICA_B.id, '2030-10-11')).json() as { id: string };

    const ok = await app.inject({
      method: 'DELETE',
      url: `/api/v1/feriados/${propio.id}`,
      headers: await admin(),
    });
    expect(ok.statusCode).toBe(204);
    expect(ok.body).toBe('');
    const registros = await auditoriaDe(CLINICA_A.id, 'feriado', propio.id);
    expect(registros.map((r) => r.accion)).toEqual(['creacion', 'eliminacion']);
    expect(registros[1]).toMatchObject({
      datos_antes: { fecha: '2030-10-10', descripcion: 'A borrar' },
      datos_despues: null,
    });

    for (const id of [ajeno.id, randomUUID(), 'no-es-un-uuid']) {
      const r = await app.inject({
        method: 'DELETE',
        url: `/api/v1/feriados/${id}`,
        headers: await admin(),
      });
      expect(r.statusCode).toBe(404);
      expect(r.json()).toMatchObject({ codigo: 'RECURSO_NO_ENCONTRADO' });
    }
    const deB = await app.inject({
      method: 'GET',
      url: '/api/v1/feriados',
      headers: await admin(CLINICA_B.id),
    });
    expect((deB.json() as { id: string }[]).map((f) => f.id)).toContain(ajeno.id);
  });

  it.each(['recepcionista', 'odontologo'] as const)(
    '403 al rol %s en las escrituras',
    async (rol) => {
      const headers = await autorizacion(rol, CLINICA_A.id);
      const post = await app.inject({
        method: 'POST',
        url: '/api/v1/feriados',
        headers,
        payload: { fecha: '2030-11-11', descripcion: 'X' },
      });
      const del = await app.inject({
        method: 'DELETE',
        url: `/api/v1/feriados/${randomUUID()}`,
        headers,
      });
      const plantilla = await app.inject({
        method: 'POST',
        url: '/api/v1/feriados/plantilla-nacional',
        headers,
        payload: { anio: 2026 },
      });
      for (const r of [post, del, plantilla]) {
        expect(r.statusCode).toBe(403);
        expect(r.json()).toMatchObject({ codigo: 'ACCESO_PROHIBIDO' });
      }
    },
  );

  it('sin token responde 401', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/feriados' })).statusCode).toBe(401);
  });
});

describe('/feriados/plantilla-nacional', () => {
  it('GET devuelve la plantilla del año a los tres roles', async () => {
    for (const rol of ['administrador', 'recepcionista', 'odontologo'] as const) {
      const r = await app.inject({
        method: 'GET',
        url: '/api/v1/feriados/plantilla-nacional?anio=2026',
        headers: await autorizacion(rol, CLINICA_A.id),
      });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({ anio: 2026, feriados: PLANTILLAS_FERIADOS_NACIONALES[2026] });
    }
  });

  it('un año sin plantilla responde 422 PLANTILLA_FERIADOS_NO_DISPONIBLE (GET y POST)', async () => {
    const g = await app.inject({
      method: 'GET',
      url: '/api/v1/feriados/plantilla-nacional?anio=2031',
      headers: await admin(),
    });
    const p = await app.inject({
      method: 'POST',
      url: '/api/v1/feriados/plantilla-nacional',
      headers: await admin(),
      payload: { anio: 2031 },
    });
    for (const r of [g, p]) {
      expect(r.statusCode).toBe(422);
      expect(r.json()).toMatchObject({ codigo: 'PLANTILLA_FERIADOS_NO_DISPONIBLE' });
    }
  });

  it('GET sin anio o con anio inválido responde 400', async () => {
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/feriados/plantilla-nacional',
          headers: await admin(),
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/feriados/plantilla-nacional',
          headers: await admin(),
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
  });

  it('POST copia la plantilla de forma idempotente y conserva las descripciones propias', async () => {
    await limpiar(CLINICA_A.id);
    const total = (PLANTILLAS_FERIADOS_NACIONALES[2026] ?? []).length;
    await crear(CLINICA_A.id, '2026-05-01', 'Descripción propia');

    const primera = await app.inject({
      method: 'POST',
      url: '/api/v1/feriados/plantilla-nacional',
      headers: await admin(),
      payload: { anio: 2026 },
    });
    expect(primera.statusCode).toBe(200);
    const cuerpo = primera.json() as {
      anio: number;
      creados: { id: string; fecha: string }[];
      omitidas: string[];
    };
    expect(cuerpo.anio).toBe(2026);
    expect(cuerpo.creados).toHaveLength(total - 1);
    expect(cuerpo.omitidas).toEqual(['2026-05-01']);

    const segunda = await app.inject({
      method: 'POST',
      url: '/api/v1/feriados/plantilla-nacional',
      headers: await admin(),
      payload: { anio: 2026 },
    });
    const cuerpo2 = segunda.json() as { creados: unknown[]; omitidas: string[] };
    expect(cuerpo2.creados).toEqual([]);
    expect(cuerpo2.omitidas).toHaveLength(total);

    const lista = await app.inject({
      method: 'GET',
      url: '/api/v1/feriados?anio=2026',
      headers: await admin(),
    });
    const feriados = lista.json() as { fecha: string; descripcion: string }[];
    expect(feriados).toHaveLength(total);
    expect(feriados.find((f) => f.fecha === '2026-05-01')?.descripcion).toBe('Descripción propia');
  });

  it('registra un evento de auditoría por feriado creado, con origen plantilla_nacional', async () => {
    await limpiar(CLINICA_B.id);
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/feriados/plantilla-nacional',
      headers: await admin(CLINICA_B.id),
      payload: { anio: 2027 },
    });
    const creados = (r.json() as { creados: { id: string }[] }).creados;
    expect(creados).toHaveLength((PLANTILLAS_FERIADOS_NACIONALES[2027] ?? []).length);
    for (const { id } of creados.slice(0, 3)) {
      const registros = await auditoriaDe(CLINICA_B.id, 'feriado', id);
      expect(registros).toHaveLength(1);
      expect(registros[0]).toMatchObject({
        accion: 'creacion',
        datos_despues: { origen: 'plantilla_nacional' },
      });
    }
  });

  it('la copia en A no crea feriados en B', async () => {
    await limpiar(CLINICA_A.id);
    await limpiar(CLINICA_B.id);
    await app.inject({
      method: 'POST',
      url: '/api/v1/feriados/plantilla-nacional',
      headers: await admin(CLINICA_A.id),
      payload: { anio: 2026 },
    });
    const deB = await app.inject({
      method: 'GET',
      url: '/api/v1/feriados',
      headers: await admin(CLINICA_B.id),
    });
    expect(deB.json()).toEqual([]);
  });
});
