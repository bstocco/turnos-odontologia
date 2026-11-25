import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import swagger from '@fastify/swagger';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { DestinationStream } from 'pino';

import type { Config } from '../../config/index.js';
import { crearLogger } from '../../infrastructure/logging/logger.js';

import { registrarManejoDeErrores } from './errores.js';
import { registrarModulos } from './register-modules.js';

export interface OpcionesDeApp {
  /** Destino de los logs; las pruebas lo usan para capturar la salida. */
  destinoDeLogs?: DestinationStream;
  /** Carpeta de módulos HTTP; por defecto `./modules` junto a este archivo. */
  directorioDeModulos?: string;
}

function rutaSinConsulta(url: string): string {
  return url.split('?')[0] ?? url;
}

/**
 * Construye la aplicación sin escuchar en ningún puerto (D3): las pruebas `api` usan `inject`.
 * `GET /salud` se registra en la raíz; los módulos de `modules/` cuelgan de `/api/v1`.
 */
export async function buildApp(
  config: Config,
  opciones: OpcionesDeApp = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    // El Logger de pino cumple FastifyBaseLogger; se declara así para no propagar su tipo concreto.
    loggerInstance: crearLogger(config, opciones.destinoDeLogs) as FastifyBaseLogger,
    // Los logs de acceso los emite el hook onResponse (sin consulta ni cuerpo).
    logController: new LogController({ disableRequestLogging: true, requestIdLogLabel: 'reqId' }),
    genReqId: () => randomUUID(),
  });

  registrarManejoDeErrores(app);

  // Correlación entre el cliente, el log y el detalle de un error.
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // Registro de acceso: método, ruta SIN consulta, estado y duración. Nunca cuerpo ni consulta.
  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        metodo: request.method,
        ruta: rutaSinConsulta(request.url),
        estado: reply.statusCode,
        duracionMs: Math.round(reply.elapsedTime),
      },
      'acceso',
    );
  });

  // Contrato OpenAPI derivado de las rutas reales (C-18). Sin interfaz ni ruta propia: el documento
  // solo se obtiene en proceso con `app.swagger()`. Debe registrarse ANTES de las rutas.
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: { title: 'API de turnos odontológicos', version: '0.0.0' },
    },
  });

  // Sin versiones, rutas del servidor ni configuración (spec http-service).
  app.get('/salud', async () => ({ estado: 'ok' }));

  const directorio =
    opciones.directorioDeModulos ?? fileURLToPath(new URL('./modules', import.meta.url));
  await registrarModulos(app, directorio);

  return app;
}
