import type { FastifyInstance } from 'fastify';
import Type, { type Static } from 'typebox';

import { ErrorDeDominio } from '../../../../domain/shared/errores.js';
import { cargarAdminInternalKey } from '../../../../config/index.js';
import { compararEnTiempoConstante } from '../../../../infrastructure/crypto/index.js';

import { aprovisionarClinica } from '../../../../application/aprovisionamiento/index.js';
import { repositorioDeAprovisionamiento } from '../../../../infrastructure/aprovisionamiento/repositorio-de-clinicas.js';

const CuerpoNuevaClinica = Type.Object({
  slug: Type.String({ minLength: 2, maxLength: 64, pattern: '^[a-z0-9][a-z0-9-]*$' }),
  nombre: Type.String({ minLength: 1, maxLength: 128 }),
  email: Type.String({ format: 'email', minLength: 1, maxLength: 254 }),
});
type CuerpoNuevaClinica = Static<typeof CuerpoNuevaClinica>;

/**
 * Módulo interno de alta de clínicas (C-17): `POST /interno/clinicas`.
 * Protegido por la clave de servicio de entorno (`ADMIN_INTERNAL_KEY`), sin contexto
 * de clínica (la clínica aún no existe).
 */
export default async function moduloInterno(app: FastifyInstance): Promise<void> {
  app.post(
    '/interno/clinicas',
    { schema: { body: CuerpoNuevaClinica } },
    async (request, reply) => {
      // Guarda de clave de servicio primero: sin cargar el repositorio ni otras
      // variables obligatorias (en la prueba de API no están cargadas).
      const claveConfigurada = cargarAdminInternalKey();
      const header = request.headers.authorization;
      const claveIntroducida = header === undefined ? undefined : header.replace(/^Bearer\s+/i, '');
      if (
        claveIntroducida === undefined ||
        claveConfigurada === undefined ||
        !compararEnTiempoConstante(claveConfigurada, claveIntroducida)
      ) {
        throw new ErrorDeDominio(
          'CLAVE_DE_SERVICIO_INVALIDA',
          'no_autenticado',
          'Clave de servicio ausente o inválida.',
        );
      }

      const resultado = await aprovisionarClinica(
        repositorioDeAprovisionamiento,
        request.body as CuerpoNuevaClinica,
      );
      return reply.code(201).send({ clinicaId: resultado.id, slug: resultado.slug });
    },
  );
}
