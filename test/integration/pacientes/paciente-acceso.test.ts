import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ESTADOS_ACTIVOS_LIST } from '../../../src/domain/turno/estado.js';
import { crearAccesoPacientesReader } from '../../../src/infrastructure/db/repositories/paciente-acceso/index.js';
import { crearPacienteRepository } from '../../../src/infrastructure/db/repositories/paciente/index.js';
import {
  CLINICA_A,
  CLINICA_B,
  cerrarPool,
  comoApp,
  insertarPaciente,
  insertarProfesional,
  insertarTurno,
  prepararBaseDePacientes,
} from './soporte.js';

let profP: string;
let profQ: string;
let confirmadoConP: string;
let atendidoConP: string;
let soloCanceladoConP: string;
let soloConQ: string;
let sinTurnos: string;
let pacienteDeB: string;

beforeAll(async () => {
  await prepararBaseDePacientes();
  profP = await insertarProfesional(CLINICA_A.id, 'ProfP');
  profQ = await insertarProfesional(CLINICA_A.id, 'ProfQ');
  confirmadoConP = await insertarPaciente(CLINICA_A.id, { apellido: 'Álvarez', dni: '20000001' });
  atendidoConP = await insertarPaciente(CLINICA_A.id, { apellido: 'Alvarado', dni: '20000002' });
  soloCanceladoConP = await insertarPaciente(CLINICA_A.id, { apellido: 'Alonso', dni: '20000003' });
  soloConQ = await insertarPaciente(CLINICA_A.id, { apellido: 'Alcázar', dni: '20000004' });
  sinTurnos = await insertarPaciente(CLINICA_A.id, { apellido: 'Alba', dni: '20000005' });
  pacienteDeB = await insertarPaciente(CLINICA_B.id, { apellido: 'Álvarez', dni: '20000001' });
  await insertarTurno(CLINICA_A.id, confirmadoConP, profP, 'confirmado');
  await insertarTurno(CLINICA_A.id, atendidoConP, profP, 'atendido');
  await insertarTurno(CLINICA_A.id, soloCanceladoConP, profP, 'cancelado');
  await insertarTurno(CLINICA_A.id, soloConQ, profQ, 'confirmado');
});
afterAll(cerrarPool);

describe('crearAccesoPacientesReader.esPacienteDeProfesional', () => {
  it('verdadero con turno activo (confirmado / atendido) con el profesional', async () => {
    const r = await comoApp(CLINICA_A.id, async (c) => {
      const lector = crearAccesoPacientesReader(c);
      return [
        await lector.esPacienteDeProfesional(confirmadoConP, profP),
        await lector.esPacienteDeProfesional(atendidoConP, profP),
      ];
    });
    expect(r).toEqual([true, true]);
  });

  it('falso con turno solo cancelado, solo con otro profesional o sin turnos', async () => {
    const r = await comoApp(CLINICA_A.id, async (c) => {
      const lector = crearAccesoPacientesReader(c);
      return [
        await lector.esPacienteDeProfesional(soloCanceladoConP, profP),
        await lector.esPacienteDeProfesional(soloConQ, profP),
        await lector.esPacienteDeProfesional(sinTurnos, profP),
        await lector.esPacienteDeProfesional(confirmadoConP, profQ),
      ];
    });
    expect(r).toEqual([false, false, false, false]);
  });

  it('falso para id no UUID, inexistente y paciente de otra clínica', async () => {
    const r = await comoApp(CLINICA_A.id, async (c) => {
      const lector = crearAccesoPacientesReader(c);
      return [
        await lector.esPacienteDeProfesional('no-es-uuid', profP),
        await lector.esPacienteDeProfesional(randomUUID(), profP),
        await lector.esPacienteDeProfesional(pacienteDeB, profP),
      ];
    });
    expect(r).toEqual([false, false, false]);
  });

  it('cuenta exactamente los estados activos', async () => {
    for (const estado of ESTADOS_ACTIVOS_LIST) {
      const pacienteId = await insertarPaciente(CLINICA_A.id, {
        apellido: `Estado${estado.length}`,
        dni: String(30000000 + ESTADOS_ACTIVOS_LIST.indexOf(estado)),
      });
      await insertarTurno(CLINICA_A.id, pacienteId, profP, estado);
      const resultado = await comoApp(CLINICA_A.id, (c) =>
        crearAccesoPacientesReader(c).esPacienteDeProfesional(pacienteId, profP),
      );
      expect(resultado, estado).toBe(true);
    }
    const reprogramado = await insertarPaciente(CLINICA_A.id, {
      apellido: 'Repro',
      dni: '30000009',
    });
    await insertarTurno(CLINICA_A.id, reprogramado, profP, 'reprogramado');
    expect(
      await comoApp(CLINICA_A.id, (c) =>
        crearAccesoPacientesReader(c).esPacienteDeProfesional(reprogramado, profP),
      ),
    ).toBe(false);
  });
});

describe('búsquedas filtradas por profesional', () => {
  it('por DNI: solo con turno activo con el profesional', async () => {
    const r = await comoApp(CLINICA_A.id, async (c) => {
      const lector = crearAccesoPacientesReader(c);
      return [
        await lector.buscarPorDniDeProfesional('20000001', profP),
        await lector.buscarPorDniDeProfesional('20000003', profP),
        await lector.buscarPorDniDeProfesional('20000004', profP),
        await lector.buscarPorDniDeProfesional('20000004', profQ),
      ];
    });
    expect(r.map((p) => p?.id ?? null)).toEqual([confirmadoConP, null, null, soloConQ]);
  });

  it('por apellido: solo pacientes con turno activo con P, orden y LIMIT', async () => {
    const todos = await comoApp(CLINICA_A.id, (c) =>
      crearAccesoPacientesReader(c).buscarPorApellidoDeProfesional('al', profP, 50),
    );
    expect(todos.map((p) => p.id)).toEqual([atendidoConP, confirmadoConP]); // Alvarado, Álvarez
    const uno = await comoApp(CLINICA_A.id, (c) =>
      crearAccesoPacientesReader(c).buscarPorApellidoDeProfesional('al', profP, 1),
    );
    expect(uno.map((p) => p.id)).toEqual([atendidoConP]);
  });

  it('el LIMIT se aplica después del filtro de alcance (no devuelve de menos)', async () => {
    const prof = await insertarProfesional(CLINICA_A.id, 'ProfLimite');
    const propios: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const id = await insertarPaciente(CLINICA_A.id, { apellido: `Zz${i}`, dni: `5000000${i}` });
      await insertarTurno(CLINICA_A.id, id, prof, 'confirmado');
      propios.push(id);
    }
    await insertarPaciente(CLINICA_A.id, { apellido: 'Zz0Ajeno', dni: '50000009' });
    const lista = await comoApp(CLINICA_A.id, (c) =>
      crearAccesoPacientesReader(c).buscarPorApellidoDeProfesional('zz', prof, 3),
    );
    expect(lista.map((p) => p.id)).toEqual(propios);
  });

  it('equivale a buscarPorApellido de C-05 cuando todos tienen turno con P (tildes, mayúsculas, % y _)', async () => {
    const prof = await insertarProfesional(CLINICA_A.id, 'ProfEquiv');
    for (const [i, apellido] of ['Équis', 'EQUIS', 'equis_x', 'equis%y', 'equisZ'].entries()) {
      const id = await insertarPaciente(CLINICA_A.id, { apellido, dni: `6000000${i}` });
      await insertarTurno(CLINICA_A.id, id, prof, 'pendiente_confirmacion');
    }
    for (const prefijo of ['equ', 'ÉQU', 'equis_', 'equis%', '%', '_']) {
      const [base, filtrado] = await comoApp(CLINICA_A.id, async (c) => [
        await crearPacienteRepository(c).buscarPorApellido(prefijo, 50),
        await crearAccesoPacientesReader(c).buscarPorApellidoDeProfesional(prefijo, prof, 50),
      ]);
      const propios = base.filter((p) => p.dni.startsWith('6000000'));
      expect(
        filtrado.map((p) => p.id),
        prefijo,
      ).toEqual(propios.map((p) => p.id));
    }
  });

  it('no cruza clínicas: el profesional de A no ve pacientes de B', async () => {
    const lista = await comoApp(CLINICA_B.id, (c) =>
      crearAccesoPacientesReader(c).buscarPorApellidoDeProfesional('alv', profP, 50),
    );
    expect(lista).toEqual([]);
  });
});
