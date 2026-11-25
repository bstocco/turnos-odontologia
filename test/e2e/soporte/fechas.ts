/*
 * Fechas locales de la clínica (zona fija `America/Argentina/Buenos_Aires`, sin horario de verano).
 * El reloj de la app no se simula en los e2e de Fase 1: las fechas se calculan respecto de hoy.
 */
export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';

const MS_POR_DIA = 86_400_000;

const formato = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface FechaYHoraLocal {
  readonly fecha: string;
  readonly hora: string;
}

/** Fecha (`AAAA-MM-DD`) y hora (`HH:MM`) locales de un instante. */
export function aLocal(instante: Date | string): FechaYHoraLocal {
  const partes = Object.fromEntries(
    formato.formatToParts(new Date(instante)).map((p) => [p.type, p.value]),
  );
  return {
    fecha: `${partes.year}-${partes.month}-${partes.day}`,
    hora: `${partes.hour}:${partes.minute}`,
  };
}

export function hoyLocal(ahora: Date = new Date()): string {
  return aLocal(ahora).fecha;
}

export function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * MS_POR_DIA).toISOString().slice(0, 10);
}

/** 0 = domingo ... 6 = sábado, como `diaSemana` de los horarios. */
export function diaSemana(fecha: string): number {
  return new Date(`${fecha}T00:00:00Z`).getUTCDay();
}

/** Primer día de lunes a viernes desde `desde` (inclusive) que no figure en `excluidas`. */
export function proximoDiaHabil(desde: string, excluidas: ReadonlySet<string> = new Set()): string {
  let fecha = desde;
  while (diaSemana(fecha) === 0 || diaSemana(fecha) === 6 || excluidas.has(fecha)) {
    fecha = sumarDias(fecha, 1);
  }
  return fecha;
}
