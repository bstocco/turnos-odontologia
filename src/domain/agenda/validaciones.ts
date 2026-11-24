import { error, ok, type Resultado } from '../shared/resultado.js';
import {
  ocupacionInvalida,
  turnoEnBloqueo,
  turnoEnFeriado,
  turnoFueraDeHorario,
  turnoInicioEnPasado,
  turnoNoAlineado,
} from './errores-agenda.js';
import { contiene, crearIntervalo, seSolapa, type Intervalo } from './intervalo.js';
import type { Bloqueo, ConfiguracionAgenda, FranjaAtencion } from './puertos.js';
import { instanteALocal, localAInstante, type FechaLocal } from './zona-horaria.js';

/**
 * Validaciones previas a persistir un turno. Todas son puras: reciben `ahora`, zona, franjas, etc.
 * por parámetro y devuelven `Resultado` (no lanzan, no leen reloj). Cada supuesto provisional del
 * diseño vive en UNA función (ver design.md §Open Questions).
 */

const MINUTOS_POR_DIA = 1440;

/** RN-AG-10 (supuesto): se acepta inicio == ahora; se rechaza solo inicio < ahora. */
export function validarInicioNoPasado(inicio: Date, ahora: Date): Resultado<void> {
  return inicio.getTime() < ahora.getTime() ? error(turnoInicioEnPasado()) : ok(undefined);
}

/** RN-AG-11 (PO-06): alineado a la medianoche LOCAL, sin segundos ni milisegundos. */
export function validarGranularidad(inicio: Date, config: ConfiguracionAgenda): Resultado<void> {
  const g = config.granularidadMinutos;
  if (!Number.isInteger(g) || g <= 0 || MINUTOS_POR_DIA % g !== 0)
    return error(ocupacionInvalida('granularidad'));
  const local = instanteALocal(inicio, config.zonaHoraria);
  if (!local.ok) return local;
  const conSubminutos = local.valor.segundos !== 0 || inicio.getTime() % 1000 !== 0;
  return conSubminutos || local.valor.minutos % g !== 0 ? error(turnoNoAlineado()) : ok(undefined);
}

/** RN-AG-07: la fecha local de inicio, en la zona de la clínica, no puede ser feriado. */
export function validarNoFeriado(
  inicio: Date,
  feriados: readonly FechaLocal[],
  zona: string,
): Resultado<void> {
  const local = instanteALocal(inicio, zona);
  if (!local.ok) return local;
  return feriados.includes(local.valor.fecha) ? error(turnoEnFeriado()) : ok(undefined);
}

/** Franja semanal -> Intervalo UTC para una fecha local concreta (compartido con disponibilidad). */
export function franjaAIntervalo(
  fecha: FechaLocal,
  franja: FranjaAtencion,
  zona: string,
): Resultado<Intervalo> {
  const desde = localAInstante(fecha, franja.desdeMinutos, zona);
  if (!desde.ok) return desde;
  const hasta = localAInstante(fecha, franja.hastaMinutos, zona);
  if (!hasta.ok) return hasta;
  return crearIntervalo(desde.valor, hasta.valor);
}

/**
 * RN-AG-06 (supuesto): `[inicio, fin)` del profesional debe caber en UNA franja del día de semana
 * local. El buffer del sillón no participa: el llamador pasa solo el rango del profesional.
 */
export function validarDentroDeHorario(
  rangoProfesional: Intervalo,
  franjas: readonly FranjaAtencion[],
  zona: string,
): Resultado<void> {
  const local = instanteALocal(rangoProfesional.inicio, zona);
  if (!local.ok) return local;
  const cabe = franjas
    .filter((f) => f.diaSemana === local.valor.diaSemana)
    .some((f) => {
      const intervalo = franjaAIntervalo(local.valor.fecha, f, zona);
      return intervalo.ok && contiene(intervalo.valor, rangoProfesional);
    });
  return cabe ? ok(undefined) : error(turnoFueraDeHorario());
}

/** RN-AG-07: el rango del profesional no puede solaparse con un bloqueo (adyacente no bloquea). */
export function validarSinBloqueo(
  rangoProfesional: Intervalo,
  bloqueos: readonly Bloqueo[],
): Resultado<void> {
  return bloqueos.some((b) => seSolapa(rangoProfesional, b.intervalo))
    ? error(turnoEnBloqueo())
    : ok(undefined);
}

export interface EntradaValidacionPrevia {
  readonly inicio: Date;
  readonly rangoProfesional: Intervalo;
  readonly ahora: Date;
  readonly config: ConfiguracionAgenda;
  readonly feriados: readonly FechaLocal[];
  readonly franjas: readonly FranjaAtencion[];
  readonly bloqueos: readonly Bloqueo[];
}

/** Encadena las validaciones en el orden del spec: pasado, granularidad, feriado, horario, bloqueo. */
export function validarTurnoPrevio(e: EntradaValidacionPrevia): Resultado<void> {
  const pasos: ReadonlyArray<() => Resultado<void>> = [
    () => validarInicioNoPasado(e.inicio, e.ahora),
    () => validarGranularidad(e.inicio, e.config),
    () => validarNoFeriado(e.inicio, e.feriados, e.config.zonaHoraria),
    () => validarDentroDeHorario(e.rangoProfesional, e.franjas, e.config.zonaHoraria),
    () => validarSinBloqueo(e.rangoProfesional, e.bloqueos),
  ];
  for (const paso of pasos) {
    const r = paso();
    if (!r.ok) return r;
  }
  return ok(undefined);
}
