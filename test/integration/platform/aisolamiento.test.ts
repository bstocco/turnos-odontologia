import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { aplicarMigraciones } from '../../../src/infrastructure/db/ejecutor-de-migraciones.js';
import { withTenant } from '../../../src/infrastructure/db/tenant/with-tenant.js';
import {
  CLINICA_A,
  CLINICA_B,
  insertarConfigDeClinica,
  listarIdsDeConfiguracion,
} from '../../support/aislamiento.js';
import {
  configDeBaseDePrueba,
  consultarComoMigra,
  reiniciarEsquema,
} from '../../support/base-de-datos.js';

// El arnés de aislamiento corre sobre el pool de la aplicación (withTenant); en las
// pruebas ese pool debe apuntar a la base de pruebas (perfil `test`).
const config = configDeBaseDePrueba();
process.env.DATABASE_URL = config.testDatabaseUrl;

const URL_MIGRA = config.testDatabaseMigrationUrl as string;

beforeAll(async () => {
  await reiniciarEsquema(URL_MIGRA);
  await aplicarMigraciones({
    urlDeMigracion: URL_MIGRA,
    directorio: join(process.cwd(), 'migrations'),
  });
});

describe('R-05: rol de la aplicación sin BYPASSRLS', () => {
  it('el rol app es sin superusuario y sin BYPASSRLS', async () => {
    const filas = await consultarComoMigra<{ rolsuper: boolean; rolbypassrls: boolean }>(
      URL_MIGRA,
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'app'",
    );
    expect(filas[0]?.rolsuper).toBe(false);
    expect(filas[0]?.rolbypassrls).toBe(false);
  });
});

describe('arnés de aislamiento (test/support/aislamiento.ts)', () => {
  it('la clínica A inserta en su configuración y solo ve sus filas; B no ve ni escribe las de A', async () => {
    await insertarConfigDeClinica(CLINICA_A);
    await insertarConfigDeClinica(CLINICA_B);

    expect(await listarIdsDeConfiguracion(CLINICA_A.id)).toEqual([CLINICA_A.id]);
    expect(await listarIdsDeConfiguracion(CLINICA_B.id)).toEqual([CLINICA_B.id]);
  });
});

describe('especificación db-tenant-rls', () => {
  it('falla cerrada: sin contexto no se ve ninguna fila', async () => {
    expect(await listarIdsDeConfiguracion()).toEqual([]);
  });

  it('la clínica A no inserta una fila de la clínica B (42501)', async () => {
    const codigo = await withTenant(CLINICA_A.id, (cliente) =>
      cliente.query('INSERT INTO clinica_config (clinica_id) VALUES ($1)', [CLINICA_B.id]).then(
        () => undefined,
        (e: { code?: string }) => e.code,
      ),
    );
    expect(codigo).toBe('42501');
  });

  it('el propietario sin contexto ve 0 filas (FORCE ROW LEVEL SECURITY)', async () => {
    const filas = await consultarComoMigra<{ clinica_id: string }>(
      URL_MIGRA,
      'SELECT clinica_id FROM clinica_config',
    );
    expect(filas).toEqual([]);
  });
});
