import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { hashSha256 } from '../../../src/infrastructure/crypto/index.js';

import {
  CLINICA_A,
  CLINICA_B,
  cerrarPool,
  comoApp,
  comoAppSinContexto,
  consultarComoMigra,
  crearClinicaInactiva,
  crearTurnoMinimo,
  limpiarTablasReservaPublica,
  prepararBaseReservaPublica,
  type EntornoReservaPublica,
} from './soporte.js';

let entorno: EntornoReservaPublica;

beforeAll(async () => {
  entorno = await prepararBaseReservaPublica();
});

beforeEach(async () => {
  await limpiarTablasReservaPublica(entorno.urlMigra);
});

afterAll(async () => {
  await cerrarPool();
});

describe('C-15 esquema codigo_verificacion, token_accion y resolver_clinica_por_hash_token', () => {
  it('crea codigo_verificacion y token_accion propiedad de migra, con RLS forzada, índices y privilegios SELECT/INSERT/UPDATE para app', async () => {
    const tablas = await consultarComoMigra<{
      tablename: string;
      tableowner: string;
      rowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      entorno.urlMigra,
      `SELECT t.tablename, t.tableowner, c.relrowsecurity AS rowsecurity, c.relforcerowsecurity
       FROM pg_tables t
       JOIN pg_class c ON c.relname = t.tablename
       JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
       WHERE t.schemaname = 'public' AND t.tablename IN ('codigo_verificacion', 'token_accion')
       ORDER BY t.tablename`,
    );
    expect(tablas).toEqual([
      {
        tablename: 'codigo_verificacion',
        tableowner: 'migra',
        rowsecurity: true,
        relforcerowsecurity: true,
      },
      {
        tablename: 'token_accion',
        tableowner: 'migra',
        rowsecurity: true,
        relforcerowsecurity: true,
      },
    ]);

    const indices = await consultarComoMigra<{ indexname: string }>(
      entorno.urlMigra,
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public' AND tablename IN ('codigo_verificacion', 'token_accion')`,
    );
    const nombresIndices = indices.map((i) => i.indexname);
    expect(nombresIndices).toContain('codigo_verificacion_clinica_email_creado_idx');
    expect(nombresIndices).toContain('token_accion_clinica_turno_idx');
    expect(nombresIndices).toContain('token_accion_hash_unico');

    for (const tabla of ['codigo_verificacion', 'token_accion']) {
      const privs = await consultarComoMigra<{ privilege_type: string }>(
        entorno.urlMigra,
        `SELECT privilege_type
         FROM information_schema.table_privileges
         WHERE grantee = 'app' AND table_schema = 'public' AND table_name = $1
         ORDER BY privilege_type`,
        [tabla],
      );
      expect(privs.map((p) => p.privilege_type)).toEqual(['INSERT', 'SELECT', 'UPDATE']);
    }
  });

  it('codigo_verificacion solo acepta hashes SHA-256 hex minúscula, rechaza intentos < 0 y aísla clínicas con RLS', async () => {
    const hashValido = hashSha256('123456');
    const venceEn = new Date(Date.now() + 600_000);
    const idA = randomUUID();

    await comoApp(CLINICA_A.id, (c) =>
      c.query(
        `INSERT INTO codigo_verificacion (id, clinica_id, email, hash_codigo, vence_en)
         VALUES ($1, $2, 'paciente@ejemplo.test', $3, $4)`,
        [idA, CLINICA_A.id, hashValido, venceEn],
      ),
    );

    // Código en claro o hash no SHA-256 → 23514
    for (const malo of ['123456', hashValido.toUpperCase(), 'abc']) {
      await expect(
        comoApp(CLINICA_A.id, (c) =>
          c.query(
            `INSERT INTO codigo_verificacion (id, clinica_id, email, hash_codigo, vence_en)
             VALUES ($1, $2, 'paciente@ejemplo.test', $3, $4)`,
            [randomUUID(), CLINICA_A.id, malo, venceEn],
          ),
        ),
      ).rejects.toMatchObject({ code: '23514' });
    }

    // intentos < 0 → 23514
    await expect(
      comoApp(CLINICA_A.id, (c) =>
        c.query(
          `INSERT INTO codigo_verificacion (id, clinica_id, email, hash_codigo, vence_en, intentos)
           VALUES ($1, $2, 'paciente@ejemplo.test', $3, $4, -1)`,
          [randomUUID(), CLINICA_A.id, hashValido, venceEn],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });

    // Aislamiento RLS
    const enB = await comoApp(CLINICA_B.id, (c) =>
      c.query('SELECT id FROM codigo_verificacion').then((r) => r.rows),
    );
    expect(enB).toEqual([]);

    const sinContexto = await comoAppSinContexto((c) =>
      c.query('SELECT id FROM codigo_verificacion').then((r) => r.rows),
    );
    expect(sinContexto).toEqual([]);

    // Inserción cruzada → 42501
    await expect(
      comoApp(CLINICA_A.id, (c) =>
        c.query(
          `INSERT INTO codigo_verificacion (id, clinica_id, email, hash_codigo, vence_en)
           VALUES ($1, $2, 'otro@ejemplo.test', $3, $4)`,
          [randomUUID(), CLINICA_B.id, hashValido, venceEn],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });

    // DELETE rechazado para rol app → 42501
    await expect(
      comoApp(CLINICA_A.id, (c) => c.query('DELETE FROM codigo_verificacion WHERE id = $1', [idA])),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('token_accion exige FK compuesta a turno, hash SHA-256 único global, propósito válido y RLS', async () => {
    const turnoA = await crearTurnoMinimo(CLINICA_A.id);
    const turnoB = await crearTurnoMinimo(CLINICA_B.id);
    const hashToken = hashSha256('token-secreto-sintetico-1');
    const venceEn = new Date('2026-12-20T14:00:00.000Z');
    const idA = randomUUID();

    await comoApp(CLINICA_A.id, (c) =>
      c.query(
        `INSERT INTO token_accion (id, clinica_id, turno_id, proposito, hash_token, vence_en)
         VALUES ($1, $2, $3, 'confirmar', $4, $5)`,
        [idA, CLINICA_A.id, turnoA, hashToken, venceEn],
      ),
    );

    // Hash duplicado → 23505 (incluso en otra clínica, ejecutado vía migra o mismo tenant)
    await expect(
      comoApp(CLINICA_A.id, (c) =>
        c.query(
          `INSERT INTO token_accion (id, clinica_id, turno_id, proposito, hash_token, vence_en)
           VALUES ($1, $2, $3, 'cancelar', $4, $5)`,
          [randomUUID(), CLINICA_A.id, turnoA, hashToken, venceEn],
        ),
      ),
    ).rejects.toMatchObject({ code: '23505' });

    // FK compuesta cross-tenant → 23503
    await expect(
      comoApp(CLINICA_A.id, (c) =>
        c.query(
          `INSERT INTO token_accion (id, clinica_id, turno_id, proposito, hash_token, vence_en)
           VALUES ($1, $2, $3, 'confirmar', $4, $5)`,
          [randomUUID(), CLINICA_A.id, turnoB, hashSha256('otro-token'), venceEn],
        ),
      ),
    ).rejects.toMatchObject({ code: '23503' });

    // Propósito inválido o hash en claro → 23514
    await expect(
      comoApp(CLINICA_A.id, (c) =>
        c.query(
          `INSERT INTO token_accion (id, clinica_id, turno_id, proposito, hash_token, vence_en)
           VALUES ($1, $2, $3, 'reprogramar', $4, $5)`,
          [randomUUID(), CLINICA_A.id, turnoA, hashSha256('tercer-token'), venceEn],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });

    await expect(
      comoApp(CLINICA_A.id, (c) =>
        c.query(
          `INSERT INTO token_accion (id, clinica_id, turno_id, proposito, hash_token, vence_en)
           VALUES ($1, $2, $3, 'confirmar', 'token-en-claro', $4)`,
          [randomUUID(), CLINICA_A.id, turnoA, venceEn],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });

    // Aislamiento RLS y rechazo de DELETE
    const enB = await comoApp(CLINICA_B.id, (c) =>
      c.query('SELECT id FROM token_accion').then((r) => r.rows),
    );
    expect(enB).toEqual([]);

    await expect(
      comoApp(CLINICA_A.id, (c) => c.query('DELETE FROM token_accion WHERE id = $1', [idA])),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('resolver_clinica_por_hash_token es SECURITY DEFINER de mínimo alcance y devuelve NULL si el hash no existe o la clínica está inactiva', async () => {
    const rutina = await consultarComoMigra<{
      prosecdef: boolean;
      proconfig: string[] | null;
    }>(
      entorno.urlMigra,
      `SELECT prosecdef, proconfig
       FROM pg_proc
       WHERE proname = 'resolver_clinica_por_hash_token'`,
    );
    expect(rutina).toEqual([
      {
        prosecdef: true,
        proconfig: ['search_path=pg_catalog, public'],
      },
    ]);

    const turnoA = await crearTurnoMinimo(CLINICA_A.id);
    const hashActivo = hashSha256('token-clinica-activa');
    await comoApp(CLINICA_A.id, (c) =>
      c.query(
        `INSERT INTO token_accion (id, clinica_id, turno_id, proposito, hash_token, vence_en)
         VALUES ($1, $2, $3, 'confirmar', $4, $5)`,
        [randomUUID(), CLINICA_A.id, turnoA, hashActivo, new Date('2026-12-20T14:00:00.000Z')],
      ),
    );

    const idInactiva = await crearClinicaInactiva(entorno.urlMigra);
    const turnoInactiva = await crearTurnoMinimo(idInactiva);
    const hashInactivo = hashSha256('token-clinica-inactiva');
    await comoApp(idInactiva, (c) =>
      c.query(
        `INSERT INTO token_accion (id, clinica_id, turno_id, proposito, hash_token, vence_en)
         VALUES ($1, $2, $3, 'cancelar', $4, $5)`,
        [
          randomUUID(),
          idInactiva,
          turnoInactiva,
          hashInactivo,
          new Date('2026-12-20T14:00:00.000Z'),
        ],
      ),
    );

    const resueltoActivo = await comoAppSinContexto((c) =>
      c
        .query<{ id: string | null }>('SELECT resolver_clinica_por_hash_token($1) AS id', [
          hashActivo,
        ])
        .then((r) => r.rows[0]?.id ?? null),
    );
    expect(resueltoActivo).toBe(CLINICA_A.id);

    const resueltoInactivo = await comoAppSinContexto((c) =>
      c
        .query<{ id: string | null }>('SELECT resolver_clinica_por_hash_token($1) AS id', [
          hashInactivo,
        ])
        .then((r) => r.rows[0]?.id ?? null),
    );
    expect(resueltoInactivo).toBeNull();

    const resueltoInexistente = await comoAppSinContexto((c) =>
      c
        .query<{ id: string | null }>('SELECT resolver_clinica_por_hash_token($1) AS id', [
          hashSha256('no-existe'),
        ])
        .then((r) => r.rows[0]?.id ?? null),
    );
    expect(resueltoInexistente).toBeNull();
  });
});
