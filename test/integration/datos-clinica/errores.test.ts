import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ErrorDeDominio } from '../../../src/domain/shared/index.js';
import {
  ErrorDePersistencia,
  horaAMinutos,
  minutosAHora,
  traducirErrorPg,
} from '../../../src/infrastructure/db/repositories/compartido/index.js';
import {
  CLINICA_A,
  CLINICA_B,
  cerrarPool,
  comoApp,
  consultarComoMigra,
  prepararBaseDeDatosClinica,
  type EntornoDePrueba,
} from './soporte.js';

const PROF_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const PROF_B = 'bbbbbbbb-0000-4000-8000-000000000001';
let USUARIO: string;

/** Crea un usuario del personal de prueba (sintético; hash de contraseña falso — RN-DA). */
async function crearUsuarioSintetico(clinicaId: string): Promise<string> {
  return comoApp(clinicaId, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      'INSERT INTO usuario (id, clinica_id, email, hash_contrasena, rol, profesional_id) VALUES (gen_random_uuid(), $1, $2, $3, $4, NULL) RETURNING id',
      [
        clinicaId,
        `usuario.sintetico.${randomUUID()}@example.com`,
        'hash-sintetico-no-real',
        'administrador',
      ],
    );
    return rows[0]?.id ?? '';
  });
}
// Datos personales sintéticos que NUNCA deben aparecer en un error (Ley 25.326).
const DNI = '30111222';
const TELEFONO = '+5491123456789';
const EMAIL = 'paciente.sintetico.7@example.com';

let entorno: EntornoDePrueba;

/** Provoca el fallo con SQL real y devuelve lo que `traducirErrorPg` produce. */
async function traducir(clinica: string, sql: string, valores: unknown[] = []): Promise<Error> {
  try {
    await comoApp(clinica, (c) => c.query(sql, valores));
  } catch (e) {
    return traducirErrorPg(e);
  }
  throw new Error('La sentencia debía fallar');
}

const INS_PACIENTE = `INSERT INTO paciente (clinica_id, nombre, apellido, dni, telefono, email)
  VALUES ($1, 'Nombre', 'Apellido', $2, $3, $4)`;

beforeAll(async () => {
  entorno = await prepararBaseDeDatosClinica();
});
afterAll(cerrarPool);

beforeEach(async () => {
  await consultarComoMigra(
    entorno.urlMigra,
    'TRUNCATE paciente, feriado, horario_atencion, bloqueo, profesional CASCADE',
  );
  USUARIO = await crearUsuarioSintetico(CLINICA_A.id);
  await comoApp(CLINICA_A.id, (c) =>
    c.query(
      "INSERT INTO profesional (id, clinica_id, nombre, apellido) VALUES ($1, $2, 'n', 'a')",
      [PROF_A, CLINICA_A.id],
    ),
  );
  await comoApp(CLINICA_B.id, (c) =>
    c.query(
      "INSERT INTO profesional (id, clinica_id, nombre, apellido) VALUES ($1, $2, 'n', 'a')",
      [PROF_B, CLINICA_B.id],
    ),
  );
});

function esDominio(error: Error, codigo: string, tipo: string): void {
  expect(error).toBeInstanceOf(ErrorDeDominio);
  expect((error as ErrorDeDominio).codigo).toBe(codigo);
  expect((error as ErrorDeDominio).tipo).toBe(tipo);
}

describe('traducirErrorPg: violaciones reales de PostgreSQL', () => {
  it('23505 paciente_dni_unico -> PACIENTE_DNI_DUPLICADO (conflicto)', async () => {
    await comoApp(CLINICA_A.id, (c) => c.query(INS_PACIENTE, [CLINICA_A.id, DNI, TELEFONO, EMAIL]));
    const error = await traducir(CLINICA_A.id, INS_PACIENTE, [CLINICA_A.id, DNI, TELEFONO, EMAIL]);
    esDominio(error, 'PACIENTE_DNI_DUPLICADO', 'conflicto');
  });

  it('23505 feriado_fecha_unica -> FERIADO_DUPLICADO (conflicto)', async () => {
    const sql =
      "INSERT INTO feriado (clinica_id, fecha, descripcion) VALUES ($1, '2026-12-25', 'x')";
    await comoApp(CLINICA_A.id, (c) => c.query(sql, [CLINICA_A.id]));
    esDominio(await traducir(CLINICA_A.id, sql, [CLINICA_A.id]), 'FERIADO_DUPLICADO', 'conflicto');
  });

  it('23P01 bloqueo_sin_solape -> BLOQUEO_SOLAPADO (conflicto)', async () => {
    const sql = `INSERT INTO bloqueo (clinica_id, profesional_id, inicio, fin, creado_por)
      VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5)`;
    await comoApp(CLINICA_A.id, (c) =>
      c.query(sql, [CLINICA_A.id, PROF_A, '2026-12-10T10:00:00Z', '2026-12-10T12:00:00Z', USUARIO]),
    );
    const error = await traducir(CLINICA_A.id, sql, [
      CLINICA_A.id,
      PROF_A,
      '2026-12-10T11:00:00Z',
      '2026-12-10T13:00:00Z',
      USUARIO,
    ]);
    esDominio(error, 'BLOQUEO_SOLAPADO', 'conflicto');
  });

  it('23P01 horario_sin_solape -> FRANJA_SOLAPADA (conflicto)', async () => {
    const sql = `INSERT INTO horario_atencion (clinica_id, profesional_id, dia_semana, hora_desde, hora_hasta)
      VALUES ($1, $2, 1, $3::time, $4::time)`;
    await comoApp(CLINICA_A.id, (c) => c.query(sql, [CLINICA_A.id, PROF_A, '09:00', '13:00']));
    const error = await traducir(CLINICA_A.id, sql, [CLINICA_A.id, PROF_A, '12:00', '14:00']);
    esDominio(error, 'FRANJA_SOLAPADA', 'conflicto');
  });

  it('23503 clave foránea compuesta -> RECURSO_NO_ENCONTRADO (no_encontrado)', async () => {
    const sql = `INSERT INTO horario_atencion (clinica_id, profesional_id, dia_semana, hora_desde, hora_hasta)
      VALUES ($1, $2, 1, '09:00', '10:00')`;
    // Profesional inexistente en la clínica del contexto.
    const error = await traducir(CLINICA_A.id, sql, [
      CLINICA_A.id,
      'aaaaaaaa-0000-4000-8000-0000000000ff',
    ]);
    esDominio(error, 'RECURSO_NO_ENCONTRADO', 'no_encontrado');
  });

  it('23514 check, 22P02 formato y 22007 fecha -> DATOS_INVALIDOS (solicitud_invalida)', async () => {
    esDominio(
      await traducir(
        CLINICA_A.id,
        "INSERT INTO prestacion (clinica_id, nombre, duracion_minutos) VALUES ($1, 'p', 0)",
        [CLINICA_A.id],
      ),
      'DATOS_INVALIDOS',
      'solicitud_invalida',
    );
    esDominio(
      await traducir(
        CLINICA_A.id,
        "INSERT INTO sillon (clinica_id, nombre, buffer_minutos) VALUES ($1, 's', 'no-es-un-numero')",
        [CLINICA_A.id],
      ),
      'DATOS_INVALIDOS',
      'solicitud_invalida',
    );
    esDominio(
      await traducir(
        CLINICA_A.id,
        "INSERT INTO feriado (clinica_id, fecha, descripcion) VALUES ($1, 'no-es-fecha'::date, 'x')",
        [CLINICA_A.id],
      ),
      'DATOS_INVALIDOS',
      'solicitud_invalida',
    );
  });

  it('un error no previsto (NOT NULL 23502) se propaga solo con sqlstate y constraint', async () => {
    const error = await traducir(
      CLINICA_A.id,
      'INSERT INTO sillon (clinica_id, nombre) VALUES ($1, NULL)',
      [CLINICA_A.id],
    );
    expect(error).toBeInstanceOf(ErrorDePersistencia);
    expect((error as ErrorDePersistencia).sqlstate).toBe('23502');
  });
});

describe('traducirErrorPg: sin datos personales en el error', () => {
  async function erroresDeFichas(): Promise<Error[]> {
    await comoApp(CLINICA_A.id, (c) => c.query(INS_PACIENTE, [CLINICA_A.id, DNI, TELEFONO, EMAIL]));
    return [
      // DNI duplicado: el detail de PostgreSQL contiene el DNI.
      await traducir(CLINICA_A.id, INS_PACIENTE, [CLINICA_A.id, DNI, TELEFONO, EMAIL]),
      // Teléfono inválido: el detail de PostgreSQL contiene la fila completa.
      await traducir(CLINICA_A.id, INS_PACIENTE, [
        CLINICA_A.id,
        '30999888',
        '011 15-2345-6789',
        EMAIL,
      ]),
      // DNI mal formado.
      await traducir(CLINICA_A.id, INS_PACIENTE, [CLINICA_A.id, '12.345', TELEFONO, EMAIL]),
    ];
  }

  it('JSON, message y stack no contienen DNI, teléfono ni email', async () => {
    for (const error of await erroresDeFichas()) {
      const serializado = [
        JSON.stringify(error),
        error.message,
        error.stack ?? '',
        JSON.stringify(Object.getOwnPropertyNames(error).map((p) => Reflect.get(error, p))),
      ].join('\n');
      for (const secreto of [DNI, '30999888', TELEFONO, '011 15-2345-6789', EMAIL, '12.345']) {
        expect(serializado).not.toContain(secreto);
      }
    }
  });

  it('el error no adjunta la causa (el detalle del motor) ni propiedades extra', async () => {
    for (const error of await erroresDeFichas()) {
      expect(error.cause).toBeUndefined();
      expect(Reflect.get(error, 'detail')).toBeUndefined();
    }
  });
});

describe('traducirErrorPg: casos límite', () => {
  it('un error de pg sin constraint se traduce a ErrorDePersistencia con constraint indefinido', () => {
    const error = traducirErrorPg(
      Object.assign(new Error('detalle con 30111222'), { code: '08006' }),
    );
    expect(error).toBeInstanceOf(ErrorDePersistencia);
    expect((error as ErrorDePersistencia).sqlstate).toBe('08006');
    expect((error as ErrorDePersistencia).constraint).toBeUndefined();
    expect(error.message).not.toContain('30111222');
  });

  it('un valor que no es un error de pg produce ErrorDePersistencia sin sqlstate', () => {
    const error = traducirErrorPg('cualquier cosa 30111222');
    expect(error).toBeInstanceOf(ErrorDePersistencia);
    expect((error as ErrorDePersistencia).sqlstate).toBeUndefined();
    expect(error.message).not.toContain('30111222');
  });

  it('un ErrorDeDominio previo se conserva tal cual', () => {
    const original = new ErrorDeDominio('YA_TRADUCIDO', 'conflicto', 'ya traducido');
    expect(traducirErrorPg(original)).toBe(original);
  });

  it('un 23505 con constraint desconocida no se mapea a un código de dominio', () => {
    const error = traducirErrorPg(
      Object.assign(new Error('x'), { code: '23505', constraint: 'otra_constraint' }),
    );
    expect(error).toBeInstanceOf(ErrorDePersistencia);
    expect((error as ErrorDePersistencia).constraint).toBe('otra_constraint');
  });
});

describe('mapeos de horas', () => {
  it.each([
    [0, '00:00'],
    [540, '09:00'],
    [810, '13:30'],
    [1439, '23:59'],
    [1440, '24:00'],
  ])('minutosAHora(%i) = %s y vuelve con horaAMinutos', (minutos, hora) => {
    expect(minutosAHora(minutos)).toBe(hora);
    expect(horaAMinutos(hora)).toBe(minutos);
  });

  it.each([1441, -1, 1.5, Number.NaN])('minutosAHora(%s) se rechaza con DATOS_INVALIDOS', (m) => {
    expect(() => minutosAHora(m)).toThrow(ErrorDeDominio);
    try {
      minutosAHora(m);
    } catch (e) {
      expect((e as ErrorDeDominio).codigo).toBe('DATOS_INVALIDOS');
    }
  });

  it('horaAMinutos acepta el formato time de pg (HH:MM:SS) y rechaza basura', () => {
    expect(horaAMinutos('09:00:00')).toBe(540);
    expect(horaAMinutos('24:00:00')).toBe(1440);
    expect(() => horaAMinutos('9am')).toThrow(ErrorDeDominio);
  });
});
