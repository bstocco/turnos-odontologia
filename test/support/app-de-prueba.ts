import { Writable } from 'node:stream';

import type { FastifyInstance } from 'fastify';

import { loadConfig, type Config } from '../../src/config/index.js';
import { buildApp, type OpcionesDeApp } from '../../src/interfaces/http/app.js';

export function configDePrueba(extra: Record<string, string> = {}): Config {
  return loadConfig('app', {
    DATABASE_URL: 'postgres://app:secreto-123@localhost:5432/turnos_test',
    LOG_LEVEL: 'info',
    ...extra,
  });
}

/** Captura la salida del logger, línea por línea. */
export function capturarLogs() {
  const lineas: string[] = [];
  const destino = new Writable({
    write(chunk: Buffer | string, _codificacion, siguiente) {
      for (const linea of chunk.toString().split('\n')) {
        if (linea.trim() !== '') lineas.push(linea);
      }
      siguiente();
    },
  });
  return {
    destino,
    lineas,
    texto: (): string => lineas.join('\n'),
    registros: (): Record<string, unknown>[] =>
      lineas.map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

/** Construye la app con los logs capturados y, si se indica, otra carpeta de módulos. */
export async function appDePrueba(
  directorioDeModulos?: string,
  extra: Record<string, string> = {},
): Promise<{ app: FastifyInstance; logs: ReturnType<typeof capturarLogs> }> {
  const logs = capturarLogs();
  const opciones: OpcionesDeApp = { destinoDeLogs: logs.destino };
  if (directorioDeModulos !== undefined) opciones.directorioDeModulos = directorioDeModulos;
  const app = await buildApp(configDePrueba(extra), opciones);
  return { app, logs };
}
