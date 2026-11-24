import type { FastifyInstance } from 'fastify';

import type { RequestContext } from '../../application/shared/request-context.js';
import { loadConfig } from '../../config/index.js';

import { verificarTokenDeAcceso } from './jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    userContext?: RequestContext;
  }
}

export { contextoDePedido } from './rbac.js';

/**
 * Plugin de autenticación: en cada pedido que trae el token de acceso, valida el JWT,
 * construye el `RequestContext` y abre `withTenant(clinicaId, fn)` para el alcance del
 * pedido (las rutas abren `withTenant` con el contexto entregado).
 */
export async function pluginDeAutenticacion(app: FastifyInstance): Promise<void> {
  const secreto = loadConfig('app').jwtAccessSecret;
  if (secreto === undefined) {
    throw new Error('Falta JWT_ACCESS_SECRET (perfil app).');
  }

  app.addHook('onRequest', async (request, reply) => {
    const header = request.headers.authorization;
    const token = header === undefined ? undefined : header.replace(/^Bearer\s+/i, '');
    if (token === undefined || token === '') return;

    const contexto = await verificarTokenDeAcceso(secreto, token);
    if (contexto === undefined) {
      reply.code(401).send({ codigo: 'TOKEN_INVALIDO', mensaje: 'El token de acceso no es válido.' });
      return;
    }
    request.userContext = {
      clinicaId: contexto.clinicaId,
      actor: { tipo: 'usuario', id: contexto.usuarioId, rol: contexto.rol },
    };
  });
}
