import type { FastifyInstance } from 'fastify';
import Type, { type Static } from 'typebox';

import type { ProfesionalId } from '../../../../domain/shared/index.js';
import { crearIntervaloOLanzar } from '../../../../domain/agenda/index.js';
import { contextoDePedido, requireRole } from '../../../../infrastructure/auth/rbac.js';
import { crearBloqueoRepository } from '../../../../infrastructure/db/repositories/bloqueo/index.js';
import { withTenant } from '../../../../infrastructure/db/tenant/with-tenant.js';

const BloqueoBody = Type.Object({
  profesionalId: Type.String({ format: 'uuid' }),
  inicio: Type.String({ format: 'date-time' }),
  fin: Type.String({ format: 'date-time' }),
  motivo: Type.Optional(Type.String()),
});
type BloqueoBody = Static<typeof BloqueoBody>;

/** Módulo HTTP de bloqueos (C-12): alta y baja con rechazo `409` (RN-AG-08). */
export default async function moduloBloqueos(app: FastifyInstance): Promise<void> {
  app.post('/bloqueos', { schema: { body: BloqueoBody } }, async (request, reply) => {
    const contexto = contextoDePedido(request);
    requireRole(contexto, 'odontologo');
    const body = request.body as BloqueoBody;

    const creado = await withTenant(contexto.clinicaId, (cliente) =>
      crearBloqueoRepository(cliente).crear({
        profesionalId: body.profesionalId as ProfesionalId,
        intervalo: crearIntervaloOLanzar(new Date(body.inicio), new Date(body.fin)),
        motivo: body.motivo ?? null,
        creadoPor: contexto.actor.id,
      }),
    );
    return reply.code(201).send(creado);
  });

  app.delete('/bloqueos/:id', async (request) => {
    const contexto = contextoDePedido(request);
    requireRole(contexto, 'odontologo');
    const id = (request.params as { id: string }).id;
    const eliminado = await withTenant(contexto.clinicaId, (cliente) =>
      crearBloqueoRepository(cliente).eliminar(id),
    );
    return { eliminado };
  });
}
