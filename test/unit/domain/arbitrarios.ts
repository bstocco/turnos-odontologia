import fc from 'fast-check';

import { crearIntervaloOLanzar, type Intervalo } from '../../../src/domain/agenda/intervalo.js';

/** Base de instantes de las pruebas: 2026-03-02T00:00:00Z (lunes). Todo en minutos enteros. */
export const BASE_MS = Date.UTC(2026, 2, 2);
export const MINUTO_MS = 60_000;

export function instanteEnMinutos(minutos: number): Date {
  return new Date(BASE_MS + minutos * MINUTO_MS);
}

export function intervaloEnMinutos(desde: number, hasta: number): Intervalo {
  return crearIntervaloOLanzar(instanteEnMinutos(desde), instanteEnMinutos(hasta));
}

/** Intervalos válidos con extremos en minutos enteros dentro de un rango acotado (encoge bien). */
export const arbIntervalo: fc.Arbitrary<Intervalo> = fc
  .tuple(fc.integer({ min: 0, max: 600 }), fc.integer({ min: 1, max: 240 }))
  .map(([inicio, duracion]) => intervaloEnMinutos(inicio, inicio + duracion));
