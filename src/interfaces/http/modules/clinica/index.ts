import type { FastifyInstance } from 'fastify';

import {
  ESCRITURA,
  LECTURA,
  exigirRol,
  modificarConfiguracionClinica,
  obtenerConfiguracionClinica,
} from '../../../../application/configuracion/index.js';
import { pluginDeAutenticacion } from '../../../../infrastructure/auth/plugin.js';
import { contextoDePedido } from '../../../../infrastructure/auth/rbac.js';
import { withTenant } from '../../../../infrastructure/db/tenant/with-tenant.js';

import { dependenciasDeClinica } from './dependencias.js';
import { ClinicaDto, ModificarClinicaBody } from './esquemas.js';

/** `/clinica`: lectura y modificación de la configuración operativa (C-08, `api-configuracion-clinica`). */
export default async function moduloClinica(app: FastifyInstance): Promise<void> {
  // design D3: el hook de C-06 se agrega al contexto encapsulado de este módulo.
  await pluginDeAutenticacion(app);
  // Sin token, 401 antes que cualquier validación de forma.
  app.addHook('preValidation', async (request) => {
    contextoDePedido(request);
  });

  app.get('/clinica', { schema: { response: { 200: ClinicaDto } } }, async (request) => {
    const ctx = contextoDePedido(request);
    exigirRol(ctx, LECTURA);
    return withTenant(ctx.clinicaId, (cliente) =>
      obtenerConfiguracionClinica(dependenciasDeClinica(cliente), ctx),
    );
  });

  app.patch(
    '/clinica',
    { schema: { body: ModificarClinicaBody, response: { 200: ClinicaDto } } },
    async (request) => {
      const ctx = contextoDePedido(request);
      exigirRol(ctx, ESCRITURA);
      const cuerpo = request.body as ModificarClinicaBody;
      return withTenant(ctx.clinicaId, (cliente) =>
        modificarConfiguracionClinica(dependenciasDeClinica(cliente), ctx, cuerpo, request.ip),
      );
    },
  );
}
