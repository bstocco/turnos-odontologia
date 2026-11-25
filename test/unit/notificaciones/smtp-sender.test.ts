import { describe, expect, it, vi } from 'vitest';

import { ErrorDeEnvioEmail } from '../../../src/application/notificaciones/errores.js';
import {
  crearEmailSenderSmtp,
  type TransporteSmtp,
} from '../../../src/infrastructure/email/smtp-sender.js';

describe('crearEmailSenderSmtp', () => {
  it('falla de inmediato si faltan credenciales o remitente válido sin exponer secretos', () => {
    expect(() =>
      crearEmailSenderSmtp({ emailApiKey: '', emailFrom: 'turnos@clinica.example' }),
    ).toThrowError(ErrorDeEnvioEmail);

    try {
      crearEmailSenderSmtp({ emailApiKey: undefined, emailFrom: 'turnos@clinica.example' });
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorDeEnvioEmail);
      const err = error as ErrorDeEnvioEmail;
      expect(err.codigo).toBe('EMAIL_CONFIGURACION_INVALIDA');
      expect(err.reintentable).toBe(false);
      expect(err.message).toContain('EMAIL_API_KEY');
    }

    try {
      crearEmailSenderSmtp({ emailApiKey: 're_secreto_123456', emailFrom: 'invalido' });
    } catch (error) {
      const err = error as ErrorDeEnvioEmail;
      expect(err.codigo).toBe('EMAIL_CONFIGURACION_INVALIDA');
      expect(err.message).toContain('EMAIL_FROM');
      expect(err.message).not.toContain('re_secreto_123456');
      expect(err.message).not.toContain('invalido');
    }
  });

  it('usa preset Resend SMTP por defecto, sanea saltos de línea en asunto y devuelve messageId', async () => {
    const sendMail = vi.fn(async () => ({ messageId: 'resend-msg-42' }));
    let opcionesCapturadas: unknown;

    const sender = crearEmailSenderSmtp(
      {
        emailApiKey: 're_clave_secreta',
        emailFrom: 'turnos@clinica.example',
      },
      {
        fabricaTransporte: (opciones): TransporteSmtp => {
          opcionesCapturadas = opciones;
          return { sendMail };
        },
      },
    );

    const res = await sender.enviar({
      para: 'paciente@ejemplo.com',
      asunto: 'Turno\r\nconfirmado\npara mañana',
      texto: 'Hola',
      html: '<p>Hola</p>',
    });

    expect(res).toEqual({ idProveedor: 'resend-msg-42' });
    expect(opcionesCapturadas).toEqual({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: { user: 'resend', pass: 're_clave_secreta' },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'turnos@clinica.example',
      to: 'paciente@ejemplo.com',
      subject: 'Turno confirmado para mañana',
      text: 'Hola',
      html: '<p>Hola</p>',
    });
  });

  it('admite configuración SMTP personalizada para otros proveedores como Brevo', async () => {
    const sendMail = vi.fn(async () => ({ messageId: 'brevo-99' }));
    let opcionesCapturadas: unknown;

    const sender = crearEmailSenderSmtp(
      {
        emailApiKey: 'xsmtpsib-clave',
        emailFrom: 'Turnos <turnos@clinica.example>',
        smtp: {
          host: 'smtp-relay.brevo.com',
          port: 587,
          secure: false,
          user: 'usuario-brevo',
        },
      },
      {
        fabricaTransporte: (opciones): TransporteSmtp => {
          opcionesCapturadas = opciones;
          return { sendMail };
        },
      },
    );

    const res = await sender.enviar({
      para: 'paciente@ejemplo.com',
      asunto: 'Recordatorio',
      texto: 'Cuerpo',
    });

    expect(res).toEqual({ idProveedor: 'brevo-99' });
    expect(opcionesCapturadas).toEqual({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: { user: 'usuario-brevo', pass: 'xsmtpsib-clave' },
    });
  });

  it('mapea errores de red, timeout y 4xx/429 como reintentables sin filtrar PII ni secretos', async () => {
    const erroresTransitorios = [
      Object.assign(new Error('ETIMEDOUT con paciente@privado.com'), { code: 'ETIMEDOUT' }),
      Object.assign(new Error('Rate limit paciente@privado.com'), { responseCode: 429 }),
      Object.assign(new Error('Try again later'), { responseCode: 421 }),
    ];

    for (const errTransporte of erroresTransitorios) {
      const sender = crearEmailSenderSmtp(
        { emailApiKey: 're_secreto', emailFrom: 'turnos@clinica.example' },
        {
          fabricaTransporte: () => ({
            sendMail: async () => {
              throw errTransporte;
            },
          }),
        },
      );

      try {
        await sender.enviar({
          para: 'paciente@privado.com',
          asunto: 'Asunto',
          texto: 'Cuerpo secreto',
        });
        expect.unreachable('Debió lanzar');
      } catch (error) {
        expect(error).toBeInstanceOf(ErrorDeEnvioEmail);
        const err = error as ErrorDeEnvioEmail;
        expect(err.reintentable).toBe(true);
        expect(err.message).not.toContain('paciente@privado.com');
        expect(err.message).not.toContain('re_secreto');
        expect(err.message).not.toContain('Cuerpo secreto');
      }
    }
  });

  it('mapea errores 5xx y EAUTH como definitivos (reintentable = false) sin filtrar PII', async () => {
    const erroresDefinitivos = [
      Object.assign(new Error('Invalid login re_secreto'), { code: 'EAUTH', responseCode: 535 }),
      Object.assign(new Error('Mailbox unavailable paciente@privado.com'), { responseCode: 550 }),
    ];

    for (const errTransporte of erroresDefinitivos) {
      const sender = crearEmailSenderSmtp(
        { emailApiKey: 're_secreto', emailFrom: 'turnos@clinica.example' },
        {
          fabricaTransporte: () => ({
            sendMail: async () => {
              throw errTransporte;
            },
          }),
        },
      );

      try {
        await sender.enviar({
          para: 'paciente@privado.com',
          asunto: 'Asunto',
          texto: 'Cuerpo secreto',
        });
        expect.unreachable('Debió lanzar');
      } catch (error) {
        expect(error).toBeInstanceOf(ErrorDeEnvioEmail);
        const err = error as ErrorDeEnvioEmail;
        expect(err.reintentable).toBe(false);
        expect(err.message).not.toContain('paciente@privado.com');
        expect(err.message).not.toContain('re_secreto');
      }
    }
  });
});
