import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolverClinicaPorSlug } from '../../../src/infrastructure/db/repositories/clinica-publica/index.js';
import { poolDeLaAplicacion } from '../../../src/infrastructure/db/pool/index.js';
import {
  CLINICA_A,
  SLUG_INACTIVA,
  cerrarPool,
  consultarComoMigra,
  crearClinicaInactiva,
  prepararBaseDeDisponibilidad,
  type EntornoDePrueba,
} from './soporte.js';

let entorno: EntornoDePrueba;

beforeAll(async () => {
  entorno = await prepararBaseDeDisponibilidad();
  await crearClinicaInactiva(entorno.urlMigra);
});
afterAll(cerrarPool);

describe('función resolver_clinica_por_slug (C13_001)', () => {
  const resolver = async (slug: string) => {
    const { rows } = await poolDeLaAplicacion().query<{ id: string | null }>(
      'SELECT resolver_clinica_por_slug($1) AS id',
      [slug],
    );
    return rows[0]?.id;
  };

  it('devuelve el id de una clínica activa', async () => {
    expect(await resolver(CLINICA_A.slug)).toBe(CLINICA_A.id);
  });

  it('devuelve NULL para un slug inexistente', async () => {
    expect(await resolver('no-existe')).toBeNull();
  });

  it('devuelve NULL para una clínica inactiva, igual que un slug inexistente', async () => {
    expect(await resolver(SLUG_INACTIVA)).toBeNull();
  });

  it('el resultado tiene una sola columna uuid (sin otras columnas de clinica)', async () => {
    const res = await poolDeLaAplicacion().query('SELECT * FROM resolver_clinica_por_slug($1)', [
      CLINICA_A.slug,
    ]);
    expect(res.fields.map((f) => f.name)).toEqual(['resolver_clinica_por_slug']);
    const tipos = await consultarComoMigra<{ t: string }>(
      entorno.urlMigra,
      `SELECT pg_get_function_result('resolver_clinica_por_slug(text)'::regprocedure) AS t`,
    );
    expect(tipos[0]?.t).toBe('uuid');
  });

  it('EXECUTE está revocado a PUBLIC y concedido a app; es SECURITY DEFINER con search_path fijo', async () => {
    const filas = await consultarComoMigra<{ publico: boolean; app: boolean }>(
      entorno.urlMigra,
      `SELECT has_function_privilege('public', 'resolver_clinica_por_slug(text)', 'EXECUTE') AS publico,
              has_function_privilege('app', 'resolver_clinica_por_slug(text)', 'EXECUTE') AS app`,
    );
    expect(filas[0]).toEqual({ publico: false, app: true });
    const def = await consultarComoMigra<{ definer: boolean; config: string[] | null }>(
      entorno.urlMigra,
      `SELECT prosecdef AS definer, proconfig AS config FROM pg_proc WHERE proname = 'resolver_clinica_por_slug'`,
    );
    expect(def[0]?.definer).toBe(true);
    expect(def[0]?.config).toContain('search_path=pg_catalog, public');
  });
});

describe('adaptador resolverClinicaPorSlug', () => {
  const pool = () => poolDeLaAplicacion();

  it('devuelve el id de la clínica activa', async () => {
    expect(await resolverClinicaPorSlug(pool(), CLINICA_A.slug)).toBe(CLINICA_A.id);
  });

  it('devuelve null para inexistente e inactiva', async () => {
    expect(await resolverClinicaPorSlug(pool(), 'no-existe')).toBeNull();
    expect(await resolverClinicaPorSlug(pool(), SLUG_INACTIVA)).toBeNull();
  });

  it('trata comillas y % como literales (sin inyección ni comodines)', async () => {
    expect(await resolverClinicaPorSlug(pool(), "x' OR '1'='1")).toBeNull();
    expect(await resolverClinicaPorSlug(pool(), 'clinica-a-%')).toBeNull();
    expect(await resolverClinicaPorSlug(pool(), '%')).toBeNull();
  });
});
