import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { FastifyInstance, FastifyPluginAsync, FastifyPluginCallback } from 'fastify';

type PluginDeModulo = FastifyPluginAsync | FastifyPluginCallback;

/** Un módulo no se pudo cargar. El arranque falla nombrando el módulo. */
export class ErrorDeModulo extends Error {
  readonly modulo: string;

  constructor(modulo: string, motivo: string) {
    super(`No se pudo cargar el módulo HTTP '${modulo}': ${motivo}`);
    this.name = 'ErrorDeModulo';
    this.modulo = modulo;
  }
}

/** `index.ts` en desarrollo y en pruebas, `index.js` en `dist/`. */
const PUNTOS_DE_ENTRADA = ['index.ts', 'index.js'] as const;

function puntoDeEntrada(directorio: string): string | undefined {
  for (const archivo of PUNTOS_DE_ENTRADA) {
    const ruta = join(directorio, archivo);
    if (existsSync(ruta)) return ruta;
  }
  return undefined;
}

/**
 * Carga cada carpeta de `directorio` como un módulo HTTP, en orden alfabético, con el prefijo
 * indicado. Agregar un módulo no exige editar ningún archivo compartido (D3).
 * Devuelve los nombres cargados, en orden.
 */
export async function registrarModulos(
  app: FastifyInstance,
  directorio: string,
  prefijo = '/api/v1',
): Promise<string[]> {
  let entradas: string[];
  try {
    const leidas = await readdir(directorio, { withFileTypes: true });
    entradas = leidas
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // Una carpeta vacía no se emite en dist/: equivale a "sin módulos".
      app.log.warn('No existe la carpeta de módulos HTTP: no se carga ninguno.');
      return [];
    }
    throw error;
  }

  const cargados: string[] = [];
  for (const nombre of entradas) {
    const carpeta = join(directorio, nombre);
    const entrada = puntoDeEntrada(carpeta);
    if (entrada === undefined) {
      throw new ErrorDeModulo(nombre, 'falta el punto de entrada index.ts o index.js');
    }

    let modulo: { default?: unknown };
    try {
      modulo = (await import(/* @vite-ignore */ pathToFileURL(entrada).href)) as {
        default?: unknown;
      };
    } catch (error) {
      const detalle = error instanceof Error ? error.message : 'error desconocido';
      throw new ErrorDeModulo(nombre, `falló la importación (${detalle})`);
    }

    if (typeof modulo.default !== 'function') {
      throw new ErrorDeModulo(
        nombre,
        'no exporta un plugin de Fastify como exportación por defecto',
      );
    }
    await app.register(modulo.default as PluginDeModulo, { prefix: prefijo });
    cargados.push(nombre);
  }
  return cargados;
}
