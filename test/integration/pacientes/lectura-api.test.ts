import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CLINICA_A,
  CLINICA_B,
  auditoriaDe,
  autorizacion,
  cerrarPool,
  crearAppDePrueba,
  insertarPaciente,
  insertarProfesional,
  insertarTurno,
  insertarUsuario,
  prepararBaseDePacientes,
} from './soporte.js';

let app: FastifyInstance;
let profP: string;
let profQ: string;
let odontologoDeP: string;
let odontologoSinVinculo: string;
let ficha: string;
let conTurnoConfirmadoConP: string;
let soloConQ: string;
let soloCanceladoConP: string;
let deB: string;

beforeAll(async () => {
  await prepararBaseDePacientes();
  app = (await crearAppDePrueba()).app;
  profP = await insertarProfesional(CLINICA_A.id, 'P');
  profQ = await insertarProfesional(CLINICA_A.id, 'Q');
  odontologoDeP = await insertarUsuario(CLINICA_A.id, 'odontologo', profP);
  odontologoSinVinculo = await insertarUsuario(CLINICA_A.id, 'odontologo', null);
  ficha = await insertarPaciente(CLINICA_A.id, {
    nombre: 'Valeria',
    apellido: 'Ficticia',
    dni: '33000001',
    telefono: '+5491155553333',
    email: 'valeria@ejemplo.invalid',
    obraSocial: 'Mutual Sintetica',
  });
  conTurnoConfirmadoConP = await insertarPaciente(CLINICA_A.id, {
    apellido: 'ConP',
    dni: '33000002',
  });
  soloConQ = await insertarPaciente(CLINICA_A.id, { apellido: 'SoloQ', dni: '33000003' });
  soloCanceladoConP = await insertarPaciente(CLINICA_A.id, {
    apellido: 'Cancelado',
    dni: '33000004',
  });
  deB = await insertarPaciente(CLINICA_B.id, { apellido: 'DeB', dni: '33000005' });
  await insertarTurno(CLINICA_A.id, conTurnoConfirmadoConP, profP, 'confirmado');
  await insertarTurno(CLINICA_A.id, soloConQ, profQ, 'confirmado');
  await insertarTurno(CLINICA_A.id, soloCanceladoConP, profP, 'cancelado');
});
afterAll(async () => {
  await app.close();
  await cerrarPool();
});

const get = async (id: string, headers: { authorization: string }) =>
  app.inject({ method: 'GET', url: `/api/v1/pacientes/${id}`, headers });

describe('GET /pacientes/{id} (administración y recepción)', () => {
  it.each(['recepcionista', 'administrador'] as const)(
    '%s lee la ficha completa y queda un lectura_ficha por lectura',
    async (rol) => {
      const usuario = randomUUID();
      const headers = await autorizacion(rol, CLINICA_A.id, usuario);
      const antes = (await auditoriaDe(CLINICA_A.id, 'paciente', ficha)).length;
      const r1 = await get(ficha, headers);
      const r2 = await get(ficha, headers);
      expect(r1.statusCode).toBe(200);
      expect(r1.json()).toEqual({
        id: ficha,
        nombre: 'Valeria',
        apellido: 'Ficticia',
        dni: '33000001',
        telefono: '+5491155553333',
        email: 'valeria@ejemplo.invalid',
        obraSocial: 'Mutual Sintetica',
        creadoEn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
      });
      expect(r2.statusCode).toBe(200);
      const eventos = (await auditoriaDe(CLINICA_A.id, 'paciente', ficha)).slice(antes);
      expect(eventos).toHaveLength(2);
      for (const e of eventos) {
        expect(e).toMatchObject({
          accion: 'lectura_ficha',
          actor_id: usuario,
          datos_antes: null,
          datos_despues: null,
        });
        expect(e.ip).toBeTruthy();
      }
    },
  );

  it('404 para paciente de otra clínica, inexistente y mal formado, sin auditar', async () => {
    const headers = await autorizacion('administrador', CLINICA_A.id);
    const antes = (await auditoriaDe(CLINICA_A.id, 'paciente')).length;
    for (const id of [deB, randomUUID(), 'no-es-un-uuid']) {
      const r = await get(id, headers);
      expect(r.statusCode, id).toBe(404);
      expect(r.json()).toMatchObject({ codigo: 'RECURSO_NO_ENCONTRADO' });
    }
    expect((await auditoriaDe(CLINICA_A.id, 'paciente')).length).toBe(antes);
    expect(await auditoriaDe(CLINICA_B.id, 'paciente', deB)).toEqual([]);
  });
});

describe('GET /pacientes/{id} (odontólogo)', () => {
  it('lee a un paciente con turno confirmado con su profesional, auditado', async () => {
    const r = await get(
      conTurnoConfirmadoConP,
      await autorizacion('odontologo', CLINICA_A.id, odontologoDeP),
    );
    expect(r.statusCode).toBe(200);
    const eventos = await auditoriaDe(CLINICA_A.id, 'paciente', conTurnoConfirmadoConP);
    expect(eventos.map((e) => e.accion)).toEqual(['lectura_ficha']);
    expect(eventos[0]?.actor_id).toBe(odontologoDeP);
  });

  it('404 sin auditar para paciente solo con otro profesional, solo con turno cancelado o sin turnos', async () => {
    const headers = await autorizacion('odontologo', CLINICA_A.id, odontologoDeP);
    for (const id of [soloConQ, soloCanceladoConP, ficha, deB]) {
      const r = await get(id, headers);
      expect(r.statusCode, id).toBe(404);
      expect(r.json()).toMatchObject({ codigo: 'RECURSO_NO_ENCONTRADO' });
    }
    expect(await auditoriaDe(CLINICA_A.id, 'paciente', soloConQ)).toEqual([]);
    expect(await auditoriaDe(CLINICA_A.id, 'paciente', soloCanceladoConP)).toEqual([]);
  });

  it('403 para un odontólogo sin profesional vinculado', async () => {
    const r = await get(
      conTurnoConfirmadoConP,
      await autorizacion('odontologo', CLINICA_A.id, odontologoSinVinculo),
    );
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ codigo: 'ACCESO_PROHIBIDO' });
  });

  it('403 para un odontólogo cuyo usuario no existe en la clínica', async () => {
    const r = await get(
      conTurnoConfirmadoConP,
      await autorizacion('odontologo', CLINICA_A.id, randomUUID()),
    );
    expect(r.statusCode).toBe(403);
  });
});
