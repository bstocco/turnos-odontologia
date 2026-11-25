import {
  turnoSolapadoProfesional,
  turnoSolapadoSillon,
} from '../../../../domain/agenda/errores-agenda.js';
import { ErrorDeDominio } from '../../../../domain/shared/errores.js';
import { ErrorDePersistencia, traducirErrorPg } from '../compartido/errores.js';

function textoDe(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor.length > 0 ? valor : undefined;
}

/**
 * Traducción local de errores de PostgreSQL para reserva pública (`Q6b`):
 * encapsula `23P01` (`turno_sin_solape_profesional` / `turno_sin_solape_sillon`) y `40P01`
 * sin modificar `compartido/errores.ts` fuera de la zona de `C-15`.
 */
export function traducirErrorReservaPg(error: unknown): Error {
  if (error instanceof ErrorDeDominio) return error;

  let sqlstate: string | undefined;
  let constraint: string | undefined;

  if (error instanceof ErrorDePersistencia) {
    sqlstate = error.sqlstate;
    constraint = error.constraint;
  } else if (typeof error === 'object' && error !== null) {
    sqlstate = textoDe(Reflect.get(error, 'code'));
    constraint = textoDe(Reflect.get(error, 'constraint'));
  }

  if (sqlstate === '23P01' && constraint === 'turno_sin_solape_profesional') {
    return turnoSolapadoProfesional();
  }
  if (sqlstate === '23P01' && constraint === 'turno_sin_solape_sillon') {
    return turnoSolapadoSillon();
  }
  if (sqlstate === '40P01') {
    return turnoSolapadoSillon();
  }

  return traducirErrorPg(error);
}
