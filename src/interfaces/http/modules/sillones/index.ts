import type { FastifyInstance } from 'fastify';

import {
  ESCRITURA,
  LECTURA,
  crearSillon,
  exigirRol,
  listarSillones,
  modificarSillon,
  obtenerSillon,
} from '../../../../application/configuracion/index.js';
import { pluginDeAutenticacion } from '../../../../infrastructure/auth/plugin.js';
import { contextoDePedido } from '../../../../infrastructure/auth/rbac.js';
import { withTenant } from '../../../../infrastructure/db/tenant/with-tenant.js';

import { dependenciasDeSillones } from './dependencias.js';
import {
  AltaDeSillonBody,
  FiltroDeLista,
  ListaDeSillones,
  ModificarSillonBody,
  ParamsDeId,
  SillonDto,
} from './esquemas.js';

/** `/sillones`: catálogo de sillones (C-08, `api-recursos-clinica`). Sin DELETE (D7). */
export default async function moduloSillones(app: FastifyInstance): Promise<void> {
  // design D3: el hook de C-06 se agrega al contexto encapsulado de este módulo.
  await pluginDeAutenticacion(app);
  // Sin token, 401 antes que cualquier validación de forma.
  app.addHook('preValidation', async (request) => {
    contextoDePedido(request);
  });

  app.get(
    '/sillones',
    { schema: { querystring: FiltroDeLista, response: { 200: ListaDeSillones } } },
    async (request) => {
      const ctx = contextoDePedido(request);
      exigirRol(ctx, LECTURA);
      const filtro = request.query as FiltroDeLista;
      return withTenant(ctx.clinicaId, (cliente) =>
        listarSillones(dependenciasDeSillones(cliente), ctx, filtro),
      );
    },
  );

  app.get(
    '/sillones/:id',
    { schema: { params: ParamsDeId, response: { 200: SillonDto } } },
    async (request) => {
      const ctx = contextoDePedido(request);
      exigirRol(ctx, LECTURA);
      const { id } = request.params as { id: string };
      return withTenant(ctx.clinicaId, (cliente) =>
        obtenerSillon(dependenciasDeSillones(cliente), ctx, id),
      );
    },
  );

  app.post(
    '/sillones',
    { schema: { body: AltaDeSillonBody, response: { 201: SillonDto } } },
    async (request, reply) => {
      const ctx = contextoDePedido(request);
      exigirRol(ctx, ESCRITURA);
      const cuerpo = request.body as AltaDeSillonBody;
      const creado = await withTenant(ctx.clinicaId, (cliente) =>
        crearSillon(dependenciasDeSillones(cliente), ctx, cuerpo, request.ip),
      );
      return reply.code(201).send(creado);
    },
  );

  app.patch(
    '/sillones/:id',
    { schema: { params: ParamsDeId, body: ModificarSillonBody, response: { 200: SillonDto } } },
    async (request) => {
      const ctx = contextoDePedido(request);
      exigirRol(ctx, ESCRITURA);
      const { id } = request.params as { id: string };
      const cuerpo = request.body as ModificarSillonBody;
      return withTenant(ctx.clinicaId, (cliente) =>
        modificarSillon(dependenciasDeSillones(cliente), ctx, id, cuerpo, request.ip),
      );
    },
  );
}
