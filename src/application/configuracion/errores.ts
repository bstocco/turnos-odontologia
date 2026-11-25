import { ErrorDeDominio } from '../../domain/shared/errores.js';

/*
 * Fábricas de error de la aplicación de configuración (design D8). Los mensajes son fijos y no
 * interpolan datos personales (regla dura 1). Los códigos que ya existen en C-05 y C-06 se
 * reutilizan tal cual para que el cliente vea un único código por situación.
 */

export const accesoProhibido = (): ErrorDeDominio =>
  new ErrorDeDominio('ACCESO_PROHIBIDO', 'prohibido', 'El rol no tiene permiso para este recurso.');

export const recursoNoEncontrado = (): ErrorDeDominio =>
  new ErrorDeDominio('RECURSO_NO_ENCONTRADO', 'no_encontrado', 'El recurso indicado no existe');

export const cambiosVacios = (): ErrorDeDominio =>
  new ErrorDeDominio(
    'CAMBIOS_VACIOS',
    'solicitud_invalida',
    'La solicitud no indica ningún campo para modificar.',
  );

export const granularidadInvalida = (): ErrorDeDominio =>
  new ErrorDeDominio(
    'GRANULARIDAD_INVALIDA',
    'regla_de_negocio',
    'La granularidad debe ser un entero positivo que divida 1440 minutos.',
  );

export const franjaInvalida = (): ErrorDeDominio =>
  new ErrorDeDominio(
    'FRANJA_INVALIDA',
    'solicitud_invalida',
    'Cada franja debe cumplir horaDesde < horaHasta.',
  );

export const franjaSolapada = (): ErrorDeDominio =>
  new ErrorDeDominio('FRANJA_SOLAPADA', 'conflicto', 'Las franjas de atención se solapan');

export const plantillaFeriadosNoDisponible = (): ErrorDeDominio =>
  new ErrorDeDominio(
    'PLANTILLA_FERIADOS_NO_DISPONIBLE',
    'regla_de_negocio',
    'No hay plantilla de feriados nacionales para el año indicado.',
  );
