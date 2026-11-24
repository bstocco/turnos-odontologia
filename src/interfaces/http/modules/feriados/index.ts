import type { FastifyInstance } from 'fastify';

import {
  ESCRITURA,
  LECTURA,
  copiarPlantilla,
  crearFeriado,
  eliminarFeriado,
  exigirRol,
  listarFeriados,
  obtenerPlantilla,
} from '../../../../application/configuracion/index.js';
import { pluginDeAutenticacion } from '../../../../infrastructure/auth/plugin.js';
import { contextoDePedido } from '../../../../infrastructure/auth/rbac.js';
import { withTenant } from '../../../../infrastructure/db/tenant/with-tenant.js';

import { dependenciasDeFeriados } from './dependencias.js';
import {
  AltaDeFeriadoBody,
  AnioQuery,
  CopiarPlantillaBody,
  FeriadoDto,
  FiltroDeFeriados,
  ListaDeFeriados,
  ParamsDeId,
  PlantillaDto,
  ResultadoDeCopiaDto,
} from './esquemas.js';

/** `/feriados`: feriados de la clínica y plantilla nacional (C-08, `api-feriados`). */
export default async function moduloFeriados(app: FastifyInstance): Promise<void> {
  // design D3: el hook de C-06 se agrega al contexto encapsulado de este módulo.
  await pluginDeAutenticacion(app);
  // Sin token, 401 antes que cualquier validación de forma.
  app.addHook('preValidation', async (request) => {
    contextoDePedido(request);
  });

  app.get(
    '/feriados',
    { schema: { querystring: FiltroDeFeriados, response: { 200: ListaDeFeriados } } },
    async (request) => {
      const ctx = contextoDePedido(request);
      exigirRol(ctx, LECTURA);
      const filtro = request.query as FiltroDeFeriados;
      return withTenant(ctx.clinicaId, (cliente) =>
        listarFeriados(dependenciasDeFeriados(cliente), ctx, filtro),
      );
    },
  );

  app.post(
    '/feriados',
    { schema: { body: AltaDeFeriadoBody, response: { 201: FeriadoDto } } },
    async (request, reply) => {
      const ctx = contextoDePedido(request);
      exigirRol(ctx, ESCRITURA);
      const cuerpo = request.body as AltaDeFeriadoBody;
      const creado = await withTenant(ctx.clinicaId, (cliente) =>
        crearFeriado(dependenciasDeFeriados(cliente), ctx, cuerpo, request.ip),
      );
      return reply.code(201).send(creado);
    },
  );

  app.delete('/feriados/:id', { schema: { params: ParamsDeId } }, async (request, reply) => {
    const ctx = contextoDePedido(request);
    exigirRol(ctx, ESCRITURA);
    const { id } = request.params as { id: string };
    await withTenant(ctx.clinicaId, (cliente) =>
      eliminarFeriado(dependenciasDeFeriados(cliente), ctx, id, request.ip),
    );
    return reply.code(204).send();
  });

  app.get(
    '/feriados/plantilla-nacional',
    { schema: { querystring: AnioQuery, response: { 200: PlantillaDto } } },
    async (request) => {
      const ctx = contextoDePedido(request);
      const { anio } = request.query as AnioQuery;
      return obtenerPlantilla(ctx, anio);
    },
  );

  app.post(
    '/feriados/plantilla-nacional',
    { schema: { body: CopiarPlantillaBody, response: { 200: ResultadoDeCopiaDto } } },
    async (request) => {
      const ctx = contextoDePedido(request);
      exigirRol(ctx, ESCRITURA);
      const { anio } = request.body as CopiarPlantillaBody;
      return withTenant(ctx.clinicaId, (cliente) =>
        copiarPlantilla(dependenciasDeFeriados(cliente), ctx, anio, request.ip),
      );
    },
  );
}
