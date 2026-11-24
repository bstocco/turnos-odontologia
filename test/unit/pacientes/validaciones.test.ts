import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  normalizarDni,
  normalizarEmail,
  normalizarTelefono,
  validarCriterioDeBusqueda,
} from '../../../src/application/pacientes/index.js';
import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';

function codigoDe(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof ErrorDeDominio) return error.codigo;
    throw error;
  }
  return 'SIN_ERROR';
}

describe('normalizarDni', () => {
  it.each([
    ['30.111.222', '30111222'],
    ['30 111 222', '30111222'],
    ['1234567', '1234567'],
    ['  12.345.678 ', '12345678'],
  ])('"%s" -> "%s"', (entrada, esperado) => {
    expect(normalizarDni(entrada)).toBe(esperado);
  });

  it.each(['123456', '123456789', '30.111.22A', 'abcdefgh', '', '   '])(
    '"%s" es DNI_INVALIDO',
    (entrada) => {
      expect(codigoDe(() => normalizarDni(entrada))).toBe('DNI_INVALIDO');
    },
  );

  it('propiedad: idempotente sobre DNIs válidos', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9]{7,8}$/), (dni) => {
        expect(normalizarDni(normalizarDni(dni))).toBe(normalizarDni(dni));
      }),
    );
  });

  it('propiedad: puntos y espacios insertados en un DNI válido normalizan a sus dígitos', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[0-9]{7,8}$/),
        fc.array(fc.constantFrom('.', ' ')),
        (dni, separadores) => {
          let sucio = '';
          [...dni].forEach((digito, i) => {
            sucio += digito + (separadores[i] ?? '');
          });
          expect(normalizarDni(sucio)).toBe(dni);
        },
      ),
    );
  });
});

describe('normalizarTelefono', () => {
  it('antepone + al formato internacional de C-04', () => {
    expect(normalizarTelefono('011 15 5555-1234')).toBe('+5491155551234');
    expect(normalizarTelefono('+54 9 11 5555-1234')).toBe('+5491155551234');
  });

  it('un número inválido es TELEFONO_INVALIDO y el mensaje no lo repite', () => {
    let mensaje = '';
    let codigo = '';
    try {
      normalizarTelefono('123');
    } catch (error) {
      if (error instanceof ErrorDeDominio) {
        codigo = error.codigo;
        mensaje = error.message;
      }
    }
    expect(codigo).toBe('TELEFONO_INVALIDO');
    expect(mensaje).not.toContain('123');
  });
});

describe('normalizarEmail', () => {
  it('recorta y pasa a minúsculas', () => {
    expect(normalizarEmail('  Paciente.Sintetico@Ejemplo.INVALID ')).toBe(
      'paciente.sintetico@ejemplo.invalid',
    );
    expect(normalizarEmail('A@B.invalid')).toBe('a@b.invalid');
  });
});

describe('validarCriterioDeBusqueda', () => {
  it('solo dni: devuelve el DNI normalizado', () => {
    expect(validarCriterioDeBusqueda({ dni: '30.111.222' })).toEqual({
      tipo: 'dni',
      dni: '30111222',
    });
  });

  it('solo apellido: recorta', () => {
    expect(validarCriterioDeBusqueda({ apellido: '  Pér ' })).toEqual({
      tipo: 'apellido',
      prefijo: 'Pér',
    });
  });

  it.each([
    [{}],
    [{ dni: '30111222', apellido: 'Perez' }],
    [{ apellido: 'P' }],
    [{ apellido: '  P  ' }],
    [{ apellido: '   ' }],
  ])('%j es BUSQUEDA_INVALIDA', (entrada) => {
    expect(codigoDe(() => validarCriterioDeBusqueda(entrada))).toBe('BUSQUEDA_INVALIDA');
  });

  it('un DNI de búsqueda inválido es DNI_INVALIDO', () => {
    expect(codigoDe(() => validarCriterioDeBusqueda({ dni: '12' }))).toBe('DNI_INVALIDO');
  });
});
