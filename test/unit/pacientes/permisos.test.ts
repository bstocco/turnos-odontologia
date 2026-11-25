import { describe, expect, it } from 'vitest';

import {
  ALTA_Y_MODIFICACION,
  LECTURA,
  accesoProhibido,
  busquedaInvalida,
  cambiosVacios,
  dniInvalido,
  exigirRol,
  recursoNoEncontrado,
} from '../../../src/application/pacientes/index.js';
import type { RequestContext } from '../../../src/application/shared/request-context.js';
import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';

function ctxConRol(rol: string): RequestContext {
  return {
    clinicaId: '11111111-1111-4111-8111-111111111111',
    actor: { tipo: 'usuario', id: '33333333-3333-4333-8333-333333333333', rol },
  };
}

function capturar(fn: () => void): ErrorDeDominio {
  try {
    fn();
  } catch (error) {
    if (error instanceof ErrorDeDominio) return error;
    throw error;
  }
  throw new Error('se esperaba un ErrorDeDominio');
}

describe('constantes de permisos (design D3)', () => {
  it('alta y modificación: administrador y recepcionista', () => {
    expect([...ALTA_Y_MODIFICACION]).toEqual(['administrador', 'recepcionista']);
  });

  it('lectura: los tres roles', () => {
    expect([...LECTURA]).toEqual(['administrador', 'recepcionista', 'odontologo']);
  });
});

describe('exigirRol', () => {
  it.each(['administrador', 'recepcionista'])('%s puede dar de alta y modificar', (rol) => {
    expect(() => exigirRol(ctxConRol(rol), ALTA_Y_MODIFICACION)).not.toThrow();
  });

  it('el odontólogo no puede dar de alta ni modificar', () => {
    const error = capturar(() => exigirRol(ctxConRol('odontologo'), ALTA_Y_MODIFICACION));
    expect(error.codigo).toBe('ACCESO_PROHIBIDO');
    expect(error.tipo).toBe('prohibido');
  });

  it.each(['administrador', 'recepcionista', 'odontologo'])('%s puede leer', (rol) => {
    expect(() => exigirRol(ctxConRol(rol), LECTURA)).not.toThrow();
  });

  it.each(['paciente', '', 'ADMINISTRADOR'])('el rol desconocido "%s" no tiene permiso', (rol) => {
    expect(capturar(() => exigirRol(ctxConRol(rol), LECTURA)).codigo).toBe('ACCESO_PROHIBIDO');
  });
});

describe('fábricas de error', () => {
  it.each([
    [dniInvalido(), 'DNI_INVALIDO', 'solicitud_invalida'],
    [busquedaInvalida(), 'BUSQUEDA_INVALIDA', 'solicitud_invalida'],
    [cambiosVacios(), 'CAMBIOS_VACIOS', 'solicitud_invalida'],
    [recursoNoEncontrado(), 'RECURSO_NO_ENCONTRADO', 'no_encontrado'],
    [accesoProhibido(), 'ACCESO_PROHIBIDO', 'prohibido'],
  ])('%#: código y tipo', (error, codigo, tipo) => {
    expect(error).toBeInstanceOf(ErrorDeDominio);
    expect(error.codigo).toBe(codigo);
    expect(error.tipo).toBe(tipo);
    expect(error.message.length).toBeGreaterThan(10);
    expect(error.message).not.toMatch(/\d{7}/);
  });
});
