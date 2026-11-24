import { ErrorDeDominio } from '../shared/errores.js';
import { exigirFechaValida } from './validaciones.js';

export const ZONA_HORARIA_POR_DEFECTO = 'America/Argentina/Buenos_Aires';

const DESPLAZAMIENTO_FIJO = /^(?:[+-]\d{1,2}(?::?\d{2})?|(?:UTC|GMT)[+-].+|Etc\/GMT.*)$/i;

export interface PlantillaEmail {
  readonly asunto: string;
  readonly cuerpo: string;
}

export interface FechaHoraFormateada {
  readonly fecha: string;
  readonly hora: string;
  readonly texto: string;
}

export interface DatosBaseTurno {
  readonly nombreClinica: string;
  readonly nombrePaciente: string;
  readonly nombreProfesional: string;
  readonly nombrePrestacion: string;
  readonly inicio: Date;
  readonly zonaHoraria?: string;
}

export interface DatosCreacionTurno extends DatosBaseTurno {
  readonly estado: 'pendiente_confirmacion' | 'confirmado';
  readonly enlaceConfirmar?: string;
  readonly enlaceCancelar?: string;
}

export interface DatosConfirmacionTurno extends DatosBaseTurno {
  readonly enlaceCancelar?: string;
}

export interface DatosCancelacionTurno extends DatosBaseTurno {
  readonly motivo?: string;
}

export interface DatosReprogramacionTurno extends DatosBaseTurno {
  readonly inicioAnterior: Date;
  readonly enlaceCancelar?: string;
}

export interface DatosRecordatorioTurno extends DatosBaseTurno {
  readonly enlaceConfirmar?: string;
  readonly enlaceCancelar?: string;
}

export interface DatosCodigoVerificacion {
  readonly nombreClinica: string;
  readonly codigo: string;
  readonly vigenciaMinutos: number;
}

function errorZonaInvalida(): ErrorDeDominio {
  return new ErrorDeDominio(
    'ZONA_HORARIA_INVALIDA',
    'solicitud_invalida',
    'La zona horaria IANA indicada no es válida.',
  );
}

function errorParametroInvalido(mensaje: string): ErrorDeDominio {
  return new ErrorDeDominio('PARAMETRO_INVALIDO', 'solicitud_invalida', mensaje);
}

function sanearAsunto(texto: string): string {
  return texto
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extraerParte(
  partes: readonly Intl.DateTimeFormatPart[],
  tipo: Intl.DateTimeFormatPartTypes,
): string {
  return partes.find((p) => p.type === tipo)?.value ?? '';
}

function agregarEnlaces(
  lineas: string[],
  enlaces: { readonly enlaceConfirmar?: string; readonly enlaceCancelar?: string },
): void {
  if (enlaces.enlaceConfirmar !== undefined && enlaces.enlaceConfirmar.trim().length > 0) {
    lineas.push(`Confirmar turno: ${enlaces.enlaceConfirmar}`);
  }
  if (enlaces.enlaceCancelar !== undefined && enlaces.enlaceCancelar.trim().length > 0) {
    lineas.push(`Cancelar turno: ${enlaces.enlaceCancelar}`);
  }
}

function armarEmail(asunto: string, lineas: readonly string[]): PlantillaEmail {
  return {
    asunto: sanearAsunto(asunto),
    cuerpo: lineas.join('\n'),
  };
}

function formatearTurnoBase(datos: DatosBaseTurno): FechaHoraFormateada {
  return formatearFechaHoraEnZona(datos.inicio, datos.zonaHoraria);
}

/**
 * Formatea un instante UTC en una zona horaria IANA explícita (`dd/mm/yyyy` y `HH:mm`).
 * Rechaza desplazamientos fijos (como `UTC-3` o `-03:00`) y zonas desconocidas.
 */
export function formatearFechaHoraEnZona(
  instante: Date,
  zonaHoraria: string = ZONA_HORARIA_POR_DEFECTO,
): FechaHoraFormateada {
  exigirFechaValida(instante, 'El instante del turno no es una fecha válida.');

  const zona = zonaHoraria.trim();
  if (zona.length === 0 || DESPLAZAMIENTO_FIJO.test(zona)) {
    throw errorZonaInvalida();
  }

  let formateador: Intl.DateTimeFormat;
  try {
    formateador = new Intl.DateTimeFormat('es-AR', {
      timeZone: zona,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    throw errorZonaInvalida();
  }

  const partes = formateador.formatToParts(instante);
  const fecha = `${extraerParte(partes, 'day')}/${extraerParte(partes, 'month')}/${extraerParte(partes, 'year')}`;
  const hora = `${extraerParte(partes, 'hour')}:${extraerParte(partes, 'minute')}`;

  return { fecha, hora, texto: `${fecha} a las ${hora}` };
}

/** Plantilla de email para el alta inicial de un turno (`pendiente_confirmacion` o `confirmado`). */
export function plantillaCreacionTurno(datos: DatosCreacionTurno): PlantillaEmail {
  const momento = formatearTurnoBase(datos);
  const etiquetaEstado =
    datos.estado === 'pendiente_confirmacion' ? 'pendiente de confirmación' : 'confirmado';

  const lineas = [
    `Hola ${datos.nombrePaciente},`,
    '',
    `Registramos tu turno en ${datos.nombreClinica} (estado: ${etiquetaEstado}).`,
    `Prestación: ${datos.nombrePrestacion}`,
    `Profesional: ${datos.nombreProfesional}`,
    `Fecha y hora: ${momento.texto}`,
  ];
  agregarEnlaces(lineas, datos);

  return armarEmail(`${datos.nombreClinica} — Turno ${etiquetaEstado} (${momento.texto})`, lineas);
}

/** Plantilla de email al confirmarse un turno. */
export function plantillaConfirmacionTurno(datos: DatosConfirmacionTurno): PlantillaEmail {
  const momento = formatearTurnoBase(datos);
  const lineas = [
    `Hola ${datos.nombrePaciente},`,
    '',
    `Tu turno en ${datos.nombreClinica} fue confirmado.`,
    `Prestación: ${datos.nombrePrestacion}`,
    `Profesional: ${datos.nombreProfesional}`,
    `Fecha y hora: ${momento.texto}`,
  ];
  agregarEnlaces(lineas, { enlaceCancelar: datos.enlaceCancelar });

  return armarEmail(`${datos.nombreClinica} — Turno confirmado (${momento.texto})`, lineas);
}

/** Plantilla de email al cancelarse un turno. */
export function plantillaCancelacionTurno(datos: DatosCancelacionTurno): PlantillaEmail {
  const momento = formatearTurnoBase(datos);
  const lineas = [
    `Hola ${datos.nombrePaciente},`,
    '',
    `Tu turno en ${datos.nombreClinica} para el ${momento.texto} fue cancelado.`,
    `Prestación: ${datos.nombrePrestacion}`,
    `Profesional: ${datos.nombreProfesional}`,
  ];
  if (datos.motivo !== undefined && datos.motivo.trim().length > 0) {
    lineas.push(`Motivo: ${datos.motivo.trim()}`);
  }

  return armarEmail(`${datos.nombreClinica} — Turno cancelado (${momento.texto})`, lineas);
}

/** Plantilla de email cuando recepción reprograma un turno a un nuevo horario. */
export function plantillaReprogramacionTurno(datos: DatosReprogramacionTurno): PlantillaEmail {
  const anterior = formatearFechaHoraEnZona(datos.inicioAnterior, datos.zonaHoraria);
  const nuevo = formatearTurnoBase(datos);
  const lineas = [
    `Hola ${datos.nombrePaciente},`,
    '',
    `Tu turno en ${datos.nombreClinica} fue reprogramado.`,
    `Horario anterior: ${anterior.texto}`,
    `Nuevo horario: ${nuevo.texto}`,
    `Prestación: ${datos.nombrePrestacion}`,
    `Profesional: ${datos.nombreProfesional}`,
  ];
  agregarEnlaces(lineas, { enlaceCancelar: datos.enlaceCancelar });

  return armarEmail(`${datos.nombreClinica} — Turno reprogramado (${nuevo.texto})`, lineas);
}

/** Plantilla de email de recordatorio previo al turno. */
export function plantillaRecordatorioTurno(datos: DatosRecordatorioTurno): PlantillaEmail {
  const momento = formatearTurnoBase(datos);
  const lineas = [
    `Hola ${datos.nombrePaciente},`,
    '',
    `Te recordamos tu próximo turno en ${datos.nombreClinica}.`,
    `Prestación: ${datos.nombrePrestacion}`,
    `Profesional: ${datos.nombreProfesional}`,
    `Fecha y hora: ${momento.texto}`,
  ];
  agregarEnlaces(lineas, datos);

  return armarEmail(`${datos.nombreClinica} — Recordatorio de turno (${momento.texto})`, lineas);
}

/** Plantilla de email para el código numérico de verificación de reserva pública. */
export function plantillaCodigoVerificacion(datos: DatosCodigoVerificacion): PlantillaEmail {
  if (
    datos.codigo.trim().length === 0 ||
    !Number.isFinite(datos.vigenciaMinutos) ||
    datos.vigenciaMinutos <= 0
  ) {
    throw errorParametroInvalido('Los parámetros del código de verificación son inválidos.');
  }

  const unidad = datos.vigenciaMinutos === 1 ? 'minuto' : 'minutos';
  const lineas = [
    'Hola,',
    '',
    `Tu código de verificación para ${datos.nombreClinica} es: ${datos.codigo}`,
    `Este código vence en ${datos.vigenciaMinutos} ${unidad} y es de un solo uso.`,
  ];

  return armarEmail(`${datos.nombreClinica} — Código de verificación`, lineas);
}

/** Mensaje en español listo para construir un enlace manual de recordatorio por WhatsApp. */
export function plantillaRecordatorioWhatsapp(datos: DatosBaseTurno): string {
  const momento = formatearTurnoBase(datos);
  return (
    `Hola ${datos.nombrePaciente}, te recordamos tu turno en ${datos.nombreClinica} ` +
    `para ${datos.nombrePrestacion} con ${datos.nombreProfesional} el ${momento.texto}.`
  );
}
