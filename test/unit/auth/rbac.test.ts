import { describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';

import { type RequestContext } from '../../../src/application/shared/request-context.js';
import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';
import {
  contextoDePedido,
  requirePermission,
  requireRole,
} from '../../../src/infrastructure/auth/rbac.js';

function contexto(rol: string): RequestContext {
  return {
    clinicaId: '11111111-1111-4111-8111-111111111111',
    actor: { tipo: 'usuario', id: 'id-1', rol },
  };
}

describe('requireRole', () => {
  it('pasa cuando el contexto tiene el rol; lanza ErrorDeDominio de otro modo', () => {
    expect(() => requireRole(contexto('administrador'), 'administrador')).not.toThrow();
    expect(() => requireRole(contexto('recepcionista'), 'administrador')).toThrow(ErrorDeDominio);
  });
});

describe('requirePermission', () => {
  it('exige el permiso indicado', () => {
    expect(() => requirePermission(contexto('odontologo'), 'administrador')).toThrow(
      ErrorDeDominio,
    );
    expect(() => requirePermission(contexto('administrador'), 'administrador')).not.toThrow();
  });
});

describe('contextoDePedido', () => {
  it('devuelve el contexto del pedido; sin token lanza AUTENTICACION_REQUERIDA', () => {
    const request = { userContext: contexto('administrador') } as FastifyRequest;
    expect(contextoDePedido(request).actor.rol).toBe('administrador');
    expect(() => contextoDePedido({} as FastifyRequest)).toThrowError(/Autenticación requerida/);
  });
});
