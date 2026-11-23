import { describe, expect, it } from 'vitest';

import {
  MARCADOR,
  PROFUNDIDAD_MAXIMA,
  esCampoSensible,
  limpiarTexto,
  redactar,
} from '../../src/infrastructure/logging/redactor.js';

describe('redacción de datos personales', () => {
  it('objeto anidado: redacta paciente.dni y paciente.email y conserva el resto', () => {
    const entrada = {
      reqId: 'abc',
      paciente: { id: 'p-1', dni: '30111222', email: 'ana@example.com', turnos: 3 },
    };
    const salida = redactar(entrada);
    expect(salida.paciente.dni).toBe(MARCADOR);
    expect(salida.paciente.email).toBe(MARCADOR);
    expect(salida.paciente.id).toBe('p-1');
    expect(salida.paciente.turnos).toBe(3);
    expect(salida.reqId).toBe('abc');
  });

  it('reconoce los campos en camelCase, snake_case y con acentos', () => {
    const salida = redactar({
      obra_social: 'OSDE',
      obraSocial: 'OSDE',
      Teléfono: '1155551234',
      APELLIDO: 'Pérez',
      nombre: 'Ana',
    });
    for (const valor of Object.values(salida)) expect(valor).toBe(MARCADOR);
  });

  it('redacta dentro de arreglos', () => {
    const salida = redactar({ pacientes: [{ dni: '1' }, { dni: '2' }] });
    expect(salida.pacientes.map((p) => p.dni)).toEqual([MARCADOR, MARCADOR]);
  });

  it('no mutan el objeto original', () => {
    const original = { paciente: { dni: '30111222' } };
    redactar(original);
    expect(original.paciente.dni).toBe('30111222');
  });

  it('no enmascara de más campos que no son datos personales', () => {
    const salida = redactar({ estado: 'confirmado', duracionMs: 12, profesionalId: 'x' });
    expect(salida).toEqual({ estado: 'confirmado', duracionMs: 12, profesionalId: 'x' });
  });
});

describe('redacción de credenciales y secretos', () => {
  it('redacta cabeceras de autorización y cookies', () => {
    const salida = redactar({
      headers: {
        authorization: 'Bearer abc.def.ghi',
        cookie: 'sid=1',
        'x-api-key': 'k',
        host: 'a',
      },
    });
    expect(salida.headers.authorization).toBe(MARCADOR);
    expect(salida.headers.cookie).toBe(MARCADOR);
    expect(salida.headers['x-api-key']).toBe(MARCADOR);
    expect(salida.headers.host).toBe('a');
  });

  it('redacta contraseñas, tokens, códigos y secretos con cualquier nombre compuesto', () => {
    const salida = redactar({
      password: 'p',
      contrasena: 'p',
      accessToken: 't',
      refresh_token: 't',
      codigoVerificacion: '123456',
      jwtAccessSecret: 's',
      EMAIL_API_KEY: 'k',
    });
    for (const valor of Object.values(salida)) expect(valor).toBe(MARCADOR);
  });
});

describe('textos de error', () => {
  it('enmascara un DNI y un email dentro del mensaje y conserva el resto', () => {
    const texto = limpiarTexto('No existe el paciente 30111222 (ana@example.com) en la clínica');
    expect(texto).not.toContain('30111222');
    expect(texto).not.toContain('ana@example.com');
    expect(texto).toContain('en la clínica');
  });

  it('enmascara credenciales dentro de URLs y tokens Bearer', () => {
    const texto = limpiarTexto('falló postgres://app:secreto-123@host:5432/db con Bearer abc.def');
    expect(texto).not.toContain('secreto-123');
    expect(texto).not.toContain('abc.def');
    expect(texto).toContain('host:5432/db');
  });

  it('no enmascara números que no son de 7 u 8 dígitos', () => {
    expect(limpiarTexto('turno 12345 de 123456789012')).toBe('turno 12345 de 123456789012');
  });

  it('un Error con un DNI en el mensaje conserva el tipo y enmascara el valor', () => {
    const salida = redactar({ err: new Error('Paciente 30111222 no encontrado') });
    const err = salida.err as unknown as { type: string; message: string; stack: string };
    expect(err.type).toBe('Error');
    expect(err.message).not.toContain('30111222');
    expect(err.message).toContain(MARCADOR);
    expect(err.stack).not.toContain('30111222');
  });

  it('un Error con propiedades propias redacta las sensibles y conserva el código', () => {
    const error = Object.assign(new Error('falla'), { codigo: 'TURNO_SOLAPADO', dni: '30111222' });
    const err = redactar({ err: error }).err as unknown as Record<string, unknown>;
    expect(err.dni).toBe(MARCADOR);
    expect(err.codigo).toBe('TURNO_SOLAPADO');
  });

  it('el código de error de dominio no se redacta, pero el código de verificación sí', () => {
    const salida = redactar({ codigo: 'TURNO_SOLAPADO_SILLON', codigoVerificacion: '123456' });
    expect(salida.codigo).toBe('TURNO_SOLAPADO_SILLON');
    expect(salida.codigoVerificacion).toBe(MARCADOR);
  });

  it('redacta msg y message en cualquier nivel', () => {
    const salida = redactar({ detalle: { msg: 'dni 30111222' } });
    expect(JSON.stringify(salida)).not.toContain('30111222');
  });
});

describe('robustez', () => {
  it('maneja referencias circulares sin romperse', () => {
    const a: Record<string, unknown> = { nombre: 'x' };
    a.yo = a;
    const salida = redactar(a);
    expect(salida.nombre).toBe(MARCADOR);
    expect(salida.yo).toBe('[CIRCULAR]');
  });

  it('el mismo objeto en dos ramas no se marca como circular', () => {
    const compartido = { dni: '1', ok: true };
    const salida = redactar({ a: compartido, b: compartido });
    expect(salida.a).toEqual({ dni: MARCADOR, ok: true });
    expect(salida.b).toEqual({ dni: MARCADOR, ok: true });
  });

  it('trunca por debajo de la profundidad máxima en lugar de filtrar contenido', () => {
    let anidado: Record<string, unknown> = { dni: '30111222' };
    for (let i = 0; i < PROFUNDIDAD_MAXIMA + 3; i++) anidado = { siguiente: anidado };
    expect(JSON.stringify(redactar(anidado))).not.toContain('30111222');
  });

  it('deja intactos los valores primitivos y las fechas', () => {
    expect(redactar('texto')).toBe('texto');
    expect(redactar(5)).toBe(5);
    expect(redactar(null)).toBeNull();
    expect(redactar({ cuando: new Date('2026-01-02T03:04:05Z') }).cuando).toBe(
      '2026-01-02T03:04:05.000Z',
    );
  });

  it('esCampoSensible clasifica los nombres esperados', () => {
    expect(esCampoSensible('obra_social')).toBe(true);
    expect(esCampoSensible('Authorization')).toBe(true);
    expect(esCampoSensible('estado')).toBe(false);
    expect(esCampoSensible('profesionalId')).toBe(false);
  });
});
