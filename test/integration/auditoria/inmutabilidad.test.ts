import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  cerrarPool,
  comoApp,
  consultarComoMigra,
  crearClinicaSintetica,
  prepararBaseAuditoria,
  type EntornoAuditoria,
} from './soporte.js';

let entorno: EntornoAuditoria;

interface ErrorPg {
  readonly code?: string;
  readonly message?: string;
}

async function capturarError(promesa: Promise<unknown>): Promise<ErrorPg> {
  try {
    await promesa;
  } catch (error) {
    return error as ErrorPg;
  }
  throw new Error('Se esperaba que PostgreSQL rechazara la sentencia');
}

beforeAll(async () => {
  entorno = await prepararBaseAuditoria();
});

afterAll(cerrarPool);

const TRN_UUID = 'aaaaaaaa-0000-4000-8000-000000000001';
const PAC_UUID = 'bbbbbbbb-0000-4000-8000-000000000001';

describe('inmutabilidad append-only de auditoria (RN-AU-01)', () => {
  it('el rol app no puede ejecutar UPDATE, DELETE ni TRUNCATE (42501)', async () => {
    const clinica = await crearClinicaSintetica('inm-app');
    await comoApp(clinica.id, (c) =>
      c.query(
        `INSERT INTO auditoria (clinica_id, actor_tipo, actor_id, accion, entidad, entidad_id)
         VALUES ($1, 'usuario', 'usr-1', 'creacion', 'turno', $2)`,
        [clinica.id, TRN_UUID],
      ),
    );

    const errUpdate = await capturarError(
      comoApp(clinica.id, (c) => c.query("UPDATE auditoria SET accion = 'alterada'")),
    );
    const errDelete = await capturarError(
      comoApp(clinica.id, (c) => c.query('DELETE FROM auditoria')),
    );
    const errTruncate = await capturarError(
      comoApp(clinica.id, (c) => c.query('TRUNCATE TABLE auditoria')),
    );

    expect(errUpdate.code).toBe('42501');
    expect(errDelete.code).toBe('42501');
    expect(errTruncate.code).toBe('42501');

    const { rows } = await comoApp(clinica.id, (c) =>
      c.query<{ accion: string }>('SELECT accion FROM auditoria'),
    );
    expect(rows).toEqual([{ accion: 'creacion' }]);
  });

  it('el propietario migra tampoco puede ejecutar UPDATE ni DELETE (con o sin filas) por trigger (P0001)', async () => {
    const clinica = await crearClinicaSintetica('inm-migra');
    const insertada = await comoApp(clinica.id, (c) =>
      c.query<{ id: string }>(
        `INSERT INTO auditoria (clinica_id, actor_tipo, actor_id, accion, entidad, entidad_id)
         VALUES ($1, 'usuario', 'usr-2', 'creacion', 'paciente', $2)
         RETURNING id::text AS id`,
        [clinica.id, PAC_UUID],
      ),
    );
    const id = insertada.rows[0]?.id;

    const errUpdateFila = await capturarError(
      consultarComoMigra(entorno.urlMigra, "UPDATE auditoria SET accion = 'otra' WHERE id = $1", [
        id,
      ]),
    );
    const errUpdateVacio = await capturarError(
      consultarComoMigra(entorno.urlMigra, "UPDATE auditoria SET accion = 'otra' WHERE false"),
    );
    const errDeleteFila = await capturarError(
      consultarComoMigra(entorno.urlMigra, 'DELETE FROM auditoria WHERE id = $1', [id]),
    );
    const errDeleteVacio = await capturarError(
      consultarComoMigra(entorno.urlMigra, 'DELETE FROM auditoria WHERE false'),
    );

    for (const err of [errUpdateFila, errUpdateVacio, errDeleteFila, errDeleteVacio]) {
      expect(err.code).toBe('P0001');
      expect(err.message).toContain('append-only');
    }

    const { rows } = await comoApp(clinica.id, (c) =>
      c.query<{ id: string; accion: string }>(
        'SELECT id::text AS id, accion FROM auditoria WHERE id = $1',
        [id],
      ),
    );
    expect(rows).toEqual([{ id, accion: 'creacion' }]);
  });

  it('el propietario migra tampoco puede ejecutar TRUNCATE TABLE auditoria (P0001)', async () => {
    const clinica = await crearClinicaSintetica('inm-trunc');
    await comoApp(clinica.id, (c) =>
      c.query(
        `INSERT INTO auditoria (clinica_id, actor_tipo, accion, entidad)
         VALUES ($1, 'sistema', 'creacion', 'clinica')`,
        [clinica.id],
      ),
    );

    const errTruncate = await capturarError(
      consultarComoMigra(entorno.urlMigra, 'TRUNCATE TABLE auditoria'),
    );
    expect(errTruncate.code).toBe('P0001');
    expect(errTruncate.message).toContain('append-only');

    const { rows } = await comoApp(clinica.id, (c) => c.query('SELECT id FROM auditoria'));
    expect(rows).toHaveLength(1);
  });

  it('es compatible de forma literal con el INSERT de C-17 (aprovisionamiento de clínica)', async () => {
    const clinica = await crearClinicaSintetica('c17-compat');

    await comoApp(clinica.id, (c) =>
      c.query(
        `INSERT INTO auditoria (clinica_id, ocurrio_en, actor_tipo, accion, entidad, entidad_id)
         VALUES ($1, now(), 'sistema', 'creacion', 'clinica', $1)`,
        [clinica.id],
      ),
    );

    const { rows } = await comoApp(clinica.id, (c) =>
      c.query<{
        clinica_id: string;
        actor_tipo: string;
        actor_id: string | null;
        accion: string;
        entidad: string;
        entidad_id: string | null;
        datos_antes: unknown;
        datos_despues: unknown;
        ip: string | null;
      }>(
        `SELECT clinica_id, actor_tipo, actor_id, accion, entidad, entidad_id, datos_antes, datos_despues, host(ip) AS ip
           FROM auditoria`,
      ),
    );

    expect(rows).toEqual([
      {
        clinica_id: clinica.id,
        actor_tipo: 'sistema',
        actor_id: null,
        accion: 'creacion',
        entidad: 'clinica',
        entidad_id: clinica.id,
        datos_antes: null,
        datos_despues: null,
        ip: null,
      },
    ]);
  });
});
