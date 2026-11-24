import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ErrorDeDominio } from '../../../src/domain/shared/index.js';
import { crearProfesionalRepository } from '../../../src/infrastructure/db/repositories/profesional/index.js';
import { crearPrestacionRepository } from '../../../src/infrastructure/db/repositories/prestacion/index.js';
import { crearRecursosReader } from '../../../src/infrastructure/db/repositories/recursos/index.js';
import { crearSillonRepository } from '../../../src/infrastructure/db/repositories/sillon/index.js';
import {
  CLINICA_A,
  CLINICA_B,
  cerrarPool,
  comoApp,
  comoAppSinContexto,
  consultarComoMigra,
  prepararBaseDeDatosClinica,
  type EntornoDePrueba,
} from './soporte.js';

let entorno: EntornoDePrueba;

beforeAll(async () => {
  entorno = await prepararBaseDeDatosClinica();
});
afterAll(cerrarPool);

beforeEach(async () => {
  await consultarComoMigra(entorno.urlMigra, 'TRUNCATE sillon, prestacion, profesional CASCADE');
});

describe('profesionales', () => {
  it('crear en A deja el clinica_id de A sin que el llamador lo indique', async () => {
    const creado = await comoApp(CLINICA_A.id, (c) =>
      crearProfesionalRepository(c).crear({
        nombre: 'Nombre',
        apellido: 'Apellido',
        matricula: 'MP-1',
      }),
    );
    expect(creado).toMatchObject({
      nombre: 'Nombre',
      apellido: 'Apellido',
      matricula: 'MP-1',
      activo: true,
    });
    const { rows } = await comoApp(CLINICA_A.id, (c) =>
      c.query('SELECT clinica_id FROM profesional WHERE id = $1', [creado.id]),
    );
    expect(rows[0]?.['clinica_id']).toBe(CLINICA_A.id);
  });

  it('la clínica B no ve ni lista al profesional de A', async () => {
    await comoApp(CLINICA_A.id, (c) =>
      crearProfesionalRepository(c).crear({ nombre: 'n', apellido: 'a' }),
    );
    expect(await comoApp(CLINICA_B.id, (c) => crearProfesionalRepository(c).listar())).toEqual([]);
    expect(await comoApp(CLINICA_A.id, (c) => crearProfesionalRepository(c).listar())).toHaveLength(
      1,
    );
  });

  it('actualizar usa lista blanca: cambia solo lo indicado y puede borrar la matrícula', async () => {
    const creado = await comoApp(CLINICA_A.id, (c) =>
      crearProfesionalRepository(c).crear({ nombre: 'n', apellido: 'a', matricula: 'MP-1' }),
    );
    const cambiado = await comoApp(CLINICA_A.id, (c) =>
      crearProfesionalRepository(c).actualizar(creado.id, { apellido: 'otro' }),
    );
    expect(cambiado).toMatchObject({ nombre: 'n', apellido: 'otro', matricula: 'MP-1' });
    const sinMatricula = await comoApp(CLINICA_A.id, (c) =>
      crearProfesionalRepository(c).actualizar(creado.id, { matricula: null }),
    );
    expect(sinMatricula?.matricula).toBeNull();
    // Un campo fuera de la lista blanca (p. ej. clinica_id) se ignora.
    const intento = { clinica_id: CLINICA_B.id, nombre: 'x' } as { nombre: string };
    const ignorado = await comoApp(CLINICA_A.id, (c) =>
      crearProfesionalRepository(c).actualizar(creado.id, intento),
    );
    expect(ignorado?.nombre).toBe('x');
    const { rows } = await comoApp(CLINICA_A.id, (c) =>
      c.query('SELECT clinica_id FROM profesional WHERE id = $1', [creado.id]),
    );
    expect(rows[0]?.['clinica_id']).toBe(CLINICA_A.id);
  });

  it('actualizar un profesional de otra clínica devuelve null', async () => {
    const creado = await comoApp(CLINICA_A.id, (c) =>
      crearProfesionalRepository(c).crear({ nombre: 'n', apellido: 'a' }),
    );
    expect(
      await comoApp(CLINICA_B.id, (c) =>
        crearProfesionalRepository(c).actualizar(creado.id, { nombre: 'hack' }),
      ),
    ).toBeNull();
  });

  it('desactivar conserva la fila', async () => {
    const creado = await comoApp(CLINICA_A.id, (c) =>
      crearProfesionalRepository(c).crear({ nombre: 'n', apellido: 'a' }),
    );
    const inactivo = await comoApp(CLINICA_A.id, (c) =>
      crearProfesionalRepository(c).desactivar(creado.id),
    );
    expect(inactivo?.activo).toBe(false);
    expect(
      await comoApp(CLINICA_A.id, (c) => crearProfesionalRepository(c).obtenerPorId(creado.id)),
    ).toMatchObject({
      activo: false,
    });
  });
});

describe('sillones', () => {
  it('desactivar un sillón: sigue existiendo, activo=false y sale de sillonesActivos', async () => {
    const repo = await comoApp(CLINICA_A.id, async (c) => {
      const r = crearSillonRepository(c);
      const uno = await r.crear({ nombre: 'Sillón 1', bufferMinutos: 10 });
      const dos = await r.crear({ nombre: 'Sillón 2' });
      return { uno, dos };
    });
    expect(repo.dos.bufferMinutos).toBe(0);
    await comoApp(CLINICA_A.id, (c) => crearSillonRepository(c).desactivar(repo.uno.id));
    const lector = await comoApp(CLINICA_A.id, async (c) => {
      const r = crearRecursosReader(c);
      return { uno: await r.sillon(repo.uno.id as never), activos: await r.sillonesActivos() };
    });
    expect(lector.uno).toEqual({ id: repo.uno.id, bufferMinutos: 10, activo: false });
    expect(lector.activos.map((s) => s.id)).toEqual([repo.dos.id]);
    expect(await comoApp(CLINICA_A.id, (c) => crearSillonRepository(c).listar())).toHaveLength(2);
  });

  it('buffer negativo -> DATOS_INVALIDOS', async () => {
    const error = await comoApp(CLINICA_A.id, (c) =>
      crearSillonRepository(c).crear({ nombre: 's', bufferMinutos: -5 }),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorDeDominio);
    expect((error as ErrorDeDominio).codigo).toBe('DATOS_INVALIDOS');
  });
});

describe('prestaciones', () => {
  it('crear prestación con duración 0 -> DATOS_INVALIDOS; con 30 se crea', async () => {
    const error = await comoApp(CLINICA_A.id, (c) =>
      crearPrestacionRepository(c).crear({ nombre: 'p', duracionMinutos: 0 }),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorDeDominio);
    expect((error as ErrorDeDominio).codigo).toBe('DATOS_INVALIDOS');
    const creada = await comoApp(CLINICA_A.id, (c) =>
      crearPrestacionRepository(c).crear({ nombre: 'Consulta', duracionMinutos: 30 }),
    );
    expect(creada).toMatchObject({ nombre: 'Consulta', duracionMinutos: 30, activa: true });
  });

  it('actualizar la duración y desactivar', async () => {
    const creada = await comoApp(CLINICA_A.id, (c) =>
      crearPrestacionRepository(c).crear({ nombre: 'Consulta', duracionMinutos: 30 }),
    );
    const act = await comoApp(CLINICA_A.id, (c) =>
      crearPrestacionRepository(c).actualizar(creada.id, { duracionMinutos: 40 }),
    );
    expect(act).toMatchObject({ duracionMinutos: 40, nombre: 'Consulta' });
    const baja = await comoApp(CLINICA_A.id, (c) =>
      crearPrestacionRepository(c).desactivar(creada.id),
    );
    expect(baja?.activa).toBe(false);
    expect(await comoApp(CLINICA_A.id, (c) => crearPrestacionRepository(c).listar())).toHaveLength(
      1,
    );
  });
});

describe('escritura sin contexto de clínica', () => {
  it('es rechazada por la base (no se escribe nada)', async () => {
    await expect(
      comoAppSinContexto((c) =>
        crearProfesionalRepository(c).crear({ nombre: 'n', apellido: 'a' }),
      ),
    ).rejects.toBeDefined();
    await expect(
      comoAppSinContexto((c) => crearSillonRepository(c).crear({ nombre: 's' })),
    ).rejects.toBeDefined();
    await expect(
      comoAppSinContexto((c) =>
        crearPrestacionRepository(c).crear({ nombre: 'p', duracionMinutos: 30 }),
      ),
    ).rejects.toBeDefined();
    expect(await comoApp(CLINICA_A.id, (c) => crearProfesionalRepository(c).listar())).toEqual([]);
  });
});
