import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CLINICA_A,
  CLINICA_B,
  cerrarPool,
  comoApp,
  comoAppSinContexto,
  prepararBaseDeDatosClinica,
} from './soporte.js';

// Regla 3: toda tabla con datos de clínica lleva una prueba de aislamiento entre clínicas.
const PROF_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const PROF_B = 'bbbbbbbb-0000-4000-8000-000000000001';

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

/** Una inserción válida por tabla; `$1` = clinica_id, `$2` = profesional de esa clínica. */
const INSERCIONES = {
  profesional:
    "INSERT INTO profesional (id, clinica_id, nombre, apellido) VALUES ($2, $1, 'Nombre', 'Apellido')",
  sillon: "INSERT INTO sillon (clinica_id, nombre) VALUES ($1, 'Sillón sintético')",
  prestacion:
    "INSERT INTO prestacion (clinica_id, nombre, duracion_minutos) VALUES ($1, 'Consulta', 30)",
  paciente: `INSERT INTO paciente (clinica_id, nombre, apellido, dni, telefono)
    VALUES ($1, 'Nombre', 'Apellido', '30111222', '+5491123456789')`,
  feriado: "INSERT INTO feriado (clinica_id, fecha, descripcion) VALUES ($1, '2026-12-25', 'x')",
  horario_atencion: `INSERT INTO horario_atencion (clinica_id, profesional_id, dia_semana, hora_desde, hora_hasta)
    VALUES ($1, $2, 1, '09:00', '13:00')`,
  bloqueo: (creadoPor: string) =>
    `INSERT INTO bloqueo (clinica_id, profesional_id, inicio, fin, creado_por)
    VALUES ($1, $2, '2026-12-10T10:00:00Z', '2026-12-10T12:00:00Z', '${creadoPor}')`,
} as const;

type Tabla = keyof typeof INSERCIONES;

/** Pasa solo los parámetros que la sentencia referencia (pg exige que coincidan). */
function insertar(
  contexto: string,
  tabla: Tabla,
  clinicaFila: string,
  prof: string,
): Promise<unknown> {
  if (tabla === 'bloqueo') {
    return comoApp(contexto, async (c) =>
      c.query(INSERCIONES.bloqueo(await crearUsuarioSintetico(contexto)), [clinicaFila, prof]),
    );
  }
  const sql = INSERCIONES[tabla];
  const parametros = sql.includes('$2') ? [clinicaFila, prof] : [clinicaFila];
  return comoApp(contexto, (c) => c.query(sql, parametros));
}
const TABLAS = Object.keys(INSERCIONES) as Tabla[];

// El profesional debe existir antes que sus horarios y bloqueos.
const ORDEN: Tabla[] = [
  'profesional',
  'sillon',
  'prestacion',
  'paciente',
  'feriado',
  'horario_atencion',
  'bloqueo',
];

beforeAll(async () => {
  await prepararBaseDeDatosClinica();
  for (const [clinica, prof] of [
    [CLINICA_A.id, PROF_A],
    [CLINICA_B.id, PROF_B],
  ] as const) {
    for (const tabla of ORDEN) {
      await insertar(clinica, tabla, clinica, prof);
    }
  }
});
afterAll(cerrarPool);

describe.each(TABLAS)('aislamiento de %s', (tabla) => {
  it('la clínica A solo ve sus filas y la B las suyas', async () => {
    for (const clinica of [CLINICA_A.id, CLINICA_B.id]) {
      const { rows } = await comoApp(clinica, (c) =>
        c.query<{ clinica_id: string }>(`SELECT clinica_id FROM ${tabla}`),
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(new Set(rows.map((f) => f.clinica_id))).toEqual(new Set([clinica]));
    }
  });

  it('la clínica A no inserta una fila con el clinica_id de la B (42501)', async () => {
    await expect(insertar(CLINICA_A.id, tabla, CLINICA_B.id, PROF_B)).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('sin contexto de clínica no se ve ninguna fila (falla cerrada)', async () => {
    const { rows } = await comoAppSinContexto((c) => c.query(`SELECT 1 FROM ${tabla}`));
    expect(rows).toHaveLength(0);
  });
});
