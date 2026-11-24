import { ErrorDeDominio } from '../../../../domain/shared/index.js';

/**
 * Traducción de errores de PostgreSQL (D10). Decide SOLO por `code` y `constraint` (campos
 * estructurados), nunca por el texto. El `detail` del motor puede contener valores de la fila
 * (DNI, teléfono, email): jamás se copia, ni como mensaje ni como `cause` (Ley 25.326, regla 1).
 * Todos los mensajes son fijos, sin interpolar valores.
 */

/** Error de persistencia no previsto: lleva solo el SQLSTATE y el nombre del constraint. */
export class ErrorDePersistencia extends Error {
  readonly sqlstate: string | undefined;
  readonly constraint: string | undefined;

  constructor(sqlstate: string | undefined, constraint: string | undefined, mensaje?: string) {
    super(mensaje ?? 'Error de persistencia no previsto');
    this.name = 'ErrorDePersistencia';
    this.sqlstate = sqlstate;
    this.constraint = constraint;
  }
}

export const pacienteDniDuplicado = (): ErrorDeDominio =>
  new ErrorDeDominio(
    'PACIENTE_DNI_DUPLICADO',
    'conflicto',
    'Ya existe un paciente con ese DNI en la clínica',
  );
export const feriadoDuplicado = (): ErrorDeDominio =>
  new ErrorDeDominio('FERIADO_DUPLICADO', 'conflicto', 'Ya existe un feriado en esa fecha');
export const bloqueoSolapado = (): ErrorDeDominio =>
  new ErrorDeDominio(
    'BLOQUEO_SOLAPADO',
    'conflicto',
    'El bloqueo se solapa con otro del profesional',
  );
export const franjaSolapada = (): ErrorDeDominio =>
  new ErrorDeDominio('FRANJA_SOLAPADA', 'conflicto', 'Las franjas de atención se solapan');
export const recursoNoEncontrado = (): ErrorDeDominio =>
  new ErrorDeDominio('RECURSO_NO_ENCONTRADO', 'no_encontrado', 'El recurso indicado no existe');
export const datosInvalidos = (): ErrorDeDominio =>
  new ErrorDeDominio('DATOS_INVALIDOS', 'solicitud_invalida', 'Los datos indicados no son válidos');

const SQLSTATE = /^[0-9A-Z]{5}$/;
const DATOS_INVALIDOS = new Set(['23514', '22P02', '22007', '22008']);

function textoDe(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor.length > 0 ? valor : undefined;
}

/** Devuelve el error de dominio o de persistencia que corresponde; no lanza. */
export function traducirErrorPg(error: unknown): Error {
  if (error instanceof ErrorDeDominio || error instanceof ErrorDePersistencia) return error;

  let sqlstate: string | undefined;
  let constraint: string | undefined;
  if (typeof error === 'object' && error !== null) {
    const codigo = textoDe(Reflect.get(error, 'code'));
    sqlstate = codigo !== undefined && SQLSTATE.test(codigo) ? codigo : undefined;
    constraint = textoDe(Reflect.get(error, 'constraint'));
  }

  if (sqlstate === '23505' && constraint === 'paciente_dni_unico') return pacienteDniDuplicado();
  if (sqlstate === '23505' && constraint === 'feriado_fecha_unica') return feriadoDuplicado();
  if (sqlstate === '23P01' && constraint === 'bloqueo_sin_solape') return bloqueoSolapado();
  if (sqlstate === '23P01' && constraint === 'horario_sin_solape') return franjaSolapada();
  if (sqlstate === '23503') return recursoNoEncontrado();
  if (sqlstate !== undefined && DATOS_INVALIDOS.has(sqlstate)) return datosInvalidos();

  return new ErrorDePersistencia(sqlstate, constraint);
}
