import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config/index.js';
import { configDeBaseDePrueba, consultarComoMigra } from '../support/base-de-datos.js';

import { prepararBaseE2E } from './soporte/base.js';

const URL_MIGRA = (): string => configDeBaseDePrueba().testDatabaseMigrationUrl as string;

describe('entorno e2e: esquema real con las migraciones', () => {
  it('tras el globalSetup existen las tablas de las migraciones reales', async () => {
    const filas = await consultarComoMigra<{ tablename: string }>(
      URL_MIGRA(),
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    const tablas = filas.map((f) => f.tablename);
    expect(tablas).toEqual(
      expect.arrayContaining(['clinica', 'usuario', 'paciente', 'turno', 'auditoria']),
    );
  });

  it('el rol de la aplicación no es superusuario, no tiene BYPASSRLS ni es propietario de tablas', async () => {
    const [rol] = await consultarComoMigra<{ rolsuper: boolean; rolbypassrls: boolean }>(
      URL_MIGRA(),
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'app'`,
    );
    expect(rol).toEqual({ rolsuper: false, rolbypassrls: false });

    const propias = await consultarComoMigra(
      URL_MIGRA(),
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tableowner = 'app'`,
    );
    expect(propias).toEqual([]);
  });
});

describe('entorno e2e: guarda de la base de pruebas', () => {
  const base = {
    TEST_DATABASE_URL: 'postgres://app:x@localhost:5432/turnos_test',
    TEST_DATABASE_MIGRATION_URL: 'postgres://migra:x@localhost:5432/turnos_test',
  };

  it('se niega a correr con un host no permitido, antes de tocar nada', async () => {
    const config = loadConfig('test', {
      ...base,
      TEST_DATABASE_URL: 'postgres://app:x@db.produccion.example:5432/turnos_test',
      TEST_DATABASE_MIGRATION_URL: 'postgres://migra:x@db.produccion.example:5432/turnos_test',
    });
    await expect(prepararBaseE2E(config)).rejects.toThrow(/host no permitido/);
  });

  it('se niega a correr con una base cuyo nombre no termina en _test', async () => {
    const config = loadConfig('test', {
      ...base,
      TEST_DATABASE_URL: 'postgres://app:x@localhost:5432/turnos',
      TEST_DATABASE_MIGRATION_URL: 'postgres://migra:x@localhost:5432/turnos',
    });
    await expect(prepararBaseE2E(config)).rejects.toThrow(/_test/);
  });
});
