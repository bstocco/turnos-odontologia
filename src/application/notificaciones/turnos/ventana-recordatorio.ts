import {
  instanteALocal,
  localAInstante,
  sumarDias,
  type FechaLocal,
} from '../../../domain/agenda/zona-horaria.js';
import { ErrorDeDominio } from '../../../domain/shared/errores.js';
import { valorOLanzar } from '../../../domain/shared/resultado.js';
import type { VentanaRecordatorio } from './puertos.js';

export const ANTICIPACION_RECORDATORIO_HORAS_DEFECTO = 24;
const HORA_MS = 3_600_000;
const MAX_MINUTOS_BUSQUEDA_DST = 180;

export interface EntradaVentanaRecordatorio {
  readonly ahora: Date;
  readonly zonaHoraria: string;
  readonly anticipacionHoras?: number;
}

function resolverInstanteLocalSeguro(
  fechaInicial: FechaLocal,
  minutosIniciales: number,
  zonaHoraria: string,
): Date {
  let fechaActual = fechaInicial;
  let minutosActuales = minutosIniciales;

  for (let paso = 0; paso <= MAX_MINUTOS_BUSQUEDA_DST; paso++) {
    const res = localAInstante(fechaActual, minutosActuales, zonaHoraria);
    if (res.ok) return res.valor;
    if (res.error.codigo !== 'HORA_LOCAL_INEXISTENTE') {
      throw res.error;
    }

    minutosActuales += 1;
    if (minutosActuales >= 1440) {
      minutosActuales = 0;
      fechaActual = sumarDias(fechaActual, 1);
    }
  }

  throw new ErrorDeDominio(
    'HORA_LOCAL_INEXISTENTE',
    'solicitud_invalida',
    'No se pudo resolver una hora local válida dentro del rango de transición DST.',
  );
}

/**
 * Calcula la ventana *catch-up* `(ahora, hastaInclusivo]` en la zona horaria IANA de la clínica.
 * Para la porción de días completos (default 24 hs = 1 día) avanza días calendario locales en esa
 * zona y resuelve transiciones DST de forma determinista sin desplazamientos fijos.
 */
export function calcularVentanaRecordatorio(
  entrada: EntradaVentanaRecordatorio,
): VentanaRecordatorio {
  const ahoraMs = entrada.ahora.getTime();
  if (!(entrada.ahora instanceof Date) || Number.isNaN(ahoraMs)) {
    throw new ErrorDeDominio(
      'FECHA_INVALIDA',
      'solicitud_invalida',
      'El instante actual para calcular la ventana de recordatorio no es válido.',
    );
  }

  const anticipacionHoras = entrada.anticipacionHoras ?? ANTICIPACION_RECORDATORIO_HORAS_DEFECTO;
  if (!Number.isInteger(anticipacionHoras) || anticipacionHoras <= 0) {
    throw new ErrorDeDominio(
      'ANTICIPACION_RECORDATORIO_INVALIDA',
      'solicitud_invalida',
      'La anticipación del recordatorio debe ser un entero positivo en horas.',
    );
  }

  const local = valorOLanzar(instanteALocal(entrada.ahora, entrada.zonaHoraria));
  const diasCompletos = Math.trunc(anticipacionHoras / 24);
  const horasRestantes = anticipacionHoras % 24;

  const fechaObjetivo = diasCompletos > 0 ? sumarDias(local.fecha, diasCompletos) : local.fecha;
  const baseObjetivo = resolverInstanteLocalSeguro(
    fechaObjetivo,
    local.minutos,
    entrada.zonaHoraria,
  );

  let hastaMs =
    baseObjetivo.getTime() +
    local.segundos * 1000 +
    entrada.ahora.getUTCMilliseconds() +
    horasRestantes * HORA_MS;

  if (hastaMs <= ahoraMs) {
    hastaMs = ahoraMs + anticipacionHoras * HORA_MS;
  }

  return {
    desdeExclusivo: new Date(ahoraMs),
    hastaInclusivo: new Date(hastaMs),
  };
}

/** Indica si `inicio` cae dentro de la ventana semiabierta `(desdeExclusivo, hastaInclusivo]`. */
export function estaEnVentanaRecordatorio(inicio: Date, ventana: VentanaRecordatorio): boolean {
  const ms = inicio.getTime();
  return ms > ventana.desdeExclusivo.getTime() && ms <= ventana.hastaInclusivo.getTime();
}
