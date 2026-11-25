import { describe, expect, it } from 'vitest';

import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';
import {
  calcularVencimientoTokenAccion,
  construirEnlaceAccionPublica,
  normalizarDatosPacienteReserva,
  normalizarEmailPublico,
  puedeCancelarConAnticipacion,
} from '../../../src/application/reserva-publica/validaciones.js';

describe('reserva-publica validaciones y reglas puras', () => {
  it('normaliza email público y rechaza formato inválido sin interpolar el valor en el error', () => {
    expect(normalizarEmailPublico('  Paciente.Prueba@EJEMPLO.TEST  ')).toBe(
      'paciente.prueba@ejemplo.test',
    );

    const correoInvalido = 'secreto.invalido';
    let capturado: unknown;
    try {
      normalizarEmailPublico(correoInvalido);
    } catch (error) {
      capturado = error;
    }
    expect(capturado).toBeInstanceOf(ErrorDeDominio);
    expect((capturado as ErrorDeDominio).codigo).toBe('DATOS_INVALIDOS');
    expect((capturado as ErrorDeDominio).message).not.toContain(correoInvalido);
  });

  it('normaliza datos del paciente (DNI sin puntos/espacios, teléfono +549, email y obra social opcional)', () => {
    const normalizado = normalizarDatosPacienteReserva({
      nombre: '  Lucía  ',
      apellido: '  Gómez ',
      dni: '30.123.456',
      telefono: '011 15-4321-8765',
      email: ' LUCIA@Ejemplo.Test ',
      obraSocial: '   ',
    });

    expect(normalizado).toEqual({
      nombre: 'Lucía',
      apellido: 'Gómez',
      dni: '30123456',
      telefono: '+5491143218765',
      email: 'lucia@ejemplo.test',
      obraSocial: null,
    });
  });

  it('rechaza DNI inválido o nombre vacío sin filtrar datos personales', () => {
    const dniMalo = '1234';
    let errorDni: unknown;
    try {
      normalizarDatosPacienteReserva({
        nombre: 'Lucía',
        apellido: 'Gómez',
        dni: dniMalo,
        telefono: '1143218765',
        email: 'lucia@ejemplo.test',
      });
    } catch (error) {
      errorDni = error;
    }
    expect(errorDni).toBeInstanceOf(ErrorDeDominio);
    expect((errorDni as ErrorDeDominio).codigo).toBe('DNI_INVALIDO');
    expect((errorDni as ErrorDeDominio).message).not.toContain(dniMalo);

    expect(() =>
      normalizarDatosPacienteReserva({
        nombre: '   ',
        apellido: 'Gómez',
        dni: '30123456',
        telefono: '1143218765',
        email: 'lucia@ejemplo.test',
      }),
    ).toThrowError(ErrorDeDominio);
  });

  it('calcula vencimiento del token acotado por min(ahora + ttl, inicioTurno)', () => {
    const ahora = new Date('2026-12-10T10:00:00.000Z');
    const turnoLejano = new Date('2026-12-15T10:00:00.000Z');
    const turnoCercano = new Date('2026-12-10T18:00:00.000Z');

    expect(calcularVencimientoTokenAccion(ahora, turnoLejano).toISOString()).toBe(
      '2026-12-12T10:00:00.000Z',
    );
    expect(calcularVencimientoTokenAccion(ahora, turnoCercano).toISOString()).toBe(
      '2026-12-10T18:00:00.000Z',
    );
  });

  it('construye enlaces de acción limpiando barras finales de PUBLIC_BASE_URL', () => {
    expect(
      construirEnlaceAccionPublica('https://turnos.clinica.test///', 'abc_123', 'confirmar'),
    ).toBe('https://turnos.clinica.test/publico/turnos/accion?token=abc_123&accion=confirmar');
  });

  it('verifica anticipación mínima RN-RE-02 exactamente en el límite y con horas configurables', () => {
    const inicio = new Date('2026-12-12T14:00:00.000Z');

    // Exactamente 24h00m00s antes → permitido
    expect(puedeCancelarConAnticipacion(new Date('2026-12-11T14:00:00.000Z'), inicio, 24)).toBe(
      true,
    );

    // 23h59m59s antes → rechazado
    expect(puedeCancelarConAnticipacion(new Date('2026-12-11T14:00:01.000Z'), inicio, 24)).toBe(
      false,
    );

    // Anticipación personalizada: 12 horas
    expect(puedeCancelarConAnticipacion(new Date('2026-12-12T02:00:00.000Z'), inicio, 12)).toBe(
      true,
    );
    expect(puedeCancelarConAnticipacion(new Date('2026-12-12T02:00:01.000Z'), inicio, 12)).toBe(
      false,
    );

    // Anticipación 0 horas: solo antes del inicio
    expect(puedeCancelarConAnticipacion(new Date('2026-12-12T13:59:59.000Z'), inicio, 0)).toBe(
      true,
    );
    expect(puedeCancelarConAnticipacion(new Date('2026-12-12T14:00:01.000Z'), inicio, 0)).toBe(
      false,
    );
  });
});
