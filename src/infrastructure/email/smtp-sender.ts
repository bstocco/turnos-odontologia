import nodemailer from 'nodemailer';

import {
  ErrorDeEnvioEmail,
  type EmailSender,
  type MensajeEmail,
  type ResultadoEnvioEmail,
} from '../../application/notificaciones/index.js';

export interface ConfigSmtpPersonalizada {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user: string;
}

export interface ConfigEmailSmtp {
  readonly emailApiKey: string | undefined;
  readonly emailFrom: string | undefined;
  readonly smtp?: ConfigSmtpPersonalizada;
}

export interface OpcionesTransporteNodemailer {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly auth: {
    readonly user: string;
    readonly pass: string;
  };
}

export interface MensajeNodemailer {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

export interface TransporteSmtp {
  sendMail(mensaje: MensajeNodemailer): Promise<{ readonly messageId: string }>;
}

export interface OpcionesEmailSenderSmtp {
  readonly fabricaTransporte?: (opciones: OpcionesTransporteNodemailer) => TransporteSmtp;
}

const PRESET_RESEND_SMTP: ConfigSmtpPersonalizada = {
  host: 'smtp.resend.com',
  port: 465,
  secure: true,
  user: 'resend',
};

const FORMATO_CORREO_SIMPLE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODIGOS_RED_TRANSITORIOS = new Set([
  'ETIMEDOUT',
  'ESOCKET',
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
]);

function esRemitenteValido(remitente: string): boolean {
  const limpio = remitente.trim();
  if (limpio.length === 0 || /[\r\n]/.test(limpio)) return false;
  const matchAngulares = /<([^<>]+)>$/.exec(limpio);
  const direccion = (matchAngulares?.[1] ?? limpio).trim();
  return FORMATO_CORREO_SIMPLE.test(direccion);
}

function sanearAsunto(asunto: string): string {
  return asunto
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function numeroDe(valor: unknown): number | undefined {
  return typeof valor === 'number' && Number.isInteger(valor) ? valor : undefined;
}

function textoDe(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor.length > 0 ? valor : undefined;
}

function traducirErrorSmtp(error: unknown): ErrorDeEnvioEmail {
  if (error instanceof ErrorDeEnvioEmail) return error;

  let code: string | undefined;
  let responseCode: number | undefined;
  if (typeof error === 'object' && error !== null) {
    code = textoDe(Reflect.get(error, 'code'));
    responseCode = numeroDe(Reflect.get(error, 'responseCode'));
  }

  if (code === 'EAUTH' || responseCode === 535) {
    return new ErrorDeEnvioEmail(
      'EMAIL_AUTENTICACION_INVALIDA',
      false,
      'El servidor SMTP rechazó las credenciales configuradas.',
    );
  }

  if (responseCode === 429) {
    return new ErrorDeEnvioEmail(
      'EMAIL_LIMITE_TASA',
      true,
      'El proveedor SMTP limitó temporalmente la tasa de envíos.',
    );
  }

  if (responseCode !== undefined && responseCode >= 400 && responseCode < 500) {
    return new ErrorDeEnvioEmail(
      'EMAIL_ERROR_TEMPORAL',
      true,
      'El servidor SMTP devolvió un rechazo temporal.',
    );
  }

  if (responseCode !== undefined && responseCode >= 500) {
    return new ErrorDeEnvioEmail(
      'EMAIL_RECHAZADO_PERMANENTE',
      false,
      'El servidor SMTP rechazó el envío de forma permanente.',
    );
  }

  if (code !== undefined && CODIGOS_RED_TRANSITORIOS.has(code)) {
    return new ErrorDeEnvioEmail(
      'EMAIL_ERROR_RED',
      true,
      'Error temporal de red o tiempo de espera al contactar el servidor SMTP.',
    );
  }

  return new ErrorDeEnvioEmail(
    'EMAIL_PROVEEDOR_ERROR',
    true,
    'Error temporal al intentar entregar el correo por SMTP.',
  );
}

/**
 * Adaptador SMTP neutral entre Resend y Brevo usando `nodemailer`.
 * Por defecto usa el preset SMTP de Resend con `EMAIL_API_KEY` y `EMAIL_FROM`.
 */
export function crearEmailSenderSmtp(
  config: ConfigEmailSmtp,
  opciones: OpcionesEmailSenderSmtp = {},
): EmailSender {
  const apiKey = config.emailApiKey?.trim() ?? '';
  if (apiKey.length === 0) {
    throw new ErrorDeEnvioEmail(
      'EMAIL_CONFIGURACION_INVALIDA',
      false,
      'Falta configurar EMAIL_API_KEY para el envío de correos.',
    );
  }

  const from = config.emailFrom?.trim() ?? '';
  if (!esRemitenteValido(from)) {
    throw new ErrorDeEnvioEmail(
      'EMAIL_CONFIGURACION_INVALIDA',
      false,
      'La variable EMAIL_FROM falta o no tiene un formato de remitente válido.',
    );
  }

  const smtp = config.smtp ?? PRESET_RESEND_SMTP;
  if (smtp.host.trim().length === 0 || !Number.isInteger(smtp.port) || smtp.port <= 0) {
    throw new ErrorDeEnvioEmail(
      'EMAIL_CONFIGURACION_INVALIDA',
      false,
      'La configuración del servidor SMTP (host o port) no es válida.',
    );
  }

  const fabrica =
    opciones.fabricaTransporte ??
    ((opts: OpcionesTransporteNodemailer): TransporteSmtp => nodemailer.createTransport(opts));

  const transporte = fabrica({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: apiKey,
    },
  });

  return {
    async enviar(mensaje: MensajeEmail): Promise<ResultadoEnvioEmail> {
      try {
        const info = await transporte.sendMail({
          from,
          to: mensaje.para,
          subject: sanearAsunto(mensaje.asunto),
          text: mensaje.texto,
          ...(mensaje.html !== undefined ? { html: mensaje.html } : {}),
        });
        return { idProveedor: info.messageId };
      } catch (error) {
        throw traducirErrorSmtp(error);
      }
    },
  };
}
