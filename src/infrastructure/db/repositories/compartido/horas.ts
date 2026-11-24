import { parsearHoraLocal } from '../../../../domain/agenda/index.js';
import { datosInvalidos } from './errores.js';

const MINUTOS_POR_DIA = 1440;

/** Minutos desde la medianoche local (0-1440) -> `HH:MM` para un parámetro `$n::time` (1440 -> `24:00`). */
export function minutosAHora(minutos: number): string {
  if (!Number.isInteger(minutos) || minutos < 0 || minutos > MINUTOS_POR_DIA)
    throw datosInvalidos();
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return `${String(horas).padStart(2, '0')}:${String(resto).padStart(2, '0')}`;
}

/** `HH:MM[:SS]` (valor de `time` en pg) -> minutos desde la medianoche local (0-1440). */
export function horaAMinutos(hora: string): number {
  const resultado = parsearHoraLocal(hora);
  if (!resultado.ok) throw resultado.error;
  return resultado.valor;
}
