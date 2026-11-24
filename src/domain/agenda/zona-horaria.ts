import type { Marcado } from '../shared/ids.js';
import { error, ok, type Resultado } from '../shared/resultado.js';
import {
  fechaHoraLocalInvalida,
  horaLocalInexistente,
  zonaHorariaInvalida,
} from './errores-agenda.js';

/** Fecha local de la clínica `AAAA-MM-DD`, validada (sin fechas imposibles). */
export type FechaLocal = Marcado<string, 'FechaLocal'>;

export interface InstanteLocal {
  readonly fecha: FechaLocal;
  /** Minutos desde la medianoche local (0-1439). */
  readonly minutos: number;
  readonly segundos: number;
  /** 0 = domingo ... 6 = sábado (como `horario_atencion.dia_semana` y `EXTRACT(DOW)`). */
  readonly diaSemana: number;
}

const MINUTO_MS = 60_000;
const DIA_MS = 86_400_000;
const FORMATO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const FORMATO_HORA = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

// Los formateadores se cachean por zona: es memoización pura, no I/O.
const formateadores = new Map<string, Intl.DateTimeFormat>();

function formateador(zona: string): Resultado<Intl.DateTimeFormat> {
  const cacheado = formateadores.get(zona);
  if (cacheado !== undefined) return ok(cacheado);
  // Solo identificadores IANA: se descartan desplazamientos fijos como "+03:00" o "UTC+3".
  if (zona === '' || /^[+-]|^UTC[+-]|^GMT[+-]/i.test(zona)) return error(zonaHorariaInvalida());
  try {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: zona,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formateadores.set(zona, f);
    return ok(f);
  } catch {
    return error(zonaHorariaInvalida());
  }
}

function aString(n: number, largo: number): string {
  return String(n).padStart(largo, '0');
}

/** Hora local de pared expresada como milisegundos "como si fuera UTC". */
function paredComoUtcMs(instanteMs: number, f: Intl.DateTimeFormat): number {
  const partes: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(instanteMs))) {
    if (p.type !== 'literal') partes[p.type] = Number(p.value);
  }
  return Date.UTC(
    partes['year'] ?? 0,
    (partes['month'] ?? 1) - 1,
    partes['day'] ?? 1,
    (partes['hour'] ?? 0) % 24,
    partes['minute'] ?? 0,
    partes['second'] ?? 0,
  );
}

export function crearFechaLocal(valor: string): Resultado<FechaLocal> {
  const m = FORMATO_FECHA.exec(valor);
  if (m === null) return error(fechaHoraLocalInvalida('fecha'));
  const [a, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(a, mes - 1, dia));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return error(fechaHoraLocalInvalida('fecha'));
  }
  return ok(valor as FechaLocal);
}

/** Convierte `HH:MM[:00]` (tipo `time` de PostgreSQL) a minutos desde la medianoche (0-1440). */
export function parsearHoraLocal(valor: string): Resultado<number> {
  const m = FORMATO_HORA.exec(valor);
  if (m === null) return error(fechaHoraLocalInvalida('hora'));
  const [h, min, seg] = [Number(m[1]), Number(m[2]), Number(m[3] ?? '0')];
  const total = h * 60 + min;
  if (min > 59 || seg !== 0 || total > 1440) return error(fechaHoraLocalInvalida('hora'));
  return ok(total);
}

function fechaAMs(fecha: FechaLocal): number {
  const m = FORMATO_FECHA.exec(fecha);
  return Date.UTC(Number(m?.[1]), Number(m?.[2]) - 1, Number(m?.[3]));
}

function msAFecha(ms: number): FechaLocal {
  const d = new Date(ms);
  return `${aString(d.getUTCFullYear(), 4)}-${aString(d.getUTCMonth() + 1, 2)}-${aString(d.getUTCDate(), 2)}` as FechaLocal;
}

export function sumarDias(fecha: FechaLocal, dias: number): FechaLocal {
  return msAFecha(fechaAMs(fecha) + dias * DIA_MS);
}

/** Día de la semana de una fecha local: 0 = domingo ... 6 = sábado. */
export function diaSemanaDe(fecha: FechaLocal): number {
  return new Date(fechaAMs(fecha)).getUTCDay();
}

/**
 * Hora local de la clínica -> instante UTC según las reglas IANA de esa fecha.
 * Hora inexistente (adelanto de reloj) -> HORA_LOCAL_INEXISTENTE; repetida -> primera ocurrencia.
 */
export function localAInstante(fecha: FechaLocal, minutos: number, zona: string): Resultado<Date> {
  const f = formateador(zona);
  if (!f.ok) return f;
  if (!Number.isInteger(minutos) || minutos < 0 || minutos > 1440)
    return error(fechaHoraLocalInvalida('hora'));

  const pared = fechaAMs(fecha) + minutos * MINUTO_MS;
  // Desplazamientos vigentes un día antes y un día después: cubren los dos lados de una transición.
  const desplazamientos = new Set(
    [pared - DIA_MS, pared + DIA_MS].map((t) => paredComoUtcMs(t, f.valor) - t),
  );
  const candidatos = [...desplazamientos]
    .map((d) => pared - d)
    .filter((t) => paredComoUtcMs(t, f.valor) === pared)
    .sort((a, b) => a - b);
  const primero = candidatos[0];
  return primero === undefined ? error(horaLocalInexistente()) : ok(new Date(primero));
}

/** Instante UTC -> fecha local, minutos desde la medianoche local y día de semana local. */
export function instanteALocal(instante: Date, zona: string): Resultado<InstanteLocal> {
  const f = formateador(zona);
  if (!f.ok) return f;
  const ms = instante.getTime();
  if (Number.isNaN(ms)) return error(fechaHoraLocalInvalida('instante'));
  const pared = new Date(paredComoUtcMs(ms, f.valor));
  return ok({
    fecha: msAFecha(pared.getTime()),
    minutos: pared.getUTCHours() * 60 + pared.getUTCMinutes(),
    segundos: pared.getUTCSeconds(),
    diaSemana: pared.getUTCDay(),
  });
}
