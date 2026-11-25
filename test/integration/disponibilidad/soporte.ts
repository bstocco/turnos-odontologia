import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import { aplicarMigraciones } from '../../../src/infrastructure/db/ejecutor-de-migraciones.js';
import { poolDeLaAplicacion } from '../../../src/infrastructure/db/pool/index.js';
import { withTenant } from '../../../src/infrastructure/db/tenant/with-tenant.js';
import { CLINICA_A, CLINICA_B, insertarConfigDeClinica } from '../../support/aislamiento.js';
import { appDePrueba, capturarLogs } from '../../support/app-de-prueba.js';
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

/** Slug de una clínica sintética inactiva (la crea `crearClinicaInactiva`). */
export const SLUG_INACTIVA = 'clinica-inactiva-sintetica';
const ID_INACTIVA = '77777777-7777-4777-8777-777777777777';

/**
 * Reinicia el esquema, aplica las migraciones REALES y deja las clínicas sintéticas A y B con su
 * `clinica_config`. Apunta el pool de la aplicación a la base de pruebas. Solo datos sintéticos.
 */
export async function prepararBaseDeDisponibilidad(): Promise<EntornoDePrueba> {
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

/** Crea (como `migra`) una clínica sintética con `activa = false`. */
export async function crearClinicaInactiva(urlMigra: string): Promise<string> {
  await consultarComoMigra(
    urlMigra,
    `INSERT INTO clinica (id, nombre, slug, activa) VALUES ($1, 'Clínica inactiva sintética', $2, FALSE)
     ON CONFLICT (id) DO NOTHING`,
    [ID_INACTIVA, SLUG_INACTIVA],
  );
  return ID_INACTIVA;
}

/** Ejecuta `fn` como rol `app` dentro de `withTenant`. */
export function comoApp<T>(
  clinicaId: string,
  fn: (cliente: pg.PoolClient) => Promise<T>,
): Promise<T> {
  return withTenant(clinicaId, fn);
}

export async function cerrarPool(): Promise<void> {
  await poolDeLaAplicacion().end();
}

export interface AppPublica {
  readonly app: FastifyInstance;
  readonly logs: ReturnType<typeof capturarLogs>;
}

/**
 * App completa con módulos reales. `extra` permite fijar variables como `RATE_LIMIT_PUBLIC`
 * (el módulo lee `process.env` al registrarse, igual que `pluginDeAutenticacion`).
 */
export async function crearAppPublica(extra: Record<string, string> = {}): Promise<AppPublica> {
  const { app, logs } = await appDePrueba(undefined, extra);
  await app.ready();
  return { app, logs };
}

// --- datos sintéticos --------------------------------------------------------------------------

export async function insertarProfesional(
  clinicaId: string,
  datos: { nombre?: string; apellido?: string; matricula?: string | null; activo?: boolean } = {},
): Promise<string> {
  const id = randomUUID();
  await comoApp(clinicaId, (c) =>
    c.query(
      `INSERT INTO profesional (id, clinica_id, nombre, apellido, matricula, activo)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        clinicaId,
        datos.nombre ?? 'Nombre',
        datos.apellido ?? 'Apellido',
        datos.matricula ?? null,
        datos.activo ?? true,
      ],
    ),
  );
  return id;
}

export async function insertarPrestacion(
  clinicaId: string,
  nombre: string,
  duracionMinutos: number,
  activa = true,
): Promise<string> {
  const id = randomUUID();
  await comoApp(clinicaId, (c) =>
    c.query(
      `INSERT INTO prestacion (id, clinica_id, nombre, duracion_minutos, activa)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, clinicaId, nombre, duracionMinutos, activa],
    ),
  );
  return id;
}

export async function insertarSillon(
  clinicaId: string,
  nombre: string,
  bufferMinutos = 0,
  activo = true,
): Promise<string> {
  const id = randomUUID();
  await comoApp(clinicaId, (c) =>
    c.query(
      `INSERT INTO sillon (id, clinica_id, nombre, buffer_minutos, activo)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, clinicaId, nombre, bufferMinutos, activo],
    ),
  );
  return id;
}

let secuenciaDni = 20_000_000;

export async function insertarPaciente(clinicaId: string, nombre: string): Promise<string> {
  const id = randomUUID();
  await comoApp(clinicaId, (c) =>
    c.query(
      `INSERT INTO paciente (id, clinica_id, nombre, apellido, dni, telefono)
       VALUES ($1, $2, $3, 'Sintetico', $4, '+5491100000000')`,
      [id, clinicaId, nombre, String(secuenciaDni++)],
    ),
  );
  return id;
}

export async function insertarHorario(
  clinicaId: string,
  profesionalId: string,
  diaSemana: number,
  desde: string,
  hasta: string,
): Promise<void> {
  await comoApp(clinicaId, (c) =>
    c.query(
      `INSERT INTO horario_atencion (id, clinica_id, profesional_id, dia_semana, hora_desde, hora_hasta)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
      [clinicaId, profesionalId, diaSemana, desde, hasta],
    ),
  );
}

export async function insertarFeriado(clinicaId: string, fecha: string): Promise<void> {
  await comoApp(clinicaId, (c) =>
    c.query(
      `INSERT INTO feriado (clinica_id, fecha, descripcion) VALUES ($1, $2, 'feriado sintético')`,
      [clinicaId, fecha],
    ),
  );
}

export async function insertarBloqueo(
  clinicaId: string,
  profesionalId: string,
  inicio: string,
  fin: string,
): Promise<void> {
  // C12_001: `bloqueo.creado_por` tiene FK a `usuario`; el usuario de prueba se crea antes.
  await comoApp(clinicaId, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      'INSERT INTO usuario (id, clinica_id, email, hash_contrasena, rol, profesional_id) ' +
        'VALUES (gen_random_uuid(), $1, $2, $3, $4, NULL) RETURNING id',
      [
        clinicaId,
        `usuario.sintetico.${randomUUID()}@example.com`,
        'hash-sintetico-no-real',
        'administrador',
      ],
    );
    const creadoPor = rows[0]?.id;
    if (creadoPor === undefined) throw new Error('No se pudo crear el usuario sintético.');
    await c.query(
      `INSERT INTO bloqueo (clinica_id, profesional_id, inicio, fin, motivo, creado_por)
       VALUES ($1, $2, $3, $4, 'motivo sintético reservado', $5)`,
      [clinicaId, profesionalId, inicio, fin, creadoPor],
    );
  });
}

export interface TurnoSintetico {
  readonly pacienteId: string;
  readonly profesionalId: string;
  readonly sillonId: string;
  readonly prestacionId: string;
  /** ISO UTC. */
  readonly inicio: string;
  readonly minutos: number;
  readonly buffer?: number;
  readonly estado?: string;
}

export async function insertarTurnoSintetico(
  clinicaId: string,
  t: TurnoSintetico,
): Promise<string> {
  const id = randomUUID();
  const buffer = t.buffer ?? 0;
  await comoApp(clinicaId, (c) =>
    c.query(
      `INSERT INTO turno (id, clinica_id, paciente_id, profesional_id, sillon_id, prestacion_id,
                          inicio, fin, buffer_minutos, fin_sillon, estado, origen)
       VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz,
               $7::timestamptz + make_interval(mins => $8), $9,
               $7::timestamptz + make_interval(mins => $8 + $9), $10, 'recepcion')`,
      [
        id,
        clinicaId,
        t.pacienteId,
        t.profesionalId,
        t.sillonId,
        t.prestacionId,
        t.inicio,
        t.minutos,
        buffer,
        t.estado ?? 'confirmado',
      ],
    ),
  );
  return id;
}

/** Granularidad de la clínica (por defecto 15). */
export async function fijarGranularidad(clinicaId: string, minutos: number): Promise<void> {
  await comoApp(clinicaId, (c) =>
    c.query('UPDATE clinica_config SET granularidad_minutos = $1 WHERE clinica_id = $2', [
      minutos,
      clinicaId,
    ]),
  );
}
