import { parsearHoraLocal, type FranjaAtencion } from '../../domain/agenda/index.js';

import { franjaInvalida, franjaSolapada } from './errores.js';

const MINUTOS_POR_DIA = 1440;

/**
 * Granularidad válida: entero > 0 que divide 1440. Es la misma regla que el primer guardia de
 * `validarGranularidad` del dominio (una prueba de propiedad las compara).
 */
export function esGranularidadValida(granularidad: number): boolean {
  return Number.isInteger(granularidad) && granularidad > 0 && MINUTOS_POR_DIA % granularidad === 0;
}

/** Franja tal como llega por HTTP: horas locales `HH:MM` (o `24:00`). */
export interface FranjaEntrada {
  readonly diaSemana: number;
  readonly horaDesde: string;
  readonly horaHasta: string;
}

/** Minutos desde la medianoche local (0-1440) -> `HH:MM` (`1440` -> `24:00`). */
export function formatearMinutos(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return `${String(horas).padStart(2, '0')}:${String(resto).padStart(2, '0')}`;
}

function ordenar(franjas: readonly FranjaAtencion[]): FranjaAtencion[] {
  return [...franjas].sort(
    (a, b) =>
      a.diaSemana - b.diaSemana ||
      a.desdeMinutos - b.desdeMinutos ||
      a.hastaMinutos - b.hastaMinutos,
  );
}

/**
 * ¿Hay dos franjas del mismo día que se solapen? Semántica `[desde, hasta)`: ordena por
 * `(dia, desde)` y compara vecinas (`siguiente.desde < anterior.hasta`).
 */
export function detectarSolapeDeFranjas(franjas: readonly FranjaAtencion[]): boolean {
  const ordenadas = ordenar(franjas);
  let maximoHasta = -1;
  let diaActual = -1;
  for (const franja of ordenadas) {
    if (franja.diaSemana !== diaActual) {
      diaActual = franja.diaSemana;
      maximoHasta = franja.hastaMinutos;
      continue;
    }
    if (franja.desdeMinutos < maximoHasta) return true;
    maximoHasta = Math.max(maximoHasta, franja.hastaMinutos);
  }
  return false;
}

/**
 * Convierte y valida las franjas del `PUT` de horarios: horas parseables (dominio), `desde <
 * hasta` y sin solapes del mismo día. Devuelve las franjas ordenadas por día y hora.
 */
export function validarFranjas(entrada: readonly FranjaEntrada[]): FranjaAtencion[] {
  const franjas = entrada.map((f): FranjaAtencion => {
    const desde = parsearHoraLocal(f.horaDesde);
    if (!desde.ok) throw desde.error;
    const hasta = parsearHoraLocal(f.horaHasta);
    if (!hasta.ok) throw hasta.error;
    if (desde.valor >= hasta.valor) throw franjaInvalida();
    return { diaSemana: f.diaSemana, desdeMinutos: desde.valor, hastaMinutos: hasta.valor };
  });
  if (detectarSolapeDeFranjas(franjas)) throw franjaSolapada();
  return ordenar(franjas);
}
