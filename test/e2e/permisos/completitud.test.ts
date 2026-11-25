import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { operacionesDe, type Contrato } from '../contrato/comparar.js';
import { abrirEntorno, type EntornoE2E } from '../soporte/entorno.js';

import { MATRIZ } from './matriz.js';
import { diferenciasDeCompletitud } from './completitud.js';

describe('matriz de permisos: completitud respecto de las rutas registradas', () => {
  let entorno: EntornoE2E;

  beforeAll(async () => {
    entorno = await abrirEntorno();
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  it('toda operación registrada tiene fila y toda fila tiene operación', () => {
    const registradas = [...operacionesDe(entorno.app.swagger() as unknown as Contrato).keys()];
    const diferencias = diferenciasDeCompletitud(registradas, Object.keys(MATRIZ));
    expect(diferencias).toEqual({ sinFila: [], filasSobrantes: [] });
  });

  it('una operación registrada sin fila se informa nombrando método y ruta', () => {
    const diferencias = diferenciasDeCompletitud(['GET /a', 'POST /nueva'], ['GET /a']);
    expect(diferencias.sinFila).toEqual(['POST /nueva']);
    expect(diferencias.filasSobrantes).toEqual([]);
  });

  it('una fila sin operación registrada (ruta eliminada) se informa como sobrante', () => {
    const diferencias = diferenciasDeCompletitud(['GET /a'], ['GET /a', 'DELETE /vieja']);
    expect(diferencias.filasSobrantes).toEqual(['DELETE /vieja']);
    expect(diferencias.sinFila).toEqual([]);
  });
});
