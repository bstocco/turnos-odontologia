import { crearTokenDeRefresco } from '../../../src/infrastructure/auth/refresco.js';
import { crearTokenDeRefrescoEnTabla } from '../../../src/infrastructure/auth/repositorio-de-usuarios.js';
import { withTenant } from '../../../src/infrastructure/db/tenant/with-tenant.js';

import type { EntornoE2E } from './entorno.js';

export interface Sesion {
  readonly token: string;
  readonly encabezados: { readonly authorization: string };
}

/**
 * Inicio de sesión con la ruta real `POST /api/v1/auth/login`. Cada login sale de una IP distinta
 * (por defecto en `inject`) para no agotar el límite de 5/min por IP del módulo `auth`, cuyo
 * contador es compartido por todo el proceso.
 */
export async function iniciarSesion(
  entorno: EntornoE2E,
  slug: string,
  email: string,
  password: string,
): Promise<Sesion> {
  const respuesta = await entorno.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { slug, email, password },
  });
  if (respuesta.statusCode !== 200) {
    throw new Error(`El inicio de sesión respondió ${respuesta.statusCode}.`);
  }
  const { token } = respuesta.json() as { token: string };
  return { token, encabezados: { authorization: `Bearer ${token}` } };
}

/**
 * Emite por fixture el token de refresco que `POST /auth/login` crea y descarta (defecto F5: el
 * login no lo entrega al cliente). Es el mismo código de la aplicación: `crearTokenDeRefresco` y
 * su registro en `token_refresco` con `withTenant`.
 */
export async function emitirRefrescoSintetico(
  clinicaId: string,
  usuarioId: string,
): Promise<string> {
  const creado = crearTokenDeRefresco(clinicaId);
  await withTenant(clinicaId, (cliente) =>
    crearTokenDeRefrescoEnTabla(cliente, {
      clinicaId,
      usuarioId,
      hash: creado.hash,
      venceEn: creado.venceEn,
    }),
  );
  return creado.token;
}
