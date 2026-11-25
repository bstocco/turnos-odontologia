import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  crearFechaLocal,
  crearIntervaloOLanzar,
  type FechaLocal,
} from '../../../src/domain/agenda/index.js';
import { ErrorDeDominio, type ProfesionalId } from '../../../src/domain/shared/index.js';
import { crearBloqueoRepository } from '../../../src/infrastructure/db/repositories/bloqueo/index.js';
import { crearCalendarioReader } from '../../../src/infrastructure/db/repositories/calendario/index.js';
import { crearFeriadoRepository } from '../../../src/infrastructure/db/repositories/feriado/index.js';
import { crearHorarioRepository } from '../../../src/infrastructure/db/repositories/horario/index.js';
import {
  CLINICA_A,
  CLINICA_B,
  cerrarPool,
  comoApp,
  consultarComoMigra,
  prepararBaseDeDatosClinica,
  type EntornoDePrueba,
} from './soporte.js';

const PROF_A = 'aaaaaaaa-0000-4000-8000-000000000001' as ProfesionalId;
const PROF_A2 = 'aaaaaaaa-0000-4000-8000-000000000002' as ProfesionalId;
const PROF_B = 'bbbbbbbb-0000-4000-8000-000000000001' as ProfesionalId;
let USUARIO: string;

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

const fecha = (valor: string): FechaLocal => {
  const r = crearFechaLocal(valor);
  if (!r.ok) throw r.error;
  return r.valor;
};
const utc = (hora: number, minuto = 0): Date => new Date(Date.UTC(2026, 11, 10, hora, minuto));

let entorno: EntornoDePrueba;

beforeAll(async () => {
  entorno = await prepararBaseDeDatosClinica();
});
afterAll(cerrarPool);

beforeEach(async () => {
  await consultarComoMigra(
    entorno.urlMigra,
    'TRUNCATE horario_atencion, bloqueo, feriado, profesional CASCADE',
  );
  for (const [clinica, id] of [
    [CLINICA_A.id, PROF_A],
    [CLINICA_A.id, PROF_A2],
    [CLINICA_B.id, PROF_B],
  ] as const) {
    await comoApp(clinica, (c) =>
      c.query(
        "INSERT INTO profesional (id, clinica_id, nombre, apellido) VALUES ($1, $2, 'n', 'a')",
        [id, clinica],
      ),
    );
  }
  USUARIO = await crearUsuarioSintetico(CLINICA_A.id);
});

const enA = <T>(fn: (c: Parameters<typeof crearHorarioRepository>[0]) => Promise<T>): Promise<T> =>
  comoApp(CLINICA_A.id, fn);

describe('franjas de atención', () => {
  it('franja martes 09:00-13:30 -> { 2, 540, 810 }', async () => {
    const franjas = await enA(async (c) => {
      await crearHorarioRepository(c).reemplazarFranjas(PROF_A, [
        { diaSemana: 2, desdeMinutos: 540, hastaMinutos: 810 },
      ]);
      return crearCalendarioReader(c).franjasDeAtencion(PROF_A);
    });
    expect(franjas).toEqual([{ diaSemana: 2, desdeMinutos: 540, hastaMinutos: 810 }]);
  });

  it('guarda y vuelve a leer una franja hasta medianoche (1440)', async () => {
    const franjas = await enA(async (c) => {
      await crearHorarioRepository(c).reemplazarFranjas(PROF_A, [
        { diaSemana: 5, desdeMinutos: 1200, hastaMinutos: 1440 },
      ]);
      return crearCalendarioReader(c).franjasDeAtencion(PROF_A);
    });
    expect(franjas).toEqual([{ diaSemana: 5, desdeMinutos: 1200, hastaMinutos: 1440 }]);
  });

  it('devuelve las franjas ordenadas por día y hora de inicio', async () => {
    const franjas = await enA(async (c) => {
      await crearHorarioRepository(c).reemplazarFranjas(PROF_A, [
        { diaSemana: 3, desdeMinutos: 840, hastaMinutos: 1080 },
        { diaSemana: 1, desdeMinutos: 840, hastaMinutos: 1080 },
        { diaSemana: 1, desdeMinutos: 540, hastaMinutos: 780 },
      ]);
      return crearCalendarioReader(c).franjasDeAtencion(PROF_A);
    });
    expect(franjas.map((f) => [f.diaSemana, f.desdeMinutos])).toEqual([
      [1, 540],
      [1, 840],
      [3, 840],
    ]);
  });

  it('reemplazar con solape -> FRANJA_SOLAPADA y las franjas anteriores quedan intactas', async () => {
    const original = [{ diaSemana: 1, desdeMinutos: 540, hastaMinutos: 780 }];
    const { error, despues } = await enA(async (c) => {
      const repo = crearHorarioRepository(c);
      await repo.reemplazarFranjas(PROF_A, original);
      const fallo = await repo
        .reemplazarFranjas(PROF_A, [
          { diaSemana: 2, desdeMinutos: 540, hastaMinutos: 780 },
          { diaSemana: 2, desdeMinutos: 700, hastaMinutos: 900 },
        ])
        .catch((e: unknown) => e);
      // La transacción sigue usable: el reemplazo fallido revirtió solo su propio trabajo.
      return { error: fallo, despues: await crearCalendarioReader(c).franjasDeAtencion(PROF_A) };
    });
    expect(error).toBeInstanceOf(ErrorDeDominio);
    expect((error as ErrorDeDominio).codigo).toBe('FRANJA_SOLAPADA');
    expect((error as ErrorDeDominio).tipo).toBe('conflicto');
    expect(despues).toEqual(original);
  });

  it('reemplazar con un conjunto vacío borra las franjas; no toca las de otro profesional', async () => {
    const resultado = await enA(async (c) => {
      const repo = crearHorarioRepository(c);
      await repo.reemplazarFranjas(PROF_A, [{ diaSemana: 1, desdeMinutos: 0, hastaMinutos: 60 }]);
      await repo.reemplazarFranjas(PROF_A2, [{ diaSemana: 1, desdeMinutos: 0, hastaMinutos: 60 }]);
      await repo.reemplazarFranjas(PROF_A, []);
      const lector = crearCalendarioReader(c);
      return {
        a: await lector.franjasDeAtencion(PROF_A),
        a2: await lector.franjasDeAtencion(PROF_A2),
      };
    });
    expect(resultado.a).toEqual([]);
    expect(resultado.a2).toHaveLength(1);
  });

  it('franjas inválidas (fuera de 0-1440 o desde >= hasta) -> DATOS_INVALIDOS', async () => {
    for (const franja of [
      { diaSemana: 1, desdeMinutos: 540, hastaMinutos: 1441 },
      { diaSemana: 1, desdeMinutos: 600, hastaMinutos: 600 },
      { diaSemana: 7, desdeMinutos: 540, hastaMinutos: 600 },
    ]) {
      const error = await enA((c) =>
        crearHorarioRepository(c).reemplazarFranjas(PROF_A, [franja]),
      ).catch((e: unknown) => e);
      expect((error as ErrorDeDominio).codigo).toBe('DATOS_INVALIDOS');
    }
  });

  it('profesional de otra clínica: lectura vacía y escritura RECURSO_NO_ENCONTRADO', async () => {
    expect(await enA((c) => crearCalendarioReader(c).franjasDeAtencion(PROF_B))).toEqual([]);
    const error = await enA((c) =>
      crearHorarioRepository(c).reemplazarFranjas(PROF_B, [
        { diaSemana: 1, desdeMinutos: 540, hastaMinutos: 600 },
      ]),
    ).catch((e: unknown) => e);
    expect((error as ErrorDeDominio).codigo).toBe('RECURSO_NO_ENCONTRADO');
  });
});

describe('feriados', () => {
  const sembrar = (): Promise<unknown> =>
    enA(async (c) => {
      const repo = crearFeriadoRepository(c);
      await repo.crear(fecha('2026-12-08'), 'Inmaculada Concepción');
      await repo.crear(fecha('2026-12-25'), 'Navidad');
      await repo.crear(fecha('2026-07-09'), 'Día de la Independencia');
    });

  it('rango semiabierto [2026-12-08, 2026-12-25) devuelve solo el 08', async () => {
    await sembrar();
    const r = await enA((c) =>
      crearCalendarioReader(c).feriados(fecha('2026-12-08'), fecha('2026-12-25')),
    );
    expect(r).toEqual(['2026-12-08']);
  });

  it('un rango más amplio devuelve ambas fechas ordenadas', async () => {
    await sembrar();
    const r = await enA((c) =>
      crearCalendarioReader(c).feriados(fecha('2026-12-01'), fecha('2027-01-01')),
    );
    expect(r).toEqual(['2026-12-08', '2026-12-25']);
  });

  it('la fecha no depende de la zona horaria del proceso', async () => {
    await sembrar();
    const zonaOriginal = process.env.TZ;
    try {
      for (const zona of ['Pacific/Kiritimati', 'America/Los_Angeles']) {
        process.env.TZ = zona;
        const r = await enA((c) =>
          crearCalendarioReader(c).feriados(fecha('2026-07-01'), fecha('2026-08-01')),
        );
        expect(r).toEqual(['2026-07-09']);
      }
      // Control negativo: el parser por defecto de `date` de pg SÍ se desplaza con la zona.
      process.env.TZ = 'Pacific/Kiritimati';
      const { rows } = await enA((c) =>
        c.query("SELECT fecha FROM feriado WHERE fecha = '2026-07-09'"),
      );
      const crudo = rows[0]?.['fecha'];
      expect(crudo).toBeInstanceOf(Date);
      expect((crudo as Date).toISOString().slice(0, 10)).not.toBe('2026-07-09');
    } finally {
      if (zonaOriginal === undefined) delete process.env.TZ;
      else process.env.TZ = zonaOriginal;
    }
  });

  it('feriado repetido -> FERIADO_DUPLICADO; crear/eliminar/listar', async () => {
    const creado = await enA((c) =>
      crearFeriadoRepository(c).crear(fecha('2026-12-25'), 'Navidad'),
    );
    const repetido = await enA((c) =>
      crearFeriadoRepository(c).crear(fecha('2026-12-25'), 'Otra'),
    ).catch((e: unknown) => e);
    expect((repetido as ErrorDeDominio).codigo).toBe('FERIADO_DUPLICADO');
    expect(creado).toMatchObject({ fecha: '2026-12-25', descripcion: 'Navidad' });

    const listaDespues = await enA(async (c) => {
      const repo = crearFeriadoRepository(c);
      const creado = await repo.crear(fecha('2026-12-26'), 'Puente');
      const eliminado = await repo.eliminar(creado.id);
      const inexistente = await repo.eliminar(creado.id);
      return { eliminado, inexistente, lista: (await repo.listar()).map((f) => f.fecha) };
    });
    expect(listaDespues).toEqual({ eliminado: true, inexistente: false, lista: ['2026-12-25'] });
  });

  it('la clínica B no ve los feriados de A y puede repetir la fecha', async () => {
    await sembrar();
    const b = await comoApp(CLINICA_B.id, async (c) => {
      const repo = crearFeriadoRepository(c);
      const antes = await crearCalendarioReader(c).feriados(
        fecha('2026-01-01'),
        fecha('2027-01-01'),
      );
      await repo.crear(fecha('2026-12-25'), 'Navidad B');
      return antes;
    });
    expect(b).toEqual([]);
  });
});

describe('bloqueos', () => {
  const crear = (prof: ProfesionalId, ini: Date, fin: Date) =>
    enA((c) =>
      crearBloqueoRepository(c).crear({
        profesionalId: prof,
        intervalo: crearIntervaloOLanzar(ini, fin),
        creadoPor: USUARIO,
      }),
    );

  it('un bloqueo adyacente [12:00,13:00) no aparece para [10:00,12:00)', async () => {
    await crear(PROF_A, utc(10), utc(12));
    const r = await enA((c) =>
      crearCalendarioReader(c).bloqueos(PROF_A, crearIntervaloOLanzar(utc(12), utc(13))),
    );
    expect(r).toEqual([]);
  });

  it('un bloqueo parcial aparece con su intervalo completo', async () => {
    const creado = await crear(PROF_A, utc(10), utc(12));
    const r = await enA((c) =>
      crearCalendarioReader(c).bloqueos(PROF_A, crearIntervaloOLanzar(utc(11, 30), utc(13))),
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.id).toBe(creado.id);
    expect(r[0]?.profesionalId).toBe(PROF_A);
    expect(r[0]?.intervalo.inicio.toISOString()).toBe(utc(10).toISOString());
    expect(r[0]?.intervalo.fin.toISOString()).toBe(utc(12).toISOString());
  });

  it('no devuelve bloqueos de otro profesional', async () => {
    await crear(PROF_A2, utc(10), utc(12));
    const r = await enA((c) =>
      crearCalendarioReader(c).bloqueos(PROF_A, crearIntervaloOLanzar(utc(9), utc(13))),
    );
    expect(r).toEqual([]);
  });

  it('bloqueo solapado -> BLOQUEO_SOLAPADO', async () => {
    await crear(PROF_A, utc(10), utc(12));
    const error = await crear(PROF_A, utc(11), utc(13)).catch((e: unknown) => e);
    expect((error as ErrorDeDominio).codigo).toBe('BLOQUEO_SOLAPADO');
    expect((error as ErrorDeDominio).tipo).toBe('conflicto');
  });

  it('bloqueo con profesional de B -> RECURSO_NO_ENCONTRADO sin revelar que existe', async () => {
    const error = await crear(PROF_B, utc(10), utc(12)).catch((e: unknown) => e);
    expect((error as ErrorDeDominio).codigo).toBe('RECURSO_NO_ENCONTRADO');
    expect((error as ErrorDeDominio).tipo).toBe('no_encontrado');
  });

  it('eliminar un bloqueo libera el intervalo; eliminar uno inexistente devuelve false', async () => {
    const creado = await crear(PROF_A, utc(10), utc(12));
    expect(await enA((c) => crearBloqueoRepository(c).eliminar(creado.id))).toBe(true);
    expect(await enA((c) => crearBloqueoRepository(c).eliminar(creado.id))).toBe(false);
    await expect(crear(PROF_A, utc(11), utc(13))).resolves.toBeDefined();
  });
});
