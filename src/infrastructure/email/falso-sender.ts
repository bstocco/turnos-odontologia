import {
  ErrorDeEnvioEmail,
  type EmailSender,
  type MensajeEmail,
  type ResultadoEnvioEmail,
} from '../../application/notificaciones/index.js';

export interface MensajeEnviadoFalso {
  readonly idProveedor: string;
  readonly para: string;
  readonly asunto: string;
  readonly texto: string;
  readonly html?: string;
}

export interface EmailSenderFalso extends EmailSender {
  readonly enviados: readonly MensajeEnviadoFalso[];
  fallarTransitoriamente(veces: number, codigo?: string): void;
  fallarPermanentemente(codigo?: string): void;
  limpiar(): void;
}

/**
 * Adaptador determinista en memoria para pruebas unitarias y de integración sin red.
 */
export function crearEmailSenderFalso(): EmailSenderFalso {
  const registros: MensajeEnviadoFalso[] = [];
  let secuencia = 0;
  let fallosTransitoriosRestantes = 0;
  let codigoTransitorio = 'EMAIL_ERROR_TEMPORAL';
  let falloPermanenteCodigo: string | undefined;

  return {
    get enviados(): readonly MensajeEnviadoFalso[] {
      return registros.map((m) => ({ ...m }));
    },

    fallarTransitoriamente(veces: number, codigo = 'EMAIL_ERROR_TEMPORAL'): void {
      if (!Number.isInteger(veces) || veces < 0) {
        throw new RangeError('La cantidad de fallos transitorios debe ser un entero >= 0.');
      }
      falloPermanenteCodigo = undefined;
      fallosTransitoriosRestantes = veces;
      codigoTransitorio = codigo;
    },

    fallarPermanentemente(codigo = 'EMAIL_RECHAZADO_PERMANENTE'): void {
      fallosTransitoriosRestantes = 0;
      falloPermanenteCodigo = codigo;
    },

    limpiar(): void {
      registros.length = 0;
      secuencia = 0;
      fallosTransitoriosRestantes = 0;
      codigoTransitorio = 'EMAIL_ERROR_TEMPORAL';
      falloPermanenteCodigo = undefined;
    },

    async enviar(mensaje: MensajeEmail): Promise<ResultadoEnvioEmail> {
      if (falloPermanenteCodigo !== undefined) {
        throw new ErrorDeEnvioEmail(
          falloPermanenteCodigo,
          false,
          'Envío rechazado de forma permanente en adaptador de prueba.',
        );
      }

      if (fallosTransitoriosRestantes > 0) {
        fallosTransitoriosRestantes -= 1;
        throw new ErrorDeEnvioEmail(
          codigoTransitorio,
          true,
          'Fallo temporal simulado en adaptador de prueba.',
        );
      }

      secuencia += 1;
      const idProveedor = `falso-${secuencia}`;
      registros.push({
        idProveedor,
        para: mensaje.para,
        asunto: mensaje.asunto,
        texto: mensaje.texto,
        ...(mensaje.html !== undefined ? { html: mensaje.html } : {}),
      });
      return { idProveedor };
    },
  };
}
