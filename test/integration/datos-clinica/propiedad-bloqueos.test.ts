import fc from 'fast-check';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  CLINICA_A,
  cerrarPool,
  comoApp,
  consultarComoMigra,
  prepararBaseDeDatosClinica,
  type EntornoDePrueba,
} from './soporte.js';

const PROFESIONALES = [
  'aaaaaaaa-0000-4000-8000-000000000001',
  'aaaaaaaa-0000-4000-8000-000000000002',
] as const;
const USUARIO = 'cccccccc-0000-4000-8000-000000000001';
const BASE_MS = Date.UTC(2026, 11, 10, 8, 0, 0);
const HORA_MS = 3_600_000;

let entorno: EntornoDePrueba;

beforeAll(async () => {
  entorno = await prepararBaseDeDatosClinica();
});
afterAll(cerrarPool);

beforeEach(async () => {
  await consultarComoMigra(
    entorno.urlMigra,
    'TRUNCATE bloqueo, horario_atencion, profesional CASCADE',
  );
  for (const id of PROFESIONALES) {
    await comoApp(CLINICA_A.id, (c) =>
      c.query(
        "INSERT INTO profesional (id, clinica_id, nombre, apellido) VALUES ($1, $2, 'n', 'a')",
        [id, CLINICA_A.id],
      ),
    );
  }
});

describe('propiedad: la base nunca acepta bloqueos solapados del mismo profesional', () => {
  const bloqueoArb = fc.record({
    profesional: fc.integer({ min: 0, max: 1 }),
    desde: fc.integer({ min: 0, max: 20 }),
    largo: fc.integer({ min: 1, max: 6 }),
  });

  it('ningún par aceptado del mismo profesional se solapa (secuencias arbitrarias)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(bloqueoArb, { minLength: 1, maxLength: 12 }), async (secuencia) => {
        await consultarComoMigra(entorno.urlMigra, 'TRUNCATE bloqueo');
        const aceptados: { prof: number; ini: number; fin: number }[] = [];
        for (const { profesional, desde, largo } of secuencia) {
          const ini = BASE_MS + desde * HORA_MS;
          const fin = ini + largo * HORA_MS;
          try {
            await comoApp(CLINICA_A.id, (c) =>
              c.query(
                `INSERT INTO bloqueo (clinica_id, profesional_id, inicio, fin, creado_por)
                 VALUES ($1, $2, $3, $4, $5)`,
                [CLINICA_A.id, PROFESIONALES[profesional], new Date(ini), new Date(fin), USUARIO],
              ),
            );
            aceptados.push({ prof: profesional, ini, fin });
          } catch (error) {
            // Solo se ignoran los rechazos por exclusión (23P01); cualquier otro fallo es un defecto.
            expect((error as { code?: string }).code).toBe('23P01');
          }
        }
        for (const [i, a] of aceptados.entries()) {
          for (const b of aceptados.slice(i + 1)) {
            if (a.prof === b.prof) expect(a.ini < b.fin && b.ini < a.fin).toBe(false);
          }
        }
        // Oráculo de fuerza bruta: un bloqueo se rechaza solo si se solapaba con uno ya aceptado.
        const { rows } = await comoApp(CLINICA_A.id, (c) => c.query('SELECT 1 FROM bloqueo'));
        expect(rows).toHaveLength(aceptados.length);
      }),
      { numRuns: 15 },
    );
  });

  it('un bloqueo contiguo se acepta (caso base de la propiedad)', async () => {
    const insertar = (ini: number, fin: number): Promise<unknown> =>
      comoApp(CLINICA_A.id, (c) =>
        c.query(
          `INSERT INTO bloqueo (clinica_id, profesional_id, inicio, fin, creado_por)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            CLINICA_A.id,
            PROFESIONALES[0],
            new Date(BASE_MS + ini),
            new Date(BASE_MS + fin),
            USUARIO,
          ],
        ),
      );
    await insertar(0, HORA_MS);
    await expect(insertar(HORA_MS, 2 * HORA_MS)).resolves.toBeDefined();
    await expect(insertar(HORA_MS / 2, 1.5 * HORA_MS)).rejects.toMatchObject({ code: '23P01' });
  });
});
