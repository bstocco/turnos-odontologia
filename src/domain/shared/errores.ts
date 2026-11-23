/**
 * Errores de dominio. Son semánticos: no conocen HTTP. La capa HTTP traduce el `tipo`
 * a un estado (ver interfaces/http/errores.ts). Los mensajes NO deben interpolar datos
 * personales (regla dura 1): usá identificadores.
 */
export type TipoDeError =
  | 'solicitud_invalida'
  | 'no_autenticado'
  | 'prohibido'
  | 'no_encontrado'
  | 'conflicto'
  | 'regla_de_negocio';

const FORMATO_DE_CODIGO = /^[A-Z][A-Z0-9_]*$/;

export class ErrorDeDominio extends Error {
  readonly codigo: string;
  readonly tipo: TipoDeError;

  constructor(codigo: string, tipo: TipoDeError, mensaje: string) {
    if (!FORMATO_DE_CODIGO.test(codigo)) {
      throw new TypeError(`Código de error de dominio inválido: ${codigo}`);
    }
    super(mensaje);
    this.name = 'ErrorDeDominio';
    this.codigo = codigo;
    this.tipo = tipo;
  }
}
