import type { ProfesionalId, SillonId } from '../shared/ids.js';
import { error, ok, type Resultado } from '../shared/resultado.js';
import { ocupacionInvalida } from './errores-agenda.js';
import type { Intervalo } from './intervalo.js';
import {
  detectarSolape,
  rangoProfesional,
  rangoSillon,
  type OcupacionExistente,
} from './ocupacion.js';
import type { Bloqueo, ConfiguracionAgenda, FranjaAtencion, Sillon } from './puertos.js';
import { validarTurnoPrevio } from './validaciones.js';
import {
  diaSemanaDe,
  instanteALocal,
  localAInstante,
  sumarDias,
  type FechaLocal,
} from './zona-horaria.js';

const MINUTOS_POR_DIA = 1440;

export interface EntradaDisponibilidad {
  readonly profesionalId: ProfesionalId;
  /** Duración de la prestación, en minutos. */
  readonly duracionMinutos: number;
  /** Rango de fechas locales `[desde, hasta)`. */
  readonly desde: FechaLocal;
  readonly hasta: FechaLocal;
  readonly franjas: readonly FranjaAtencion[];
  readonly feriados: readonly FechaLocal[];
  readonly bloqueos: readonly Bloqueo[];
  /** Turnos relevantes del rango: del profesional y de los sillones (los inactivos se ignoran). */
  readonly turnos: readonly OcupacionExistente[];
  readonly sillones: readonly Sillon[];
  readonly config: ConfiguracionAgenda;
  readonly ahora: Date;
}

export interface Hueco {
  readonly intervalo: Intervalo;
  /** Sillones activos asignables, en el orden recibido. Nunca vacío. */
  readonly sillonesAsignables: readonly SillonId[];
}

/**
 * Huecos libres de un profesional para una prestación (D7). Reutiliza `validarTurnoPrevio` y
 * `detectarSolape`: lo que se ofrece es, por construcción, lo que la validación acepta.
 * Elegir un sillón entre los asignables y reintentar ante concurrencia es de C-09.
 */
export function calcularDisponibilidad(e: EntradaDisponibilidad): Resultado<readonly Hueco[]> {
  const g = e.config.granularidadMinutos;
  if (!Number.isInteger(e.duracionMinutos) || e.duracionMinutos <= 0)
    return error(ocupacionInvalida('duración'));
  if (!Number.isInteger(g) || g <= 0 || MINUTOS_POR_DIA % g !== 0)
    return error(ocupacionInvalida('granularidad'));
  const zona = instanteALocal(e.ahora, e.config.zonaHoraria);
  if (!zona.ok) return zona;

  const sillonesActivos = e.sillones.filter((s) => s.activo);
  const huecos: Hueco[] = [];

  for (let fecha = e.desde; fecha < e.hasta; fecha = sumarDias(fecha, 1)) {
    if (e.feriados.includes(fecha)) continue;
    const franjasDelDia = e.franjas
      .filter((f) => f.diaSemana === diaSemanaDe(fecha))
      .sort((a, b) => a.desdeMinutos - b.desdeMinutos);

    for (const franja of franjasDelDia) {
      const primero = Math.ceil(franja.desdeMinutos / g) * g;
      for (
        let minutos = primero;
        minutos + e.duracionMinutos <= franja.hastaMinutos;
        minutos += g
      ) {
        const inicio = localAInstante(fecha, minutos, e.config.zonaHoraria);
        if (!inicio.ok) continue; // hora inexistente por cambio de horario: no se ofrece
        const hueco = evaluarHueco(e, inicio.valor, sillonesActivos);
        if (hueco !== null) huecos.push(hueco);
      }
    }
  }
  return ok(huecos.sort((a, b) => a.intervalo.inicio.getTime() - b.intervalo.inicio.getTime()));
}

function evaluarHueco(
  e: EntradaDisponibilidad,
  inicio: Date,
  sillones: readonly Sillon[],
): Hueco | null {
  const profesional = rangoProfesional(inicio, e.duracionMinutos);
  if (!profesional.ok) return null;
  const previa = validarTurnoPrevio({
    inicio,
    rangoProfesional: profesional.valor,
    ahora: e.ahora,
    config: e.config,
    feriados: e.feriados,
    franjas: e.franjas,
    bloqueos: e.bloqueos,
  });
  if (!previa.ok) return null;

  const asignables = sillones
    .filter((s) => {
      const sillon = rangoSillon(inicio, e.duracionMinutos, s.bufferMinutos);
      if (!sillon.ok) return false;
      return detectarSolape(
        {
          profesionalId: e.profesionalId,
          sillonId: s.id,
          inicio,
          fin: profesional.valor.fin,
          finSillon: sillon.valor.fin,
        },
        e.turnos,
      ).ok;
    })
    .map((s) => s.id);
  return asignables.length === 0
    ? null
    : { intervalo: profesional.valor, sillonesAsignables: asignables };
}
