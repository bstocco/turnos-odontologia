import { randomBytes, randomUUID } from 'node:crypto';

import { hashContrasena } from '../../../src/infrastructure/auth/contrasena.js';
import { withTenant } from '../../../src/infrastructure/db/tenant/with-tenant.js';

import type { EntornoE2E } from './entorno.js';

export type RolE2E = 'administrador' | 'recepcionista' | 'odontologo';

export interface ClinicaSintetica {
  readonly id: string;
  readonly slug: string;
  readonly nombre: string;
}

export interface UsuarioSintetico {
  readonly id: string;
  readonly email: string;
  /** Contraseña descartable generada para esta ejecución; no figura en ningún archivo. */
  readonly password: string;
  readonly rol: RolE2E;
}

/** Clave de servicio de la ejecución (la fija `entorno-descartable.ts`). */
export function claveInterna(): string {
  const clave = process.env.ADMIN_INTERNAL_KEY;
  if (clave === undefined || clave === '') throw new Error('Falta ADMIN_INTERNAL_KEY descartable.');
  return clave;
}

/**
 * Alta de una clínica con la ruta real `POST /api/v1/interno/clinicas` y un `slug` único por
 * flujo: así los flujos no dependen del orden ni de datos de otros (spec "Aislamiento entre flujos").
 */
export async function crearClinicaSintetica(
  entorno: EntornoE2E,
  flujo: string,
): Promise<ClinicaSintetica> {
  const sufijo = randomUUID().replaceAll('-', '').slice(0, 8);
  const slug = `e2e-${flujo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${sufijo}`;
  const nombre = `Clínica sintética ${slug}`;
  const respuesta = await entorno.inject({
    method: 'POST',
    url: '/api/v1/interno/clinicas',
    headers: { authorization: `Bearer ${claveInterna()}` },
    payload: { slug, nombre, email: `inicial.${sufijo}@ejemplo.invalid` },
  });
  if (respuesta.statusCode !== 201) {
    throw new Error(`El alta interna de la clínica respondió ${respuesta.statusCode}.`);
  }
  const { clinicaId } = respuesta.json() as { clinicaId: string };
  return { id: clinicaId, slug, nombre };
}

/**
 * Usuario del personal creado por fixture (SQL como el rol `app`, dentro de `withTenant`) con un
 * hash argon2id real. Es el camino disponible hoy: el alta interna descarta la contraseña
 * temporal (F2) y `POST /usuarios` no autentica (F1).
 */
export async function crearUsuarioSintetico(
  clinica: Pick<ClinicaSintetica, 'id'>,
  rol: RolE2E,
  opciones: { readonly profesionalId?: string; readonly activo?: boolean } = {},
): Promise<UsuarioSintetico> {
  const id = randomUUID();
  const password = randomBytes(18).toString('base64url');
  const email = `${rol}.${id.slice(0, 8)}@ejemplo.invalid`;
  const hash = await hashContrasena(password);
  await withTenant(clinica.id, async (cliente) => {
    // El rol `app` solo puede insertar estas columnas; `activo` toma su DEFAULT (C06_002).
    await cliente.query(
      `INSERT INTO usuario (id, clinica_id, email, hash_contrasena, rol, profesional_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, clinica.id, email, hash, rol, opciones.profesionalId ?? null],
    );
    if (opciones.activo === false) {
      await cliente.query(`UPDATE usuario SET activo = false WHERE clinica_id = $1 AND id = $2`, [
        clinica.id,
        id,
      ]);
    }
  });
  return { id, email, password, rol };
}
