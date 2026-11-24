import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CLINICA_A,
  CLINICA_B,
  cerrarPool,
  comoApp,
  comoAppSinContexto,
  consultarComoMigra,
  prepararBaseAuditoria,
  type EntornoAuditoria,
} from './soporte.js';

const TRN_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const TRN_B = 'bbbbbbbb-0000-4000-8000-000000000001';
const TRN_INTRUSO = 'cccccccc-0000-4000-8000-000000000001';

let entorno: EntornoAuditoria;

beforeAll(async () => {
  entorno = await prepararBaseAuditoria();

  await comoApp(CLINICA_A.id, (c) =>
    c.query(
      `INSERT INTO auditoria (clinica_id, actor_tipo, actor_id, accion, entidad, entidad_id)
       VALUES ($1, 'usuario', 'usr-a', 'creacion', 'turno', $2)`,
      [CLINICA_A.id, TRN_A],
    ),
  );
  await comoApp(CLINICA_B.id, (c) =>
    c.query(
      `INSERT INTO auditoria (clinica_id, actor_tipo, actor_id, accion, entidad, entidad_id)
       VALUES ($1, 'usuario', 'usr-b', 'creacion', 'turno', $2)`,
      [CLINICA_B.id, TRN_B],
    ),
  );
});

afterAll(cerrarPool);

describe('aislamiento multi-tenant de auditoria (RN-MT-01, DD-01)', () => {
  it('la clínica A solo ve sus registros y la clínica B solo los suyos', async () => {
    for (const [clinicaId, entidadEsperada] of [
      [CLINICA_A.id, TRN_A],
      [CLINICA_B.id, TRN_B],
    ] as const) {
      const { rows } = await comoApp(clinicaId, (c) =>
        c.query<{ clinica_id: string; entidad_id: string }>(
          'SELECT clinica_id, entidad_id FROM auditoria',
        ),
      );
      expect(rows).toEqual([{ clinica_id: clinicaId, entidad_id: entidadEsperada }]);
    }
  });

  it('la clínica A no puede insertar un registro con clinica_id de la clínica B (42501)', async () => {
    await expect(
      comoApp(CLINICA_A.id, (c) =>
        c.query(
          `INSERT INTO auditoria (clinica_id, actor_tipo, actor_id, accion, entidad, entidad_id)
           VALUES ($1, 'usuario', 'usr-a', 'creacion', 'turno', $2)`,
          [CLINICA_B.id, TRN_INTRUSO],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });

    const { rows } = await comoApp(CLINICA_B.id, (c) =>
      c.query<{ entidad_id: string }>('SELECT entidad_id FROM auditoria'),
    );
    expect(rows.map((r) => r.entidad_id)).toEqual([TRN_B]);
  });

  it('sin contexto de clínica falla cerrado en lectura e inserción', async () => {
    const lectura = await comoAppSinContexto((c) => c.query('SELECT id FROM auditoria'));
    expect(lectura.rows).toHaveLength(0);

    await expect(
      comoAppSinContexto((c) =>
        c.query(
          `INSERT INTO auditoria (clinica_id, actor_tipo, accion, entidad)
           VALUES ($1, 'sistema', 'creacion', 'turno')`,
          [CLINICA_A.id],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('el propietario migra sin contexto ve 0 filas (FORCE ROW LEVEL SECURITY)', async () => {
    const filas = await consultarComoMigra<{ id: string }>(
      entorno.urlMigra,
      'SELECT id::text AS id FROM auditoria',
    );
    expect(filas).toEqual([]);
  });
});
