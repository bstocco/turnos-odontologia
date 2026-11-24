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
  readonly constraint?: string;
}

async function intentar(
  clinicaId: string,
  sql: string,
  valores: unknown[] = [],
): Promise<ErrorPg | undefined> {
  try {
    await comoApp(clinicaId, (c) => c.query(sql, valores));
    return undefined;
  } catch (error) {
    return error as ErrorPg;
  }
}

beforeAll(async () => {
  entorno = await prepararBaseAuditoria();
});

afterAll(cerrarPool);

describe('esquema de auditoria (C07_001)', () => {
  it('define todas las columnas canónicas con sus tipos, identidad ALWAYS y FK a clinica', async () => {
    const columnas = await consultarComoMigra<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      is_identity: string;
      identity_generation: string | null;
    }>(
      entorno.urlMigra,
      `SELECT column_name, data_type, is_nullable, is_identity, identity_generation
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'auditoria'
        ORDER BY ordinal_position`,
    );

    expect(columnas).toEqual([
      {
        column_name: 'id',
        data_type: 'bigint',
        is_nullable: 'NO',
        is_identity: 'YES',
        identity_generation: 'ALWAYS',
      },
      {
        column_name: 'clinica_id',
        data_type: 'uuid',
        is_nullable: 'NO',
        is_identity: 'NO',
        identity_generation: null,
      },
      {
        column_name: 'ocurrio_en',
        data_type: 'timestamp with time zone',
        is_nullable: 'NO',
        is_identity: 'NO',
        identity_generation: null,
      },
      {
        column_name: 'actor_tipo',
        data_type: 'text',
        is_nullable: 'NO',
        is_identity: 'NO',
        identity_generation: null,
      },
      {
        column_name: 'actor_id',
        data_type: 'text',
        is_nullable: 'YES',
        is_identity: 'NO',
        identity_generation: null,
      },
      {
        column_name: 'accion',
        data_type: 'text',
        is_nullable: 'NO',
        is_identity: 'NO',
        identity_generation: null,
      },
      {
        column_name: 'entidad',
        data_type: 'text',
        is_nullable: 'NO',
        is_identity: 'NO',
        identity_generation: null,
      },
      {
        column_name: 'entidad_id',
        data_type: 'uuid',
        is_nullable: 'YES',
        is_identity: 'NO',
        identity_generation: null,
      },
      {
        column_name: 'datos_antes',
        data_type: 'jsonb',
        is_nullable: 'YES',
        is_identity: 'NO',
        identity_generation: null,
      },
      {
        column_name: 'datos_despues',
        data_type: 'jsonb',
        is_nullable: 'YES',
        is_identity: 'NO',
        identity_generation: null,
      },
      {
        column_name: 'ip',
        data_type: 'inet',
        is_nullable: 'YES',
        is_identity: 'NO',
        identity_generation: null,
      },
    ]);

    const fks = await consultarComoMigra<{ count: number }>(
      entorno.urlMigra,
      `SELECT count(*)::int AS count
         FROM pg_constraint
        WHERE conrelid = 'auditoria'::regclass
          AND contype = 'f'
          AND confrelid = 'clinica'::regclass`,
    );
    expect(fks[0]?.count).toBe(1);
  });

  it('crea los cuatro índices previstos para consultas de C-16', async () => {
    const indices = await consultarComoMigra<{ indexname: string }>(
      entorno.urlMigra,
      `SELECT indexname
         FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'auditoria'
        ORDER BY indexname`,
    );
    expect(indices.map((i) => i.indexname)).toEqual(
      expect.arrayContaining([
        'auditoria_clinica_actor_idx',
        'auditoria_clinica_entidad_id_idx',
        'auditoria_clinica_entidad_idx',
        'auditoria_clinica_ocurrio_idx',
      ]),
    );
  });

  it('pertenece a migra, tiene RLS forzada y el rol app solo tiene SELECT e INSERT', async () => {
    const tabla = await consultarComoMigra<{
      dueno: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      entorno.urlMigra,
      `SELECT pg_get_userbyid(relowner) AS dueno, relrowsecurity, relforcerowsecurity
         FROM pg_class
        WHERE relname = 'auditoria' AND relkind = 'r'`,
    );
    expect(tabla[0]).toEqual({
      dueno: 'migra',
      relrowsecurity: true,
      relforcerowsecurity: true,
    });

    const privs = await consultarComoMigra<{
      sel: boolean;
      ins: boolean;
      upd: boolean;
      del: boolean;
      trunc: boolean;
    }>(
      entorno.urlMigra,
      `SELECT has_table_privilege('app', 'auditoria', 'SELECT') AS sel,
              has_table_privilege('app', 'auditoria', 'INSERT') AS ins,
              has_table_privilege('app', 'auditoria', 'UPDATE') AS upd,
              has_table_privilege('app', 'auditoria', 'DELETE') AS del,
              has_table_privilege('app', 'auditoria', 'TRUNCATE') AS trunc`,
    );
    expect(privs[0]).toEqual({
      sel: true,
      ins: true,
      upd: false,
      del: false,
      trunc: false,
    });
  });

  it('asigna id secuencial creciente e instante UTC automático en inserciones completas', async () => {
    const clinica = await crearClinicaSintetica('secuencial');
    const entidadUuid = 'aaaaaaaa-0000-4000-8000-000000000001';

    const { primera, segunda } = await comoApp(clinica.id, async (c) => {
      const r1 = await c.query<{
        id: string;
        ocurrio_en: Date;
        actor_tipo: string;
        actor_id: string | null;
        accion: string;
        entidad: string;
        entidad_id: string | null;
        datos_antes: unknown;
        datos_despues: unknown;
        ip: string | null;
      }>(
        `INSERT INTO auditoria
           (clinica_id, actor_tipo, actor_id, accion, entidad, entidad_id, datos_antes, datos_despues, ip)
         VALUES ($1, 'usuario', 'usr-1', 'creacion', 'turno', $2, '{"estado":"libre"}'::jsonb, '{"estado":"confirmado"}'::jsonb, '192.0.2.10'::inet)
         RETURNING id::text AS id, ocurrio_en, actor_tipo, actor_id, accion, entidad, entidad_id, datos_antes, datos_despues, host(ip) AS ip`,
        [clinica.id, entidadUuid],
      );
      const r2 = await c.query<{ id: string }>(
        `INSERT INTO auditoria (clinica_id, actor_tipo, actor_id, accion, entidad, entidad_id)
         VALUES ($1, 'usuario', 'usr-1', 'modificacion', 'turno', $2)
         RETURNING id::text AS id`,
        [clinica.id, entidadUuid],
      );
      return { primera: r1.rows[0]!, segunda: r2.rows[0]! };
    });

    expect(BigInt(segunda.id)).toBeGreaterThan(BigInt(primera.id));
    expect(primera.ocurrio_en).toBeInstanceOf(Date);
    expect(primera.actor_tipo).toBe('usuario');
    expect(primera.actor_id).toBe('usr-1');
    expect(primera.accion).toBe('creacion');
    expect(primera.entidad).toBe('turno');
    expect(primera.entidad_id).toBe(entidadUuid);
    expect(primera.datos_antes).toEqual({ estado: 'libre' });
    expect(primera.datos_despues).toEqual({ estado: 'confirmado' });
    expect(primera.ip).toBe('192.0.2.10');
  });

  it('acepta usuario, paciente_enlace y sistema (con y sin actor_id)', async () => {
    const clinica = await crearClinicaSintetica('actores');
    const turnoId = 'bbbbbbbb-0000-4000-8000-000000000001';
    const notifId1 = 'cccccccc-0000-4000-8000-000000000001';
    const notifId2 = 'cccccccc-0000-4000-8000-000000000002';

    await comoApp(clinica.id, async (c) => {
      await c.query(
        `INSERT INTO auditoria (clinica_id, actor_tipo, actor_id, accion, entidad, entidad_id)
         VALUES ($1, 'usuario', 'usr-10', 'creacion', 'turno', $2),
                ($1, 'paciente_enlace', 'tok-10', 'confirmacion', 'turno', $2),
                ($1, 'sistema', NULL, 'recordatorio', 'notificacion', $3),
                ($1, 'sistema', 'worker-24h', 'recordatorio', 'notificacion', $4)`,
        [clinica.id, turnoId, notifId1, notifId2],
      );
    });

    const { rows } = await comoApp(clinica.id, (c) =>
      c.query<{ actor_tipo: string; actor_id: string | null }>(
        'SELECT actor_tipo, actor_id FROM auditoria ORDER BY id',
      ),
    );
    expect(rows).toEqual([
      { actor_tipo: 'usuario', actor_id: 'usr-10' },
      { actor_tipo: 'paciente_enlace', actor_id: 'tok-10' },
      { actor_tipo: 'sistema', actor_id: null },
      { actor_tipo: 'sistema', actor_id: 'worker-24h' },
    ]);
  });

  it('rechaza actor_tipo inválido y actor_id faltante o blanco según tipo de actor (23514)', async () => {
    const clinica = await crearClinicaSintetica('checks-actor');

    const tipoInvalido = await intentar(
      clinica.id,
      `INSERT INTO auditoria (clinica_id, actor_tipo, actor_id, accion, entidad)
       VALUES ($1, 'anonimo', 'x', 'creacion', 'turno')`,
      [clinica.id],
    );
    expect(tipoInvalido?.code).toBe('23514');
    expect(tipoInvalido?.constraint).toBe('auditoria_actor_tipo_check');

    for (const [actorTipo, actorId] of [
      ['usuario', null],
      ['usuario', '   '],
      ['paciente_enlace', null],
      ['paciente_enlace', ''],
      ['sistema', '   '],
    ] as const) {
      const error = await intentar(
        clinica.id,
        `INSERT INTO auditoria (clinica_id, actor_tipo, actor_id, accion, entidad)
         VALUES ($1, $2, $3, 'creacion', 'turno')`,
        [clinica.id, actorTipo, actorId],
      );
      expect(error?.code).toBe('23514');
      expect(error?.constraint).toBe('auditoria_actor_id_check');
    }
  });

  it('rechaza accion o entidad inválidos (23514), entidad_id no-UUID (22P02) e inserción sin clinica_id', async () => {
    const clinica = await crearClinicaSintetica('checks-formato');

    for (const accion of ['', 'Creacion', 'crear-turno', '1accion']) {
      const error = await intentar(
        clinica.id,
        `INSERT INTO auditoria (clinica_id, actor_tipo, accion, entidad)
         VALUES ($1, 'sistema', $2, 'turno')`,
        [clinica.id, accion],
      );
      expect(error?.code).toBe('23514');
      expect(error?.constraint).toBe('auditoria_accion_formato_check');
    }

    for (const entidad of ['', 'Turno', 'turno-dental', '1entidad']) {
      const error = await intentar(
        clinica.id,
        `INSERT INTO auditoria (clinica_id, actor_tipo, accion, entidad)
         VALUES ($1, 'sistema', 'creacion', $2)`,
        [clinica.id, entidad],
      );
      expect(error?.code).toBe('23514');
      expect(error?.constraint).toBe('auditoria_entidad_formato_check');
    }

    const entidadIdInvalido = await intentar(
      clinica.id,
      `INSERT INTO auditoria (clinica_id, actor_tipo, accion, entidad, entidad_id)
       VALUES ($1, 'sistema', 'creacion', 'turno', 'no-es-uuid')`,
      [clinica.id],
    );
    expect(entidadIdInvalido?.code).toBe('22P02');

    const sinClinica = await intentar(
      clinica.id,
      `INSERT INTO auditoria (actor_tipo, accion, entidad) VALUES ('sistema', 'creacion', 'turno')`,
    );
    expect(['23502', '42501']).toContain(sinClinica?.code);
  });
});
