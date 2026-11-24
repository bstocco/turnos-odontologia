import { ErrorDeDominio } from '../../domain/shared/errores.js';

/*
 * Errores de la consulta pública de disponibilidad (C-13, design D5). Los mensajes son fijos y no
 * interpolan datos de entrada (regla 1). Un único `404` para clínica, profesional y prestación.
 */

export const recursoPublicoNoEncontrado = (): ErrorDeDominio =>
  new ErrorDeDominio('RECURSO_NO_ENCONTRADO', 'no_encontrado', 'El recurso solicitado no existe.');

export const rangoFechasInvalido = (): ErrorDeDominio =>
  new ErrorDeDominio(
    'RANGO_FECHAS_INVALIDO',
    'solicitud_invalida',
    'El rango de fechas solicitado no es válido.',
  );
