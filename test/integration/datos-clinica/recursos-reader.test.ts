import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { PrestacionId, ProfesionalId, SillonId } from '../../../src/domain/shared/index.js';
import { crearRecursosReader } from '../../../src/infrastructure/db/repositories/recursos/index.js';
import {
  CLINICA_A,
  CLINICA_B,
  ZONA_CLINICA_B,
  cerrarPool,
  comoApp,
  comoAppSinContexto,
  consultarComoMigra,
  prepararBaseDeDatosClinica,
  type EntornoDePrueba,
} from './soporte.js';

const PROF_A = 'aaaaaaaa-0000-4000-8000-000000000001' as ProfesionalId;
const PROF_B = 'bbbbbbbb-0000-4000-8000-000000000001' as ProfesionalId;
const SILLON_A10 = 'aaaaaaaa-0000-4000-8000-0000000000a1' as SillonId;
const SILLON_A0 = 'aaaaaaaa-0000-4000-8000-0000000000a2' as SillonId;
const SILLON_A_INACTIVO = 'aaaaaaaa-0000-4000-8000-0000000000a3' as SillonId;
const SILLON_B = 'bbbbbbbb-0000-4000-8000-0000000000b1' as SillonId;
const PREST_A = 'aaaaaaaa-0000-4000-8000-0000000000c1' as PrestacionId;
const PREST_A_INACTIVA = 'aaaaaaaa-0000-4000-8000-0000000000c2' as PrestacionId;
const PREST_B = 'bbbbbbbb-0000-4000-8000-0000000000c1' as PrestacionId;

let entorno: EntornoDePrueba;

beforeAll(async () => {
  entorno = await prepararBaseDeDatosClinica();
});
afterAll(cerrarPool);

beforeEach(async () => {
  await consultarComoMigra(
    entorno.urlMigra,
    'TRUNCATE sillon, prestacion, profesional, horario_atencion, bloqueo, feriado CASCADE',
  );
  const insertar = (clinica: string, sql: string, valores: unknown[]): Promise<unknown> =>
    comoApp(clinica, (c) => c.query(sql, valores));
  await insertar(
    CLINICA_A.id,
    "INSERT INTO profesional (id, clinica_id, nombre, apellido, activo) VALUES ($1, $2, 'n', 'a', false)",
    [PROF_A, CLINICA_A.id],
  );
  await insertar(
    CLINICA_B.id,
    "INSERT INTO profesional (id, clinica_id, nombre, apellido) VALUES ($1, $2, 'n', 'a')",
    [PROF_B, CLINICA_B.id],
  );
  const sillon =
    'INSERT INTO sillon (id, clinica_id, nombre, buffer_minutos, activo) VALUES ($1, $2, $3, $4, $5)';
  await insertar(CLINICA_A.id, sillon, [SILLON_A10, CLINICA_A.id, 'Sillón 1', 10, true]);
  await insertar(CLINICA_A.id, sillon, [SILLON_A0, CLINICA_A.id, 'Sillón 2', 0, true]);
  await insertar(CLINICA_A.id, sillon, [SILLON_A_INACTIVO, CLINICA_A.id, 'Sillón 3', 5, false]);
  await insertar(CLINICA_B.id, sillon, [SILLON_B, CLINICA_B.id, 'Sillón B', 0, true]);
  const prestacion =
    'INSERT INTO prestacion (id, clinica_id, nombre, duracion_minutos, activa) VALUES ($1, $2, $3, $4, $5)';
  await insertar(CLINICA_A.id, prestacion, [PREST_A, CLINICA_A.id, 'Limpieza', 45, true]);
  await insertar(CLINICA_A.id, prestacion, [PREST_A_INACTIVA, CLINICA_A.id, 'Vieja', 20, false]);
  await insertar(CLINICA_B.id, prestacion, [PREST_B, CLINICA_B.id, 'Conducto', 60, true]);
});

const comoReaderA = <T>(
  fn: (r: ReturnType<typeof crearRecursosReader>) => Promise<T>,
): Promise<T> => comoApp(CLINICA_A.id, (c) => fn(crearRecursosReader(c)));

describe('RecursosReader: lectura por id', () => {
  it('sillón con buffer 10 y marca de activo', async () => {
    expect(await comoReaderA((r) => r.sillon(SILLON_A10))).toEqual({
      id: SILLON_A10,
      bufferMinutos: 10,
      activo: true,
    });
  });

  it('sillón inactivo se devuelve con activo = false', async () => {
    expect(await comoReaderA((r) => r.sillon(SILLON_A_INACTIVO))).toEqual({
      id: SILLON_A_INACTIVO,
      bufferMinutos: 5,
      activo: false,
    });
  });

  it('profesional (con su marca de activo) y prestación (aunque esté inactiva, D12)', async () => {
    expect(await comoReaderA((r) => r.profesional(PROF_A))).toEqual({ id: PROF_A, activo: false });
    expect(await comoReaderA((r) => r.prestacion(PREST_A))).toEqual({
      id: PREST_A,
      duracionMinutos: 45,
    });
    expect(await comoReaderA((r) => r.prestacion(PREST_A_INACTIVA))).toEqual({
      id: PREST_A_INACTIVA,
      duracionMinutos: 20,
    });
  });

  it('recurso de otra clínica o inexistente -> null', async () => {
    expect(await comoReaderA((r) => r.profesional(PROF_B))).toBeNull();
    expect(await comoReaderA((r) => r.sillon(SILLON_B))).toBeNull();
    expect(await comoReaderA((r) => r.prestacion(PREST_B))).toBeNull();
    expect(
      await comoReaderA((r) => r.sillon('aaaaaaaa-0000-4000-8000-0000000000ff' as SillonId)),
    ).toBeNull();
  });

  it('un id que no es un uuid se trata como inexistente (null), sin romper la transacción', async () => {
    const resultado = await comoReaderA(async (r) => {
      const sillon = await r.sillon('no-es-un-uuid' as SillonId);
      const profesional = await r.profesional('no-es-un-uuid' as ProfesionalId);
      // la transacción sigue usable
      const activos = await r.sillonesActivos();
      return { sillon, profesional, activos: activos.length };
    });
    expect(resultado).toEqual({ sillon: null, profesional: null, activos: 2 });
  });

  it('sin contexto de clínica las lecturas devuelven null o lista vacía', async () => {
    const resultado = await comoAppSinContexto(async (c) => {
      const r = crearRecursosReader(c);
      return {
        sillon: await r.sillon(SILLON_A10),
        profesional: await r.profesional(PROF_A),
        prestacion: await r.prestacion(PREST_A),
        activos: await r.sillonesActivos(),
      };
    });
    expect(resultado).toEqual({ sillon: null, profesional: null, prestacion: null, activos: [] });
  });
});

describe('RecursosReader: sillonesActivos', () => {
  it('devuelve solo los activos de la clínica del contexto', async () => {
    const activos = await comoReaderA((r) => r.sillonesActivos());
    expect(activos.map((s) => s.id).sort()).toEqual([SILLON_A10, SILLON_A0].sort());
    expect(activos.every((s) => s.activo)).toBe(true);
  });

  it('la clínica B ve solo su sillón', async () => {
    const activos = await comoApp(CLINICA_B.id, (c) => crearRecursosReader(c).sillonesActivos());
    expect(activos.map((s) => s.id)).toEqual([SILLON_B]);
  });
});

describe('RecursosReader: configuracionAgenda', () => {
  it('clínica A: zona de Buenos Aires y granularidad 15', async () => {
    expect(await comoReaderA((r) => r.configuracionAgenda())).toEqual({
      zonaHoraria: 'America/Argentina/Buenos_Aires',
      granularidadMinutos: 15,
    });
  });

  it('clínica B: su propia zona; la A no recibe la de B', async () => {
    const b = await comoApp(CLINICA_B.id, (c) => crearRecursosReader(c).configuracionAgenda());
    expect(b.zonaHoraria).toBe(ZONA_CLINICA_B);
    const a = await comoReaderA((r) => r.configuracionAgenda());
    expect(a.zonaHoraria).not.toBe(ZONA_CLINICA_B);
  });

  it('clínica sin clinica_config -> error interno sin datos de la clínica', async () => {
    const sinConfig = '33333333-3333-4333-8333-333333333333';
    await comoApp(sinConfig, (c) =>
      c.query(
        "INSERT INTO clinica (id, nombre, slug) VALUES ($1, 'Nombre secreto', 'sin-config')",
        [sinConfig],
      ),
    );
    const error = await comoApp(sinConfig, (c) =>
      crearRecursosReader(c).configuracionAgenda(),
    ).catch((e: unknown) => e as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('Nombre secreto');
    expect((error as Error).message).not.toContain('sin-config');
    expect((error as Error).message).not.toContain(sinConfig);
  });

  it('sin contexto de clínica falla (no hay a quién leerle la configuración)', async () => {
    await expect(
      comoAppSinContexto((c) => crearRecursosReader(c).configuracionAgenda()),
    ).rejects.toBeInstanceOf(Error);
  });
});
