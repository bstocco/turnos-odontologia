import type { FastifyRequest } from 'fastify';

import { ErrorDeDominio } from '../../domain/shared/errores.js';
import { type RequestContext } from '../../application/shared/request-context.js';

export type RolDePersonal = 'administrador' | 'recepcionista' | 'odontologo';

/** Exige que el contexto tenga el rol indicado (matriz RBAC de `03 §RBAC`). */
export function requireRole(contexto: RequestContext, rol: RolDePersonal): void {
  if (contexto.actor.rol !== rol) {
    throw new ErrorDeDominio('ACCESO_PROHIBIDO', 'prohibido', 'El rol no tiene permiso para este recurso.');
  }
}

/** Exige permiso al rol: acceso a un recurso solo el rol indicado (administrador). */
export function requirePermission(contexto: RequestContext, permission: RolDePersonal): void {
  requireRole(contexto, permission);
}

/** Contexto del pedido autenticado; sin token → no autenticado. */
export function contextoDePedido(request: FastifyRequest): RequestContext {
  const contexto = request.userContext;
  if (contexto === undefined) {
    throw new ErrorDeDominio('AUTENTICACION_REQUERIDA', 'no_autenticado', 'Autenticación requerida.');
  }
  return contexto;
}
