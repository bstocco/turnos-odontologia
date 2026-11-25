import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { RequestContext } from '../../../../application/shared/request-context.js';
import { ErrorDeDominio } from '../../../../domain/shared/index.js';
import { pluginDeAutenticacion } from '../../../../infrastructure/auth/plugin.js';
import { requireRole } from '../../../../infrastructure/auth/rbac.js';
import { withTenant } from '../../../../infrastructure/db/tenant/with-tenant.js';

interface Ausente {
  readonly id: string;
  readonly inicio: string;
  readonly fin: string;
  readonly pacienteId: string | null;
  readonly profesionalId: string | null;
}

/** Exige contexto de clínica y rol `administrador` (tarea T6 de C-16). */
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
    throw new ErrorDeDominio(
      'DATOS_INVALIDOS',
      'solicitud_invalida',
      'Los datos indicados no son válidos',
    );
  }
  return fecha;
}

/**
 * Módulo de registro de ausentismo (C-16): listado y conteo de ausentes por período, paciente y
 * profesional (RN-AB-02). Zona: `src/interfaces/http/modules/ausentismo/**`.
 */
export default async function moduloAusentismo(app: FastifyInstance): Promise<void> {
  await pluginDeAutenticacion(app);
  app.get('/ausentismo', async (request) => {
    const contexto = exigirContextoDeAdministrador(request);
    const query = request.query as Record<string, string | undefined>;
    const desde = parsearFecha(query.desde);
    const hasta = parsearFecha(query.hasta);
    const pacienteId = query.pacienteId ?? null;
    const profesionalId = query.profesionalId ?? null;

    const { rows: filas } = await withTenant(contexto.clinicaId, async (cliente) => {
      const condiciones: string[] = ["estado = 'ausente'"];
      const valores: unknown[] = [];
      if (desde !== null) {
        valores.push(desde);
        condiciones.push(`inicio >= $${valores.length}::timestamptz`);
      }
      if (hasta !== null) {
        valores.push(hasta);
        condiciones.push(`inicio < $${valores.length}::timestamptz`);
      }
      if (pacienteId !== null) {
        valores.push(pacienteId);
        condiciones.push(`paciente_id = $${valores.length}::uuid`);
      }
      if (profesionalId !== null) {
        valores.push(profesionalId);
        condiciones.push(`profesional_id = $${valores.length}::uuid`);
      }
      const resultado = await cliente.query<{ rows: unknown[] }>(
        `SELECT id, inicio, fin, paciente_id, profesional_id FROM turno
         WHERE ${condiciones.join(' AND ')}
         ORDER BY inicio`,
        valores,
      );
      return resultado;
    });
    const ausentes: Ausente[] = (filas as Record<string, unknown>[]).map((f) => ({
      id: String(f['id']),
      inicio: new Date(f['inicio'] as string).toISOString(),
      fin: new Date(f['fin'] as string).toISOString(),
      pacienteId: (f['paciente_id'] as string | null) ?? null,
      profesionalId: (f['profesional_id'] as string | null) ?? null,
    }));
    return { total: ausentes.length, ausentes };
  });
}
