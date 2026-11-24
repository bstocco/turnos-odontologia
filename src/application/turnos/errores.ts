import { ErrorDeDominio } from '../../domain/shared/errores.js';

/** Recurso (turno) no encontrado; esquema de error del modelo. */
export function turnoNoEncontrado(): ErrorDeDominio {
  return new ErrorDeDominio(
    'RECURSO_NO_ENCONTRADO',
    'no_encontrado',
    'El turno indicado no existe',
  );
}
