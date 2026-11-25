import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CLINICA_A } from '../datos-clinica/soporte.js';

import { insertarTurno, PROFESIONAL_A, SILLON_1 } from './soporte.js';
import { comoApp, cerrarPool, prepararBaseDeDatosClinica } from '../datos-clinica/soporte.js';

describe('C-09: reprogramación atómica (RN-TU-02)', () => {
  beforeAll(async () => {
    await prepararBaseDeDatosClinica();
  });

  beforeEach(async () => {
    await comoApp(CLINICA_A.id, (c) => c.query('DELETE FROM turno'));
  });

  it('si el nuevo insert falla, la transición del original se revierte', async () => {
    const originalId = await comoApp(CLINICA_A.id, async (c) => {
      await insertarTurno(c, {
        profesionalId: PROFESIONAL_A,
        sillonId: SILLON_1,
        inicio: new Date('2026-12-01T10:00:00Z'),
        duracionMinutos: 60,
      });
      const { rows } = await c.query<{ id: string; estado: string }>(
        'SELECT id, estado FROM turno',
      );
      return rows[0]?.id ?? '';
    });
    expect(originalId).not.toBe('');

    // Transacción fallida: pasa el original a un estado ACTIVO (`confirmado`) y luego
    // inserta el nuevo turno solapando (la exclusión lo rechaza): con withTenant, el
    // fallo revierte todo.
    const codigo = await comoApp(CLINICA_A.id, async (c) => {
      await c.query('UPDATE turno SET estado = $1 WHERE id = $2', ['confirmado', originalId]);
      await insertarTurno(c, {
        profesionalId: PROFESIONAL_A,
        sillonId: SILLON_1,
        inicio: new Date('2026-12-01T10:30:00Z'),
        duracionMinutos: 60,
      });
      return 'sin error';
    }).then(
      () => 'sin error',
      (e: { code?: string }) => e.code,
    );
    expect(codigo).toBe('23P01');

    const estadoFinal = await comoApp(
      CLINICA_A.id,
      async (c) =>
        (await c.query<{ estado: string }>('SELECT estado FROM turno WHERE id = $1', [originalId]))
          .rows[0]?.estado,
    );
    expect(estadoFinal).toBe('pendiente_confirmacion');
  });

  beforeEach(async () => {
    await comoApp(CLINICA_A.id, (c) => c.query('DELETE FROM turno'));
  });

  it('limpia el pool al terminar el archivo', async () => {
    await cerrarPool();
  });
});
