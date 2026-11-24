import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CLINICA_A, CLINICA_B } from '../datos-clinica/soporte.js';

import {
  codigoDeError,
  insertarTurno,
  PROFESIONAL_A,
  PROFESIONAL_B,
  SILLON_1,
  SILLON_2,
} from './soporte.js';
import {
  comoApp,
  comoAppSinContexto,
  prepararBaseDeDatosClinica,
} from '../datos-clinica/soporte.js';

describe('C-09: constraints y fronteras de turno (spec db-tenant-rls: exclusión, buffer, RN-AG)', () => {
  beforeAll(async () => {
    await prepararBaseDeDatosClinica();
  });

  beforeEach(async () => {
    await comoApp(CLINICA_A.id, (c) => c.query('DELETE FROM turno'));
  });

  it('fronteras semiabiertas: fin = inicio no solapa (RN-AG-03)', async () => {
    const ids = await comoApp(CLINICA_A.id, async (c) => [
      await insertarTurno(c, {
        profesionalId: PROFESIONAL_A,
        sillonId: SILLON_1,
        inicio: new Date('2026-12-01T10:00:00Z'),
        duracionMinutos: 60,
      }),
      await insertarTurno(c, {
        profesionalId: PROFESIONAL_A,
        sillonId: SILLON_1,
        inicio: new Date('2026-12-01T11:00:00Z'),
        duracionMinutos: 60,
      }),
    ]);
    expect(ids).toHaveLength(2);
  });

  it('solape del mismo profesional rechazado con 23P01 (turno_sin_solape_profesional)', async () => {
    const codigo = await comoApp(CLINICA_A.id, async (c) => {
      await insertarTurno(c, {
        profesionalId: PROFESIONAL_A,
        sillonId: SILLON_1,
        inicio: new Date('2026-12-01T10:00:00Z'),
        duracionMinutos: 60,
      });
      return codigoDeError(() =>
        insertarTurno(c, {
          profesionalId: PROFESIONAL_A,
          sillonId: SILLON_1,
          inicio: new Date('2026-12-01T10:30:00Z'),
          duracionMinutos: 60,
        }),
      );
    });
    expect(codigo).toBe('23P01');
  });

  it('el buffer bloquea solo al sillón (RN-AG-05): otro profesional en el mismo sillón rechazado', async () => {
    const codigo = await comoApp(CLINICA_A.id, async (c) => {
      await insertarTurno(c, {
        profesionalId: PROFESIONAL_A,
        sillonId: SILLON_1,
        inicio: new Date('2026-12-01T10:00:00Z'),
        duracionMinutos: 60,
        bufferMinutos: 30,
      });
      return codigoDeError(() =>
        insertarTurno(c, {
          profesionalId: PROFESIONAL_B,
          sillonId: SILLON_1,
          inicio: new Date('2026-12-01T10:30:00Z'),
          duracionMinutos: 30,
        }),
      );
    });
    expect(codigo).toBe('23P01');
  });

  it('aislamiento por clínica: A no ve ni escribe datos de B (RLS forzada)', async () => {
    await comoApp(CLINICA_A.id, async (c) => {
      await insertarTurno(c, {
        profesionalId: PROFESIONAL_A,
        sillonId: SILLON_1,
        inicio: new Date('2026-12-01T10:00:00Z'),
        duracionMinutos: 60,
      });
    });

    const visiblesEnB = await comoApp(
      CLINICA_B.id,
      async (c) => (await c.query('SELECT id FROM turno')).rows,
    );
    expect(visiblesEnB).toEqual([]);

    const sinContexto = await comoAppSinContexto(
      async (c) => (await c.query('SELECT id FROM turno')).rows,
    );
    expect(sinContexto).toEqual([]);

    const insertadoDeB = await comoApp(CLINICA_A.id, (c) =>
      c
        .query(
          'INSERT INTO turno (clinica_id, profesional_id, sillon_id, inicio, fin, fin_sillon) VALUES ($1, $2, $3, $4, $5, $5)',
          [
            CLINICA_B.id,
            PROFESIONAL_B,
            SILLON_2,
            new Date('2026-12-01T11:00:00Z'),
            new Date('2026-12-01T12:00:00Z'),
          ],
        )
        .then(
          () => undefined,
          (e: { code?: string }) => e.code,
        ),
    );
    expect(insertadoDeB).toBe('42501');
  });
});
