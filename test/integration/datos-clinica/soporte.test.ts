import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CLINICA_A,
  CLINICA_B,
  cerrarPool,
  comoApp,
  prepararBaseDeDatosClinica,
} from './soporte.js';

beforeAll(async () => {
  await prepararBaseDeDatosClinica();
});
afterAll(cerrarPool);

describe('soporte de pruebas de C-05', () => {
  it('lee la configuración de la clínica A con withTenant y no ve la de B', async () => {
    const filas = await comoApp(CLINICA_A.id, (c) =>
      c.query<{ clinica_id: string }>('SELECT clinica_id FROM clinica_config'),
    );
    expect(filas.rows.map((f) => f.clinica_id)).toEqual([CLINICA_A.id]);
  });

  it('la clínica B queda con su propia zona horaria', async () => {
    const filas = await comoApp(CLINICA_B.id, (c) =>
      c.query<{ zona_horaria: string }>('SELECT zona_horaria FROM clinica WHERE id = $1', [
        CLINICA_B.id,
      ]),
    );
    expect(filas.rows[0]?.zona_horaria).toBe('America/Santiago');
  });
});
