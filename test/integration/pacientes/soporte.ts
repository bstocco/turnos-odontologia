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

/* Soporte de las pruebas de C-10: solo datos sintéticos (regla dura 2), sin tocar test/support. */

/**
 * Reinicia el esquema, aplica las migraciones REALES con el rol `migra` y deja dos clínicas
 * sintéticas (A y B). Apunta el pool de la aplicación a la base de pruebas.
 */
export async function prepararBaseDePacientes(): Promise<void> {
  const config = configDeBaseDePrueba();
  const urlMigra = config.testDatabaseMigrationUrl as string;
  process.env.DATABASE_URL = config.testDatabaseUrl as string;
  await reiniciarEsquema(urlMigra);
  await aplicarMigraciones({
    urlDeMigracion: urlMigra,
    directorio: join(process.cwd(), 'migrations'),
  });
  await insertarConfigDeClinica(CLINICA_A);
  await insertarConfigDeClinica(CLINICA_B);
}

export function comoApp<T>(
  clinicaId: string,
  fn: (cliente: pg.PoolClient) => Promise<T>,
): Promise<T> {
  return withTenant(clinicaId, fn);
}

export async function cerrarPool(): Promise<void> {
  await poolDeLaAplicacion().end();
}

export async function insertarProfesional(
  clinicaId: string,
  apellido = 'Apellido',
): Promise<string> {
  const id = randomUUID();
  await comoApp(clinicaId, (c) =>
    c.query(
      `INSERT INTO profesional (id, clinica_id, nombre, apellido) VALUES ($1, $2, 'Nombre', $3)`,
      [id, clinicaId, apellido],
    ),
  );
  return id;
}

export type Rol = 'administrador' | 'recepcionista' | 'odontologo';

export async function insertarUsuario(
  clinicaId: string,
  rol: Rol,
  profesionalId: string | null = null,
): Promise<string> {
  const id = randomUUID();
  await comoApp(clinicaId, (c) =>
    c.query(
      `INSERT INTO usuario (id, clinica_id, email, hash_contrasena, rol, profesional_id)
       VALUES ($1, $2, $3, 'hash-sintetico-no-real', $4, $5)`,
      [id, clinicaId, `${id}@ejemplo.invalid`, rol, profesionalId],
    ),
  );
  return id;
}

export interface PacienteSintetico {
  readonly id?: string;
  readonly nombre?: string;
  readonly apellido: string;
  readonly dni: string;
  readonly telefono?: string;
  readonly email?: string | null;
  readonly obraSocial?: string | null;
}

export async function insertarPaciente(clinicaId: string, p: PacienteSintetico): Promise<string> {
  const id = p.id ?? randomUUID();
  await comoApp(clinicaId, (c) =>
    c.query(
      `INSERT INTO paciente (id, clinica_id, nombre, apellido, dni, telefono, email, obra_social)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        clinicaId,
        p.nombre ?? 'Nombre',
        p.apellido,
        p.dni,
        p.telefono ?? '+5491155550000',
        p.email ?? null,
        p.obraSocial ?? null,
      ],
    ),
  );
  return id;
}

let contadorDeTurnos = 0;

/** Inserta un turno sintético; cada llamada usa una franja distinta (sin solapes de profesional). */
export async function insertarTurno(
  clinicaId: string,
  pacienteId: string,
  profesionalId: string,
  estado: string,
): Promise<string> {
  const id = randomUUID();
  contadorDeTurnos += 1;
  const inicio = new Date(Date.UTC(2031, 0, 1, 0, 0, 0) + contadorDeTurnos * 60 * 60 * 1000);
  const fin = new Date(inicio.getTime() + 30 * 60 * 1000);
  await comoApp(clinicaId, (c) =>
    c.query(
      `INSERT INTO turno (id, clinica_id, paciente_id, profesional_id, inicio, fin, fin_sillon, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7)`,
      [id, clinicaId, pacienteId, profesionalId, inicio, fin, estado],
    ),
  );
  return id;
}

// --- API: app completa (módulos reales) con tokens firmados por rol --------------------------

export const SECRETO_DE_PRUEBA = 'secreto-de-prueba-c10-0123456789abcdef0123456789';

export async function crearAppDePrueba(): Promise<{
  app: FastifyInstance;
  logs: Awaited<ReturnType<typeof appDePrueba>>['logs'];
}> {
  process.env.JWT_ACCESS_SECRET = SECRETO_DE_PRUEBA;
  const construida = await appDePrueba(undefined, { JWT_ACCESS_SECRET: SECRETO_DE_PRUEBA });
  await construida.app.ready();
  return construida;
}

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

export async function contarAuditoria(clinicaId: string): Promise<number> {
  const { rows } = await comoApp(clinicaId, (c) =>
    c.query<{ n: string }>('SELECT count(*)::text AS n FROM auditoria'),
  );
  return Number(rows[0]?.n);
}
