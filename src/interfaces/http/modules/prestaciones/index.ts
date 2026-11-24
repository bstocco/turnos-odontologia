import type { FastifyInstance } from 'fastify';

import {
  ESCRITURA,
  LECTURA,
  crearPrestacion,
  exigirRol,
  listarPrestaciones,
  modificarPrestacion,
  obtenerPrestacion,
} from '../../../../application/configuracion/index.js';
import { pluginDeAutenticacion } from '../../../../infrastructure/auth/plugin.js';
import { contextoDePedido } from '../../../../infrastructure/auth/rbac.js';
import { withTenant } from '../../../../infrastructure/db/tenant/with-tenant.js';

import { dependenciasDePrestaciones } from './dependencias.js';
import {
  AltaDePrestacionBody,
  FiltroDeLista,
  ListaDePrestaciones,
  ModificarPrestacionBody,
  ParamsDeId,
  PrestacionDto,
} from './esquemas.js';

/** `/prestaciones`: catálogo de prestaciones (C-08, `api-recursos-clinica`). Sin DELETE (D7). */
export default async function moduloPrestaciones(app: FastifyInstance): Promise<void> {
  // design D3: el hook de C-06 se agrega al contexto encapsulado de este módulo.
  await pluginDeAutenticacion(app);
  // Sin token, 401 antes que cualquier validación de forma.
  app.addHook('preValidation', async (request) => {
    contextoDePedido(request);
  });

  app.get(
    '/prestaciones',
    { schema: { querystring: FiltroDeLista, response: { 200: ListaDePrestaciones } } },
    async (request) => {
      const ctx = contextoDePedido(request);
      exigirRol(ctx, LECTURA);
      const filtro = request.query as FiltroDeLista;
      return withTenant(ctx.clinicaId, (cliente) =>
        listarPrestaciones(dependenciasDePrestaciones(cliente), ctx, filtro),
      );
    },
  );

  app.get(
    '/prestaciones/:id',
    { schema: { params: ParamsDeId, response: { 200: PrestacionDto } } },
    async (request) => {
      const ctx = contextoDePedido(request);
      exigirRol(ctx, LECTURA);
      const { id } = request.params as { id: string };
      return withTenant(ctx.clinicaId, (cliente) =>
        obtenerPrestacion(dependenciasDePrestaciones(cliente), ctx, id),
      );
    },
  );

  app.post(
    '/prestaciones',
    { schema: { body: AltaDePrestacionBody, response: { 201: PrestacionDto } } },
    async (request, reply) => {
      const ctx = contextoDePedido(request);
      exigirRol(ctx, ESCRITURA);
      const cuerpo = request.body as AltaDePrestacionBody;
      const creada = await withTenant(ctx.clinicaId, (cliente) =>
        crearPrestacion(dependenciasDePrestaciones(cliente), ctx, cuerpo, request.ip),
      );
      return reply.code(201).send(creada);
    },
  );

  app.patch(
    '/prestaciones/:id',
    {
      schema: {
        params: ParamsDeId,
        body: ModificarPrestacionBody,
        response: { 200: PrestacionDto },
      },
    },
    async (request) => {
      const ctx = contextoDePedido(request);
      exigirRol(ctx, ESCRITURA);
      const { id } = request.params as { id: string };
      const cuerpo = request.body as ModificarPrestacionBody;
      return withTenant(ctx.clinicaId, (cliente) =>
        modificarPrestacion(dependenciasDePrestaciones(cliente), ctx, id, cuerpo, request.ip),
      );
    },
  );
}
