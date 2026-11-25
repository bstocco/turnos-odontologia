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

/** Reinicia el esquema, aplica las migraciones REALES y deja las clínicas sintéticas A y B. */
export async function prepararBaseDeExportacion(): Promise<EntornoDePrueba> {
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

/** Ejecuta `fn` como rol `app` dentro de `withTenant`. */
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

/** Secreto de prueba del token de acceso (no es un secreto real). */
export const SECRETO_DE_PRUEBA = 'secreto-de-prueba-c16-0123456789abcdef0123456789';

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

/** Construye la app con todos los módulos reales (fija el secreto JWT de prueba). */
export async function crearAppDePrueba(): Promise<FastifyInstance> {
  process.env.JWT_ACCESS_SECRET = SECRETO_DE_PRUEBA;
  const { app } = await appDePrueba(undefined, { JWT_ACCESS_SECRET: SECRETO_DE_PRUEBA });
  await app.ready();
  return app;
}

// --- insertores sintéticos ----------------------------------------------------------------------

export async function insertarProfesional(clinicaId: string, nombre: string): Promise<string> {
  const id = randomUUID();
  await comoApp(clinicaId, (c) =>
    c.query(
      `INSERT INTO profesional (id, clinica_id, nombre, apellido) VALUES ($1, $2, $3, 'Apellido')`,
      [id, clinicaId, nombre],
    ),
  );
  return id;
}

export async function insertarPaciente(
  clinicaId: string,
  nombre: string,
  apellido = 'Perez',
): Promise<string> {
  const id = randomUUID();
  await comoApp(clinicaId, (c) =>
    c.query(
      `INSERT INTO paciente (id, clinica_id, nombre, apellido, dni, telefono)
       VALUES ($1, $2, $3, $4, $5, '+5491100000000')`,
      [
        id,
        clinicaId,
        nombre,
        apellido,
        String(Math.floor(Math.random() * 90_000_000) + 10_000_000),
      ],
    ),
  );
  return id;
}

export async function insertarSillon(clinicaId: string, nombre: string): Promise<string> {
  const id = randomUUID();
  await comoApp(clinicaId, (c) =>
    c.query(`INSERT INTO sillon (id, clinica_id, nombre, buffer_minutos) VALUES ($1, $2, $3, 0)`, [
      id,
      clinicaId,
      nombre,
    ]),
  );
  return id;
}

export async function insertarPrestacion(clinicaId: string, nombre: string): Promise<string> {
  const id = randomUUID();
  await comoApp(clinicaId, (c) =>
    c.query(
      `INSERT INTO prestacion (id, clinica_id, nombre, duracion_minutos, activa)
       VALUES ($1, $2, $3, 30, TRUE)`,
      [id, clinicaId, nombre],
    ),
  );
  return id;
}

export async function insertarTurno(
  clinicaId: string,
  opts: {
    readonly pacienteId?: string;
    readonly profesionalId?: string;
    readonly sillonId?: string;
    readonly estado: string;
    readonly inicio: string;
  },
): Promise<string> {
  const id = randomUUID();
  await comoApp(clinicaId, (c) =>
    c.query(
      `INSERT INTO turno (id, clinica_id, paciente_id, profesional_id, sillon_id, estado, inicio, fin, fin_sillon)
       VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $7::timestamptz + interval '30 minutes',
               $7::timestamptz + interval '30 minutes')`,
      [
        id,
        clinicaId,
        opts.pacienteId ?? null,
        opts.profesionalId ?? null,
        opts.sillonId ?? null,
        opts.estado,
        opts.inicio,
      ],
    ),
  );
  return id;
}

export interface FilaDeAuditoria {
  readonly accion: string;
  readonly entidad: string;
  readonly actor_id: string | null;
}

export function auditoriaDe(clinicaId: string): Promise<FilaDeAuditoria[]> {
  return comoApp(clinicaId, async (c) => {
    const { rows } = await c.query<FilaDeAuditoria>(
      'SELECT accion, entidad, actor_id FROM auditoria ORDER BY id',
    );
    return rows;
  });
}
