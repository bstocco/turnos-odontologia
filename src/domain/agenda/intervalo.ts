import { error, ok, type Resultado } from '../shared/resultado.js';
import { intervaloInvalido } from './errores-agenda.js';

/** Intervalo semiabierto [inicio, fin): incluye el inicio y excluye el fin (RN-AG-03). */
export interface Intervalo {
  readonly inicio: Date;
  readonly fin: Date;
}

/** Copia defensiva de los extremos y objeto congelado: el intervalo es inmutable. */
export function crearIntervalo(inicio: Date, fin: Date): Resultado<Intervalo> {
  const i = inicio.getTime();
  const f = fin.getTime();
  if (Number.isNaN(i) || Number.isNaN(f) || f <= i) return error(intervaloInvalido());
  return ok(Object.freeze({ inicio: new Date(i), fin: new Date(f) }));
}

export function crearIntervaloOLanzar(inicio: Date, fin: Date): Intervalo {
  const r = crearIntervalo(inicio, fin);
  if (!r.ok) throw r.error;
  return r.valor;
}

/** a.inicio < b.fin y b.inicio < a.fin. */
export function seSolapa(a: Intervalo, b: Intervalo): boolean {
  return a.inicio.getTime() < b.fin.getTime() && b.inicio.getTime() < a.fin.getTime();
}

/** El fin de uno es el inicio del otro. */
export function esAdyacente(a: Intervalo, b: Intervalo): boolean {
  return a.fin.getTime() === b.inicio.getTime() || b.fin.getTime() === a.inicio.getTime();
}

/** externo.inicio <= interno.inicio y interno.fin <= externo.fin. */
export function contiene(externo: Intervalo, interno: Intervalo): boolean {
  return (
    externo.inicio.getTime() <= interno.inicio.getTime() &&
    interno.fin.getTime() <= externo.fin.getTime()
  );
}
