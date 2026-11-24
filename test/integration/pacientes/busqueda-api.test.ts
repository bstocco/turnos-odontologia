import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CLINICA_A,
  CLINICA_B,
  auditoriaDe,
  autorizacion,
  cerrarPool,
  contarAuditoria,
  crearAppDePrueba,
  insertarPaciente,
  insertarProfesional,
  insertarTurno,
  insertarUsuario,
  prepararBaseDePacientes,
} from './soporte.js';

let app: FastifyInstance;
let profP: string;
let odontologoDeP: string;
let propio: string;
let ajeno: string;

beforeAll(async () => {
  await prepararBaseDePacientes();
  app = (await crearAppDePrueba()).app;
  profP = await insertarProfesional(CLINICA_A.id, 'P');
  odontologoDeP = await insertarUsuario(CLINICA_A.id, 'odontologo', profP);
  await insertarPaciente(CLINICA_A.id, {
    nombre: 'Ana',
    apellido: 'Gómez',
    dni: '34000001',
    telefono: '+5491155554444',
    email: 'ana@ejemplo.invalid',
    obraSocial: 'Mutual Sintetica',
  });
  propio = await insertarPaciente(CLINICA_A.id, {
    nombre: 'Beto',
    apellido: 'Gomez Propio',
    dni: '34000002',
  });
  ajeno = await insertarPaciente(CLINICA_A.id, {
    nombre: 'Cora',
    apellido: 'Gomez Ajeno',
    dni: '34000003',
  });
  await insertarPaciente(CLINICA_B.id, { apellido: 'Gomez DeB', dni: '34000004' });
  await insertarTurno(CLINICA_A.id, propio, profP, 'confirmado');
  await insertarTurno(CLINICA_A.id, ajeno, profP, 'cancelado');
  for (let i = 0; i < 25; i += 1) {
    await insertarPaciente(CLINICA_A.id, {
      apellido: `Masivo${String(i).padStart(2, '0')}`,
      dni: `350000${String(i).padStart(2, '0')}`,
    });
  }
});
afterAll(async () => {
  await app.close();
  await cerrarPool();
});

const buscar = async (consulta: string, headers: { authorization: string }) =>
  app.inject({ method: 'GET', url: `/api/v1/pacientes?${consulta}`, headers });

describe('GET /pacientes (administración y recepción)', () => {
  it('por apellido sin tildes ni mayúsculas: solo la clínica del token y solo el resumen', async () => {
    const r = await buscar('apellido=gomez', await autorizacion('recepcionista', CLINICA_A.id));
    expect(r.statusCode).toBe(200);
    const lista = r.json<Record<string, unknown>[]>();
    expect(lista.map((p) => p.dni)).toEqual(['34000001', '34000003', '34000002']);
    // 'Gómez' < 'Gomez Ajeno' < 'Gomez Propio' en la colación de la base.
    for (const p of lista) {
      expect(Object.keys(p).sort()).toEqual(['apellido', 'dni', 'id', 'nombre']);
    }
    expect(r.body).not.toContain('5491155554444');
    expect(r.body).not.toContain('ana@ejemplo');
    expect(r.body).not.toContain('Mutual');
    expect(r.body).not.toContain('DeB');
  });

  it('por tilde en el criterio también encuentra', async () => {
    const r = await buscar(
      `apellido=${encodeURIComponent('GÓMEZ')}`,
      await autorizacion('administrador', CLINICA_A.id),
    );
    expect(r.json<unknown[]>().length).toBeGreaterThanOrEqual(1);
  });

  it('por DNI exacto: un resultado; DNI de otra clínica: lista vacía', async () => {
    const headers = await autorizacion('recepcionista', CLINICA_A.id);
    const propioDni = await buscar('dni=34.000.002', headers);
    expect(propioDni.json<{ id: string }[]>().map((p) => p.id)).toEqual([propio]);
    const deB = await buscar('dni=34000004', headers);
    expect(deB.statusCode).toBe(200);
    expect(deB.json()).toEqual([]);
  });

  it('tope por defecto de 20 con 25 pacientes, y limite=5', async () => {
    const headers = await autorizacion('recepcionista', CLINICA_A.id);
    expect((await buscar('apellido=Masivo', headers)).json<unknown[]>()).toHaveLength(20);
    const cinco = await buscar('apellido=Masivo&limite=5', headers);
    expect(cinco.json<{ apellido: string }[]>().map((p) => p.apellido)).toEqual([
      'Masivo00',
      'Masivo01',
      'Masivo02',
      'Masivo03',
      'Masivo04',
    ]);
  });

  it('los comodines % y _ se buscan como texto literal', async () => {
    const r = await buscar('apellido=%25%25', await autorizacion('recepcionista', CLINICA_A.id));
    expect(r.json()).toEqual([]);
  });
});

describe('GET /pacientes (odontólogo)', () => {
  it('ve solo pacientes con turno activo con su profesional', async () => {
    const headers = await autorizacion('odontologo', CLINICA_A.id, odontologoDeP);
    const porApellido = await buscar('apellido=gomez', headers);
    expect(porApellido.json<{ id: string }[]>().map((p) => p.id)).toEqual([propio]);
    expect(
      (await buscar('dni=34000002', headers)).json<{ id: string }[]>().map((p) => p.id),
    ).toEqual([propio]);
    expect((await buscar(`dni=34000003`, headers)).json()).toEqual([]);
    expect(ajeno).toBeTruthy();
  });
});

describe('auditoría de búsquedas', () => {
  it('ninguna búsqueda agrega registros a auditoria', async () => {
    const antes = await contarAuditoria(CLINICA_A.id);
    await buscar('apellido=gomez', await autorizacion('administrador', CLINICA_A.id));
    await buscar('dni=34000001', await autorizacion('recepcionista', CLINICA_A.id));
    await buscar('apellido=gomez', await autorizacion('odontologo', CLINICA_A.id, odontologoDeP));
    expect(await contarAuditoria(CLINICA_A.id)).toBe(antes);
    expect(await auditoriaDe(CLINICA_A.id, 'paciente')).toEqual([]);
  });
});
