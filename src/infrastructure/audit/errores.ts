import { ErrorDeDominio } from '../../domain/shared/errores.js';

/**
 * Traducción segura de errores de PostgreSQL para auditoría: decide únicamente por `code` y
 * `constraint` y nunca copia `detail`, `cause` ni mensajes del motor que puedan incluir PII.
 */
export class ErrorDeAuditoriaPersistencia extends Error {
  readonly sqlstate: string | undefined;
  readonly constraint: string | undefined;

  constructor(sqlstate: string | undefined, constraint: string | undefined) {
    super('Error de persistencia en auditoría');
    this.name = 'ErrorDeAuditoriaPersistencia';
    this.sqlstate = sqlstate;
    this.constraint = constraint;
  }
}

const SQLSTATE = /^[0-9A-Z]{5}$/;
const CODIGOS_DATOS_INVALIDOS = new Set(['23514', '22P02', '22007', '22008']);

function textoDe(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor.length > 0 ? valor : undefined;
}

/** Traduce errores de `pg` al insertar auditoría en errores tipados sin datos sensibles. */
export function traducirErrorAuditoriaPg(error: unknown): Error {
  if (error instanceof ErrorDeDominio || error instanceof ErrorDeAuditoriaPersistencia) {
    return error;
  }

  let sqlstate: string | undefined;
  let constraint: string | undefined;
  if (typeof error === 'object' && error !== null) {
    const codigo = textoDe(Reflect.get(error, 'code'));
    sqlstate = codigo !== undefined && SQLSTATE.test(codigo) ? codigo : undefined;
    constraint = textoDe(Reflect.get(error, 'constraint'));
  }

  if (sqlstate === '42501') {
    return new ErrorDeDominio(
      'AUDITORIA_CONTEXTO_INVALIDO',
      'prohibido',
      'El contexto de clínica no autoriza el registro de auditoría.',
    );
  }
  if (sqlstate === '23503') {
    return new ErrorDeDominio(
      'RECURSO_NO_ENCONTRADO',
      'no_encontrado',
      'La clínica asociada al evento de auditoría no existe.',
    );
  }
  if (sqlstate !== undefined && CODIGOS_DATOS_INVALIDOS.has(sqlstate)) {
    return new ErrorDeDominio(
      'DATOS_INVALIDOS',
      'solicitud_invalida',
      'Los datos del evento de auditoría no son válidos.',
    );
  }

  return new ErrorDeAuditoriaPersistencia(sqlstate, constraint);
}
