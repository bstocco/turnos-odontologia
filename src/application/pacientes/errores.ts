import { ErrorDeDominio } from '../../domain/shared/errores.js';

/*
 * Fábricas de error de la aplicación de pacientes (design D7). Los mensajes son fijos y no
 * interpolan datos personales (regla dura 1, Ley 25.326). Los códigos existentes se reutilizan
 * tal cual para que el cliente vea un único código por situación.
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

export const dniInvalido = (): ErrorDeDominio =>
  new ErrorDeDominio(
    'DNI_INVALIDO',
    'solicitud_invalida',
    'El DNI debe tener 7 u 8 dígitos, con o sin puntos.',
  );

export const busquedaInvalida = (): ErrorDeDominio =>
  new ErrorDeDominio(
    'BUSQUEDA_INVALIDA',
    'solicitud_invalida',
    'La búsqueda requiere exactamente un criterio: dni o apellido (mínimo 2 caracteres).',
  );
