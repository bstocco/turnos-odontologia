import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig, type Config } from '../../../src/config/index.js';
import { normalizarTelefonoAr } from '../../../src/domain/comunicacion/index.js';
import { SeedBloqueadoError } from '../../../src/infrastructure/seed/assert-no-production.js';
import {
  ID_CLINICA_DEMO,
  SLUG_CLINICA_DEMO,
  ejecutarSeedDemo,
} from '../../../seeds/demo-clinica.js';
import { configDeBaseDePrueba } from '../../support/base-de-datos.js';
import {
  cerrarPool,
  comoApp,
  consultarComoMigra,
  prepararBaseDeDatosClinica,
  type EntornoDePrueba,
} from './soporte.js';

let entorno: EntornoDePrueba;
let configSeed: Config;

function configurarSeed(cambios: Partial<Config> = {}): Config {
  return { ...configSeed, ...cambios };
}

beforeAll(async () => {
  entorno = await prepararBaseDeDatosClinica();
  const prueba = configDeBaseDePrueba();
  configSeed = {
    ...loadConfig('test'),
    nodeEnv: 'development',
    allowSeed: true,
    databaseUrl: prueba.testDatabaseUrl,
  };
});
afterAll(cerrarPool);

beforeEach(async () => {
  entorno = await prepararBaseDeDatosClinica();
  process.env.DATABASE_URL = entorno.urlApp;
});

async function contarClinicasDemo(): Promise<number> {
  const filas = await consultarComoMigra<{ n: number }>(
    entorno.urlMigra,
    'SELECT count(*)::int AS n FROM clinica WHERE slug = $1',
    [SLUG_CLINICA_DEMO],
  );
  return filas[0]?.n ?? -1;
}

async function conteos(): Promise<Record<string, number>> {
  return comoApp(ID_CLINICA_DEMO, async (c) => {
    const resultado: Record<string, number> = {};
    for (const tabla of [
      'profesional',
      'sillon',
      'prestacion',
      'paciente',
      'feriado',
      'horario_atencion',
      'bloqueo',
    ]) {
      const { rows } = await c.query(`SELECT count(*)::int AS n FROM ${tabla}`);
      resultado[tabla] = Number(rows[0]?.['n']);
    }
    return resultado;
  });
}

/** Foto de los datos de la clínica de demostración (sin `creado_en`, que depende del reloj). */
async function foto(): Promise<unknown> {
  return comoApp(ID_CLINICA_DEMO, async (c) => {
    const tablas: Record<string, string> = {
      profesional: 'SELECT * FROM profesional ORDER BY id',
      sillon: 'SELECT * FROM sillon ORDER BY id',
      prestacion: 'SELECT * FROM prestacion ORDER BY id',
      paciente:
        'SELECT id, clinica_id, nombre, apellido, dni, telefono, email, obra_social FROM paciente ORDER BY id',
      feriado: 'SELECT id, fecha::text AS fecha, descripcion FROM feriado ORDER BY id',
      horario:
        'SELECT profesional_id, dia_semana, hora_desde::text, hora_hasta::text FROM horario_atencion ORDER BY profesional_id, dia_semana, hora_desde',
      bloqueo: 'SELECT * FROM bloqueo ORDER BY id',
    };
    const resultado: Record<string, unknown[]> = {};
    for (const [clave, sql] of Object.entries(tablas)) resultado[clave] = (await c.query(sql)).rows;
    return resultado;
  });
}

describe('guardas antes de tocar la base', () => {
  it('sin ALLOW_SEED termina con error, sin abrir conexión ni escribir datos', async () => {
    // Si el seed intentara conectarse, la conexión (puerto 1) fallaría con otro error.
    process.env.DATABASE_URL = 'postgres://app:x@127.0.0.1:1/turnos_test';
    const salida: string[] = [];
    await expect(
      ejecutarSeedDemo(configurarSeed({ allowSeed: false }), (l) => salida.push(l)),
    ).rejects.toBeInstanceOf(SeedBloqueadoError);
    expect(salida).toEqual([]);
    expect(await contarClinicasDemo()).toBe(0);
  });

  it('con un host fuera de SEED_ALLOWED_HOSTS termina con error, sin escribir datos', async () => {
    process.env.DATABASE_URL = 'postgres://app:x@127.0.0.1:1/turnos_test';
    await expect(
      ejecutarSeedDemo(
        configurarSeed({ seedAllowedHosts: ['otro-host.interno'] }),
        () => undefined,
      ),
    ).rejects.toBeInstanceOf(SeedBloqueadoError);
    expect(await contarClinicasDemo()).toBe(0);
  });

  it('en producción también se rechaza', async () => {
    process.env.DATABASE_URL = 'postgres://app:x@127.0.0.1:1/turnos_test';
    await expect(
      ejecutarSeedDemo(configurarSeed({ nodeEnv: 'production' }), () => undefined),
    ).rejects.toBeInstanceOf(SeedBloqueadoError);
    expect(await contarClinicasDemo()).toBe(0);
  });
});

describe('contenido de la clínica de demostración', () => {
  it('crea profesionales con franjas, sillones, prestaciones, feriados, bloqueo y pacientes', async () => {
    await ejecutarSeedDemo(configurarSeed(), () => undefined);
    expect(await contarClinicasDemo()).toBe(1);

    const n = await conteos();
    expect(n['profesional']).toBeGreaterThanOrEqual(2);
    expect(n['horario_atencion']).toBeGreaterThanOrEqual(2 * 5 * 2);
    expect(n['sillon']).toBe(2);
    expect(n['prestacion']).toBe(3);
    expect(n['feriado']).toBeGreaterThan(0);
    expect(n['bloqueo']).toBeGreaterThanOrEqual(1);
    expect(n['paciente']).toBe(20);

    await comoApp(ID_CLINICA_DEMO, async (c) => {
      const sillones = await c.query('SELECT buffer_minutos FROM sillon ORDER BY buffer_minutos');
      expect(sillones.rows.map((f) => f['buffer_minutos'])).toEqual([0, 10]);
      const prestaciones = await c.query(
        'SELECT duracion_minutos FROM prestacion ORDER BY duracion_minutos',
      );
      expect(prestaciones.rows.map((f) => f['duracion_minutos'])).toEqual([30, 45, 60]);
      const config = await c.query('SELECT 1 FROM clinica_config');
      expect(config.rows).toHaveLength(1);
      const dias = await c.query(
        'SELECT DISTINCT dia_semana FROM horario_atencion ORDER BY dia_semana',
      );
      expect(dias.rows.map((f) => f['dia_semana'])).toEqual([1, 2, 3, 4, 5]);
    });
  });

  it('todos los emails terminan en @example.com y los teléfonos están normalizados', async () => {
    await ejecutarSeedDemo(configurarSeed(), () => undefined);
    const { rows } = await comoApp(ID_CLINICA_DEMO, (c) =>
      c.query('SELECT dni, telefono, email FROM paciente'),
    );
    expect(rows).toHaveLength(20);
    for (const fila of rows) {
      expect(String(fila['email'])).toMatch(/^[a-z0-9.]+@example\.com$/);
      expect(String(fila['dni'])).toMatch(/^[0-9]{8}$/);
      // El teléfono guardado es `+` + la forma normalizada de C-04 (`549...`).
      expect(`+${normalizarTelefonoAr(String(fila['telefono']))}`).toBe(fila['telefono']);
    }
  });
});

describe('determinismo e idempotencia', () => {
  it('la segunda ejecución informa que ya existe y no cambia las filas', async () => {
    await ejecutarSeedDemo(configurarSeed(), () => undefined);
    const antes = await conteos();
    const salida: string[] = [];
    await ejecutarSeedDemo(configurarSeed(), (l) => salida.push(l));
    expect(salida.join('\n')).toMatch(/ya existe/i);
    expect(await conteos()).toEqual(antes);
    expect(await contarClinicasDemo()).toBe(1);
  });

  it('no modifica otras clínicas', async () => {
    const antes = await consultarComoMigra<{ n: number }>(
      entorno.urlMigra,
      'SELECT count(*)::int AS n FROM clinica',
    );
    await ejecutarSeedDemo(configurarSeed(), () => undefined);
    const despues = await consultarComoMigra<{ n: number }>(
      entorno.urlMigra,
      'SELECT count(*)::int AS n FROM clinica',
    );
    expect(despues[0]?.n).toBe((antes[0]?.n ?? 0) + 1);
  });

  it('dos bases vacías producen los mismos identificadores y datos', async () => {
    await ejecutarSeedDemo(configurarSeed(), () => undefined);
    const primera = await foto();
    entorno = await prepararBaseDeDatosClinica();
    await ejecutarSeedDemo(configurarSeed(), () => undefined);
    const segunda = await foto();
    expect(segunda).toEqual(primera);
    expect((primera as { paciente: unknown[] }).paciente).toHaveLength(20);
  });
});

describe('salida sin datos personales', () => {
  it('informa id, slug y conteos, sin DNI, teléfonos, emails ni nombres de pacientes', async () => {
    const salida: string[] = [];
    await ejecutarSeedDemo(configurarSeed(), (l) => salida.push(l));
    const texto = salida.join('\n');
    expect(texto).toContain(ID_CLINICA_DEMO);
    expect(texto).toContain(SLUG_CLINICA_DEMO);
    expect(texto).toMatch(/paciente\D+20/i);

    const { rows } = await comoApp(ID_CLINICA_DEMO, (c) =>
      c.query('SELECT nombre, apellido, dni, telefono, email FROM paciente'),
    );
    for (const fila of rows) {
      for (const clave of ['dni', 'telefono', 'email']) {
        expect(texto).not.toContain(String(fila[clave]));
      }
      expect(texto).not.toContain(`${String(fila['nombre'])} ${String(fila['apellido'])}`);
    }
    expect(texto).not.toContain('@');
  });
});
