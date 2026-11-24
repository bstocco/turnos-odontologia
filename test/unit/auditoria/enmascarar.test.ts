import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  CIRCULAR_AUDITORIA,
  MARCADOR_AUDITORIA,
  PROFUNDIDAD_MAXIMA_AUDITORIA,
  TRUNCADO_AUDITORIA,
  enmascararDatosAuditoria,
  esCampoSensibleAuditoria,
  limpiarTextoAuditoria,
} from '../../../src/application/auditoria/enmascarar.js';

describe('enmascaramiento de datos personales (Q1, Ley 25.326)', () => {
  it('redacta campos personales del paciente en raíz, subobjetos y arreglos conservando IDs y estado', () => {
    const entrada = {
      turnoId: 'trn-1',
      estado: 'confirmado',
      duracionMinutos: 45,
      profesionalId: 'prof-1',
      sillonId: 'sil-1',
      paciente: {
        id: 'pac-1',
        dni: '30111222',
        telefono: '+5491123456789',
        email: 'ana@example.com',
        nombre: 'Ana',
        apellido: 'Pérez',
        obra_social: 'OSDE',
      },
      acompanantes: [{ nombre: 'Juan', dni: '31222333', parentesco: 'padre' }],
    };

    const salida = enmascararDatosAuditoria(entrada) as typeof entrada;
    expect(salida.turnoId).toBe('trn-1');
    expect(salida.estado).toBe('confirmado');
    expect(salida.duracionMinutos).toBe(45);
    expect(salida.profesionalId).toBe('prof-1');
    expect(salida.sillonId).toBe('sil-1');
    expect(salida.paciente).toEqual({
      id: 'pac-1',
      dni: MARCADOR_AUDITORIA,
      telefono: MARCADOR_AUDITORIA,
      email: MARCADOR_AUDITORIA,
      nombre: MARCADOR_AUDITORIA,
      apellido: MARCADOR_AUDITORIA,
      obra_social: MARCADOR_AUDITORIA,
    });
    expect(salida.acompanantes).toEqual([
      { nombre: MARCADOR_AUDITORIA, dni: MARCADOR_AUDITORIA, parentesco: 'padre' },
    ]);
  });

  it('reconoce variantes con mayúsculas, tildes, separadores y prefijos/sufijos de paciente', () => {
    const entrada = {
      obraSocial: 'Swiss Medical',
      TELÉFONO: '1155551234',
      APELLIDO: 'Gómez',
      nombre: 'Consultorio 1',
      nombrePaciente: 'Ana',
      dni_paciente: '30111222',
      'telefono-paciente': '+5491123456789',
      pacienteEmail: 'ana@example.com',
      obraSocialPaciente: 'Galeno',
      pacienteNombre: 'Ana',
      pacienteApellido: 'Gómez',
    };

    const salida = enmascararDatosAuditoria(entrada) as Record<string, unknown>;
    for (const valor of Object.values(salida)) {
      expect(valor).toBe(MARCADOR_AUDITORIA);
    }
  });

  it('no muta el objeto original pasado por el llamador', () => {
    const original = {
      paciente: { dni: '30111222', email: 'ana@example.com' },
      lista: [{ telefono: '+5491123456789' }],
    };
    const salida = enmascararDatosAuditoria(original);

    expect(salida).not.toBe(original);
    expect(original.paciente.dni).toBe('30111222');
    expect(original.paciente.email).toBe('ana@example.com');
    expect(original.lista[0]?.telefono).toBe('+5491123456789');
  });
});

describe('enmascaramiento de credenciales y preservación de códigos de dominio', () => {
  it('redacta contraseñas, tokens, secretos, cabeceras y códigos/hashes de verificación', () => {
    const salida = enmascararDatosAuditoria({
      contrasena: 'c1',
      hash_contrasena: '$argon2id$...',
      password: 'p1',
      passwd: 'p2',
      token: 'tok-1',
      accessToken: 'jwt-1',
      refresh_token: 'ref-1',
      hash_token: 'abc',
      secret: 's1',
      jwtAccessSecret: 's2',
      apikey: 'k1',
      'x-api-key': 'k2',
      authorization: 'Bearer abc.def',
      cookie: 'sid=1',
      codigoVerificacion: '123456',
      codigo_de_verificacion: '654321',
      verificationCode: '111222',
      hash_codigo: 'deadbeef',
      hashCodigo: 'beefdead',
      codigo: 'TURNO_SOLAPADO_SILLON',
      codigoError: '409',
    }) as Record<string, unknown>;

    expect(salida.codigo).toBe('TURNO_SOLAPADO_SILLON');
    expect(salida.codigoError).toBe('409');

    for (const [clave, valor] of Object.entries(salida)) {
      if (clave === 'codigo' || clave === 'codigoError') continue;
      expect(valor).toBe(MARCADOR_AUDITORIA);
    }
  });

  it('esCampoSensibleAuditoria clasifica correctamente claves sensibles y operativas', () => {
    expect(esCampoSensibleAuditoria('obra_social')).toBe(true);
    expect(esCampoSensibleAuditoria('nombrePaciente')).toBe(true);
    expect(esCampoSensibleAuditoria('hash_codigo')).toBe(true);
    expect(esCampoSensibleAuditoria('Authorization')).toBe(true);
    expect(esCampoSensibleAuditoria('codigo')).toBe(false);
    expect(esCampoSensibleAuditoria('estado')).toBe(false);
    expect(esCampoSensibleAuditoria('profesionalId')).toBe(false);
  });
});

describe('saneamiento de textos libres y serialización segura', () => {
  it('enmascara emails, DNIs (7-8 dígitos), Bearer tokens y credenciales en URLs en textos libres', () => {
    const limpio = limpiarTextoAuditoria(
      'Fallo postgres://app:secreto123@db.local:5432/turnos para DNI 30111222 (ana@example.com) con Bearer abc.def.ghi turno 12345',
    );
    expect(limpio).not.toContain('secreto123');
    expect(limpio).not.toContain('30111222');
    expect(limpio).not.toContain('ana@example.com');
    expect(limpio).not.toContain('abc.def.ghi');
    expect(limpio).toContain('turno 12345');
    expect(limpio).toContain('db.local:5432/turnos');

    const salida = enmascararDatosAuditoria({
      motivo: 'Paciente 9123456 escribió desde ana@example.com',
      observacion: 'Token Bearer xyz.123',
      descripcion: 'Mantiene número 12345 y 123456789012',
    }) as Record<string, string>;

    expect(salida.motivo).not.toContain('9123456');
    expect(salida.motivo).not.toContain('ana@example.com');
    expect(salida.observacion).not.toContain('xyz.123');
    expect(salida.descripcion).toBe('Mantiene número 12345 y 123456789012');
  });

  it('convierte fechas, bigint, números no finitos, errores y undefined en raíz', () => {
    const errorConDni = Object.assign(new Error('Paciente 30111222 ausente'), {
      codigo: 'TURNO_ERROR',
      dni: '30111222',
    });

    const salida = enmascararDatosAuditoria({
      cuando: new Date('2026-11-24T12:00:00Z'),
      invalida: new Date('fecha-invalida'),
      secuencia: 42n,
      infinito: Number.POSITIVE_INFINITY,
      omitido: undefined,
      err: errorConDni,
    }) as Record<string, unknown>;

    expect(salida.cuando).toBe('2026-11-24T12:00:00.000Z');
    expect(salida.invalida).toBeNull();
    expect(salida.secuencia).toBe('42');
    expect(salida.infinito).toBeNull();
    expect('omitido' in salida).toBe(false);
    expect(salida.err).toMatchObject({
      type: 'Error',
      codigo: 'TURNO_ERROR',
      dni: MARCADOR_AUDITORIA,
    });
    expect(JSON.stringify(salida.err)).not.toContain('30111222');

    expect(enmascararDatosAuditoria(undefined)).toBeNull();
    expect(enmascararDatosAuditoria(null)).toBeNull();
  });

  it('detecta referencias circulares, permite ramas compartidas y trunca profundidad excesiva', () => {
    const circular: Record<string, unknown> = { nombre: 'Ana' };
    circular.yo = circular;
    expect(enmascararDatosAuditoria(circular)).toEqual({
      nombre: MARCADOR_AUDITORIA,
      yo: CIRCULAR_AUDITORIA,
    });

    const compartido = { dni: '30111222', ok: true };
    expect(enmascararDatosAuditoria({ a: compartido, b: compartido })).toEqual({
      a: { dni: MARCADOR_AUDITORIA, ok: true },
      b: { dni: MARCADOR_AUDITORIA, ok: true },
    });

    let profundo: Record<string, unknown> = { dni: '30111222' };
    for (let i = 0; i < PROFUNDIDAD_MAXIMA_AUDITORIA + 2; i += 1) {
      profundo = { siguiente: profundo };
    }
    const serializado = JSON.stringify(enmascararDatosAuditoria(profundo));
    expect(serializado).not.toContain('30111222');
    expect(serializado).toContain(TRUNCADO_AUDITORIA);
  });

  it('propiedad (fast-check): nunca filtra DNI, email ni contraseña ni muta la entrada', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000_000, max: 99_999_999 }),
        fc.stringMatching(/^[a-z]{4,10}$/),
        fc.stringMatching(/^[A-Za-z0-9]{8,16}$/),
        (dniNum, usuario, secreto) => {
          const dni = String(dniNum);
          const email = `${usuario}@ejemplo.test`;
          const entrada = {
            paciente: { dni, email, nombre: usuario, apellido: 'Prueba' },
            credencial: { hash_contrasena: secreto, accessToken: secreto },
            motivo: `Paciente ${dni} (${email})`,
            codigo: 'ESTADO_OK',
          };

          const salida = enmascararDatosAuditoria(entrada);
          const texto = JSON.stringify(salida);

          expect(texto).not.toContain(dni);
          expect(texto).not.toContain(email);
          expect(texto).not.toContain(secreto);
          expect(entrada.paciente.dni).toBe(dni);
          expect(entrada.credencial.hash_contrasena).toBe(secreto);
        },
      ),
    );
  });
});
