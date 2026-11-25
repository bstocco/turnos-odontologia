import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

import type { Config } from '../../config/index.js';

import { parsearLimiteDeTasa } from './modules/publico-disponibilidad/limite-de-tasa.js';

const CAPACIDAD_RATE_LIMIT_GLOBAL = 10_000;

export interface OpcionesHardeningHttp {
  /** Capacidad del almacén LRU de contadores globales por IP (las pruebas pueden acotarla). */
  readonly rateLimitGlobalCache?: number;
}

/**
 * Registra los controles transversales de seguridad HTTP:
 * - Cabeceras de endurecimiento (@fastify/helmet)
 * - Política CORS restrictiva sin comodín (@fastify/cors, rutas OPTIONS ocultas de OpenAPI)
 * - Límite de tasa global por IP (@fastify/rate-limit, memoria acotada)
 */
export async function registrarHardeningHttp(
  app: FastifyInstance,
  config: Pick<Config, 'corsAllowedOrigins' | 'rateLimitGlobal'>,
  opciones: OpcionesHardeningHttp = {},
): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    hsts: { maxAge: 15_552_000, includeSubDomains: true },
    hidePoweredBy: true,
    noSniff: true,
  });

  const permitidos = new Set(config.corsAllowedOrigins);
  await app.register(cors, {
    hideOptionsRoute: true,
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['x-request-id', 'retry-after'],
    origin:
      permitidos.size === 0
        ? false
        : (origen, cb) => {
            if (origen === undefined) {
              cb(null, false);
              return;
            }
            cb(null, permitidos.has(origen));
          },
  });

  const { max, ventanaMs } = parsearLimiteDeTasa(config.rateLimitGlobal);
  await app.register(rateLimit, {
    global: true,
    hook: 'onRequest',
    max,
    timeWindow: ventanaMs,
    cache: opciones.rateLimitGlobalCache ?? CAPACIDAD_RATE_LIMIT_GLOBAL,
    errorResponseBuilder: (_request, contexto) =>
      Object.assign(new Error('Rate limit exceeded'), { statusCode: contexto.statusCode }),
  });
}
