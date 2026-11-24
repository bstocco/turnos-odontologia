import type { PoolClient, Pool } from 'pg';

import { type RequestContext } from '../../application/shared/request-context.js';

/**
 * Repositorio de `usuario` y `token_refresco`: SQL explícito, dentro de la transacción
 * del tenant (`withTenant`). Los hashes de contraseñas y de refresh tokens vienen
 * ya calculados por los módulos de autenticación (argon2id y SHA-256).
 */

export interface UsuarioDePersonal {
  readonly id: string;
  readonly email: string;
  readonly hashContrasena: string;
  readonly rol: string;
  readonly profesionalId: string | undefined;
  readonly activo: boolean;
  readonly ultimoAcceso: Date | undefined;
}

export interface TokenDeRefrescoEnTabla {
  readonly usuarioId: string;
  readonly hash: string;
  readonly venceEn: Date;
}

interface FilaDeUsuario {
  id: string;
  email: string;
  hash_contrasena: string;
  rol: string;
  profesional_id: string | null;
  activo: boolean;
  ultimo_acceso: Date | null;
}

interface FilaDeTokenRefresco {
  id: string;
  usuario_id: string;
  hash_token: string;
  vence_en: Date;
  revoked_en: Date | null;
}

function aUsuario(fila: FilaDeUsuario): UsuarioDePersonal {
  return {
    id: fila.id,
    email: fila.email,
    hashContrasena: fila.hash_contrasena,
    rol: fila.rol,
    profesionalId: fila.profesional_id ?? undefined,
    activo: fila.activo,
    ultimoAcceso: fila.ultimo_acceso ?? undefined,
  };
}

/** Busca un usuario del personal por email dentro del contexto de la clínica. */
export async function buscarUsuarioPorEmail(
  cliente: PoolClient,
  clinicaId: string,
  email: string,
): Promise<UsuarioDePersonal | undefined> {
  const { rows } = await cliente.query<FilaDeUsuario>(
    'SELECT id, email, hash_contrasena, rol, profesional_id, activo, ultimo_acceso ' +
      'FROM usuario WHERE clinica_id = $1 AND email = $2',
    [clinicaId, email],
  );
  return rows[0] === undefined ? undefined : aUsuario(rows[0]);
}

/** Busca un usuario del personal por id dentro del contexto de la clínica. */
export async function buscarUsuarioPorId(
  cliente: PoolClient,
  clinicaId: string,
  id: string,
): Promise<UsuarioDePersonal | undefined> {
  const { rows } = await cliente.query<FilaDeUsuario>(
    'SELECT id, email, hash_contrasena, rol, profesional_id, activo, ultimo_acceso ' +
      'FROM usuario WHERE clinica_id = $1 AND id = $2',
    [clinicaId, id],
  );
  return rows[0] === undefined ? undefined : aUsuario(rows[0]);
}

/** Lista los usuarios del personal de la clínica (no devuelve hash de contraseñas). */
export async function listarUsuariosDeClinica(
  cliente: PoolClient,
  clinicaId: string,
): Promise<Omit<UsuarioDePersonal, 'hashContrasena'>[]> {
  const { rows } = await cliente.query<Omit<FilaDeUsuario, 'hash_contrasena'>>(
    'SELECT id, email, rol, profesional_id, activo, ultimo_acceso FROM usuario WHERE clinica_id = $1 ORDER BY email',
    [clinicaId],
  );
  return rows.map((fila) => ({
    id: fila.id,
    email: fila.email,
    rol: fila.rol,
    profesionalId: fila.profesional_id ?? undefined,
    activo: fila.activo,
    ultimoAcceso: fila.ultimo_acceso ?? undefined,
  }));
}

/** Inserta un usuario del personal; devuelve su id. */
export async function crearUsuarioDePersonal(
  cliente: PoolClient,
  clinicaId: string,
  datos: {
    readonly email: string;
    readonly hashContrasena: string;
    readonly rol: UsuarioDePersonal['rol'];
    readonly profesionalId: string | undefined;
  },
): Promise<string> {
  const { rows } = await cliente.query<{ id: string }>(
    'INSERT INTO usuario (id, clinica_id, email, hash_contrasena, rol, profesional_id) ' +
      'VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) RETURNING id',
    [clinicaId, datos.email, datos.hashContrasena, datos.rol, datos.profesionalId ?? null],
  );
  return rows[0]?.id ?? '';
}

/** Actualiza un usuario del personal dentro del contexto de la clínica. */
export async function actualizarUsuarioDePersonal(
  cliente: PoolClient,
  clinicaId: string,
  id: string,
  datos: { readonly rol?: UsuarioDePersonal['rol']; readonly profesionalId?: string; readonly activo?: boolean },
): Promise<void> {
  await cliente.query(
    'UPDATE usuario SET rol = COALESCE($3, rol), profesional_id = COALESCE($4, profesional_id), activo = COALESCE($5, activo) ' +
      'WHERE clinica_id = $1 AND id = $2',
    [clinicaId, id, datos.rol ?? null, datos.profesionalId ?? null, datos.activo ?? null],
  );
}

/** Elimina un usuario del personal dentro del contexto de la clínica. */
export async function eliminarUsuarioDePersonal(
  cliente: PoolClient,
  clinicaId: string,
  id: string,
): Promise<void> {
  await cliente.query('DELETE FROM usuario WHERE clinica_id = $1 AND id = $2', [clinicaId, id]);
}

/** Busca un token de refresco por hash dentro del contexto de la clínica. */
export async function buscarTokenDeRefrescoPorHash(
  cliente: PoolClient,
  clinicaId: string,
  hash: string,
): Promise<{ id: string; usuarioId: string; venceEn: Date; revocadaEn: Date | undefined } | undefined> {
  const { rows } = await cliente.query<FilaDeTokenRefresco>(
    'SELECT id, usuario_id, vence_en, revoked_en FROM token_refresco WHERE clinica_id = $1 AND hash_token = $2',
    [clinicaId, hash],
  );
  const fila = rows[0];
  return fila === undefined
    ? undefined
    : {
        id: fila.id,
        usuarioId: fila.usuario_id,
        venceEn: fila.vence_en,
        revocadaEn: fila.revoked_en ?? undefined,
      };
}

/** Registra el token de refresco creado en `token_refresco`. */
export async function crearTokenDeRefrescoEnTabla(
  cliente: PoolClient,
  datos: TokenDeRefrescoEnTabla & { readonly clinicaId: string },
): Promise<void> {
  await cliente.query(
    'INSERT INTO token_refresco (id, clinica_id, usuario_id, hash_token, vence_en) VALUES (gen_random_uuid(), $1, $2, $3, $4)',
    [datos.clinicaId, datos.usuarioId, datos.hash, datos.venceEn],
  );
}

/** Marca revocado el token de refresco (revocación). */
export async function revocarTokenDeRefresco(
  cliente: PoolClient,
  clinicaId: string,
  id: string,
): Promise<void> {
  await cliente.query('UPDATE token_refresco SET revoked_en = now() WHERE clinica_id = $1 AND id = $2', [
    clinicaId,
    id,
  ]);
}

/** Busca la clínica por slug: el catálogo `clinica` no tiene RLS (directorio público). */
export async function buscarClinicaPorSlug(pool: Pool, slug: string): Promise<string | undefined> {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM clinica WHERE slug = $1', [slug]);
  return rows[0]?.id;
}

/** Tipos re-exportados para los consumidores de autenticación. */
export type { RequestContext as ContextoDePedido } from '../../application/shared/request-context.js';
