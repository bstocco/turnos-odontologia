import { ErrorDeDominio } from '../../domain/shared/errores.js';

const FORMATO_DE_CODIGO = /^[A-Z][A-Z0-9_]*$/;

/**
 * Error tipado del puerto `EmailSender`. Indica si la falla es transitoria (`reintentable = true`)
 * o permanente (`reintentable = false`). Sus mensajes nunca deben interpolar emails, cuerpos ni claves.
 */
export class ErrorDeEnvioEmail extends Error {
  readonly codigo: string;
  readonly reintentable: boolean;

  constructor(codigo: string, reintentable: boolean, mensaje: string) {
    if (!FORMATO_DE_CODIGO.test(codigo)) {
      throw new TypeError(`Código de error de email inválido: ${codigo}`);
    }
    super(mensaje);
    this.name = 'ErrorDeEnvioEmail';
    this.codigo = codigo;
    this.reintentable = reintentable;
  }
}

/**
 * Extrae un código estable y seguro para persistir en `notificacion.error` o `pgboss.job.output`.
 * Nunca reenvía mensajes arbitrarios ni trazas que puedan contener PII o credenciales.
 */
export function sanearCodigoError(
  error: unknown,
  codigoPorDefecto = 'ERROR_INTERNO_NOTIFICACION',
): string {
  if (error instanceof ErrorDeEnvioEmail || error instanceof ErrorDeDominio) {
    return error.codigo;
  }
  return FORMATO_DE_CODIGO.test(codigoPorDefecto) ? codigoPorDefecto : 'ERROR_INTERNO_NOTIFICACION';
}
