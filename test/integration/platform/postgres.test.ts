import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configDeBaseDePrueba } from '../../support/base-de-datos.js';

/**
 * Spike R-04 y R-05 (diseño D14). Verifica en PostgreSQL real las capacidades de las que depende
 * el modelo de datos. Las tablas son de uso exclusivo del spike y viven en el esquema `spike`:
 * NO son migraciones (la tabla real de turnos es de C-09).
 */
const config = configDeBaseDePrueba();
const URL_MIGRA = config.testDatabaseMigrationUrl as string;
const URL_APP = config.testDatabaseUrl as string;

const CLINICA_A = '11111111-1111-4111-8111-111111111111';
const CLINICA_B = '22222222-2222-4222-8222-222222222222';

let migra: pg.Client;
let app: pg.Client;

async function codigoDeError(
  consulta: Promise<unknown>,
): Promise<{ code?: string; constraint?: string }> {
  try {
    await consulta;
  } catch (error) {
    const e = error as { code?: string; constraint?: string };
    return { code: e.code, constraint: e.constraint };
  }
  throw new Error('Se esperaba que PostgreSQL rechazara la sentencia');
}

beforeAll(async () => {
  migra = new pg.Client({ connectionString: URL_MIGRA });
  app = new pg.Client({ connectionString: URL_APP });
  await migra.connect();
  await app.connect();
  await migra.query('DROP SCHEMA IF EXISTS spike CASCADE');
  await migra.query('CREATE SCHEMA spike');
  await migra.query('GRANT USAGE ON SCHEMA spike TO app');
});

afterAll(async () => {
  await migra.query('DROP SCHEMA IF EXISTS spike CASCADE');
  await migra.end();
  await app.end();
});

describe('R-05: extensión btree_gist', () => {
  it('el rol de migraciones puede crearla (extensión de confianza, sin superusuario)', async () => {
    const rol = await migra.query<{ rolsuper: boolean }>(
      'SELECT rolsuper FROM pg_roles WHERE rolname = current_user',
    );
    expect(rol.rows[0]?.rolsuper).toBe(false);

    await migra.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
    const ext = await migra.query('SELECT 1 FROM pg_extension WHERE extname = $1', ['btree_gist']);
    expect(ext.rowCount).toBe(1);
  });
});

describe('R-04 y exclusión: solapamientos por profesional y por sillón', () => {
  beforeAll(async () => {
    await migra.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
    await migra.query(`
      CREATE TABLE spike.turno (
        id                serial PRIMARY KEY,
        clinica_id        uuid        NOT NULL,
        profesional_id    int         NOT NULL,
        sillon_id         int         NOT NULL,
        inicio            timestamptz NOT NULL,
        fin               timestamptz NOT NULL,
        buffer_minutos    int         NOT NULL DEFAULT 0 CHECK (buffer_minutos >= 0),
        fin_sillon        timestamptz NOT NULL,
        estado            text        NOT NULL DEFAULT 'confirmado',
        rango_profesional tstzrange GENERATED ALWAYS AS (tstzrange(inicio, fin, '[)')) STORED,
        rango_sillon      tstzrange GENERATED ALWAYS AS (tstzrange(inicio, fin_sillon, '[)')) STORED,
        CONSTRAINT fin_sillon_coherente
          CHECK (fin_sillon = fin + make_interval(mins => buffer_minutos)),
        CONSTRAINT turno_sin_solape_profesional
          EXCLUDE USING gist (clinica_id WITH =, profesional_id WITH =, rango_profesional WITH &&)
          WHERE (estado NOT IN ('cancelado', 'reprogramado')),
        CONSTRAINT turno_sin_solape_sillon
          EXCLUDE USING gist (clinica_id WITH =, sillon_id WITH =, rango_sillon WITH &&)
          WHERE (estado NOT IN ('cancelado', 'reprogramado'))
      )`);
  });

  /** Inserta calculando fin y fin_sillon como lo hará la aplicación (la base solo verifica). */
  async function insertar(t: {
    clinica?: string;
    profesional: number;
    sillon: number;
    inicio: string;
    minutos: number;
    buffer?: number;
    estado?: string;
  }) {
    const buffer = t.buffer ?? 0;
    return migra.query(
      `INSERT INTO spike.turno
         (clinica_id, profesional_id, sillon_id, inicio, fin, buffer_minutos, fin_sillon, estado)
       VALUES ($1, $2, $3, $4::timestamptz,
               $4::timestamptz + make_interval(mins => $5::int),
               $6::int,
               $4::timestamptz + make_interval(mins => $5::int) + make_interval(mins => $6::int),
               $7)
       RETURNING id`,
      [
        t.clinica ?? CLINICA_A,
        t.profesional,
        t.sillon,
        t.inicio,
        t.minutos,
        buffer,
        t.estado ?? 'confirmado',
      ],
    );
  }

  const limpiar = () => migra.query('TRUNCATE spike.turno');

  it('las columnas de rango pueden ser generadas con tstzrange sobre timestamptz', async () => {
    await limpiar();
    const { rows } = await insertar({
      profesional: 1,
      sillon: 1,
      inicio: '2026-03-02T10:00:00Z',
      minutos: 30,
      buffer: 15,
    });
    const r = await migra.query<{ lo: string; hi: string; inc: boolean; inc_hi: boolean }>(
      `SELECT lower(rango_sillon)::text AS lo, upper(rango_sillon)::text AS hi,
              lower_inc(rango_sillon) AS inc, upper_inc(rango_sillon) AS inc_hi
         FROM spike.turno WHERE id = $1`,
      [rows[0]?.id],
    );
    expect(r.rows[0]?.inc).toBe(true); // [inicio
    expect(r.rows[0]?.inc_hi).toBe(false); // fin)
  });

  it('rechaza un solape del mismo profesional (aunque use otro sillón)', async () => {
    await limpiar();
    await insertar({ profesional: 1, sillon: 1, inicio: '2026-03-02T10:00:00Z', minutos: 30 });
    const error = await codigoDeError(
      insertar({ profesional: 1, sillon: 2, inicio: '2026-03-02T10:15:00Z', minutos: 30 }),
    );
    expect(error.code).toBe('23P01');
    expect(error.constraint).toBe('turno_sin_solape_profesional');
  });

  it('rechaza un solape del mismo sillón (aunque use otro profesional)', async () => {
    await limpiar();
    await insertar({ profesional: 1, sillon: 1, inicio: '2026-03-02T10:00:00Z', minutos: 30 });
    const error = await codigoDeError(
      insertar({ profesional: 2, sillon: 1, inicio: '2026-03-02T10:15:00Z', minutos: 30 }),
    );
    expect(error.code).toBe('23P01');
    expect(error.constraint).toBe('turno_sin_solape_sillon');
  });

  it('acepta rangos contiguos: termina a las 10:00 y el siguiente empieza a las 10:00', async () => {
    await limpiar();
    await insertar({ profesional: 1, sillon: 1, inicio: '2026-03-02T09:30:00Z', minutos: 30 });
    await expect(
      insertar({ profesional: 1, sillon: 1, inicio: '2026-03-02T10:00:00Z', minutos: 30 }),
    ).resolves.toBeDefined();
  });

  it('el buffer bloquea al sillón pero no al profesional (RN-AG-05)', async () => {
    await limpiar();
    // 10:00-10:30 con 15 min de limpieza: el sillón queda ocupado hasta las 10:45.
    await insertar({
      profesional: 1,
      sillon: 1,
      inicio: '2026-03-02T10:00:00Z',
      minutos: 30,
      buffer: 15,
    });

    // Otro profesional en el mismo sillón a las 10:30: lo bloquea el buffer.
    const sillon = await codigoDeError(
      insertar({ profesional: 2, sillon: 1, inicio: '2026-03-02T10:30:00Z', minutos: 30 }),
    );
    expect(sillon.constraint).toBe('turno_sin_solape_sillon');

    // El mismo profesional en otro sillón a las 10:30: el buffer no lo toca.
    await expect(
      insertar({ profesional: 1, sillon: 2, inicio: '2026-03-02T10:30:00Z', minutos: 30 }),
    ).resolves.toBeDefined();

    // El sillón vuelve a estar libre a las 10:45 exactas.
    await expect(
      insertar({ profesional: 3, sillon: 1, inicio: '2026-03-02T10:45:00Z', minutos: 30 }),
    ).resolves.toBeDefined();
  });

  it('un turno cancelado o reprogramado libera el horario', async () => {
    await limpiar();
    await insertar({
      profesional: 1,
      sillon: 1,
      inicio: '2026-03-02T10:00:00Z',
      minutos: 30,
      estado: 'cancelado',
    });
    await insertar({
      profesional: 1,
      sillon: 1,
      inicio: '2026-03-02T10:00:00Z',
      minutos: 30,
      estado: 'reprogramado',
    });
    await expect(
      insertar({ profesional: 1, sillon: 1, inicio: '2026-03-02T10:00:00Z', minutos: 30 }),
    ).resolves.toBeDefined();
  });

  it('dos clínicas pueden usar los mismos ids de profesional y sillón sin chocar', async () => {
    await limpiar();
    await insertar({
      clinica: CLINICA_A,
      profesional: 1,
      sillon: 1,
      inicio: '2026-03-02T10:00:00Z',
      minutos: 30,
    });
    await expect(
      insertar({
        clinica: CLINICA_B,
        profesional: 1,
        sillon: 1,
        inicio: '2026-03-02T10:00:00Z',
        minutos: 30,
      }),
    ).resolves.toBeDefined();
  });

  it('dos reservas concurrentes sobre el mismo hueco: gana una y la otra recibe 23P01', async () => {
    await limpiar();
    const clientes = await Promise.all(
      [1, 2].map(async () => {
        const c = new pg.Client({ connectionString: URL_MIGRA });
        await c.connect();
        return c;
      }),
    );
    try {
      const intentos = clientes.map((c, i) =>
        c
          .query(
            `INSERT INTO spike.turno (clinica_id, profesional_id, sillon_id, inicio, fin, fin_sillon)
             VALUES ($1, 1, $2, '2026-03-02T11:00:00Z', '2026-03-02T11:30:00Z', '2026-03-02T11:30:00Z')`,
            [CLINICA_A, i + 1],
          )
          .then(() => 'ok' as const)
          .catch((e: { code?: string }) => e.code ?? 'error'),
      );
      const resultados = (await Promise.all(intentos)).sort();
      expect(resultados).toEqual(['23P01', 'ok']);
    } finally {
      await Promise.all(clientes.map((c) => c.end()));
    }
  });
});

describe('R-04: fin_sillon como columna común y no generada', () => {
  it('timestamptz + interval es STABLE, por eso no puede usarse en una columna generada', async () => {
    const r = await migra.query<{ provolatile: string }>(
      "SELECT provolatile FROM pg_proc WHERE proname = 'timestamptz_pl_interval'",
    );
    expect(r.rows[0]?.provolatile).toBe('s'); // s = stable, i = immutable
  });

  it('PostgreSQL rechaza la columna generada con timestamptz + interval', async () => {
    const error = await codigoDeError(
      migra.query(`
        CREATE TABLE spike.turno_generado (
          fin            timestamptz NOT NULL,
          buffer_minutos int         NOT NULL,
          fin_sillon     timestamptz GENERATED ALWAYS AS (fin + make_interval(mins => buffer_minutos)) STORED
        )`),
    );
    expect(error.code).toBe('42P17'); // invalid_object_definition: expresión no inmutable
  });

  it('la columna común con CHECK de coherencia acepta valores correctos y rechaza incoherentes', async () => {
    await migra.query('TRUNCATE spike.turno');
    await expect(
      migra.query(
        `INSERT INTO spike.turno (clinica_id, profesional_id, sillon_id, inicio, fin, buffer_minutos, fin_sillon)
         VALUES ($1, 9, 9, '2026-03-03T10:00:00Z', '2026-03-03T10:30:00Z', 15, '2026-03-03T10:45:00Z')`,
        [CLINICA_A],
      ),
    ).resolves.toBeDefined();

    const error = await codigoDeError(
      migra.query(
        `INSERT INTO spike.turno (clinica_id, profesional_id, sillon_id, inicio, fin, buffer_minutos, fin_sillon)
         VALUES ($1, 8, 8, '2026-03-03T10:00:00Z', '2026-03-03T10:30:00Z', 15, '2026-03-03T10:40:00Z')`,
        [CLINICA_A],
      ),
    );
    expect(error.code).toBe('23514'); // check_violation
    expect(error.constraint).toBe('fin_sillon_coherente');
  });
});

describe('R-05: Row-Level Security forzada con un rol no propietario', () => {
  beforeAll(async () => {
    await migra.query(`
      CREATE TABLE spike.paciente (
        id         serial PRIMARY KEY,
        clinica_id uuid NOT NULL,
        nombre     text NOT NULL
      )`);
    await migra.query('ALTER TABLE spike.paciente ENABLE ROW LEVEL SECURITY');
    await migra.query('ALTER TABLE spike.paciente FORCE ROW LEVEL SECURITY');
    // `missing_ok = true` y NULLIF: sin contexto (o con contexto vacío tras un SET LOCAL previo
    // en la misma conexión) la política devuelve NULL y no ve filas, en lugar de fallar al convertir.
    await migra.query(`
      CREATE POLICY aislamiento ON spike.paciente
        USING (clinica_id = NULLIF(current_setting('app.clinica_id', true), '')::uuid)`);
    await migra.query('GRANT SELECT, INSERT ON spike.paciente TO app');
    await migra.query('GRANT USAGE ON SEQUENCE spike.paciente_id_seq TO app');
  });

  /** Ejecuta fn en una transacción con el contexto de clínica fijado solo para esa transacción. */
  async function conContexto<T>(clinica: string, fn: () => Promise<T>): Promise<T> {
    await app.query('BEGIN');
    try {
      await app.query("SELECT set_config('app.clinica_id', $1, true)", [clinica]);
      const resultado = await fn();
      await app.query('COMMIT');
      return resultado;
    } catch (error) {
      await app.query('ROLLBACK');
      throw error;
    }
  }

  async function contar(): Promise<number> {
    const r = await app.query<{ n: number }>('SELECT count(*)::int AS n FROM spike.paciente');
    return r.rows[0]?.n ?? -1;
  }

  it('el rol de la aplicación no es superusuario, no tiene BYPASSRLS y no es propietario', async () => {
    const r = await app.query<{ rolsuper: boolean; rolbypassrls: boolean; propietario: boolean }>(
      `SELECT r.rolsuper, r.rolbypassrls,
              (SELECT relowner = r.oid FROM pg_class WHERE oid = 'spike.paciente'::regclass) AS propietario
         FROM pg_roles r WHERE r.rolname = current_user`,
    );
    expect(r.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false, propietario: false });
  });

  it('con contexto de una clínica inserta y ve solo sus filas', async () => {
    await conContexto(CLINICA_A, () =>
      app.query("INSERT INTO spike.paciente (clinica_id, nombre) VALUES ($1, 'a1'), ($1, 'a2')", [
        CLINICA_A,
      ]),
    );
    await conContexto(CLINICA_B, () =>
      app.query("INSERT INTO spike.paciente (clinica_id, nombre) VALUES ($1, 'b1')", [CLINICA_B]),
    );

    expect(await conContexto(CLINICA_A, contar)).toBe(2);
    expect(await conContexto(CLINICA_B, contar)).toBe(1);
  });

  it('sin contexto de clínica no ve ninguna fila (falla cerrada)', async () => {
    expect(await contar()).toBe(0);
  });

  it('el contexto no se filtra a la transacción siguiente de la misma conexión', async () => {
    await conContexto(CLINICA_A, contar);
    // La conexión ya conoce el parámetro (ahora vacío): la política no debe fallar ni ver filas.
    expect(await contar()).toBe(0);
  });

  it('la clínica A no puede insertar una fila de la clínica B (WITH CHECK)', async () => {
    const error = await codigoDeError(
      conContexto(CLINICA_A, () =>
        app.query("INSERT INTO spike.paciente (clinica_id, nombre) VALUES ($1, 'intruso')", [
          CLINICA_B,
        ]),
      ),
    );
    expect(error.code).toBe('42501'); // insufficient_privilege: viola la política de seguridad por fila
  });

  it('FORCE ROW LEVEL SECURITY: ni el propietario ve filas sin contexto', async () => {
    const r = await migra.query<{ n: number }>('SELECT count(*)::int AS n FROM spike.paciente');
    expect(r.rows[0]?.n).toBe(0);
  });
});
