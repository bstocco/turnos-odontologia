import { ErrorDeDominio } from '../../domain/shared/errores.js';

/**
 * Fábricas de errores de dominio para reserva pública y acciones por token.
 * Regla dura 1 (Ley 25.326): ningún mensaje interpola datos personales del paciente ni tokens.
 */

export const codigoVerificacionInvalido = (): ErrorDeDominio =>
  new ErrorDeDominio(
    'CODIGO_VERIFICACION_INVALIDO',
    'regla_de_negocio',
    'El código de verificación ingresado no es válido.',
  );

export const codigoVerificacionVencido = (): ErrorDeDominio =>
  new ErrorDeDominio(
    'CODIGO_VERIFICACION_VENCIDO',
    'regla_de_negocio',
    'El código de verificación venció. Solicitá uno nuevo.',
  );

export const codigoVerificacionAgotado = (): ErrorDeDominio =>
  new ErrorDeDominio(
    'CODIGO_VERIFICACION_AGOTADO',
    'regla_de_negocio',
    'Se alcanzó el límite máximo de intentos para el código de verificación.',
  );

export const codigoVerificacionUsado = (): ErrorDeDominio =>
  new ErrorDeDominio(
    'CODIGO_VERIFICACION_USADO',
    'regla_de_negocio',
    'El código de verificación ya fue utilizado.',
  );

export const topeReservasActivasAlcanzado = (): ErrorDeDominio =>
  new ErrorDeDominio(
    'TOPE_RESERVAS_ACTIVAS_ALCANZADO',
    'regla_de_negocio',
    'Ya alcanzaste el máximo de 2 reservas públicas activas en esta clínica.',
  );

export const tokenAccionInvalido = (): ErrorDeDominio =>
  new ErrorDeDominio(
    'TOKEN_ACCION_INVALIDO',
    'no_encontrado',
    'El enlace de acción es inválido, ya fue utilizado o venció.',
  );

export const cancelacionFueraDePlazo = (anticipacionHoras: number): ErrorDeDominio =>
  new ErrorDeDominio(
    'CANCELACION_FUERA_DE_PLAZO',
    'conflicto',
    `No podés cancelar online con menos de ${anticipacionHoras} horas de anticipación; contactá a la clínica.`,
  );

export const recursoPublicoNoEncontrado = (): ErrorDeDominio =>
  new ErrorDeDominio('RECURSO_NO_ENCONTRADO', 'no_encontrado', 'El recurso solicitado no existe.');

export const dniPublicoInvalido = (): ErrorDeDominio =>
  new ErrorDeDominio(
    'DNI_INVALIDO',
    'solicitud_invalida',
    'El DNI debe tener entre 7 y 8 dígitos.',
  );

export const datosPublicosInvalidos = (mensaje: string): ErrorDeDominio =>
  new ErrorDeDominio('DATOS_INVALIDOS', 'solicitud_invalida', mensaje);
