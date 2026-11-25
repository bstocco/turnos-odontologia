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

export interface EntornoNotificaciones {
  readonly urlMigra: string;
  readonly urlApp: string;
}

export interface ClinicaSintetica {
  readonly id: string;
  readonly slug: string;
  readonly nombre: string;
}

/**
 * Reinicia el esquema `public` de pruebas, aplica todas las migraciones reales de `migrations/`
 * como `migra` y crea `CLINICA_A` y `CLINICA_B`. Limpia también trabajos previos en `pgboss`
 * si el esquema ya existía de una corrida anterior.
 */
export async function prepararBaseNotificaciones(): Promise<EntornoNotificaciones> {
  const config = configDeBaseDePrueba();
  const urlMigra = config.testDatabaseMigrationUrl as string;
  const urlApp = config.testDatabaseUrl as string;
  process.env.DATABASE_URL = urlApp;

  await reiniciarEsquema(urlMigra);
  await aplicarMigraciones({
    urlDeMigracion: urlMigra,
    directorio: join(process.cwd(), 'migrations'),
  });
  await limpiarColaYNotificaciones(urlMigra);
  await insertarConfigDeClinica(CLINICA_A);
  await insertarConfigDeClinica(CLINICA_B);
  return { urlMigra, urlApp };
}

/** Limpia `notificacion`, entidades de turno y trabajos/schedules de `pgboss` usando `migra`. */
export async function limpiarColaYNotificaciones(urlMigra: string): Promise<void> {
  await consultarComoMigra(
    urlMigra,
    `DO $$
    BEGIN
      IF to_regclass('public.notificacion') IS NOT NULL THEN
        TRUNCATE TABLE public.notificacion;
      END IF;
      IF to_regclass('public.turno') IS NOT NULL THEN
        TRUNCATE TABLE public.turno CASCADE;
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

let secuenciaSintetica = 40_000_000;

export interface OpcionesTurnoSintetico {
  readonly profesionalId?: string;
  readonly sillonId?: string;
  readonly prestacionId?: string;
  readonly pacienteId?: string;
  readonly pacienteNombre?: string;
  readonly pacienteApellido?: string;
  readonly pacienteEmail?: string | null;
  readonly profesionalNombre?: string;
  readonly profesionalApellido?: string;
  readonly prestacionNombre?: string;
  readonly inicio?: Date;
  readonly duracionMinutos?: number;
  readonly bufferMinutos?: number;
  readonly estado?:
    'pendiente_confirmacion' | 'confirmado' | 'cancelado' | 'reprogramado' | 'atendido' | 'ausente';
  readonly reprogramadoDe?: string | null;
}

export interface TurnoSinteticoCreado {
  readonly turnoId: string;
  readonly pacienteId: string;
  readonly profesionalId: string;
  readonly sillonId: string;
  readonly prestacionId: string;
}

/**
 * Crea un turno sintético válido (y sus recursos/paciente si no se proveen) dentro de `withTenant`.
 * Usa datos exclusivamente sintéticos (RN-DA-01).
 */
export async function crearTurnoSintetico(
  clinicaId: string,
  opciones: OpcionesTurnoSintetico = {},
): Promise<TurnoSinteticoCreado> {
  secuenciaSintetica += 1;
  const sufijo = String(secuenciaSintetica);

  return withTenant(clinicaId, async (cliente) => {
    const profesionalId = opciones.profesionalId ?? randomUUID();
    if (opciones.profesionalId === undefined) {
      await cliente.query(
        `INSERT INTO profesional (id, clinica_id, nombre, apellido)
         VALUES ($1, $2, $3, $4)`,
        [
          profesionalId,
          clinicaId,
          opciones.profesionalNombre ?? 'Sofía',
          opciones.profesionalApellido ?? `Profesional ${sufijo.slice(-3)}`,
        ],
      );
    }

    const sillonId = opciones.sillonId ?? randomUUID();
    if (opciones.sillonId === undefined) {
      await cliente.query(
        `INSERT INTO sillon (id, clinica_id, nombre, buffer_minutos)
         VALUES ($1, $2, $3, $4)`,
        [sillonId, clinicaId, `Sillón ${sufijo.slice(-3)}`, opciones.bufferMinutos ?? 0],
      );
    }

    const prestacionId = opciones.prestacionId ?? randomUUID();
    const duracionMinutos = opciones.duracionMinutos ?? 30;
    if (opciones.prestacionId === undefined) {
      await cliente.query(
        `INSERT INTO prestacion (id, clinica_id, nombre, duracion_minutos)
         VALUES ($1, $2, $3, $4)`,
        [prestacionId, clinicaId, opciones.prestacionNombre ?? 'Consulta general', duracionMinutos],
      );
    }

    const pacienteId = opciones.pacienteId ?? randomUUID();
    if (opciones.pacienteId === undefined) {
      const email =
        opciones.pacienteEmail === undefined
          ? `paciente.${sufijo}@ejemplo.test`
          : opciones.pacienteEmail;
      await cliente.query(
        `INSERT INTO paciente (id, clinica_id, nombre, apellido, dni, telefono, email)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          pacienteId,
          clinicaId,
          opciones.pacienteNombre ?? 'Lucas',
          opciones.pacienteApellido ?? 'Sintético',
          sufijo,
          `+54911${sufijo}`,
          email,
        ],
      );
    }

    const turnoId = randomUUID();
    const inicio = opciones.inicio ?? new Date('2026-12-10T14:00:00.000Z');
    const bufferMinutos = opciones.bufferMinutos ?? 0;
    const fin = new Date(inicio.getTime() + duracionMinutos * 60_000);
    const finSillon = new Date(fin.getTime() + bufferMinutos * 60_000);

    await cliente.query(
      `INSERT INTO turno (
         id, clinica_id, paciente_id, profesional_id, sillon_id, prestacion_id,
         inicio, fin, buffer_minutos, fin_sillon, estado, origen, reprogramado_de
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9, $10::timestamptz, $11, 'recepcion', $12)`,
      [
        turnoId,
        clinicaId,
        pacienteId,
        profesionalId,
        sillonId,
        prestacionId,
        inicio,
        fin,
        bufferMinutos,
        finSillon,
        opciones.estado ?? 'pendiente_confirmacion',
        opciones.reprogramadoDe ?? null,
      ],
    );

    return { turnoId, pacienteId, profesionalId, sillonId, prestacionId };
  });
}

/** Crea una clínica sintética adicional para aislar pruebas sin interferir con otras. */
export async function crearClinicaSintetica(prefijo = 'clinica-notif'): Promise<ClinicaSintetica> {
  const id = randomUUID();
  const clinica: ClinicaSintetica = {
    id,
    slug: `${prefijo}-${id.slice(0, 8)}`,
    nombre: `Clínica sintética ${id.slice(0, 8)}`,
  };
  await insertarConfigDeClinica(clinica);
  return clinica;
}

/** Ejecuta `fn` como rol `app` dentro de `withTenant`. */
export function comoApp<T>(
  clinicaId: string,
  fn: (cliente: pg.PoolClient) => Promise<T>,
): Promise<T> {
  return withTenant(clinicaId, fn);
}

/** Ejecuta `fn` como rol `app` SIN contexto de clínica. */
export async function comoAppSinContexto<T>(
  fn: (cliente: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const cliente = await poolDeLaAplicacion().connect();
  try {
    await cliente.query('BEGIN');
    try {
      const resultado = await fn(cliente);
      await cliente.query('COMMIT');
      return resultado;
    } catch (error) {
      await cliente.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  } finally {
    cliente.release();
  }
}

/** Cierra el pool de la aplicación al finalizar el archivo de pruebas. */
export async function cerrarPool(): Promise<void> {
  await poolDeLaAplicacion().end();
}
