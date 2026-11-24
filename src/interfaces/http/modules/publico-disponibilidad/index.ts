import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import {
  consultarDisponibilidad,
  listarPrestacionesPublicas,
  listarProfesionalesPublicos,
} from '../../../../application/disponibilidad/index.js';
import { loadConfig } from '../../../../config/index.js';

import {
  conClinicaPublica,
  dependenciasDeCatalogo,
  dependenciasDeDisponibilidad,
} from './dependencias.js';
import {
  ConsultaDeDisponibilidadQuery,
  DisponibilidadPublicaDto,
  ListaDePrestacionesPublicas,
  ListaDeProfesionalesPublicos,
  ParamsDeClinica,
} from './esquemas.js';
import { parsearLimiteDeTasa } from './limite-de-tasa.js';

/** Capacidad del almacén LRU de contadores por IP (memoria acotada, design D7). */
const CAPACIDAD_POR_DEFECTO = 10_000;
const LIMITE_POR_DEFECTO = '30/min';

export interface OpcionesDelModulo {
  /** Capacidad del almacén de contadores (las pruebas la reducen). */
  readonly cache?: number;
}

function limiteConfigurado(): string {
  try {
    return loadConfig('app').rateLimitPublic;
  } catch {
    // Sin configuración completa (p. ej. otra variable faltante) se aplica el valor por defecto.
    return LIMITE_POR_DEFECTO;
  }
}

/**
 * `/publico/:slug/*`: consulta pública sin sesión de catálogos y disponibilidad (C-13). No invoca
 * `pluginDeAutenticacion`: un `Authorization` presente se ignora. Un cupo por IP, evaluado en
 * `onRequest` antes de validar o tocar la base.
 */
export function crearModuloPublico(opciones: OpcionesDelModulo = {}): FastifyPluginAsync {
  return async function moduloPublicoDisponibilidad(app: FastifyInstance): Promise<void> {
    const { max, ventanaMs } = parsearLimiteDeTasa(limiteConfigurado());
    await app.register(rateLimit, {
      global: true,
      hook: 'onRequest',
      max,
      timeWindow: ventanaMs,
      cache: opciones.cache ?? CAPACIDAD_POR_DEFECTO,
      // Un Error con statusCode 429: el manejador central lo traduce a DEMASIADOS_PEDIDOS.
      errorResponseBuilder: (_request, contexto) =>
        Object.assign(new Error('Rate limit exceeded'), { statusCode: contexto.statusCode }),
    });

    // Las respuestas de error nunca son almacenables (design D9).
    app.addHook('onSend', async (_request, reply) => {
      if (reply.statusCode >= 400) reply.header('cache-control', 'no-store');
    });

    app.get(
      '/publico/:slug/prestaciones',
      { schema: { params: ParamsDeClinica, response: { 200: ListaDePrestacionesPublicas } } },
      async (request, reply) => {
        const { slug } = request.params as { slug: string };
        const prestaciones = await conClinicaPublica(slug, (c) =>
          listarPrestacionesPublicas(dependenciasDeCatalogo(c)),
        );
        return reply.header('cache-control', 'private, max-age=60').send({ prestaciones });
      },
    );

    app.get(
      '/publico/:slug/disponibilidad',
      {
        schema: {
          params: ParamsDeClinica,
          querystring: ConsultaDeDisponibilidadQuery,
          response: { 200: DisponibilidadPublicaDto },
        },
      },
      async (request, reply) => {
        const { slug } = request.params as { slug: string };
        const consulta = request.query as ConsultaDeDisponibilidadQuery;
        const resultado = await conClinicaPublica(slug, (c) =>
          consultarDisponibilidad(
            dependenciasDeDisponibilidad(c, () => new Date()),
            consulta,
          ),
        );
        return reply.header('cache-control', 'no-store').send(resultado);
      },
    );

    // Grupo 5 (Q2 aprobada): profesionales activos con datos mínimos.
    app.get(
      '/publico/:slug/profesionales',
      { schema: { params: ParamsDeClinica, response: { 200: ListaDeProfesionalesPublicos } } },
      async (request, reply) => {
        const { slug } = request.params as { slug: string };
        const profesionales = await conClinicaPublica(slug, (c) =>
          listarProfesionalesPublicos(dependenciasDeCatalogo(c)),
        );
        return reply.header('cache-control', 'private, max-age=60').send({ profesionales });
      },
    );
  };
}

export default crearModuloPublico();
