import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { ErrorDeDominio, type TipoDeError } from '../../domain/shared/errores.js';

/** Traducción del tipo semántico a estado HTTP (D4). */
export const ESTADO_POR_TIPO: Readonly<Record<TipoDeError, number>> = {
  solicitud_invalida: 400,
  no_autenticado: 401,
  prohibido: 403,
  no_encontrado: 404,
  conflicto: 409,
  regla_de_negocio: 422,
};

interface CampoInvalido {
  ubicacion: string;
  campo: string;
  regla: string;
}

interface ErrorConValidacion {
  validation?: { instancePath?: string; keyword?: string }[];
  validationContext?: string;
  statusCode?: number;
}

interface CuerpoDeError {
  codigo: string;
  mensaje: string;
  campos?: CampoInvalido[];
}

const CODIGO_POR_ESTADO: Readonly<Record<number, { codigo: string; mensaje: string }>> = {
  400: { codigo: 'SOLICITUD_INVALIDA', mensaje: 'La solicitud no es válida.' },
  413: {
    codigo: 'CUERPO_DEMASIADO_GRANDE',
    mensaje: 'El cuerpo de la solicitud es demasiado grande.',
  },
  415: {
    codigo: 'TIPO_DE_CONTENIDO_NO_SOPORTADO',
    mensaje: 'El tipo de contenido de la solicitud no está soportado.',
  },
  429: {
    codigo: 'DEMASIADOS_PEDIDOS',
    mensaje: 'Hay demasiados pedidos. Intentá de nuevo más tarde.',
  },
};

/** Lista campo y regla incumplida. Nunca incluye los valores recibidos. */
function camposInvalidos(error: ErrorConValidacion): CampoInvalido[] {
  return (error.validation ?? []).map((v) => ({
    ubicacion: error.validationContext ?? 'solicitud',
    campo: (v.instancePath ?? '').replace(/^\//, '').replace(/\//g, '.'),
    regla: v.keyword ?? 'desconocida',
  }));
}

function responder(reply: FastifyReply, estado: number, cuerpo: CuerpoDeError): FastifyReply {
  return reply.code(estado).send(cuerpo);
}

export function registrarManejoDeErrores(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) => {
    return responder(reply, 404, {
      codigo: 'RUTA_NO_ENCONTRADA',
      mensaje: 'La ruta solicitada no existe.',
    });
  });

  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ErrorDeDominio) {
      request.log.warn({ codigo: error.codigo, tipo: error.tipo }, 'Error de dominio');
      return responder(reply, ESTADO_POR_TIPO[error.tipo], {
        codigo: error.codigo,
        mensaje: error.message,
      });
    }

    const conValidacion = error as ErrorConValidacion;
    if (Array.isArray(conValidacion.validation)) {
      request.log.info({ campos: camposInvalidos(conValidacion) }, 'Solicitud con forma inválida');
      return responder(reply, 400, {
        codigo: 'SOLICITUD_INVALIDA',
        mensaje: 'La solicitud no cumple el esquema esperado.',
        campos: camposInvalidos(conValidacion),
      });
    }

    const estado = conValidacion.statusCode;
    if (estado !== undefined && estado >= 400 && estado < 500) {
      const conocido = CODIGO_POR_ESTADO[estado] ?? CODIGO_POR_ESTADO[400];
      request.log.info({ estado }, 'Solicitud rechazada');
      return responder(reply, estado, {
        codigo: conocido?.codigo ?? 'SOLICITUD_INVALIDA',
        mensaje: conocido?.mensaje ?? 'La solicitud no es válida.',
      });
    }

    // Error inesperado: el detalle va solo al log, con el identificador del pedido.
    request.log.error({ err: error }, 'Error no controlado');
    return responder(reply, 500, {
      codigo: 'ERROR_INTERNO',
      mensaje: 'Ocurrió un error interno. Intentá de nuevo más tarde.',
    });
  });
}
