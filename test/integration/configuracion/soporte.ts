import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import { firmarTokenDeAcceso } from '../../../src/infrastructure/auth/jwt.js';

import { aplicarMigraciones } from '../../../src/infrastructure/db/ejecutor-de-migraciones.js';
import { poolDeLaAplicacion } from '../../../src/infrastructure/db/pool/index.js';
import { withTenant } from '../../../src/infrastructure/db/tenant/with-tenant.js';
import { CLINICA_A, CLINICA_B, insertarConfigDeClinica } from '../../support/aislamiento.js';
import { appDePrueba } from '../../support/app-de-prueba.js';
import {
  configDeBaseDePrueba,
  consultarComoMigra,
  reiniciarEsquema,
} from '../../support/base-de-datos.js';

export { CLINICA_A, CLINICA_B, consultarComoMigra };

export interface EntornoDePrueba {
  readonly urlMigra: string;
  readonly urlApp: string;
}

/**
 * Reinicia el esquema, aplica las migraciones REALES de `migrations/` con el rol `migra` y deja
 * dos clínicas sintéticas (A y B) con `clinica_config` por defecto. Apunta el pool de la
 * aplicación a la base de pruebas. Solo datos sintéticos (regla 2).
 */
export async function prepararBaseDeConfiguracion(): Promise<EntornoDePrueba> {
  const config = configDeBaseDePrueba();
  const urlMigra = config.testDatabaseMigrationUrl as string;
  const urlApp = config.testDatabaseUrl as string;
  process.env.DATABASE_URL = urlApp;

  await reiniciarEsquema(urlMigra);
  await aplicarMigraciones({
    urlDeMigracion: urlMigra,
    directorio: join(process.cwd(), 'migrations'),
  });
  await insertarConfigDeClinica(CLINICA_A);
  await insertarConfigDeClinica(CLINICA_B);
  return { urlMigra, urlApp };
}

/** Ejecuta `fn` como rol `app` dentro de `withTenant` (transacción con contexto de clínica). */
export function comoApp<T>(
  clinicaId: string,
  fn: (cliente: pg.PoolClient) => Promise<T>,
): Promise<T> {
  return withTenant(clinicaId, fn);
}

/** Cierra el pool de la aplicación al terminar el archivo de pruebas. */
export async function cerrarPool(): Promise<void> {
  await poolDeLaAplicacion().end();
}

/** Inserta un profesional sintético y devuelve su id. */
export async function insertarProfesional(
  clinicaId: string,
  nombre = 'Nombre',
  apellido = 'Apellido',
): Promise<string> {
  const id = randomUUID();
  await comoApp(clinicaId, (c) =>
    c.query(`INSERT INTO profesional (id, clinica_id, nombre, apellido) VALUES ($1, $2, $3, $4)`, [
      id,
      clinicaId,
      nombre,
      apellido,
    ]),
  );
  return id;
}

/** Inserta un usuario sintético (hash de mentira) y devuelve su id. */
export async function insertarUsuario(
  clinicaId: string,
  rol: 'administrador' | 'recepcionista' | 'odontologo',
  profesionalId: string | null = null,
  activo = true,
): Promise<string> {
  const id = randomUUID();
  await comoApp(clinicaId, async (c) => {
    await c.query(
      `INSERT INTO usuario (id, clinica_id, email, hash_contrasena, rol, profesional_id)
       VALUES ($1, $2, $3, 'hash-sintetico-no-real', $4, $5)`,
      [id, clinicaId, `${id}@ejemplo.invalid`, rol, profesionalId],
    );
    if (!activo) await c.query('UPDATE usuario SET activo = FALSE WHERE id = $1', [id]);
  });
  return id;
}

// --- API: app completa (módulos reales) con tokens firmados por rol --------------------------

/** Secreto de prueba del token de acceso (no es un secreto real). */
export const SECRETO_DE_PRUEBA = 'secreto-de-prueba-c08-0123456789abcdef0123456789';

/**
 * Construye la app con todos los módulos reales. `pluginDeAutenticacion` lee `loadConfig('app')`
 * del entorno del proceso, así que el secreto y la base se fijan ahí antes de construirla.
 */
export async function crearAppDePrueba(): Promise<FastifyInstance> {
  process.env.JWT_ACCESS_SECRET = SECRETO_DE_PRUEBA;
  const { app } = await appDePrueba(undefined, { JWT_ACCESS_SECRET: SECRETO_DE_PRUEBA });
  await app.ready();
  return app;
}

export type Rol = 'administrador' | 'recepcionista' | 'odontologo';

/** Cabecera `Authorization` con un token de acceso válido del rol y la clínica indicados. */
export async function autorizacion(
  rol: Rol,
  clinicaId: string,
  usuarioId: string = randomUUID(),
): Promise<{ authorization: string }> {
  const token = await firmarTokenDeAcceso(SECRETO_DE_PRUEBA, { clinicaId, usuarioId, rol });
  return { authorization: `Bearer ${token}` };
}

export interface FilaDeAuditoria {
  readonly accion: string;
  readonly entidad: string;
  readonly entidad_id: string | null;
  readonly actor_id: string | null;
  readonly actor_tipo: string;
  readonly datos_antes: unknown;
  readonly datos_despues: unknown;
  readonly ip: string | null;
}

/** Registros de auditoría de la clínica para una entidad (y opcionalmente un `entidad_id`). */
export function auditoriaDe(
  clinicaId: string,
  entidad: string,
  entidadId?: string,
): Promise<FilaDeAuditoria[]> {
  return comoApp(clinicaId, async (c) => {
    const { rows } = await c.query<FilaDeAuditoria>(
      `SELECT accion, entidad, entidad_id::text AS entidad_id, actor_id, actor_tipo,
              datos_antes, datos_despues, host(ip) AS ip
         FROM auditoria
        WHERE entidad = $1 AND ($2::uuid IS NULL OR entidad_id = $2::uuid)
        ORDER BY ocurrio_en, id`,
      [entidad, entidadId ?? null],
    );
    return rows;
  });
}
