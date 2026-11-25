import { describe, expect, it } from 'vitest';

import { ErrorDeEnvioEmail } from '../../../src/application/notificaciones/errores.js';
import { crearEmailSenderFalso } from '../../../src/infrastructure/email/falso-sender.js';

describe('crearEmailSenderFalso', () => {
  it('registra copias inmutables de los mensajes enviados y devuelve idProveedor sintético', async () => {
    const sender = crearEmailSenderFalso();

    const r1 = await sender.enviar({
      para: 'a@ejemplo.com',
      asunto: 'Asunto 1',
      texto: 'Cuerpo 1',
    });
    const r2 = await sender.enviar({
      para: 'b@ejemplo.com',
      asunto: 'Asunto 2',
      texto: 'Cuerpo 2',
      html: '<p>Cuerpo 2</p>',
    });

    expect(r1.idProveedor).toBe('falso-1');
    expect(r2.idProveedor).toBe('falso-2');
    expect(sender.enviados).toHaveLength(2);
    expect(sender.enviados[0]).toEqual({
      idProveedor: 'falso-1',
      para: 'a@ejemplo.com',
      asunto: 'Asunto 1',
      texto: 'Cuerpo 1',
    });
    expect(sender.enviados[1]).toEqual({
      idProveedor: 'falso-2',
      para: 'b@ejemplo.com',
      asunto: 'Asunto 2',
      texto: 'Cuerpo 2',
      html: '<p>Cuerpo 2</p>',
    });
  });

  it('permite simular N fallos transitorios seguidos de éxito sin registrar los fallidos', async () => {
    const sender = crearEmailSenderFalso();
    sender.fallarTransitoriamente(2, 'EMAIL_TIMEOUT');

    await expect(
      sender.enviar({ para: 'a@ejemplo.com', asunto: 'Test', texto: 'Hola' }),
    ).rejects.toMatchObject({ codigo: 'EMAIL_TIMEOUT', reintentable: true });

    await expect(
      sender.enviar({ para: 'a@ejemplo.com', asunto: 'Test', texto: 'Hola' }),
    ).rejects.toBeInstanceOf(ErrorDeEnvioEmail);

    expect(sender.enviados).toHaveLength(0);

    const exito = await sender.enviar({ para: 'a@ejemplo.com', asunto: 'Test', texto: 'Hola' });
    expect(exito.idProveedor).toBe('falso-1');
    expect(sender.enviados).toHaveLength(1);
  });

  it('permite simular fallos permanentes y limpiar el estado', async () => {
    const sender = crearEmailSenderFalso();
    sender.fallarPermanentemente('EMAIL_AUTENTICACION_INVALIDA');

    await expect(
      sender.enviar({ para: 'a@ejemplo.com', asunto: 'Test', texto: 'Hola' }),
    ).rejects.toMatchObject({
      codigo: 'EMAIL_AUTENTICACION_INVALIDA',
      reintentable: false,
    });

    sender.limpiar();
    const ok = await sender.enviar({ para: 'a@ejemplo.com', asunto: 'Test', texto: 'Hola' });
    expect(ok.idProveedor).toBe('falso-1');
    expect(sender.enviados).toHaveLength(1);
  });
});
