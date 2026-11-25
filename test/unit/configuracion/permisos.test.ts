import { describe, expect, it } from 'vitest';

import {
  ESCRITURA,
  LECTURA,
  accesoProhibido,
  cambiosVacios,
  exigirRol,
  franjaInvalida,
  franjaSolapada,
  granularidadInvalida,
  plantillaFeriadosNoDisponible,
  recursoNoEncontrado,
} from '../../../src/application/configuracion/index.js';
import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';
import type { RequestContext } from '../../../src/application/shared/request-context.js';

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
  throw new Error('No lanzó');
}

describe('exigirRol', () => {
  it.each(['administrador', 'recepcionista', 'odontologo'])('acepta %s en LECTURA', (rol) => {
    expect(() => exigirRol(ctxConRol(rol), LECTURA)).not.toThrow();
  });

  it('en ESCRITURA acepta solo al administrador', () => {
    expect(() => exigirRol(ctxConRol('administrador'), ESCRITURA)).not.toThrow();
    for (const rol of ['recepcionista', 'odontologo']) {
      const error = capturar(() => exigirRol(ctxConRol(rol), ESCRITURA));
      expect(error).toMatchObject({ codigo: 'ACCESO_PROHIBIDO', tipo: 'prohibido' });
    }
  });

  it('un rol desconocido no tiene permiso ni siquiera de lectura', () => {
    const error = capturar(() => exigirRol(ctxConRol('superusuario'), LECTURA));
    expect(error.codigo).toBe('ACCESO_PROHIBIDO');
  });

  it('LECTURA y ESCRITURA siguen la matriz de design D5', () => {
    expect([...LECTURA].sort()).toEqual(['administrador', 'odontologo', 'recepcionista']);
    expect([...ESCRITURA]).toEqual(['administrador']);
  });
});

describe('fábricas de error', () => {
  it.each([
    [accesoProhibido(), 'ACCESO_PROHIBIDO', 'prohibido'],
    [recursoNoEncontrado(), 'RECURSO_NO_ENCONTRADO', 'no_encontrado'],
    [cambiosVacios(), 'CAMBIOS_VACIOS', 'solicitud_invalida'],
    [granularidadInvalida(), 'GRANULARIDAD_INVALIDA', 'regla_de_negocio'],
    [franjaInvalida(), 'FRANJA_INVALIDA', 'solicitud_invalida'],
    [franjaSolapada(), 'FRANJA_SOLAPADA', 'conflicto'],
    [plantillaFeriadosNoDisponible(), 'PLANTILLA_FERIADOS_NO_DISPONIBLE', 'regla_de_negocio'],
  ] as const)('%s tiene código %s y tipo %s', (error, codigo, tipo) => {
    expect(error).toBeInstanceOf(ErrorDeDominio);
    expect(error.codigo).toBe(codigo);
    expect(error.tipo).toBe(tipo);
    expect(error.message.length).toBeGreaterThan(0);
  });

  it('reutiliza los mensajes de C-06 y C-05 para los mismos códigos', () => {
    expect(accesoProhibido().message).toBe('El rol no tiene permiso para este recurso.');
    expect(recursoNoEncontrado().message).toBe('El recurso indicado no existe');
  });
});
