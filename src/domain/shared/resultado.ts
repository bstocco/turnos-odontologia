import type { ErrorDeDominio } from './errores.js';

/** Resultado tipado de una operación de dominio que puede fallar sin lanzar. */
export type Resultado<T> =
  { readonly ok: true; readonly valor: T } | { readonly ok: false; readonly error: ErrorDeDominio };

export function ok<T>(valor: T): Resultado<T> {
  return { ok: true, valor };
}

export function error<T = never>(e: ErrorDeDominio): Resultado<T> {
  return { ok: false, error: e };
}

/** Variante que lanza: solo para pruebas y adaptadores que ya validaron. */
export function valorOLanzar<T>(r: Resultado<T>): T {
  if (r.ok) return r.valor;
  throw r.error;
}
