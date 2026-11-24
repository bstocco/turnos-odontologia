import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  CLINICA_A,
  CLINICA_B,
  cerrarPool,
  comoApp,
  consultarComoMigra,
  prepararBaseDeDatosClinica,
  type EntornoDePrueba,
} from './soporte.js';

let entorno: EntornoDePrueba;

const TABLAS = [
  'profesional',
  'sillon',
  'prestacion',
  'paciente',
  'feriado',
  'horario_atencion',
  'bloqueo',
] as const;

const PROF_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const PROF_A2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const PROF_B = 'bbbbbbbb-0000-4000-8000-000000000001';
const USUARIO_INEXISTENTE = 'cccccccc-0000-4000-8000-000000000001';

interface ErrorPg {
  readonly code?: string;
  readonly constraint?: string;
}

/** Ejecuta una sentencia como app en la clínica y devuelve el error de pg (o undefined si pasó). */
async function intentar(
  clinicaId: string,
  sql: string,
  valores: unknown[] = [],
): Promise<ErrorPg | undefined> {
  try {
    await comoApp(clinicaId, (c) => c.query(sql, valores));
    return undefined;
  } catch (e) {
    return e as ErrorPg;
  }
}

async function ejecutar(clinicaId: string, sql: string, valores: unknown[] = []): Promise<void> {
  const error = await intentar(clinicaId, sql, valores);
  if (error !== undefined) throw error;
}

const insertarProfesional = (clinica: string, id: string): Promise<void> =>
  ejecutar(
    clinica,
    'INSERT INTO profesional (id, clinica_id, nombre, apellido) VALUES ($1, $2, $3, $4)',
    [id, clinica, 'Nombre sintético', 'Apellido sintético'],
  );

const insertarFranja = (
  clinica: string,
  prof: string,
  dia: number,
  desde: string,
  hasta: string,
): Promise<ErrorPg | undefined> =>
  intentar(
    clinica,
    `INSERT INTO horario_atencion (clinica_id, profesional_id, dia_semana, hora_desde, hora_hasta)
     VALUES ($1, $2, $3, $4::time, $5::time)`,
    [clinica, prof, dia, desde, hasta],
  );

const insertarBloqueo = (
  clinica: string,
  prof: string,
  inicio: string,
  fin: string,
  creadoPor = USUARIO_INEXISTENTE,
): Promise<ErrorPg | undefined> =>
  intentar(
    clinica,
    `INSERT INTO bloqueo (clinica_id, profesional_id, inicio, fin, creado_por)
     VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5)`,
    [clinica, prof, inicio, fin, creadoPor],
  );

const insertarDniPaciente = (clinica: string, dni: string): Promise<ErrorPg | undefined> =>
  intentar(
    clinica,
    `INSERT INTO paciente (clinica_id, nombre, apellido, dni, telefono)
     VALUES ($1, 'Nombre', 'Apellido', $2, '+5491123456789')`,
    [clinica, dni],
  );

beforeAll(async () => {
  entorno = await prepararBaseDeDatosClinica();
});
afterAll(cerrarPool);

beforeEach(async (contexto) => {
  // El spike D5 no necesita datos ni las tablas de C05_001.
  if (contexto.task.suite?.name.startsWith('spike') === true) return;
  // TRUNCATE no pasa por RLS; el rol migra es propietario de las tablas.
  await consultarComoMigra(entorno.urlMigra, `TRUNCATE ${TABLAS.join(', ')} CASCADE`);
  await insertarProfesional(CLINICA_A.id, PROF_A);
  await insertarProfesional(CLINICA_A.id, PROF_A2);
  await insertarProfesional(CLINICA_B.id, PROF_B);
});

describe('spike D5: exclusión de franjas con int4range sobre time', () => {
  it('minutos_del_dia(time) es IMMUTABLE y admite 24:00 en un EXCLUDE', async () => {
    const sql = `
      CREATE SCHEMA spike_d5;
      CREATE FUNCTION spike_d5.minutos_del_dia(t time) RETURNS int
        LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT (EXTRACT(EPOCH FROM t) / 60)::int $$;
      CREATE TABLE spike_d5.franja (
        p uuid, d time, h time,
        EXCLUDE USING gist (
          p WITH =,
          int4range(spike_d5.minutos_del_dia(d), spike_d5.minutos_del_dia(h), '[)') WITH &&)
      );
      INSERT INTO spike_d5.franja VALUES ('${PROF_A}', '20:00', '24:00');
    `;
    await consultarComoMigra(entorno.urlMigra, 'DROP SCHEMA IF EXISTS spike_d5 CASCADE');
    await consultarComoMigra(entorno.urlMigra, sql);
    const filas = await consultarComoMigra<{ m: number }>(
      entorno.urlMigra,
      "SELECT spike_d5.minutos_del_dia('24:00'::time) AS m",
    ).finally(() => consultarComoMigra(entorno.urlMigra, 'DROP SCHEMA IF EXISTS spike_d5 CASCADE'));
    expect(filas[0]?.m).toBe(1440);
  });
});

describe('tablas, tipos, propiedad y privilegios', () => {
  it.each(TABLAS)('%s existe con clinica_id NOT NULL y FK a clinica', async (tabla) => {
    const filas = await consultarComoMigra<{ nullable: string; fk: number }>(
      entorno.urlMigra,
      `SELECT c.is_nullable AS nullable,
              (SELECT count(*)::int FROM pg_constraint k
                WHERE k.conrelid = $1::regclass AND k.contype = 'f'
                  AND k.confrelid = 'clinica'::regclass
                  AND k.conkey = ARRAY[(SELECT attnum FROM pg_attribute
                        WHERE attrelid = $1::regclass AND attname = 'clinica_id')]) AS fk
         FROM information_schema.columns c
        WHERE c.table_name = $2 AND c.column_name = 'clinica_id'`,
      [tabla, tabla],
    );
    expect(filas[0]?.nullable).toBe('NO');
    expect(filas[0]?.fk).toBe(1);
  });

  it('usa timestamptz, time y date donde corresponde', async () => {
    const filas = await consultarComoMigra<{ t: string; c: string; tipo: string }>(
      entorno.urlMigra,
      `SELECT table_name AS t, column_name AS c, data_type AS tipo
         FROM information_schema.columns
        WHERE (table_name, column_name) IN
              (('bloqueo','inicio'),('bloqueo','fin'),('paciente','creado_en'),
               ('horario_atencion','hora_desde'),('horario_atencion','hora_hasta'),
               ('feriado','fecha'))`,
    );
    const tipos = Object.fromEntries(filas.map((f) => [`${f.t}.${f.c}`, f.tipo]));
    expect(tipos).toEqual({
      'bloqueo.inicio': 'timestamp with time zone',
      'bloqueo.fin': 'timestamp with time zone',
      'paciente.creado_en': 'timestamp with time zone',
      'horario_atencion.hora_desde': 'time without time zone',
      'horario_atencion.hora_hasta': 'time without time zone',
      'feriado.fecha': 'date',
    });
  });

  it('ninguna tabla pertenece al rol app y todas tienen RLS forzada', async () => {
    const filas = await consultarComoMigra<{
      relname: string;
      dueno: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      entorno.urlMigra,
      `SELECT c.relname, pg_get_userbyid(c.relowner) AS dueno, c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c WHERE c.relname = ANY($1) AND c.relkind = 'r'`,
      [[...TABLAS]],
    );
    expect(filas).toHaveLength(7);
    for (const fila of filas) {
      expect(fila.dueno).not.toBe('app');
      expect(fila.relrowsecurity).toBe(true);
      expect(fila.relforcerowsecurity).toBe(true);
    }
  });

  it.each(['profesional', 'sillon', 'prestacion', 'paciente'])(
    'app no puede borrar filas de %s (sin privilegio DELETE)',
    async (tabla) => {
      const error = await intentar(CLINICA_A.id, `DELETE FROM ${tabla}`);
      expect(error?.code).toBe('42501');
    },
  );

  it.each(['feriado', 'horario_atencion', 'bloqueo'])(
    'app puede borrar filas de %s',
    async (tabla) => {
      expect(await intentar(CLINICA_A.id, `DELETE FROM ${tabla}`)).toBeUndefined();
    },
  );

  it('las claves únicas (clinica_id, id) existen en las cuatro tablas padre', async () => {
    const filas = await consultarComoMigra<{ tabla: string }>(
      entorno.urlMigra,
      `SELECT conrelid::regclass::text AS tabla FROM pg_constraint
        WHERE contype = 'u' AND conname = ANY($1)`,
      [['profesional', 'sillon', 'prestacion', 'paciente'].map((t) => `${t}_clinica_id_id_key`)],
    );
    expect(filas.map((f) => f.tabla).sort()).toEqual([
      'paciente',
      'prestacion',
      'profesional',
      'sillon',
    ]);
  });
});

describe('fila sin clínica', () => {
  const inserciones: Record<(typeof TABLAS)[number], string> = {
    profesional: "INSERT INTO profesional (nombre, apellido) VALUES ('n', 'a')",
    sillon: "INSERT INTO sillon (nombre) VALUES ('s')",
    prestacion: "INSERT INTO prestacion (nombre, duracion_minutos) VALUES ('p', 30)",
    paciente:
      "INSERT INTO paciente (nombre, apellido, dni, telefono) VALUES ('n', 'a', '30111222', '+5491123456789')",
    feriado: "INSERT INTO feriado (fecha, descripcion) VALUES ('2026-12-25', 'x')",
    horario_atencion: `INSERT INTO horario_atencion (profesional_id, dia_semana, hora_desde, hora_hasta)
       VALUES ('${PROF_A}', 1, '09:00', '10:00')`,
    bloqueo: `INSERT INTO bloqueo (profesional_id, inicio, fin, creado_por)
       VALUES ('${PROF_A}', now(), now() + interval '1 hour', '${USUARIO_INEXISTENTE}')`,
  };

  it.each(TABLAS)('%s rechaza una inserción sin clinica_id', async (tabla) => {
    const error = await intentar(CLINICA_A.id, inserciones[tabla]);
    expect(error).toBeDefined();
    expect(['23502', '42501']).toContain(error?.code);
  });
});

describe('franjas de atención', () => {
  it('rechaza hora_desde = hora_hasta (horario_horas_check)', async () => {
    const error = await insertarFranja(CLINICA_A.id, PROF_A, 1, '10:00', '10:00');
    expect(error?.code).toBe('23514');
    expect(error?.constraint).toBe('horario_horas_check');
  });

  it('rechaza dia_semana = 7 y acepta 0 y 6', async () => {
    const malo = await insertarFranja(CLINICA_A.id, PROF_A, 7, '09:00', '10:00');
    expect(malo?.constraint).toBe('horario_dia_semana_check');
    expect(await insertarFranja(CLINICA_A.id, PROF_A, 0, '09:00', '10:00')).toBeUndefined();
    expect(await insertarFranja(CLINICA_A.id, PROF_A, 6, '09:00', '10:00')).toBeUndefined();
  });

  it('acepta una franja de 20:00 a 24:00', async () => {
    expect(await insertarFranja(CLINICA_A.id, PROF_A, 5, '20:00', '24:00')).toBeUndefined();
  });

  it('acepta franjas contiguas y rechaza solapadas con exclusión', async () => {
    expect(await insertarFranja(CLINICA_A.id, PROF_A, 1, '09:00', '13:00')).toBeUndefined();
    expect(await insertarFranja(CLINICA_A.id, PROF_A, 1, '13:00', '17:00')).toBeUndefined();
    const solapada = await insertarFranja(CLINICA_A.id, PROF_A, 1, '12:00', '14:00');
    expect(solapada?.code).toBe('23P01');
    expect(solapada?.constraint).toBe('horario_sin_solape');
  });

  it('permite la misma franja en otro día y para otro profesional', async () => {
    expect(await insertarFranja(CLINICA_A.id, PROF_A, 1, '09:00', '13:00')).toBeUndefined();
    expect(await insertarFranja(CLINICA_A.id, PROF_A, 2, '09:00', '13:00')).toBeUndefined();
    expect(await insertarFranja(CLINICA_A.id, PROF_A2, 1, '09:00', '13:00')).toBeUndefined();
  });

  it('rechaza una franja con profesional de otra clínica (clave foránea)', async () => {
    const error = await insertarFranja(CLINICA_A.id, PROF_B, 1, '09:00', '13:00');
    expect(error?.code).toBe('23503');
  });
});

describe('sillones y prestaciones', () => {
  it('rechaza buffer_minutos = -5', async () => {
    const error = await intentar(
      CLINICA_A.id,
      "INSERT INTO sillon (clinica_id, nombre, buffer_minutos) VALUES ($1, 's', -5)",
      [CLINICA_A.id],
    );
    expect(error?.constraint).toBe('sillon_buffer_minutos_check');
  });

  it('un sillón sin buffer queda con 0 y activo; con 10 lo conserva', async () => {
    await ejecutar(CLINICA_A.id, "INSERT INTO sillon (clinica_id, nombre) VALUES ($1, 's1')", [
      CLINICA_A.id,
    ]);
    await ejecutar(
      CLINICA_A.id,
      "INSERT INTO sillon (clinica_id, nombre, buffer_minutos) VALUES ($1, 's2', 10)",
      [CLINICA_A.id],
    );
    const { rows } = await comoApp(CLINICA_A.id, (c) =>
      c.query<{ nombre: string; buffer_minutos: number; activo: boolean }>(
        'SELECT nombre, buffer_minutos, activo FROM sillon ORDER BY nombre',
      ),
    );
    expect(rows).toEqual([
      { nombre: 's1', buffer_minutos: 0, activo: true },
      { nombre: 's2', buffer_minutos: 10, activo: true },
    ]);
  });

  it('rechaza duracion_minutos = 0 y acepta 1', async () => {
    const malo = await intentar(
      CLINICA_A.id,
      "INSERT INTO prestacion (clinica_id, nombre, duracion_minutos) VALUES ($1, 'p', 0)",
      [CLINICA_A.id],
    );
    expect(malo?.constraint).toBe('prestacion_duracion_minutos_check');
    const bueno = await intentar(
      CLINICA_A.id,
      "INSERT INTO prestacion (clinica_id, nombre, duracion_minutos) VALUES ($1, 'p', 1)",
      [CLINICA_A.id],
    );
    expect(bueno).toBeUndefined();
  });
});

describe('feriados', () => {
  const insertar = (clinica: string, fecha: string): Promise<ErrorPg | undefined> =>
    intentar(
      clinica,
      "INSERT INTO feriado (clinica_id, fecha, descripcion) VALUES ($1, $2::date, 'x')",
      [clinica, fecha],
    );

  it('rechaza un feriado repetido en la clínica y lo acepta en otra', async () => {
    expect(await insertar(CLINICA_A.id, '2026-12-25')).toBeUndefined();
    const repetido = await insertar(CLINICA_A.id, '2026-12-25');
    expect(repetido?.code).toBe('23505');
    expect(repetido?.constraint).toBe('feriado_fecha_unica');
    expect(await insertar(CLINICA_B.id, '2026-12-25')).toBeUndefined();
  });
});

describe('pacientes', () => {
  it('rechaza un DNI repetido en la clínica y lo acepta en otra sin que A vea a B', async () => {
    expect(await insertarDniPaciente(CLINICA_A.id, '30111222')).toBeUndefined();
    const repetido = await insertarDniPaciente(CLINICA_A.id, '30111222');
    expect(repetido?.code).toBe('23505');
    expect(repetido?.constraint).toBe('paciente_dni_unico');
    expect(await insertarDniPaciente(CLINICA_B.id, '30111222')).toBeUndefined();
    const { rows } = await comoApp(CLINICA_A.id, (c) => c.query('SELECT 1 FROM paciente'));
    expect(rows).toHaveLength(1);
  });

  it.each(['1234567', '12345678'])('acepta el DNI %s', async (dni) => {
    expect(await insertarDniPaciente(CLINICA_A.id, dni)).toBeUndefined();
  });

  it.each(['123456', '123456789', '30.111.222', 'ABC12345'])(
    'rechaza el DNI mal formado %s',
    async (dni) => {
      const error = await insertarDniPaciente(CLINICA_A.id, dni);
      expect(error?.constraint).toBe('paciente_dni_formato_check');
    },
  );

  it('rechaza un teléfono sin formato internacional y acepta uno internacional', async () => {
    const malo = await intentar(
      CLINICA_A.id,
      `INSERT INTO paciente (clinica_id, nombre, apellido, dni, telefono)
       VALUES ($1, 'n', 'a', '30111222', '011 15-2345-6789')`,
      [CLINICA_A.id],
    );
    expect(malo?.constraint).toBe('paciente_telefono_formato_check');
    expect(await insertarDniPaciente(CLINICA_A.id, '30111222')).toBeUndefined();
  });
});

describe('bloqueos', () => {
  const H = (h: number): string => `2026-12-10T${String(h).padStart(2, '0')}:00:00Z`;

  it('rechaza un bloqueo invertido o vacío (bloqueo_rango_check)', async () => {
    const igual = await insertarBloqueo(CLINICA_A.id, PROF_A, H(10), H(10));
    expect(igual?.constraint).toBe('bloqueo_rango_check');
    const invertido = await insertarBloqueo(CLINICA_A.id, PROF_A, H(12), H(10));
    expect(invertido?.constraint).toBe('bloqueo_rango_check');
  });

  it('rechaza bloqueos solapados del mismo profesional con 23P01', async () => {
    expect(await insertarBloqueo(CLINICA_A.id, PROF_A, H(10), H(12))).toBeUndefined();
    const solapado = await insertarBloqueo(CLINICA_A.id, PROF_A, H(11), H(13));
    expect(solapado?.code).toBe('23P01');
    expect(solapado?.constraint).toBe('bloqueo_sin_solape');
  });

  it('acepta un bloqueo contiguo y uno de otro profesional', async () => {
    expect(await insertarBloqueo(CLINICA_A.id, PROF_A, H(10), H(12))).toBeUndefined();
    expect(await insertarBloqueo(CLINICA_A.id, PROF_A, H(12), H(13))).toBeUndefined();
    expect(await insertarBloqueo(CLINICA_A.id, PROF_A2, H(10), H(12))).toBeUndefined();
  });

  it('acepta un creado_por sin usuario (la FK la agrega C-12)', async () => {
    expect(
      await insertarBloqueo(
        CLINICA_A.id,
        PROF_A,
        H(10),
        H(11),
        'dddddddd-0000-4000-8000-00000000ffff',
      ),
    ).toBeUndefined();
  });

  it('rechaza un bloqueo con profesional de otra clínica (clave foránea)', async () => {
    const error = await insertarBloqueo(CLINICA_A.id, PROF_B, H(10), H(11));
    expect(error?.code).toBe('23503');
  });
});
