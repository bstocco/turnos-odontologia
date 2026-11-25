import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { FiltrosDeListarAuditoria } from '../../../../application/auditoria/index.js';
import type { RequestContext } from '../../../../application/shared/request-context.js';
import { ErrorDeDominio } from '../../../../domain/shared/index.js';
import { pluginDeAutenticacion } from '../../../../infrastructure/auth/plugin.js';
import { requireRole } from '../../../../infrastructure/auth/rbac.js';
import { crearRepositorioAuditoriaPg } from '../../../../infrastructure/audit/repositorio-pg.js';
import { datosInvalidos } from '../../../../infrastructure/db/repositories/compartido/index.js';
import { withTenant } from '../../../../infrastructure/db/tenant/with-tenant.js';

/** Exige contexto de clínica y rol `administrador` (tarea T2 de C-16). */
function exigirContextoDeAdministrador(request: FastifyRequest): RequestContext {
  const contexto = request.userContext;
  if (contexto === undefined) {
    throw new ErrorDeDominio(
      'ACCESO_PROHIBIDO',
      'prohibido',
      'El rol no tiene permiso para este recurso.',
    );
  }
  requireRole(contexto, 'administrador');
  return contexto;
}

function parsearFecha(valor: string | undefined): Date | null {
  if (valor === undefined || valor === '') return null;
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) {
    throw datosInvalidos();
  }
  return fecha;
}

/**
 * Módulo de auditoría de la clínica (C-16): consulta de la auditoría append-only con filtros
 * por entidad, actor y rango de fechas. Zona: `src/interfaces/http/modules/auditoria/**`.
 */
export default async function moduloAuditoria(app: FastifyInstance): Promise<void> {
  await pluginDeAutenticacion(app);
  app.get('/auditoria', async (request) => {
    const contexto = exigirContextoDeAdministrador(request);
    const query = request.query as Record<string, string | undefined>;
    const filtros: FiltrosDeListarAuditoria = {
      entidad: query.entidad !== undefined && query.entidad !== '' ? query.entidad : undefined,
      actorId: query.actorId !== undefined && query.actorId !== '' ? query.actorId : undefined,
      desde: parsearFecha(query.desde),
      hasta: parsearFecha(query.hasta),
    };
    const registros = await withTenant(contexto.clinicaId, (cliente) =>
      crearRepositorioAuditoriaPg(cliente).listar(filtros, cliente),
    );
    return registros;
  });
}
