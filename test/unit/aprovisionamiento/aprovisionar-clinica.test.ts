import { describe, expect, it } from 'vitest';

import {
  aprovisionarClinica,
  type AprovisionadorRepositorio,
} from '../../../src/application/aprovisionamiento/index.js';

describe('aprovisionamiento de clínicas (C-17)', () => {
  it('orquesta el repositorio de aprovisionamiento y devuelve su resultado', async () => {
    const datos = {
      slug: 'clinica-prueba-01',
      nombre: 'Clínica de prueba',
      email: 'admin@clinica-prueba.local',
    };
    const resultadoEsperado = {
      id: '11111111-1111-4111-8111-111111111111',
      slug: datos.slug,
      passwordTemporal: 'temporal-123',
    };
    const repositorio: AprovisionadorRepositorio = {
      crearClinicaConAdmin: async (recibidos) => {
        expect(recibidos).toEqual(datos);
        return resultadoEsperado;
      },
    };

    expect(await aprovisionarClinica(repositorio, datos)).toEqual(resultadoEsperado);
  });
});
