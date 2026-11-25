import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CLINICA_A,
  CLINICA_B,
  cerrarPool,
  comoApp,
  insertarProfesional,
  insertarUsuario,
  prepararBaseDeConfiguracion,
} from './soporte.js';

beforeAll(async () => {
  await prepararBaseDeConfiguracion();
});
afterAll(cerrarPool);

async function codigoDeError(operacion: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await operacion();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe('usuario.profesional_id: FK compuesta (C08_001)', () => {
  it('rechaza un profesional de otra clínica con 23503', async () => {
    const profesionalDeB = await insertarProfesional(CLINICA_B.id);
    const codigo = await codigoDeError(() =>
      insertarUsuario(CLINICA_A.id, 'odontologo', profesionalDeB),
    );
    expect(codigo).toBe('23503');
  });

  it('rechaza un profesional inexistente con 23503', async () => {
    const codigo = await codigoDeError(() =>
      insertarUsuario(CLINICA_A.id, 'odontologo', randomUUID()),
    );
    expect(codigo).toBe('23503');
  });

  it('rechaza vincular por UPDATE un profesional de otra clínica', async () => {
    const usuario = await insertarUsuario(CLINICA_A.id, 'odontologo');
    const profesionalDeB = await insertarProfesional(CLINICA_B.id);
    const codigo = await codigoDeError(() =>
      comoApp(CLINICA_A.id, (c) =>
        c.query('UPDATE usuario SET profesional_id = $1 WHERE id = $2', [profesionalDeB, usuario]),
      ),
    );
    expect(codigo).toBe('23503');
  });

  it('acepta profesional_id nulo (administradores y recepcionistas)', async () => {
    const id = await insertarUsuario(CLINICA_A.id, 'administrador', null);
    const { rows } = await comoApp(CLINICA_A.id, (c) =>
      c.query('SELECT profesional_id FROM usuario WHERE id = $1', [id]),
    );
    expect(rows[0]).toEqual({ profesional_id: null });
  });

  it('acepta un profesional de la propia clínica', async () => {
    const profesional = await insertarProfesional(CLINICA_A.id);
    const id = await insertarUsuario(CLINICA_A.id, 'odontologo', profesional);
    const { rows } = await comoApp(CLINICA_A.id, (c) =>
      c.query('SELECT profesional_id FROM usuario WHERE id = $1', [id]),
    );
    expect(rows[0]).toEqual({ profesional_id: profesional });
  });
});
