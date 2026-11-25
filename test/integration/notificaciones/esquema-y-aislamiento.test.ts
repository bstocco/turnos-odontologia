import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { aplicarMigraciones } from '../../../src/infrastructure/db/ejecutor-de-migraciones.js';
import { reiniciarEsquema } from '../../support/base-de-datos.js';

import {
  CLINICA_A,
  CLINICA_B,
  cerrarPool,
  comoApp,
  comoAppSinContexto,
  consultarComoMigra,
  crearTurnoSintetico,
  limpiarColaYNotificaciones,
  prepararBaseNotificaciones,
  type EntornoNotificaciones,
} from './soporte.js';

let entorno: EntornoNotificaciones;

beforeAll(async () => {
  entorno = await prepararBaseNotificaciones();
});

beforeEach(async () => {
  await limpiarColaYNotificaciones(entorno.urlMigra);
});

afterAll(async () => {
  await cerrarPool();
});

describe('C-11 esquema notificacion y pgboss', () => {
  it('crea tabla notificacion propiedad de migra con índices y privilegios SELECT/INSERT/UPDATE para app', async () => {
    const tablas = await consultarComoMigra<{ tableowner: string; rowsecurity: boolean }>(
      entorno.urlMigra,
      `SELECT t.tableowner, c.relrowsecurity AS rowsecurity
       FROM pg_tables t
       JOIN pg_class c ON c.relname = t.tablename
       JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
       WHERE t.schemaname = 'public' AND t.tablename = 'notificacion'`,
    );
    expect(tablas).toEqual([{ tableowner: 'migra', rowsecurity: true }]);

    const rlsForzada = await consultarComoMigra<{ relforcerowsecurity: boolean }>(
      entorno.urlMigra,
      `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'notificacion'`,
    );
    expect(rlsForzada).toEqual([{ relforcerowsecurity: true }]);

    const indices = await consultarComoMigra<{ indexname: string }>(
      entorno.urlMigra,
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'notificacion'`,
    );
    const nombresIndices = indices.map((i) => i.indexname);
    expect(nombresIndices).toContain('notificacion_clinica_estado_programada_idx');
    expect(nombresIndices).toContain('notificacion_clinica_turno_idx');
    expect(nombresIndices).toContain('notificacion_clinica_idempotencia_unique');

    const privilegios = await consultarComoMigra<{ privilege_type: string }>(
      entorno.urlMigra,
      `SELECT privilege_type
       FROM information_schema.table_privileges
       WHERE grantee = 'app' AND table_schema = 'public' AND table_name = 'notificacion'
       ORDER BY privilege_type`,
    );
    expect(privilegios.map((p) => p.privilege_type)).toEqual(['INSERT', 'SELECT', 'UPDATE']);
  });

  it('valida los 6 tipos, coherencia tipo=codigo/turno_id, estado/enviada_en e intentos >= 0', async () => {
    const tipos = [
      'creacion',
      'confirmacion',
      'recordatorio',
      'cancelacion',
      'reprogramacion',
      'codigo',
    ] as const;

    const { turnoId } = await crearTurnoSintetico(CLINICA_A.id);

    for (const tipo of tipos) {
      const id = randomUUID();
      await comoApp(CLINICA_A.id, async (cliente) => {
        await cliente.query(
          `INSERT INTO notificacion (id, clinica_id, turno_id, canal, tipo, clave_idempotencia)
           VALUES ($1, $2, $3, 'email', $4, $5)`,
          [id, CLINICA_A.id, tipo === 'codigo' ? null : turnoId, tipo, `clave-${tipo}-${id}`],
        );
      });
    }

    // tipo inválido → 23514
    await expect(
      comoApp(CLINICA_A.id, (cliente) =>
        cliente.query(
          `INSERT INTO notificacion (id, clinica_id, canal, tipo, clave_idempotencia)
           VALUES ($1, $2, 'email', 'otro', $3)`,
          [randomUUID(), CLINICA_A.id, `clave-${randomUUID()}`],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });

    // tipo='codigo' con turno_id no nulo → 23514
    await expect(
      comoApp(CLINICA_A.id, (cliente) =>
        cliente.query(
          `INSERT INTO notificacion (id, clinica_id, turno_id, canal, tipo, clave_idempotencia)
           VALUES ($1, $2, $3, 'email', 'codigo', $4)`,
          [randomUUID(), CLINICA_A.id, randomUUID(), `clave-${randomUUID()}`],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });

    // estado='enviada' sin enviada_en → 23514
    await expect(
      comoApp(CLINICA_A.id, (cliente) =>
        cliente.query(
          `INSERT INTO notificacion (id, clinica_id, canal, tipo, estado, clave_idempotencia)
           VALUES ($1, $2, 'email', 'creacion', 'enviada', $3)`,
          [randomUUID(), CLINICA_A.id, `clave-${randomUUID()}`],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });

    // estado='pendiente' con enviada_en no nulo → 23514
    await expect(
      comoApp(CLINICA_A.id, (cliente) =>
        cliente.query(
          `INSERT INTO notificacion (id, clinica_id, canal, tipo, estado, enviada_en, clave_idempotencia)
           VALUES ($1, $2, 'email', 'creacion', 'pendiente', now(), $3)`,
          [randomUUID(), CLINICA_A.id, `clave-${randomUUID()}`],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });

    // intentos < 0 → 23514
    await expect(
      comoApp(CLINICA_A.id, (cliente) =>
        cliente.query(
          `INSERT INTO notificacion (id, clinica_id, canal, tipo, intentos, clave_idempotencia)
           VALUES ($1, $2, 'email', 'creacion', -1, $3)`,
          [randomUUID(), CLINICA_A.id, `clave-${randomUUID()}`],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('impone unicidad de clave_idempotencia dentro de la clínica y la permite en otra clínica', async () => {
    const claveCompartida = `turno-creacion-${randomUUID()}`;

    await comoApp(CLINICA_A.id, (cliente) =>
      cliente.query(
        `INSERT INTO notificacion (id, clinica_id, canal, tipo, clave_idempotencia)
         VALUES ($1, $2, 'email', 'creacion', $3)`,
        [randomUUID(), CLINICA_A.id, claveCompartida],
      ),
    );

    await expect(
      comoApp(CLINICA_A.id, (cliente) =>
        cliente.query(
          `INSERT INTO notificacion (id, clinica_id, canal, tipo, clave_idempotencia)
           VALUES ($1, $2, 'email', 'creacion', $3)`,
          [randomUUID(), CLINICA_A.id, claveCompartida],
        ),
      ),
    ).rejects.toMatchObject({ code: '23505' });

    await comoApp(CLINICA_B.id, (cliente) =>
      cliente.query(
        `INSERT INTO notificacion (id, clinica_id, canal, tipo, clave_idempotencia)
         VALUES ($1, $2, 'email', 'creacion', $3)`,
        [randomUUID(), CLINICA_B.id, claveCompartida],
      ),
    );
  });

  it('aísla notificaciones entre clínicas, falla cerrado sin contexto y rechaza DELETE para app', async () => {
    const idA = randomUUID();
    const idB = randomUUID();

    await comoApp(CLINICA_A.id, (cliente) =>
      cliente.query(
        `INSERT INTO notificacion (id, clinica_id, canal, tipo, clave_idempotencia)
         VALUES ($1, $2, 'email', 'creacion', $3)`,
        [idA, CLINICA_A.id, `clave-${idA}`],
      ),
    );

    await comoApp(CLINICA_B.id, (cliente) =>
      cliente.query(
        `INSERT INTO notificacion (id, clinica_id, canal, tipo, clave_idempotencia)
         VALUES ($1, $2, 'email', 'confirmacion', $3)`,
        [idB, CLINICA_B.id, `clave-${idB}`],
      ),
    );

    const filasA = await comoApp(CLINICA_A.id, async (cliente) => {
      const res = await cliente.query<{ id: string }>('SELECT id FROM notificacion');
      return res.rows.map((r) => r.id);
    });
    expect(filasA).toEqual([idA]);

    const filasSinContexto = await comoAppSinContexto(async (cliente) => {
      const res = await cliente.query<{ id: string }>('SELECT id FROM notificacion');
      return res.rows;
    });
    expect(filasSinContexto).toEqual([]);

    // Inserción cruzada rechazada por RLS (42501)
    await expect(
      comoApp(CLINICA_A.id, (cliente) =>
        cliente.query(
          `INSERT INTO notificacion (id, clinica_id, canal, tipo, clave_idempotencia)
           VALUES ($1, $2, 'email', 'creacion', $3)`,
          [randomUUID(), CLINICA_B.id, `clave-cruzada-${randomUUID()}`],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });

    // DELETE rechazado para app (42501)
    await expect(
      comoApp(CLINICA_A.id, (cliente) =>
        cliente.query('DELETE FROM notificacion WHERE id = $1', [idA]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('impone FK compuesta (clinica_id, turno_id) -> turno (clinica_id, id) y preserva tipo=codigo con turno_id NULL (C14_001)', async () => {
    const turnoB = await crearTurnoSintetico(CLINICA_B.id);

    // turno_id inexistente -> 23503
    await expect(
      comoApp(CLINICA_A.id, (cliente) =>
        cliente.query(
          `INSERT INTO notificacion (id, clinica_id, turno_id, canal, tipo, clave_idempotencia)
           VALUES ($1, $2, $3, 'email', 'creacion', $4)`,
          [randomUUID(), CLINICA_A.id, randomUUID(), `fk-inexistente-${randomUUID()}`],
        ),
      ),
    ).rejects.toMatchObject({ code: '23503' });

    // turno_id perteneciente a otra clínica -> 23503 (FK compuesta impide cruce entre tenants)
    await expect(
      comoApp(CLINICA_A.id, (cliente) =>
        cliente.query(
          `INSERT INTO notificacion (id, clinica_id, turno_id, canal, tipo, clave_idempotencia)
           VALUES ($1, $2, $3, 'email', 'creacion', $4)`,
          [randomUUID(), CLINICA_A.id, turnoB.turnoId, `fk-cruzada-${randomUUID()}`],
        ),
      ),
    ).rejects.toMatchObject({ code: '23503' });

    // tipo = 'codigo' con turno_id NULL aceptado por MATCH SIMPLE
    await comoApp(CLINICA_A.id, (cliente) =>
      cliente.query(
        `INSERT INTO notificacion (id, clinica_id, turno_id, canal, tipo, clave_idempotencia)
         VALUES ($1, $2, NULL, 'email', 'codigo', $3)`,
        [randomUUID(), CLINICA_A.id, `fk-codigo-${randomUUID()}`],
      ),
    );
  });

  it('instala pgboss v47 bajo migra, permite operar a app sin DDL y es idempotente tras reiniciar public', async () => {
    const version = await consultarComoMigra<{ version: number }>(
      entorno.urlMigra,
      'SELECT version FROM pgboss.version',
    );
    expect(version).toEqual([{ version: 47 }]);

    const tablasPgboss = await consultarComoMigra<{ tableowner: string }>(
      entorno.urlMigra,
      `SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname = 'pgboss'`,
    );
    expect(tablasPgboss).toEqual([{ tableowner: 'migra' }]);

    const boss = new PgBoss({
      connectionString: entorno.urlApp,
      schema: 'pgboss',
      migrate: false,
      createSchema: false,
      supervise: false,
      schedule: false,
      reindex: false,
      persistQueueStats: false,
      registerInstance: false,
    });
    await boss.start();
    try {
      const drift = await boss.detectSchemaDrift();
      expect(drift.ok).toBe(true);
    } finally {
      await boss.stop({ graceful: false });
    }

    // Re-ejecutar migraciones tras reiniciar únicamente public (como hacen otros tests de integración)
    await reiniciarEsquema(entorno.urlMigra);
    await aplicarMigraciones({
      urlDeMigracion: entorno.urlMigra,
      directorio: join(process.cwd(), 'migrations'),
    });
    await prepararBaseNotificaciones();

    const versionDespues = await consultarComoMigra<{ version: number }>(
      entorno.urlMigra,
      'SELECT version FROM pgboss.version',
    );
    expect(versionDespues).toEqual([{ version: 47 }]);
  });
});
