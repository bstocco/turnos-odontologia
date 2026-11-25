import { readFile, writeFile } from 'node:fs/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { abrirEntorno, type EntornoE2E } from '../soporte/entorno.js';

import type { Contrato } from './comparar.js';
import { generarContrato } from './generar.js';
import {
  RUTA_CONTRATO,
  RUTA_REGISTRO,
  informeDeContratoDesactualizado,
} from './soporte-contrato.js';

describe('contrato al día', () => {
  let entorno: EntornoE2E;
  let registro: string;
  let generado: string;

  beforeAll(async () => {
    entorno = await abrirEntorno();
    registro = await readFile(RUTA_REGISTRO, 'utf8');
    generado = generarContrato(entorno.app, registro);
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  it('docs/api/openapi.json coincide con el contrato generado de la app real', async () => {
    // Regenerar: ACTUALIZAR_CONTRATO=1 npm run test:e2e -- contrato
    if (process.env.ACTUALIZAR_CONTRATO === '1') await writeFile(RUTA_CONTRATO, generado, 'utf8');
    const versionado = await readFile(RUTA_CONTRATO, 'utf8');
    expect(informeDeContratoDesactualizado(generado, versionado)).toBeNull();
    expect(generado).toBe(versionado);
  });

  it('el informe de desactualización nombra la operación cambiada y cómo regenerar', () => {
    const alterado = JSON.parse(generado) as Contrato & {
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
    };
    const operacion = alterado.paths['/api/v1/pacientes']?.get;
    expect(operacion).toBeDefined();
    if (operacion !== undefined) operacion.responses['299'] = { description: 'alterado a mano' };

    const informe = informeDeContratoDesactualizado(
      generado,
      `${JSON.stringify(alterado, null, 2)}\n`,
    );
    expect(informe).toContain('GET /api/v1/pacientes');
    expect(informe).toContain('ACTUALIZAR_CONTRATO=1');
  });

  it('un contrato sin cambios de operaciones pero con otro texto también se informa', () => {
    const informe = informeDeContratoDesactualizado(generado, `${generado}\n`);
    expect(informe).not.toBeNull();
    expect(informe).toContain('ACTUALIZAR_CONTRATO=1');
  });

  it('el informe es null cuando el versionado es idéntico', () => {
    expect(informeDeContratoDesactualizado(generado, generado)).toBeNull();
  });
});
