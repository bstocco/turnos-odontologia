import { join } from 'node:path';

import { operacionesDiferentes, type Contrato } from './comparar.js';

export const DIRECTORIO_API = join(process.cwd(), 'docs', 'api');
export const RUTA_CONTRATO = join(DIRECTORIO_API, 'openapi.json');
export const RUTA_REGISTRO = join(DIRECTORIO_API, 'CHANGELOG.md');
export const RUTA_EXCEPCIONES = join(DIRECTORIO_API, 'excepciones-de-respuesta.json');
export const DIRECTORIO_EJEMPLOS = join(DIRECTORIO_API, 'ejemplos');

export const COMO_REGENERAR = 'ACTUALIZAR_CONTRATO=1 npm run test:e2e -- contrato';

/**
 * `null` si el contrato versionado es idéntico al generado; si no, un informe que nombra las
 * operaciones afectadas y explica cómo regenerarlo (spec "Contrato al día en CI").
 */
export function informeDeContratoDesactualizado(
  generado: string,
  versionado: string,
): string | null {
  if (generado === versionado) return null;
  let operaciones: string[] = [];
  try {
    operaciones = operacionesDiferentes(
      JSON.parse(versionado) as Contrato,
      JSON.parse(generado) as Contrato,
    );
  } catch {
    // El versionado no es JSON válido: se informa igual con la instrucción de regenerar.
  }
  const lista =
    operaciones.length > 0
      ? `Operaciones afectadas:\n${operaciones.map((o) => `  - ${o}`).join('\n')}`
      : 'Cambian datos generales del documento (versión, título o componentes).';
  return `docs/api/openapi.json no coincide con el contrato generado de la aplicación.\n${lista}\nRegeneralo con: ${COMO_REGENERAR}`;
}
