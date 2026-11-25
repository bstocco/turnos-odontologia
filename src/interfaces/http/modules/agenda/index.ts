import type { FastifyInstance } from 'fastify';
import Type, { type Static } from 'typebox';

import type { ProfesionalId } from '../../../../domain/shared/index.js';
import { crearIntervaloOLanzar, type FechaLocal } from '../../../../domain/agenda/index.js';
import { contextoDePedido } from '../../../../infrastructure/auth/rbac.js';
import { crearAgendaReader } from '../../../../infrastructure/db/repositories/turno/index.js';
import { withTenant } from '../../../../infrastructure/db/tenant/with-tenant.js';

const AgendaQuery = Type.Object({
  desde: Type.String({ format: 'date' }),
  hasta: Type.String({ format: 'date' }),
  profesionalId: Type.String({ format: 'uuid' }),
  sillonId: Type.Optional(Type.String({ format: 'uuid' })),
});
type AgendaQuery = Static<typeof AgendaQuery>;

/** Módulo HTTP de agenda (C-12): `GET /agenda?desde&hasta&profesionalId&sillonId`. */
export default async function moduloAgenda(app: FastifyInstance): Promise<void> {
  app.get('/agenda', { schema: { querystring: AgendaQuery } }, async (request) => {
    const contexto = contextoDePedido(request);
    const query = request.query as AgendaQuery;
    const profesionalId = query.profesionalId as ProfesionalId;
    const intervalo = crearIntervaloOLanzar(new Date(query.desde), new Date(query.hasta));

    return await withTenant(contexto.clinicaId, async (cliente) => {
      const agenda = crearAgendaReader(cliente);
      const turnos = await agenda.turnosActivosDeProfesional(profesionalId, intervalo);
      const bloqueos = await agenda.bloqueos(profesionalId, intervalo);
      const feriados = await agenda.feriados(query.desde as FechaLocal, query.hasta as FechaLocal);
      return { turnos, bloqueos, feriados };
    });
  });
}
