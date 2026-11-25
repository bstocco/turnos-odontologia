import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import type pg from 'pg';

import { aplicarMigraciones } from '../../../src/infrastructure/db/ejecutor-de-migraciones.js';
import { poolDeLaAplicacion } from '../../../src/infrastructure/db/pool/index.js';
import { withTenant } from '../../../src/infrastructure/db/tenant/with-tenant.js';
import { CLINICA_A, CLINICA_B, insertarConfigDeClinica } from '../../support/aislamiento.js';
import {
  configDeBaseDePrueba,
  consultarComoMigra,
  reiniciarEsquema,
} from '../../support/base-de-datos.js';

export { CLINICA_A, CLINICA_B, consultarComoMigra };

export interface EntornoReservaPublica {
  readonly urlMigra: string;
  readonly urlApp: string;
}

export const SLUG_INACTIVA = 'clinica-inactiva-reserva-sintetica';
export const ID_INACTIVA = '88888888-8888-4888-8888-888888888888';

export async function prepararBaseReservaPublica(): Promise<EntornoReservaPublica> {
  const config = configDeBaseDePrueba();
  const urlMigra = config.testDatabaseMigrationUrl as string;
  const urlApp = config.testDatabaseUrl as string;
  process.env.DATABASE_URL = urlApp;

  await reiniciarEsquema(urlMigra);
  await aplicarMigraciones({
    urlDeMigracion: urlMigra,
    directorio: join(process.cwd(), 'migrations'),
  });
  await limpiarTablasReservaPublica(urlMigra);
  await insertarConfigDeClinica(CLINICA_A);
  await insertarConfigDeClinica(CLINICA_B);
  return { urlMigra, urlApp };
}

export async function limpiarTablasReservaPublica(urlMigra: string): Promise<void> {
  await consultarComoMigra(
    urlMigra,
    `DO $$
    BEGIN
      IF to_regclass('public.token_accion') IS NOT NULL THEN
        TRUNCATE TABLE public.token_accion CASCADE;
      END IF;
      IF to_regclass('public.codigo_verificacion') IS NOT NULL THEN
        TRUNCATE TABLE public.codigo_verificacion CASCADE;
      END IF;
      IF to_regclass('public.notificacion') IS NOT NULL THEN
        TRUNCATE TABLE public.notificacion CASCADE;
      END IF;
      IF to_regclass('public.auditoria') IS NOT NULL THEN
        ALTER TABLE public.auditoria DISABLE TRIGGER USER;
        TRUNCATE TABLE public.auditoria;
        ALTER TABLE public.auditoria ENABLE TRIGGER USER;
      END IF;
      IF to_regclass('public.turno') IS NOT NULL THEN
        TRUNCATE TABLE public.turno CASCADE;
      END IF;
      IF to_regclass('public.bloqueo') IS NOT NULL THEN
        TRUNCATE TABLE public.bloqueo CASCADE;
      END IF;
      IF to_regclass('public.feriado') IS NOT NULL THEN
        TRUNCATE TABLE public.feriado CASCADE;
      END IF;
      IF to_regclass('public.horario_atencion') IS NOT NULL THEN
        TRUNCATE TABLE public.horario_atencion CASCADE;
      END IF;
      IF to_regclass('public.paciente') IS NOT NULL THEN
        TRUNCATE TABLE public.paciente CASCADE;
      END IF;
      IF to_regclass('public.profesional') IS NOT NULL THEN
        TRUNCATE TABLE public.profesional CASCADE;
      END IF;
      IF to_regclass('public.sillon') IS NOT NULL THEN
        TRUNCATE TABLE public.sillon CASCADE;
      END IF;
      IF to_regclass('public.prestacion') IS NOT NULL THEN
        TRUNCATE TABLE public.prestacion CASCADE;
      END IF;
      IF to_regclass('pgboss.job') IS NOT NULL THEN
        DELETE FROM pgboss.job;
      END IF;
      IF to_regclass('pgboss.schedule') IS NOT NULL THEN
        DELETE FROM pgboss.schedule;
      END IF;
    END $$;`,
  );
}

export async function crearClinicaInactiva(urlMigra: string): Promise<string> {
  await consultarComoMigra(
    urlMigra,
    `INSERT INTO clinica (id, nombre, slug, activa)
     VALUES ($1, 'Clínica inactiva sintética', $2, FALSE)
     ON CONFLICT (id) DO UPDATE SET activa = FALSE`,
    [ID_INACTIVA, SLUG_INACTIVA],
  );
  await withTenant(ID_INACTIVA, (c) =>
    c.query(
      `INSERT INTO clinica_config (clinica_id) VALUES ($1) ON CONFLICT (clinica_id) DO NOTHING`,
      [ID_INACTIVA],
    ),
  );
  return ID_INACTIVA;
}

export function comoApp<T>(
  clinicaId: string,
  fn: (cliente: pg.PoolClient) => Promise<T>,
): Promise<T> {
  return withTenant(clinicaId, fn);
}

export async function comoAppSinContexto<T>(
  fn: (cliente: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const cliente = await poolDeLaAplicacion().connect();
  try {
    await cliente.query('BEGIN');
    try {
      const res = await fn(cliente);
      await cliente.query('COMMIT');
      return res;
    } catch (error) {
      await cliente.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  } finally {
    cliente.release();
  }
}

export async function cerrarPool(): Promise<void> {
  await poolDeLaAplicacion().end();
}

let secuencia = 50_000_000;

export async function crearTurnoMinimo(
  clinicaId: string,
  opciones: { readonly inicio?: Date; readonly estado?: string } = {},
): Promise<string> {
  secuencia += 1;
  const sufijo = String(secuencia);
  return withTenant(clinicaId, async (c) => {
    const profesionalId = randomUUID();
    const sillonId = randomUUID();
    const prestacionId = randomUUID();
    const pacienteId = randomUUID();
    const turnoId = randomUUID();
    const inicio = opciones.inicio ?? new Date('2026-12-20T14:00:00.000Z');
    const fin = new Date(inicio.getTime() + 30 * 60_000);

    await c.query(
      `INSERT INTO profesional (id, clinica_id, nombre, apellido) VALUES ($1, $2, 'Ana', 'Sintética')`,
      [profesionalId, clinicaId],
    );
    await c.query(`INSERT INTO sillon (id, clinica_id, nombre) VALUES ($1, $2, $3)`, [
      sillonId,
      clinicaId,
      `Sillón ${sufijo}`,
    ]);
    await c.query(
      `INSERT INTO prestacion (id, clinica_id, nombre, duracion_minutos) VALUES ($1, $2, 'Consulta', 30)`,
      [prestacionId, clinicaId],
    );
    await c.query(
      `INSERT INTO paciente (id, clinica_id, nombre, apellido, dni, telefono, email)
       VALUES ($1, $2, 'Juan', 'Sintético', $3, $4, $5)`,
      [pacienteId, clinicaId, sufijo, `+54911${sufijo}`, `p.${sufijo}@ejemplo.test`],
    );
    await c.query(
      `INSERT INTO turno (id, clinica_id, paciente_id, profesional_id, sillon_id, prestacion_id,
                          inicio, fin, buffer_minutos, fin_sillon, estado, origen)
       VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, 0, $8::timestamptz, $9, 'enlace_web')`,
      [
        turnoId,
        clinicaId,
        pacienteId,
        profesionalId,
        sillonId,
        prestacionId,
        inicio,
        fin,
        opciones.estado ?? 'pendiente_confirmacion',
      ],
    );
    return turnoId;
  });
}
