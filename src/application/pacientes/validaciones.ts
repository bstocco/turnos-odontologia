import { normalizarTelefonoAr } from '../../domain/comunicacion/index.js';

import { busquedaInvalida, dniInvalido } from './errores.js';

/*
 * Normalización y validación puras (design D6). Los errores nunca incluyen el valor recibido
 * (regla dura 1).
 */

const FORMATO_DNI = /^[0-9]{7,8}$/;
const LARGO_MINIMO_APELLIDO = 2;

/** Quita puntos y espacios y exige 7 u 8 dígitos. */
export function normalizarDni(texto: string): string {
  const dni = texto.replace(/[.\s]/g, '');
  if (!FORMATO_DNI.test(dni)) throw dniInvalido();
  return dni;
}

/** Formato internacional con `+` (RN-PA-03); `normalizarTelefonoAr` (C-04) devuelve sin `+`. */
export function normalizarTelefono(texto: string): string {
  return `+${normalizarTelefonoAr(texto)}`;
}

export function normalizarEmail(texto: string): string {
  return texto.trim().toLowerCase();
}

export type CriterioDeBusqueda =
  | { readonly tipo: 'dni'; readonly dni: string }
  | { readonly tipo: 'apellido'; readonly prefijo: string };

/** Exactamente un criterio: `dni` o `apellido` (≥ 2 caracteres tras recortar). */
export function validarCriterioDeBusqueda(entrada: {
  readonly dni?: string | undefined;
  readonly apellido?: string | undefined;
}): CriterioDeBusqueda {
  const { dni, apellido } = entrada;
  if ((dni === undefined) === (apellido === undefined)) throw busquedaInvalida();
  if (dni !== undefined) return { tipo: 'dni', dni: normalizarDni(dni) };
  const prefijo = (apellido ?? '').trim();
  if (prefijo.length < LARGO_MINIMO_APELLIDO) throw busquedaInvalida();
  return { tipo: 'apellido', prefijo };
}
