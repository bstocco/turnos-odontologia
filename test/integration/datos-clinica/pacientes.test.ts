import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ErrorDeDominio } from '../../../src/domain/shared/index.js';
import { ErrorDePersistencia } from '../../../src/infrastructure/db/repositories/compartido/index.js';
import {
  crearPacienteRepository,
  type NuevoPaciente,
} from '../../../src/infrastructure/db/repositories/paciente/index.js';
import {
  CLINICA_A,
  CLINICA_B,
  cerrarPool,
  comoApp,
  consultarComoMigra,
  prepararBaseDeDatosClinica,
  type EntornoDePrueba,
} from './soporte.js';

// Todos los datos son sintéticos (regla 2); el DNI/teléfono/email NO deben aparecer en errores.
const DNI_1 = '30111222';
const DNI_2 = '30111333';
const TEL = '+5491123456789';
const EMAIL = 'paciente.uno@example.com';

const base = (cambios: Partial<NuevoPaciente> = {}): NuevoPaciente => ({
  nombre: 'Lucía',
  apellido: 'Gómez',
  dni: DNI_1,
  telefono: TEL,
  email: EMAIL,
  obraSocial: 'Obra Social Sintética',
  ...cambios,
});

let entorno: EntornoDePrueba;

beforeAll(async () => {
  entorno = await prepararBaseDeDatosClinica();
});
afterAll(cerrarPool);

beforeEach(async () => {
  await consultarComoMigra(entorno.urlMigra, 'TRUNCATE paciente CASCADE');
});

const enA = <T>(fn: (r: ReturnType<typeof crearPacienteRepository>) => Promise<T>): Promise<T> =>
  comoApp(CLINICA_A.id, (c) => fn(crearPacienteRepository(c)));
const enB = <T>(fn: (r: ReturnType<typeof crearPacienteRepository>) => Promise<T>): Promise<T> =>
  comoApp(CLINICA_B.id, (c) => fn(crearPacienteRepository(c)));

function sinDatosPersonales(error: unknown, secretos: readonly string[]): void {
  const e = error as Error;
  const serializado = [
    JSON.stringify(e),
    e.message,
    e.stack ?? '',
    JSON.stringify(Object.getOwnPropertyNames(e).map((p) => Reflect.get(e, p))),
  ].join('\n');
  for (const secreto of secretos) expect(serializado).not.toContain(secreto);
  expect(e.cause).toBeUndefined();
}

describe('alta', () => {
  it('crea en A con id nuevo, clinicaId de A y fecha de alta', async () => {
    const antes = Date.now();
    const creado = await enA((r) => r.crear(base()));
    expect(creado.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(creado.clinicaId).toBe(CLINICA_A.id);
    expect(creado.creadoEn).toBeInstanceOf(Date);
    expect(creado.creadoEn.getTime()).toBeGreaterThanOrEqual(antes - 5_000);
    expect(creado).toMatchObject({ nombre: 'Lucía', apellido: 'Gómez', dni: DNI_1, telefono: TEL });
  });

  it('obra social y email opcionales se persisten como null', async () => {
    const creado = await enA((r) => r.crear(base({ obraSocial: undefined, email: undefined })));
    expect(creado.obraSocial).toBeNull();
    expect(creado.email).toBeNull();
    expect((await enA((r) => r.obtenerPorId(creado.id)))?.obraSocial).toBeNull();
  });

  it('teléfono internacional se persiste sin cambios', async () => {
    const creado = await enA((r) => r.crear(base({ telefono: '+5491123456789' })));
    expect(creado.telefono).toBe('+5491123456789');
  });

  it('teléfono sin normalizar -> DATOS_INVALIDOS sin el teléfono en el error', async () => {
    const malo = '011 15-2345-6789';
    const error = await enA((r) => r.crear(base({ telefono: malo }))).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorDeDominio);
    expect((error as ErrorDeDominio).codigo).toBe('DATOS_INVALIDOS');
    sinDatosPersonales(error, [malo, DNI_1, EMAIL, 'Lucía', 'Gómez']);
  });

  it('DNI repetido -> PACIENTE_DNI_DUPLICADO (conflicto) sin el DNI en el error', async () => {
    await enA((r) => r.crear(base()));
    const error = await enA((r) => r.crear(base({ nombre: 'Otra' }))).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorDeDominio);
    expect((error as ErrorDeDominio).codigo).toBe('PACIENTE_DNI_DUPLICADO');
    expect((error as ErrorDeDominio).tipo).toBe('conflicto');
    sinDatosPersonales(error, [DNI_1, TEL, EMAIL]);
  });

  it('el mismo DNI en la clínica B se acepta y A no ve a ese paciente', async () => {
    const enAlta = await enA((r) => r.crear(base()));
    const enBaja = await enB((r) => r.crear(base({ nombre: 'Otro' })));
    expect(enBaja.id).not.toBe(enAlta.id);
    expect(enBaja.clinicaId).toBe(CLINICA_B.id);
    expect((await enA((r) => r.buscarPorDni(DNI_1)))?.id).toBe(enAlta.id);
  });
});

describe('búsquedas', () => {
  it('por DNI registrado devuelve ese paciente; por DNI inexistente, null', async () => {
    const creado = await enA((r) => r.crear(base()));
    expect((await enA((r) => r.buscarPorDni(DNI_1)))?.id).toBe(creado.id);
    expect(await enA((r) => r.buscarPorDni(DNI_2))).toBeNull();
  });

  it('el DNI de B buscado desde A -> null; obtenerPorId ajeno -> null', async () => {
    const deB = await enB((r) => r.crear(base({ dni: DNI_2 })));
    expect(await enA((r) => r.buscarPorDni(DNI_2))).toBeNull();
    expect(await enA((r) => r.obtenerPorId(deB.id))).toBeNull();
    expect(await enA((r) => r.obtenerPorId('no-es-un-uuid'))).toBeNull();
  });

  async function sembrarApellidos(): Promise<void> {
    await enA(async (r) => {
      await r.crear(base({ nombre: 'Ana', apellido: 'Gómez', dni: '30000001' }));
      await r.crear(base({ nombre: 'Beto', apellido: 'Godoy', dni: '30000002' }));
      await r.crear(base({ nombre: 'Aldo', apellido: 'Godoy', dni: '30000003' }));
      await r.crear(base({ nombre: 'Cora', apellido: 'Pérez', dni: '30000004' }));
      await r.crear(base({ nombre: 'Dani', apellido: '100%_real', dni: '30000005' }));
    });
    await enB((r) => r.crear(base({ nombre: 'Ajeno', apellido: 'Gonzalez', dni: '30000006' })));
  }

  it('prefijo "go" devuelve Gómez y Godoy ordenados por apellido y nombre, solo de la clínica', async () => {
    await sembrarApellidos();
    const encontrados = await enA((r) => r.buscarPorApellido('go', 10));
    expect(encontrados.map((p) => `${p.apellido}/${p.nombre}`)).toEqual([
      'Godoy/Aldo',
      'Godoy/Beto',
      'Gómez/Ana',
    ]);
  });

  it('respeta el límite y no distingue mayúsculas', async () => {
    await sembrarApellidos();
    const uno = await enA((r) => r.buscarPorApellido('GO', 1));
    expect(uno).toHaveLength(1);
    expect(uno[0]?.apellido).toBe('Godoy');
  });

  it('escapa % y _ del prefijo (no actúan como comodines)', async () => {
    await sembrarApellidos();
    expect(await enA((r) => r.buscarPorApellido('%', 10))).toEqual([]);
    expect(await enA((r) => r.buscarPorApellido('_', 10))).toEqual([]);
    const literal = await enA((r) => r.buscarPorApellido('100%_', 10));
    expect(literal.map((p) => p.apellido)).toEqual(['100%_real']);
  });

  it('un límite no positivo o no entero -> DATOS_INVALIDOS', async () => {
    for (const limite of [0, -1, 1.5]) {
      const error = await enA((r) => r.buscarPorApellido('go', limite)).catch((e: unknown) => e);
      expect((error as ErrorDeDominio).codigo).toBe('DATOS_INVALIDOS');
    }
  });
});

describe('actualización', () => {
  it('actualiza solo los campos indicados (lista blanca) y puede vaciar la obra social', async () => {
    const creado = await enA((r) => r.crear(base()));
    const actual = await enA((r) => r.actualizar(creado.id, { telefono: '+5491199998888' }));
    expect(actual).toMatchObject({ telefono: '+5491199998888', apellido: 'Gómez', dni: DNI_1 });
    const sinOS = await enA((r) => r.actualizar(creado.id, { obraSocial: null }));
    expect(sinOS?.obraSocial).toBeNull();
  });

  it('un paciente ajeno o inexistente devuelve null', async () => {
    const creado = await enA((r) => r.crear(base()));
    expect(await enB((r) => r.actualizar(creado.id, { nombre: 'hack' }))).toBeNull();
    expect(await enA((r) => r.actualizar('no-es-un-uuid', { nombre: 'x' }))).toBeNull();
  });

  it('actualizar a un DNI existente -> PACIENTE_DNI_DUPLICADO sin datos personales', async () => {
    await enA((r) => r.crear(base({ dni: DNI_1 })));
    const otro = await enA((r) => r.crear(base({ dni: DNI_2, nombre: 'Otro' })));
    const error = await enA((r) => r.actualizar(otro.id, { dni: DNI_1 })).catch((e: unknown) => e);
    expect((error as ErrorDeDominio).codigo).toBe('PACIENTE_DNI_DUPLICADO');
    sinDatosPersonales(error, [DNI_1, DNI_2, TEL, EMAIL]);
  });
});

describe('errores no previstos del motor', () => {
  it('se propagan solo con sqlstate y constraint, sin el detalle ni los valores', async () => {
    // nombre nulo: NOT NULL (23502), no previsto en la tabla de traducción.
    const error = await comoApp(CLINICA_A.id, (c) =>
      crearPacienteRepository(c).crear({ ...base(), nombre: null as unknown as string }),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorDePersistencia);
    expect((error as ErrorDePersistencia).sqlstate).toBe('23502');
    sinDatosPersonales(error, [DNI_1, TEL, EMAIL, 'Gómez']);
  });
});
