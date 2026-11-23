import type { FastifyPluginAsync } from 'fastify';

import { ErrorDeDominio, type TipoDeError } from '../../../../src/domain/shared/errores.js';

/** Módulo de prueba: rutas que provocan cada tipo de respuesta que el servicio debe manejar. */
const plugin: FastifyPluginAsync = async (app) => {
  app.get('/pacientes', async () => ({ ok: true }));

  app.get('/errores/dominio', async () => {
    throw new ErrorDeDominio(
      'TURNO_SOLAPADO_SILLON',
      'conflicto',
      'El sillón ya está ocupado en ese horario.',
    );
  });

  app.get<{ Params: { tipo: TipoDeError } }>('/errores/tipo/:tipo', async (request) => {
    throw new ErrorDeDominio('CODIGO_DE_PRUEBA', request.params.tipo, 'Error de prueba.');
  });

  app.get('/errores/inesperado', async () => {
    throw new Error('falló SELECT * FROM paciente WHERE dni = 30111222');
  });

  app.post(
    '/errores/validacion',
    {
      schema: {
        body: {
          type: 'object',
          required: ['nombre'],
          properties: { nombre: { type: 'string', minLength: 3 } },
          additionalProperties: false,
        },
      },
    },
    async () => ({ ok: true }),
  );
};

export default plugin;
