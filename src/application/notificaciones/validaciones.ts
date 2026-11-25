import { ErrorDeDominio } from '../../domain/shared/errores.js';

import type { PayloadColaEmail, TipoNotificacion } from './puertos.js';

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TIPOS_VALIDOS: ReadonlySet<TipoNotificacion> = new Set([
  'creacion',
  'confirmacion',
  'recordatorio',
  'cancelacion',
  'reprogramacion',
  'codigo',
]);

export interface EntradaEncolarNotificacion {
  readonly clinicaId: string;
  readonly turnoId?: string | null;
  readonly tipo: TipoNotificacion;
  readonly claveIdempotencia: string;
  readonly programadaPara?: Date;
}

export interface EntradaEncolarValidada {
  readonly clinicaId: string;
  readonly turnoId: string | null;
  readonly tipo: TipoNotificacion;
  readonly claveIdempotencia: string;
  readonly programadaPara?: Date;
}

export function esUuidValido(valor: unknown): valor is string {
  return typeof valor === 'string' && FORMATO_UUID.test(valor);
}

/**
 * Valida que el payload de la cola contenga exclusivamente `{ clinicaId, notificacionId }`.
 * Rechaza cualquier campo adicional para impedir que se filtren datos personales a `pgboss.job`.
 */
export function validarPayloadColaEmail(entrada: unknown): PayloadColaEmail {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) {
    throw new ErrorDeDominio(
      'PAYLOAD_NOTIFICACION_INVALIDO',
      'solicitud_invalida',
      'La carga útil de la cola de notificaciones debe ser un objeto solo con identificadores.',
    );
  }

  const claves = Object.keys(entrada);
  if (claves.length !== 2 || !claves.includes('clinicaId') || !claves.includes('notificacionId')) {
    throw new ErrorDeDominio(
      'PAYLOAD_NOTIFICACION_INVALIDO',
      'solicitud_invalida',
      'La carga útil de la cola admite únicamente clinicaId y notificacionId.',
    );
  }

  const clinicaId = Reflect.get(entrada, 'clinicaId');
  const notificacionId = Reflect.get(entrada, 'notificacionId');
  if (!esUuidValido(clinicaId) || !esUuidValido(notificacionId)) {
    throw new ErrorDeDominio(
      'PAYLOAD_NOTIFICACION_INVALIDO',
      'solicitud_invalida',
      'Los identificadores de clínica y notificación deben ser UUIDs válidos.',
    );
  }

  return { clinicaId, notificacionId };
}

/** Valida los parámetros de entrada para registrar y encolar una notificación. */
export function validarEntradaEncolar(entrada: EntradaEncolarNotificacion): EntradaEncolarValidada {
  if (!esUuidValido(entrada.clinicaId)) {
    throw new ErrorDeDominio(
      'CLINICA_ID_INVALIDO',
      'solicitud_invalida',
      'El identificador de la clínica no es un UUID válido.',
    );
  }

  if (!TIPOS_VALIDOS.has(entrada.tipo)) {
    throw new ErrorDeDominio(
      'TIPO_NOTIFICACION_INVALIDO',
      'solicitud_invalida',
      'El tipo de notificación indicado no es válido.',
    );
  }

  let turnoId: string | null = null;
  if (entrada.turnoId !== undefined && entrada.turnoId !== null) {
    if (!esUuidValido(entrada.turnoId)) {
      throw new ErrorDeDominio(
        'TURNO_ID_INVALIDO',
        'solicitud_invalida',
        'El identificador del turno no es un UUID válido.',
      );
    }
    turnoId = entrada.turnoId;
  }

  if (entrada.tipo === 'codigo' && turnoId !== null) {
    throw new ErrorDeDominio(
      'TURNO_NO_APLICA_PARA_CODIGO',
      'solicitud_invalida',
      'Una notificación de código de verificación no debe asociarse a un turno.',
    );
  }

  const clave = entrada.claveIdempotencia.trim();
  if (clave.length === 0) {
    throw new ErrorDeDominio(
      'CLAVE_IDEMPOTENCIA_INVALIDA',
      'solicitud_invalida',
      'La clave de idempotencia de la notificación es obligatoria.',
    );
  }

  if (
    entrada.programadaPara !== undefined &&
    (!(entrada.programadaPara instanceof Date) || Number.isNaN(entrada.programadaPara.getTime()))
  ) {
    throw new ErrorDeDominio(
      'FECHA_PROGRAMADA_INVALIDA',
      'solicitud_invalida',
      'La fecha programada de la notificación no es válida.',
    );
  }

  return {
    clinicaId: entrada.clinicaId,
    turnoId,
    tipo: entrada.tipo,
    claveIdempotencia: clave,
    ...(entrada.programadaPara !== undefined ? { programadaPara: entrada.programadaPara } : {}),
  };
}
