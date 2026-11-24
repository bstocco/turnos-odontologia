import type { FastifyInstance } from 'fastify';

import {
  ESCRITURA,
  LECTURA,
  crearProfesional,
  exigirRol,
  listarProfesionales,
  modificarProfesional,
  obtenerHorarios,
  obtenerProfesional,
  reemplazarHorarios,
} from '../../../../application/configuracion/index.js';
import { pluginDeAutenticacion } from '../../../../infrastructure/auth/plugin.js';
import { contextoDePedido } from '../../../../infrastructure/auth/rbac.js';
import { withTenant } from '../../../../infrastructure/db/tenant/with-tenant.js';

import { dependenciasDeHorarios, dependenciasDeProfesionales } from './dependencias.js';
import {
  AltaDeProfesionalBody,
  FiltroDeLista,
  HorariosDto,
  ListaDeProfesionales,
  ModificarProfesionalBody,
  ParamsDeId,
  ProfesionalDto,
  ReemplazarHorariosBody,
} from './esquemas.js';

/** `/profesionales`: catálogo de profesionales (C-08, `api-recursos-clinica`). Sin DELETE (D7). */
export default async function moduloProfesionales(app: FastifyInstance): Promise<void> {
  // design D3: el hook de C-06 se agrega al contexto encapsulado de este módulo.
  await pluginDeAutenticacion(app);
  // Sin token, 401 antes que cualquier validación de forma.
  app.addHook('preValidation', async (request) => {
    contextoDePedido(request);
  });

  app.get(
    '/profesionales',
    { schema: { querystring: FiltroDeLista, response: { 200: ListaDeProfesionales } } },
    async (request) => {
      const ctx = contextoDePedido(request);
      exigirRol(ctx, LECTURA);
      const filtro = request.query as FiltroDeLista;
      return withTenant(ctx.clinicaId, (cliente) =>
        listarProfesionales(dependenciasDeProfesionales(cliente), ctx, filtro),
      );
    },
  );

  app.get(
    '/profesionales/:id',
    { schema: { params: ParamsDeId, response: { 200: ProfesionalDto } } },
    async (request) => {
      const ctx = contextoDePedido(request);
      exigirRol(ctx, LECTURA);
      const { id } = request.params as { id: string };
      return withTenant(ctx.clinicaId, (cliente) =>
        obtenerProfesional(dependenciasDeProfesionales(cliente), ctx, id),
      );
    },
  );

  app.post(
    '/profesionales',
    { schema: { body: AltaDeProfesionalBody, response: { 201: ProfesionalDto } } },
    async (request, reply) => {
      const ctx = contextoDePedido(request);
      exigirRol(ctx, ESCRITURA);
      const cuerpo = request.body as AltaDeProfesionalBody;
      const creado = await withTenant(ctx.clinicaId, (cliente) =>
        crearProfesional(dependenciasDeProfesionales(cliente), ctx, cuerpo, request.ip),
      );
      return reply.code(201).send(creado);
    },
  );

  app.patch(
    '/profesionales/:id',
    {
      schema: {
        params: ParamsDeId,
        body: ModificarProfesionalBody,
        response: { 200: ProfesionalDto },
      },
    },
    async (request) => {
      const ctx = contextoDePedido(request);
      exigirRol(ctx, ESCRITURA);
      const { id } = request.params as { id: string };
      const cuerpo = request.body as ModificarProfesionalBody;
      return withTenant(ctx.clinicaId, (cliente) =>
        modificarProfesional(dependenciasDeProfesionales(cliente), ctx, id, cuerpo, request.ip),
      );
    },
  );

  app.get(
    '/profesionales/:id/horarios',
    { schema: { params: ParamsDeId, response: { 200: HorariosDto } } },
    async (request) => {
      const ctx = contextoDePedido(request);
      exigirRol(ctx, LECTURA);
      const { id } = request.params as { id: string };
      return withTenant(ctx.clinicaId, (cliente) =>
        obtenerHorarios(dependenciasDeHorarios(cliente, ctx.clinicaId), ctx, id),
      );
    },
  );

  app.put(
    '/profesionales/:id/horarios',
    {
      schema: { params: ParamsDeId, body: ReemplazarHorariosBody, response: { 200: HorariosDto } },
    },
    async (request) => {
      const ctx = contextoDePedido(request);
      exigirRol(ctx, ESCRITURA);
      const { id } = request.params as { id: string };
      const cuerpo = request.body as ReemplazarHorariosBody;
      return withTenant(ctx.clinicaId, (cliente) =>
        reemplazarHorarios(
          dependenciasDeHorarios(cliente, ctx.clinicaId),
          ctx,
          id,
          cuerpo,
          request.ip,
        ),
      );
    },
  );
}
