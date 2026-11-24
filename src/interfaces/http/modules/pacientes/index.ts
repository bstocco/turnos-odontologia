import type { FastifyInstance } from 'fastify';

import {
  ALTA_Y_MODIFICACION,
  LECTURA,
  buscarPacientes,
  crearPaciente,
  exigirRol,
  modificarPaciente,
  normalizarAlta,
  normalizarCambios,
  obtenerPaciente,
  validarCriterioDeBusqueda,
} from '../../../../application/pacientes/index.js';
import { pluginDeAutenticacion } from '../../../../infrastructure/auth/plugin.js';
import { contextoDePedido } from '../../../../infrastructure/auth/rbac.js';
import { withTenant } from '../../../../infrastructure/db/tenant/with-tenant.js';

import { dependenciasDePacientes } from './dependencias.js';
import {
  AltaDePacienteBody,
  BusquedaQuery,
  ListaDePacientes,
  ModificarPacienteBody,
  PacienteDto,
  ParamsDeId,
} from './esquemas.js';

/**
 * `/pacientes`: alta, detalle, modificación parcial y búsqueda (C-10, `api-pacientes`).
 * Sin DELETE: no hay baja de pacientes en v1 (design D9). Rutas delgadas: permisos, validación
 * pura y alcance viven en `application/pacientes`; el rol y la forma se verifican ANTES de abrir
 * la transacción.
 */
export default async function moduloPacientes(app: FastifyInstance): Promise<void> {
  // design D2: el hook de C-06 se agrega al contexto encapsulado de este módulo.
  await pluginDeAutenticacion(app);
  // Sin token, 401 antes que cualquier validación de forma.
  app.addHook('preValidation', async (request) => {
    contextoDePedido(request);
  });

  app.post(
    '/pacientes',
    { schema: { body: AltaDePacienteBody, response: { 201: PacienteDto } } },
    async (request, reply) => {
      const ctx = contextoDePedido(request);
      exigirRol(ctx, ALTA_Y_MODIFICACION);
      const cuerpo = request.body as AltaDePacienteBody;
      normalizarAlta(cuerpo); // falla (400) antes de abrir la transacción
      const creado = await withTenant(ctx.clinicaId, (cliente) =>
        crearPaciente(dependenciasDePacientes(cliente, ctx.clinicaId), ctx, cuerpo, request.ip),
      );
      return reply.code(201).send(creado);
    },
  );

  app.get(
    '/pacientes',
    { schema: { querystring: BusquedaQuery, response: { 200: ListaDePacientes } } },
    async (request) => {
      const ctx = contextoDePedido(request);
      exigirRol(ctx, LECTURA);
      const consulta = request.query as BusquedaQuery;
      validarCriterioDeBusqueda(consulta); // 400 antes de abrir la transacción
      return withTenant(ctx.clinicaId, (cliente) =>
        buscarPacientes(dependenciasDePacientes(cliente, ctx.clinicaId), ctx, consulta),
      );
    },
  );

  app.get(
    '/pacientes/:id',
    { schema: { params: ParamsDeId, response: { 200: PacienteDto } } },
    async (request) => {
      const ctx = contextoDePedido(request);
      exigirRol(ctx, LECTURA);
      const { id } = request.params as { id: string };
      return withTenant(ctx.clinicaId, (cliente) =>
        obtenerPaciente(dependenciasDePacientes(cliente, ctx.clinicaId), ctx, id, request.ip),
      );
    },
  );

  app.patch(
    '/pacientes/:id',
    {
      schema: { params: ParamsDeId, body: ModificarPacienteBody, response: { 200: PacienteDto } },
    },
    async (request) => {
      const ctx = contextoDePedido(request);
      exigirRol(ctx, ALTA_Y_MODIFICACION);
      const { id } = request.params as { id: string };
      const cuerpo = request.body as ModificarPacienteBody;
      normalizarCambios(cuerpo); // 400 antes de abrir la transacción
      return withTenant(ctx.clinicaId, (cliente) =>
        modificarPaciente(
          dependenciasDePacientes(cliente, ctx.clinicaId),
          ctx,
          id,
          cuerpo,
          request.ip,
        ),
      );
    },
  );
}
