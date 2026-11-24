import { ErrorDePersistencia } from './errores.js';

export type Fila = Record<string, unknown>;

/*
 * Lectura tipada de columnas. Si el tipo no coincide, el error nombra la columna y nunca el
 * valor (podría ser un dato personal).
 */
function invalida(columna: string, esperado: string): never {
  throw new ErrorDePersistencia(
    undefined,
    undefined,
    `Columna '${columna}' inesperada: no es ${esperado}.`,
  );
}

export function texto(fila: Fila, columna: string): string {
  const valor = fila[columna];
  return typeof valor === 'string' ? valor : invalida(columna, 'texto');
}

export function textoONulo(fila: Fila, columna: string): string | null {
  const valor = fila[columna];
  if (valor === null) return null;
  return typeof valor === 'string' ? valor : invalida(columna, 'texto o nulo');
}

export function entero(fila: Fila, columna: string): number {
  const valor = fila[columna];
  return typeof valor === 'number' && Number.isInteger(valor) ? valor : invalida(columna, 'entero');
}

export function booleano(fila: Fila, columna: string): boolean {
  const valor = fila[columna];
  return typeof valor === 'boolean' ? valor : invalida(columna, 'booleano');
}

export function instante(fila: Fila, columna: string): Date {
  const valor = fila[columna];
  return valor instanceof Date ? valor : invalida(columna, 'instante');
}

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Evita que un id mal formado aborte la transacción con 22P02: se trata como inexistente. */
export function esUuid(valor: string): boolean {
  return FORMATO_UUID.test(valor);
}
