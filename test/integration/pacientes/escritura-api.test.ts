import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CLINICA_A,
  CLINICA_B,
  auditoriaDe,
  autorizacion,
  cerrarPool,
  comoApp,
  crearAppDePrueba,
  insertarPaciente,
  prepararBaseDePacientes,
} from './soporte.js';

let app: FastifyInstance;

beforeAll(async () => {
  await prepararBaseDePacientes();
  app = (await crearAppDePrueba()).app;
});
afterAll(async () => {
  await app.close();
  await cerrarPool();
});

const ALTA = {
  nombre: '  Camila ',
  apellido: ' Sintetica ',
  dni: '31.222.333',
  telefono: '011 15 5555-1234',
  email: 'Camila.Sintetica@Ejemplo.INVALID',
};

describe('POST /pacientes', () => {
  it('201: normaliza DNI y teléfono, obraSocial null y no filtra clinicaId', async () => {
    const usuario = randomUUID();
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/pacientes',
      headers: await autorizacion('recepcionista', CLINICA_A.id, usuario),
      payload: { ...ALTA, clinicaId: CLINICA_B.id },
    });
    expect(r.statusCode).toBe(201);
    const cuerpo = r.json<Record<string, unknown>>();
    expect(cuerpo).toMatchObject({
      nombre: 'Camila',
      apellido: 'Sintetica',
      dni: '31222333',
      telefono: '+5491155551234',
      email: 'camila.sintetica@ejemplo.invalid',
      obraSocial: null,
    });
    expect(Object.keys(cuerpo).sort()).toEqual(
      ['apellido', 'creadoEn', 'dni', 'email', 'id', 'nombre', 'obraSocial', 'telefono'].sort(),
    );
    // El campo desconocido se ignora: el paciente quedó en la clínica del token.
    const enA = await comoApp(CLINICA_A.id, (c) =>
      c.query('SELECT 1 FROM paciente WHERE dni = $1', ['31222333']),
    );
    const enB = await comoApp(CLINICA_B.id, (c) =>
      c.query('SELECT 1 FROM paciente WHERE dni = $1', ['31222333']),
    );
    expect([enA.rowCount, enB.rowCount]).toEqual([1, 0]);

    const eventos = await auditoriaDe(CLINICA_A.id, 'paciente', cuerpo.id as string);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      accion: 'creacion',
      actor_id: usuario,
      actor_tipo: 'usuario',
      datos_antes: null,
      datos_despues: { camposInformados: ['nombre', 'apellido', 'dni', 'telefono', 'email'] },
    });
    expect(eventos[0]?.ip).toBeTruthy();
    const serializado = JSON.stringify(eventos);
    for (const valor of [
      'Camila',
      'Sintetica',
      '31222333',
      '31.222.333',
      '5491155551234',
      'ejemplo.invalid',
    ]) {
      expect(serializado).not.toContain(valor);
    }
  });

  it.each([
    ['DNI con letras', { ...ALTA, dni: '31.222.33A' }, 'DNI_INVALIDO', ['31.222.33A']],
    [
      'teléfono inválido',
      { ...ALTA, dni: '31222334', telefono: '123' },
      'TELEFONO_INVALIDO',
      ['123'],
    ],
    [
      'nombre en blanco',
      { ...ALTA, dni: '31222335', nombre: '   ' },
      'SOLICITUD_INVALIDA',
      ['31222335'],
    ],
  ])('400 %s: sin valores en el cuerpo del error', async (_n, payload, codigo, prohibidos) => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/pacientes',
      headers: await autorizacion('administrador', CLINICA_A.id),
      payload,
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ codigo });
    for (const valor of prohibidos) expect(r.body).not.toContain(valor);
  });

  it('409 PACIENTE_DNI_DUPLICADO con el DNI repetido con puntos, sin auditar ni filtrar datos', async () => {
    const antes = (await auditoriaDe(CLINICA_A.id, 'paciente')).length;
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/pacientes',
      headers: await autorizacion('recepcionista', CLINICA_A.id),
      payload: { ...ALTA, nombre: 'Otra', telefono: '011 15 5555-9999' },
    });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ codigo: 'PACIENTE_DNI_DUPLICADO' });
    expect(r.body).not.toContain('31222333');
    expect((await auditoriaDe(CLINICA_A.id, 'paciente')).length).toBe(antes);
  });

  it('el mismo DNI en la clínica B es válido', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/pacientes',
      headers: await autorizacion('administrador', CLINICA_B.id),
      payload: ALTA,
    });
    expect(r.statusCode).toBe(201);
  });
});

describe('PATCH /pacientes/{id}', () => {
  it('cambia el teléfono y borra obraSocial; audita solo nombres de campo', async () => {
    const id = await insertarPaciente(CLINICA_A.id, {
      apellido: 'Zapellido',
      dni: '32000001',
      obraSocial: 'Prepaga Ficticia',
      email: 'viejo@ejemplo.invalid',
    });
    const usuario = randomUUID();
    const r = await app.inject({
      method: 'PATCH',
      url: `/api/v1/pacientes/${id}`,
      headers: await autorizacion('administrador', CLINICA_A.id, usuario),
      payload: { telefono: '011 15 5555-7777', obraSocial: null, apellido: 'Zapellido' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      id,
      telefono: '+5491155557777',
      obraSocial: null,
      email: 'viejo@ejemplo.invalid',
    });

    const eventos = await auditoriaDe(CLINICA_A.id, 'paciente', id);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      accion: 'modificacion',
      actor_id: usuario,
      datos_antes: null,
      datos_despues: { camposModificados: ['telefono', 'obraSocial'] },
    });
    const serializado = JSON.stringify(eventos);
    for (const valor of ['5491155557777', 'Prepaga', 'viejo@', 'Zapellido', '32000001']) {
      expect(serializado).not.toContain(valor);
    }
  });

  it('409 al mover el DNI a uno existente, sin cambios en ningún paciente', async () => {
    const a = await insertarPaciente(CLINICA_A.id, { apellido: 'Uno', dni: '32000011' });
    await insertarPaciente(CLINICA_A.id, { apellido: 'Dos', dni: '32000012' });
    const r = await app.inject({
      method: 'PATCH',
      url: `/api/v1/pacientes/${a}`,
      headers: await autorizacion('recepcionista', CLINICA_A.id),
      payload: { dni: '32.000.012', nombre: 'Cambiado' },
    });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ codigo: 'PACIENTE_DNI_DUPLICADO' });
    const { rows } = await comoApp(CLINICA_A.id, (c) =>
      c.query<{ nombre: string; dni: string }>('SELECT nombre, dni FROM paciente WHERE id = $1', [
        a,
      ]),
    );
    expect(rows[0]).toEqual({ nombre: 'Nombre', dni: '32000011' });
    expect(await auditoriaDe(CLINICA_A.id, 'paciente', a)).toEqual([]);
  });

  it('404 para id de otra clínica, inexistente y mal formado', async () => {
    const deB = await insertarPaciente(CLINICA_B.id, { apellido: 'DeB', dni: '32000021' });
    for (const id of [deB, randomUUID(), 'no-es-un-uuid']) {
      const r = await app.inject({
        method: 'PATCH',
        url: `/api/v1/pacientes/${id}`,
        headers: await autorizacion('administrador', CLINICA_A.id),
        payload: { nombre: 'Intruso' },
      });
      expect(r.statusCode, id).toBe(404);
      expect(r.json()).toMatchObject({ codigo: 'RECURSO_NO_ENCONTRADO' });
    }
    const { rows } = await comoApp(CLINICA_B.id, (c) =>
      c.query<{ nombre: string }>('SELECT nombre FROM paciente WHERE id = $1', [deB]),
    );
    expect(rows[0]?.nombre).toBe('Nombre');
  });
});
