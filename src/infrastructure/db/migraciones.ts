import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Parte pura del runner de migraciones (D7): nombres, orden y huellas.
 * Convención: `migrations/C{NN}_{seq}_{nombre}.sql`, donde NN es el número del change y seq el
 * orden dentro del change. Los IDs de change respetan las dependencias, así que ordenar por
 * (NN, seq) equivale a ordenar por dependencias.
 */
export type CodigoDeErrorDeMigracion =
  | 'NOMBRE_INVALIDO'
  | 'SECUENCIA_REPETIDA'
  | 'DIRECTORIO_INEXISTENTE'
  | 'SIN_CONEXION_DE_MIGRACIONES'
  | 'HUELLA_DISTINTA'
  | 'MIGRACION_AUSENTE'
  | 'FALLO_EN_MIGRACION';

export class ErrorDeMigracion extends Error {
  readonly codigo: CodigoDeErrorDeMigracion;
  readonly archivo: string | undefined;

  constructor(codigo: CodigoDeErrorDeMigracion, mensaje: string, archivo?: string) {
    super(mensaje);
    this.name = 'ErrorDeMigracion';
    this.codigo = codigo;
    this.archivo = archivo;
  }
}

const PATRON_DE_NOMBRE = /^C(\d{2})_(\d{3})_([a-z0-9_]+)\.sql$/;

export interface NombreAnalizado {
  readonly nombre: string;
  readonly cambio: number;
  readonly secuencia: number;
  readonly descripcion: string;
}

export interface MigracionLeida extends NombreAnalizado {
  readonly contenido: string;
  readonly huella: string;
}

export function analizarNombre(nombre: string): NombreAnalizado | undefined {
  const m = PATRON_DE_NOMBRE.exec(nombre);
  if (m?.[1] === undefined || m[2] === undefined || m[3] === undefined) return undefined;
  return { nombre, cambio: Number(m[1]), secuencia: Number(m[2]), descripcion: m[3] };
}

/** Valida todos los nombres y los devuelve ordenados. Falla antes de que se aplique nada. */
export function validarYOrdenar(nombres: readonly string[]): NombreAnalizado[] {
  const analizados: NombreAnalizado[] = [];
  for (const nombre of nombres) {
    const analizado = analizarNombre(nombre);
    if (analizado === undefined) {
      throw new ErrorDeMigracion(
        'NOMBRE_INVALIDO',
        `El archivo '${nombre}' no cumple el patrón C{NN}_{seq}_{nombre}.sql (por ejemplo C03_001_base.sql).`,
        nombre,
      );
    }
    analizados.push(analizado);
  }

  const vistos = new Map<string, string>();
  for (const a of analizados) {
    const clave = `${a.cambio}-${a.secuencia}`;
    const previo = vistos.get(clave);
    if (previo !== undefined) {
      throw new ErrorDeMigracion(
        'SECUENCIA_REPETIDA',
        `Los archivos '${previo}' y '${a.nombre}' comparten change y secuencia.`,
        a.nombre,
      );
    }
    vistos.set(clave, a.nombre);
  }

  return [...analizados].sort((a, b) => a.cambio - b.cambio || a.secuencia - b.secuencia);
}

/**
 * Huella SHA-256 del contenido con fines de línea normalizados: el equipo trabaja en Windows y
 * Linux y un CRLF no debe cambiar la huella.
 */
export function calcularHuella(contenido: string): string {
  const sinBom = contenido.startsWith('﻿') ? contenido.slice(1) : contenido;
  const normalizado = sinBom.replace(/\r\n?/g, '\n');
  return createHash('sha256').update(normalizado, 'utf8').digest('hex');
}

/** Lee y valida el directorio. Ignora archivos ocultos (p. ej. `.gitkeep`). */
export async function leerMigraciones(directorio: string): Promise<MigracionLeida[]> {
  let nombres: string[];
  try {
    const entradas = await readdir(directorio, { withFileTypes: true });
    nombres = entradas.filter((e) => !e.name.startsWith('.')).map((e) => e.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ErrorDeMigracion(
        'DIRECTORIO_INEXISTENTE',
        'No existe el directorio de migraciones indicado.',
      );
    }
    throw error;
  }

  const ordenadas = validarYOrdenar(nombres);
  const resultado: MigracionLeida[] = [];
  for (const analizada of ordenadas) {
    const contenido = await readFile(join(directorio, analizada.nombre), 'utf8');
    resultado.push({ ...analizada, contenido, huella: calcularHuella(contenido) });
  }
  return resultado;
}
