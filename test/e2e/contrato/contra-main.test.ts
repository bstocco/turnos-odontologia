import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { leerBaseDesdeGit, verificarCambiosRompientes } from './rompientes.js';
import { RUTA_CONTRATO, RUTA_REGISTRO } from './soporte-contrato.js';

describe('contrato: cambios rompientes respecto de main', () => {
  it('no hay cambios rompientes sin declarar contra la base (CONTRATO_BASE_REF, por defecto origin/main)', async () => {
    const ref = process.env.CONTRATO_BASE_REF ?? 'origin/main';
    const resultado = await verificarCambiosRompientes({
      leerBase: leerBaseDesdeGit(ref),
      actual: await readFile(RUTA_CONTRATO, 'utf8'),
      registro: await readFile(RUTA_REGISTRO, 'utf8'),
      ci: process.env.CI === 'true',
    });
    if (resultado.estado === 'omitido') console.warn(resultado.mensajes.join('\n'));
    // Si falla, el mensaje de la aserción es la lista de cambios rompientes sin declarar.
    expect(resultado.estado === 'falla' ? resultado.mensajes.join('\n') : 'ok').toBe('ok');
  });
});
