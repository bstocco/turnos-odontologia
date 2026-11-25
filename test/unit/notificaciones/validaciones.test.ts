import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  ErrorDeEnvioEmail,
  sanearCodigoError,
} from '../../../src/application/notificaciones/errores.js';
import {
  validarEntradaEncolar,
  validarPayloadColaEmail,
} from '../../../src/application/notificaciones/validaciones.js';
import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';

const CLINICA_ID = '11111111-1111-4111-8111-111111111111';
const NOTIFICACION_ID = '22222222-2222-4222-8222-222222222222';
const TURNO_ID = '33333333-3333-4333-8333-333333333333';

describe('ErrorDeEnvioEmail y sanearCodigoError', () => {
  it('conserva código estable, bandera reintentable y mensaje fijo sin datos personales', () => {
    const transitorio = new ErrorDeEnvioEmail(
      'EMAIL_TIMEOUT',
      true,
      'Tiempo de espera agotado al contactar el servidor de correo.',
    );
    expect(transitorio).toBeInstanceOf(Error);
    expect(transitorio.codigo).toBe('EMAIL_TIMEOUT');
    expect(transitorio.reintentable).toBe(true);

    const definitivo = new ErrorDeEnvioEmail(
      'EMAIL_AUTENTICACION_INVALIDA',
      false,
      'Credenciales de correo rechazadas.',
    );
    expect(definitivo.codigo).toBe('EMAIL_AUTENTICACION_INVALIDA');
    expect(definitivo.reintentable).toBe(false);
  });

  it('sanea cualquier error devolviendo únicamente códigos estables sin emails, DNIs ni secretos', () => {
    const envio = new ErrorDeEnvioEmail('EMAIL_LIMITE_TASA', true, 'Límite temporal alcanzado.');
    expect(sanearCodigoError(envio)).toBe('EMAIL_LIMITE_TASA');

    const dominio = new ErrorDeDominio(
      'PAYLOAD_NOTIFICACION_INVALIDO',
      'solicitud_invalida',
      'Payload inválido.',
    );
    expect(sanearCodigoError(dominio)).toBe('PAYLOAD_NOTIFICACION_INVALIDO');

    fc.assert(
      fc.property(
        fc.emailAddress(),
        fc.integer({ min: 10000000, max: 99999999 }),
        fc.string({ minLength: 5, maxLength: 40 }),
        (email, dni, secreto) => {
          const bruto = new Error(`Fallo enviando a ${email} DNI ${dni} key re_${secreto}`);
          const codigo = sanearCodigoError(bruto);
          expect(codigo).toMatch(/^[A-Z][A-Z0-9_]*$/);
          expect(codigo).not.toContain(email);
          expect(codigo).not.toContain(String(dni));
          expect(codigo).not.toContain(secreto);
        },
      ),
    );
  });
});

describe('validarPayloadColaEmail (solo IDs)', () => {
  it('acepta exactamente clinicaId y notificacionId como UUIDs válidos', () => {
    const validado = validarPayloadColaEmail({
      clinicaId: CLINICA_ID,
      notificacionId: NOTIFICACION_ID,
    });
    expect(validado).toEqual({
      clinicaId: CLINICA_ID,
      notificacionId: NOTIFICACION_ID,
    });
  });

  it('rechaza payloads no objeto, UUIDs inválidos o cualquier clave adicional (incluyendo PII)', () => {
    expect(() => validarPayloadColaEmail(null)).toThrowError(ErrorDeDominio);
    expect(() => validarPayloadColaEmail('texto')).toThrowError(ErrorDeDominio);
    expect(() =>
      validarPayloadColaEmail({ clinicaId: 'no-uuid', notificacionId: NOTIFICACION_ID }),
    ).toThrowError(ErrorDeDominio);

    const clavesPii = [
      'email',
      'nombre',
      'apellido',
      'dni',
      'telefono',
      'asunto',
      'cuerpo',
      'codigo',
    ];
    for (const clave of clavesPii) {
      expect(() =>
        validarPayloadColaEmail({
          clinicaId: CLINICA_ID,
          notificacionId: NOTIFICACION_ID,
          [clave]: 'valor-sensible',
        }),
      ).toThrowError(ErrorDeDominio);
    }

    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((k) => k !== 'clinicaId' && k !== 'notificacionId' && k !== '__proto__'),
        fc.string(),
        (claveExtra, valor) => {
          expect(() =>
            validarPayloadColaEmail({
              clinicaId: CLINICA_ID,
              notificacionId: NOTIFICACION_ID,
              [claveExtra]: valor,
            }),
          ).toThrowError(ErrorDeDominio);
        },
      ),
    );
  });
});

describe('validarEntradaEncolar', () => {
  it('valida tipos permitidos, UUIDs, claveIdempotencia y coherencia de codigo con turnoId', () => {
    const entrada = validarEntradaEncolar({
      clinicaId: CLINICA_ID,
      turnoId: TURNO_ID,
      tipo: 'creacion',
      claveIdempotencia: '  turno-1-creacion  ',
    });
    expect(entrada.claveIdempotencia).toBe('turno-1-creacion');
    expect(entrada.turnoId).toBe(TURNO_ID);

    const codigoValido = validarEntradaEncolar({
      clinicaId: CLINICA_ID,
      tipo: 'codigo',
      claveIdempotencia: 'otp-1',
    });
    expect(codigoValido.turnoId).toBeNull();

    expect(() =>
      validarEntradaEncolar({
        clinicaId: CLINICA_ID,
        turnoId: TURNO_ID,
        tipo: 'codigo',
        claveIdempotencia: 'otp-con-turno',
      }),
    ).toThrowError(ErrorDeDominio);

    expect(() =>
      validarEntradaEncolar({
        clinicaId: CLINICA_ID,
        tipo: 'confirmacion',
        claveIdempotencia: '   ',
      }),
    ).toThrowError(ErrorDeDominio);

    expect(() =>
      validarEntradaEncolar({
        clinicaId: CLINICA_ID,
        tipo: 'confirmacion',
        claveIdempotencia: 'clave',
        programadaPara: new Date('invalid'),
      }),
    ).toThrowError(ErrorDeDominio);
  });
});
