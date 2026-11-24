import { describe, expect, it } from 'vitest';

import { CLINICA_A } from '../datos-clinica/soporte.js';

import { insertarTurno, PROFESIONAL_A, SILLON_1 } from './soporte.js';
import { comoApp, cerrarPool, prepararBaseDeDatosClinica } from '../datos-clinica/soporte.js';

describe('C-09: reservas concurrentes sobre el mismo hueco', () => {
  it('gana una sola; la otra rechazada con 23P01 o 40P01 (concurrencia, R-05)', async () => {
    await prepararBaseDeDatosClinica();
    const datos = {
      profesionalId: PROFESIONAL_A,
      sillonId: SILLON_1,
      inicio: new Date('2026-12-01T14:00:00Z'),
      duracionMinutos: 60,
    };

    const resultados = await Promise.allSettled([
      comoApp(CLINICA_A.id, (c) => insertarTurno(c, datos)),
      comoApp(CLINICA_A.id, (c) => insertarTurno(c, datos)),
    ]);

    const exitosos = resultados.filter((r) => r.status === 'fulfilled');
    const fallidos = resultados.filter((r) => r.status === 'rejected');
    expect(exitosos).toHaveLength(1);
    expect(fallidos).toHaveLength(1);
    const codigo = (fallidos[0] as PromiseRejectedResult).reason as { code?: string };
    expect(['23P01', '40P01']).toContain(codigo.code);
  });

  it('limpia el pool al terminar el archivo', async () => {
    await cerrarPool();
  });
});
