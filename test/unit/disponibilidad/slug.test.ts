import { describe, expect, it } from 'vitest';

import {
  rangoFechasInvalido,
  recursoPublicoNoEncontrado,
  validarSlug,
} from '../../../src/application/disponibilidad/index.js';

describe('validarSlug', () => {
  it.each(['clinica-demo', 'a1', 'ab', 'x'.repeat(64), 'a-b-c-1'])('acepta %s', (slug) => {
    expect(validarSlug(slug)).toBe(true);
  });

  it.each([
    ['vacío', ''],
    ['mayúsculas', 'Clinica'],
    ['guion inicial', '-inicio'],
    ['espacios', 'con espacio'],
    ['65 caracteres', 'x'.repeat(65)],
    ['traversal', '../x'],
    ['un solo carácter', 'a'],
    ['comillas', "a'b"],
    ['porcentaje', 'a%b'],
    ['salto de línea final', 'abc\n'],
  ])('rechaza %s', (_nombre, slug) => {
    expect(validarSlug(slug)).toBe(false);
  });
});

describe('errores públicos', () => {
  it('recursoPublicoNoEncontrado es no_encontrado con mensaje fijo', () => {
    const e = recursoPublicoNoEncontrado();
    expect(e.codigo).toBe('RECURSO_NO_ENCONTRADO');
    expect(e.tipo).toBe('no_encontrado');
    expect(e.message).toBe('El recurso solicitado no existe.');
  });

  it('rangoFechasInvalido es solicitud_invalida', () => {
    const e = rangoFechasInvalido();
    expect(e.codigo).toBe('RANGO_FECHAS_INVALIDO');
    expect(e.tipo).toBe('solicitud_invalida');
  });

  it('los dos errores son instancias distintas con mensajes distintos', () => {
    expect(recursoPublicoNoEncontrado()).not.toBe(recursoPublicoNoEncontrado());
    expect(rangoFechasInvalido().message).not.toBe(recursoPublicoNoEncontrado().message);
  });
});
