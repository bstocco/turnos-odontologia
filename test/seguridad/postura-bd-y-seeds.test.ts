import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ejecutarSeedDemo } from '../../seeds/demo-clinica.js';
import { ejecutarSeedPrimeraClinica } from '../../seeds/primera-clinica.js';
import { loadConfig } from '../../src/config/index.js';
import { verificarPosturaSeguridadBd } from '../../src/infrastructure/db/verificar-seguridad-bd.js';
import { SeedBloqueadoError } from '../../src/infrastructure/seed/assert-no-production.js';
import { asegurarEsquemaE2E } from '../e2e/soporte/base.js';
import { configDeBaseDePrueba } from '../support/base-de-datos.js';

describe('postura de seguridad de PostgreSQL y RLS (catálogo real)', () => {
  let clienteMigra: pg.Client;

  beforeAll(async () => {
    const config = configDeBaseDePrueba();
    await asegurarEsquemaE2E(config);
    clienteMigra = new pg.Client({ connectionString: config.testDatabaseMigrationUrl });
    await clienteMigra.connect();
  });

  afterAll(async () => {
    await clienteMigra.end();
  });

  it('el rol app, las tablas multi-tenant, auditoria y funciones SECURITY DEFINER cumplen la postura', async () => {
    const resultado = await verificarPosturaSeguridadBd(clienteMigra, 'app');

    expect(resultado.hallazgos).toEqual([]);
    expect(resultado.ok).toBe(true);
    expect(resultado.tablasMultiTenantVerificadas).toEqual(
      expect.arrayContaining([
        'clinica_config',
        'usuario',
        'paciente',
        'turno',
        'auditoria',
        'notificacion',
        'codigo_verificacion',
        'token_accion',
      ]),
    );
    expect(resultado.funcionesSecurityDefinerVerificadas).toEqual(
      expect.arrayContaining(['resolver_clinica_por_slug', 'resolver_clinica_por_hash_token']),
    );
  });

  it('detecta una tabla multi-tenant sin RLS forzada ni política', async () => {
    await clienteMigra.query('BEGIN');
    try {
      await clienteMigra.query(
        'CREATE TABLE public.tmp_sin_rls_c19 (id uuid PRIMARY KEY, clinica_id uuid NOT NULL)',
      );
      const resultado = await verificarPosturaSeguridadBd(clienteMigra, 'app');
      expect(resultado.ok).toBe(false);
      expect(resultado.hallazgos.some((h) => h.includes('tmp_sin_rls_c19'))).toBe(true);
    } finally {
      await clienteMigra.query('ROLLBACK');
    }
  });

  it('detecta una función SECURITY DEFINER sin search_path ni revocación de PUBLIC', async () => {
    await clienteMigra.query('BEGIN');
    try {
      await clienteMigra.query(
        'CREATE FUNCTION public.tmp_fn_insegura_c19() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$',
      );
      const resultado = await verificarPosturaSeguridadBd(clienteMigra, 'app');
      expect(resultado.ok).toBe(false);
      expect(resultado.hallazgos.some((h) => h.includes('tmp_fn_insegura_c19'))).toBe(true);
    } finally {
      await clienteMigra.query('ROLLBACK');
    }
  });
});

describe('ALLOW_SEED=false y guardas assertNoProduction() en seeds', () => {
  it('.env.example fija ALLOW_SEED=false y la configuración por defecto deshabilita seeds', () => {
    const ejemplo = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8');
    expect(ejemplo).toMatch(/^ALLOW_SEED=false$/m);

    const config = loadConfig('app', {
      DATABASE_URL: 'postgres://app:clave@localhost:5432/turnos_test',
    });
    expect(config.allowSeed).toBe(false);
  });

  it('seeds/run.ts invoca assertNoProduction() antes de ejecutar cualquier seed', () => {
    const fuente = readFileSync(resolve(process.cwd(), 'seeds/run.ts'), 'utf8');
    const idxGuarda = fuente.indexOf('assertNoProduction(');
    const idxEjecucion = fuente.indexOf('ejecutarSeedDemo(');
    expect(idxGuarda).toBeGreaterThan(-1);
    expect(idxEjecucion).toBeGreaterThan(idxGuarda);
  });

  it('ejecutarSeedDemo rechaza producción, ALLOW_SEED=false y hosts no permitidos sin abrir conexión', async () => {
    const configProd = loadConfig('seed', {
      DATABASE_URL: 'postgres://app:secreto-seed-demo@localhost:5432/turnos',
      ALLOW_SEED: 'true',
      NODE_ENV: 'production',
    });
    await expect(ejecutarSeedDemo(configProd, () => undefined)).rejects.toThrow(SeedBloqueadoError);

    const configDeshabilitado = loadConfig('seed', {
      DATABASE_URL: 'postgres://app:secreto-seed-demo@localhost:5432/turnos',
      ALLOW_SEED: 'false',
    });
    await expect(ejecutarSeedDemo(configDeshabilitado, () => undefined)).rejects.toThrow(
      SeedBloqueadoError,
    );

    const configHostExterno = loadConfig('seed', {
      DATABASE_URL: 'postgres://app:secreto-seed-demo@db.externo.example:5432/turnos',
      ALLOW_SEED: 'true',
    });
    await expect(ejecutarSeedDemo(configHostExterno, () => undefined)).rejects.toThrow(
      SeedBloqueadoError,
    );
  });

  it('ejecutarSeedPrimeraClinica rechaza producción y seeds deshabilitados antes de tocar la base', async () => {
    const previos = {
      DATABASE_URL: process.env.DATABASE_URL,
      ALLOW_SEED: process.env.ALLOW_SEED,
      NODE_ENV: process.env.NODE_ENV,
    };
    try {
      process.env.DATABASE_URL = 'postgres://app:secreto-seed-1@localhost:5432/turnos';
      process.env.ALLOW_SEED = 'true';
      process.env.NODE_ENV = 'production';
      await expect(
        ejecutarSeedPrimeraClinica({
          slug: 'clinica-prohibida',
          nombre: 'Clínica Prohibida',
          email: 'admin@ejemplo.invalid',
        }),
      ).rejects.toThrow(SeedBloqueadoError);

      process.env.NODE_ENV = 'test';
      process.env.ALLOW_SEED = 'false';
      await expect(
        ejecutarSeedPrimeraClinica({
          slug: 'clinica-prohibida',
          nombre: 'Clínica Prohibida',
          email: 'admin@ejemplo.invalid',
        }),
      ).rejects.toThrow(SeedBloqueadoError);
    } finally {
      for (const [k, v] of Object.entries(previos)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
