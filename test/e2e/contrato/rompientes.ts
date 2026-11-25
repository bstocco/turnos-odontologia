import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { compararContratos, type Contrato } from './comparar.js';

const ejecutar = promisify(execFile);

export const RUTA_DEL_CONTRATO_EN_GIT = 'docs/api/openapi.json';

export type LecturaDeBase =
  | { readonly estado: 'leida'; readonly contrato: string }
  | { readonly estado: 'sin_contrato' }
  | { readonly estado: 'ilegible'; readonly motivo: string };

export type LectorDeBase = () => Promise<LecturaDeBase>;

/**
 * Lee el contrato de `ref` con `git` (sin shell: `execFile` con argumentos). `sin_contrato` si la
 * referencia existe pero todavía no tiene el archivo (primer contrato); `ilegible` si la
 * referencia no se puede resolver (p. ej. falta `git fetch origin main`).
 */
export function leerBaseDesdeGit(ref: string, directorio: string = process.cwd()): LectorDeBase {
  return async () => {
    if (ref.startsWith('-')) return { estado: 'ilegible', motivo: 'referencia inválida' };
    const git = (...args: string[]) =>
      ejecutar('git', args, { cwd: directorio, maxBuffer: 32 * 1024 * 1024 });
    try {
      await git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
    } catch {
      return {
        estado: 'ilegible',
        motivo: `no se pudo resolver '${ref}' (¿falta git fetch origin main?)`,
      };
    }
    try {
      await git('cat-file', '-e', `${ref}:${RUTA_DEL_CONTRATO_EN_GIT}`);
    } catch {
      return { estado: 'sin_contrato' };
    }
    try {
      const { stdout } = await git('show', `${ref}:${RUTA_DEL_CONTRATO_EN_GIT}`);
      return { estado: 'leida', contrato: stdout };
    } catch {
      return {
        estado: 'ilegible',
        motivo: `no se pudo leer ${RUTA_DEL_CONTRATO_EN_GIT} de '${ref}'`,
      };
    }
  };
}

/** Texto de la sección de `version` en el registro de cambios (hasta el siguiente encabezado). */
export function seccionDeVersion(registro: string, version: string): string {
  const lineas = registro.split('\n');
  const inicio = lineas.findIndex((l) => l.startsWith(`## [${version}]`));
  if (inicio === -1) return '';
  let fin = lineas.findIndex((l, i) => i > inicio && l.startsWith('## ['));
  if (fin === -1) fin = lineas.length;
  return lineas.slice(inicio, fin).join('\n');
}

export interface ResultadoDeVerificacion {
  readonly estado: 'ok' | 'omitido' | 'falla';
  readonly mensajes: string[];
}

function mayorDe(contrato: Contrato): number {
  return Number((contrato.info?.version ?? '0').split('.')[0]);
}

export interface EntradaDeVerificacion {
  readonly leerBase: LectorDeBase;
  /** Contrato actual (texto JSON generado). */
  readonly actual: string;
  /** Contenido de `docs/api/CHANGELOG.md`. */
  readonly registro: string;
  readonly ci: boolean;
}

/**
 * Cambios rompientes respecto de la base (`main`): exigen subir el número mayor de la versión y
 * una entrada de esa versión marcada con `**Rompiente**` en el registro (spec "Cambios rompientes
 * declarados" y "Base de comparación disponible en CI").
 */
export async function verificarCambiosRompientes(
  entrada: EntradaDeVerificacion,
): Promise<ResultadoDeVerificacion> {
  const lectura = await entrada.leerBase();
  if (lectura.estado === 'sin_contrato') return { estado: 'ok', mensajes: [] };
  if (lectura.estado === 'ilegible') {
    return entrada.ci
      ? {
          estado: 'falla',
          mensajes: [`No se pudo leer el contrato de la base: ${lectura.motivo}.`],
        }
      : {
          estado: 'omitido',
          mensajes: [`AVISO: se omite la verificación de cambios rompientes: ${lectura.motivo}.`],
        };
  }

  const base = JSON.parse(lectura.contrato) as Contrato;
  const actual = JSON.parse(entrada.actual) as Contrato;
  const rompientes = compararContratos(base, actual).filter((c) => c.rompiente);
  if (rompientes.length === 0) return { estado: 'ok', mensajes: [] };

  const mensajes: string[] = [];
  const versionActual = actual.info?.version ?? '';
  if (mayorDe(actual) <= mayorDe(base)) {
    mensajes.push(
      `La versión del contrato (${versionActual}) debe subir su número mayor respecto de la base (${base.info?.version ?? '?'}).`,
    );
  }
  if (!seccionDeVersion(entrada.registro, versionActual).includes('**Rompiente**')) {
    mensajes.push(
      `docs/api/CHANGELOG.md necesita una entrada de la versión ${versionActual} marcada con **Rompiente**.`,
    );
  }
  if (mensajes.length === 0) return { estado: 'ok', mensajes: [] };

  return {
    estado: 'falla',
    mensajes: [
      'Cambios rompientes sin declarar:',
      ...rompientes.map((c) => `  - ${c.operacion}: ${c.detalle}`),
      ...mensajes,
    ],
  };
}
