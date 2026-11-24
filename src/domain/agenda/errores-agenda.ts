import { ErrorDeDominio } from '../shared/errores.js';
import type { TipoDeError } from '../shared/errores.js';

/**
 * Fábricas de errores de la agenda (design D3). Los mensajes NO interpolan datos
 * personales: el detalle opcional solo debe llevar ids u horas.
 */
function fabrica(
  codigo: string,
  tipo: TipoDeError,
  base: string,
): (detalle?: string) => ErrorDeDominio {
  return (detalle) =>
    new ErrorDeDominio(codigo, tipo, detalle === undefined ? base : `${base}: ${detalle}`);
}

// solicitud_invalida (400)
export const intervaloInvalido = fabrica(
  'INTERVALO_INVALIDO',
  'solicitud_invalida',
  'El intervalo debe cumplir inicio < fin',
);
export const ocupacionInvalida = fabrica(
  'OCUPACION_INVALIDA',
  'solicitud_invalida',
  'La duración debe ser un entero positivo y el buffer un entero >= 0',
);
export const estadoTurnoInvalido = fabrica(
  'ESTADO_TURNO_INVALIDO',
  'solicitud_invalida',
  'Estado de turno inválido',
);
export const zonaHorariaInvalida = fabrica(
  'ZONA_HORARIA_INVALIDA',
  'solicitud_invalida',
  'Zona horaria IANA desconocida',
);
export const fechaHoraLocalInvalida = fabrica(
  'FECHA_HORA_LOCAL_INVALIDA',
  'solicitud_invalida',
  'Fecha u hora local mal formada',
);

// conflicto (409)
export const turnoSolapadoProfesional = fabrica(
  'TURNO_SOLAPADO_PROFESIONAL',
  'conflicto',
  'El profesional ya tiene un turno en ese horario',
);
export const turnoSolapadoSillon = fabrica(
  'TURNO_SOLAPADO_SILLON',
  'conflicto',
  'El sillón está ocupado en ese horario',
);
export const turnoModificadoConcurrentemente = fabrica(
  'TURNO_MODIFICADO_CONCURRENTEMENTE',
  'conflicto',
  'El turno cambió de estado mientras se procesaba',
);

// regla_de_negocio (422)
export const turnoInicioEnPasado = fabrica(
  'TURNO_INICIO_EN_PASADO',
  'regla_de_negocio',
  'El turno no puede empezar en el pasado',
);
export const turnoNoAlineado = fabrica(
  'TURNO_NO_ALINEADO',
  'regla_de_negocio',
  'El inicio no está alineado a la granularidad de la agenda',
);
export const turnoEnFeriado = fabrica(
  'TURNO_EN_FERIADO',
  'regla_de_negocio',
  'No se pueden agendar turnos en un feriado',
);
export const turnoFueraDeHorario = fabrica(
  'TURNO_FUERA_DE_HORARIO',
  'regla_de_negocio',
  'El turno queda fuera del horario de atención',
);
export const turnoEnBloqueo = fabrica(
  'TURNO_EN_BLOQUEO',
  'regla_de_negocio',
  'El turno se superpone con un bloqueo del profesional',
);
export const transicionTurnoInvalida = fabrica(
  'TRANSICION_TURNO_INVALIDA',
  'regla_de_negocio',
  'Transición de estado de turno no permitida',
);
export const turnoAunNoIniciado = fabrica(
  'TURNO_AUN_NO_INICIADO',
  'regla_de_negocio',
  'El turno todavía no empezó',
);
export const horaLocalInexistente = fabrica(
  'HORA_LOCAL_INEXISTENTE',
  'regla_de_negocio',
  'La hora local no existe en la zona horaria (adelanto de reloj)',
);
