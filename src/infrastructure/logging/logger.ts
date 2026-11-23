import { pino, type DestinationStream, type Logger, type LoggerOptions } from 'pino';

import type { Config } from '../../config/index.js';

import { MARCADOR, limpiarTexto, redactar } from './redactor.js';

interface PedidoSerializable {
  method?: string;
  url?: string;
  id?: string;
}

/** Defensa en profundidad: aunque alguien registre un pedido entero, no salen cuerpo ni consulta. */
function serializarPedido(pedido: PedidoSerializable): Record<string, unknown> {
  return {
    method: pedido.method,
    url: (pedido.url ?? '').split('?')[0],
    id: pedido.id,
  };
}

function serializarRespuesta(respuesta: { statusCode?: number }): Record<string, unknown> {
  return { statusCode: respuesta.statusCode };
}

/**
 * Logger estructurado (JSON por línea) con redacción profunda de datos personales y credenciales.
 * `destino` permite capturar la salida en las pruebas.
 */
export function crearLogger(config: Pick<Config, 'logLevel'>, destino?: DestinationStream): Logger {
  const opciones: LoggerOptions = {
    level: config.logLevel,
    // Sin `pid` ni `hostname`: el nombre del equipo puede identificar a una persona.
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      // Redacta cada objeto registrado, a cualquier profundidad.
      log: (objeto) => redactar(objeto),
    },
    serializers: {
      req: serializarPedido,
      res: serializarRespuesta,
    },
    // Respaldo del redactor para las cabeceras más sensibles.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'headers.authorization',
        'headers.cookie',
      ],
      censor: MARCADOR,
    },
    hooks: {
      // El texto del mensaje no pasa por `formatters.log`: se limpia acá.
      logMethod(argumentos, metodo) {
        const [primero, segundo, ...resto] = argumentos as unknown as [
          unknown,
          unknown,
          ...unknown[],
        ];
        let objeto: unknown = primero;
        let mensaje: unknown = segundo;
        if (primero instanceof Error) {
          objeto = { err: primero };
          if (typeof segundo !== 'string') mensaje = primero.message;
        } else if (typeof primero === 'string') {
          objeto = limpiarTexto(primero);
        }
        if (typeof mensaje === 'string') mensaje = limpiarTexto(mensaje);
        const nuevos = mensaje === undefined ? [objeto] : [objeto, mensaje, ...resto];
        (metodo as (...a: unknown[]) => void).apply(this, nuevos);
      },
    },
  };
  return destino ? pino(opciones, destino) : pino(opciones);
}
