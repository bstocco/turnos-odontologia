import { randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { ExportacionDeClinica } from '../../../../application/exportacion/index.js';
import { conAuditoriaDeExportacion } from '../../../../application/auditoria/index.js';
import type { RequestContext } from '../../../../application/shared/request-context.js';
import { ErrorDeDominio } from '../../../../domain/shared/index.js';
import { crearAuditoriaPg } from '../../../../infrastructure/audit/repositorio-pg.js';
import { pluginDeAutenticacion } from '../../../../infrastructure/auth/plugin.js';
import { requireRole } from '../../../../infrastructure/auth/rbac.js';
import { withTenant } from '../../../../infrastructure/db/tenant/with-tenant.js';
import { generarExportacionDeClinica } from '../../../../application/exportacion/index.js';

/** Exige contexto de clínica y rol `administrador` (tarea T3/T7 de C-16). */
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

/**
 * Módulo de exportación de la clínica (C-16): `POST /exportaciones` y `GET /exportaciones/{id}`.
 * La exportación incluye datos de **su** clínica (RLS de C-03) y queda auditada (RN-DA-04,
 * RN-AU-03). Zona: `src/interfaces/http/modules/exportaciones/**`.
 */
export default async function moduloExportaciones(app: FastifyInstance): Promise<void> {
  await pluginDeAutenticacion(app);
  app.post('/exportaciones', async (request, reply: FastifyReply) => {
    const contexto = exigirContextoDeAdministrador(request);
    const id = randomUUID();
    await withTenant(contexto.clinicaId, async (cliente) => {
      const auditoria = crearAuditoriaPg(cliente);
      await conAuditoriaDeExportacion(
        auditoria,
        contexto,
        { entidadId: id, metadatos: { formato: 'json', entidades: ['paciente', 'turno'] } },
        async () => id,
      );
    });
    return reply.code(201).send({ id });
  });

  app.get('/exportaciones/:id', async (request, reply: FastifyReply) => {
    const contexto = exigirContextoDeAdministrador(request);
    const { id } = request.params as { id: string };
    const exportacion = await withTenant(contexto.clinicaId, (cliente) =>
      conAuditoriaDeExportacion(
        crearAuditoriaPg(cliente),
        contexto,
        { entidadId: id, metadatos: { formato: 'json' } },
        () => generarExportacionDeClinica(cliente),
      ),
    );
    return reply
      .header('content-type', 'application/json; charset=utf-8')
      .header('content-disposition', `attachment; filename="exportacion-${id}.json"`)
      .send(exportacion satisfies ExportacionDeClinica);
  });
}
