import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ConfigError,
  EsquemaEntorno,
  VARIABLES,
  describirConfig,
  loadConfig,
} from '../../src/config/index.js';

const BASE_APP = { DATABASE_URL: 'postgres://app:secreto-123@localhost:5432/turnos' };

function capturarError(fn: () => unknown): ConfigError {
  try {
    fn();
  } catch (e) {
    if (e instanceof ConfigError) return e;
    throw e;
  }
  throw new Error('Se esperaba un ConfigError y no se lanzó nada');
}

describe('validación de la configuración al arrancar', () => {
  it('variable obligatoria ausente: lista el nombre sin imprimir valores', () => {
    const error = capturarError(() => loadConfig('app', { PORT: '4000' }));
    expect(error.variables).toEqual(['DATABASE_URL']);
    expect(error.message).toContain('DATABASE_URL');
    expect(error.message).not.toContain('4000');
  });

  it('puerto inválido: nombra la variable y no repite el valor', () => {
    const error = capturarError(() => loadConfig('app', { ...BASE_APP, PORT: 'abc' }));
    expect(error.variables).toEqual(['PORT']);
    expect(error.message).not.toContain('abc');
  });

  it('zona horaria inválida: nombra la variable', () => {
    const error = capturarError(() =>
      loadConfig('app', { ...BASE_APP, DEFAULT_TIMEZONE: 'Marte/Olimpo' }),
    );
    expect(error.variables).toEqual(['DEFAULT_TIMEZONE']);
    expect(error.message).not.toContain('Marte');
  });

  it('una URL de base de datos inválida no se imprime', () => {
    const error = capturarError(() => loadConfig('app', { DATABASE_URL: 'clave-secreta-xyz' }));
    expect(error.variables).toEqual(['DATABASE_URL']);
    expect(error.message).not.toContain('clave-secreta-xyz');
  });

  it('el texto vacío se trata como ausente', () => {
    const error = capturarError(() => loadConfig('app', { DATABASE_URL: '   ' }));
    expect(error.variables).toEqual(['DATABASE_URL']);
  });

  it('ALLOW_SEED solo acepta true o false exactos', () => {
    const error = capturarError(() => loadConfig('app', { ...BASE_APP, ALLOW_SEED: 'TRUE' }));
    expect(error.variables).toEqual(['ALLOW_SEED']);
    expect(loadConfig('app', { ...BASE_APP, ALLOW_SEED: 'true' }).allowSeed).toBe(true);
  });

  it('RATE_LIMIT_PUBLIC con formato inválido falla', () => {
    const error = capturarError(() =>
      loadConfig('app', { ...BASE_APP, RATE_LIMIT_PUBLIC: 'muchos' }),
    );
    expect(error.variables).toEqual(['RATE_LIMIT_PUBLIC']);
  });

  it('cada perfil exige solo lo que usa', () => {
    expect(capturarError(() => loadConfig('migrate', BASE_APP)).variables).toEqual([
      'DATABASE_MIGRATION_URL',
    ]);
    expect(capturarError(() => loadConfig('seed', {})).variables).toEqual(['DATABASE_URL']);
    expect(capturarError(() => loadConfig('test', {})).variables).toEqual([
      'TEST_DATABASE_URL',
      'TEST_DATABASE_MIGRATION_URL',
    ]);
    expect(() =>
      loadConfig('migrate', { DATABASE_MIGRATION_URL: 'postgres://migra:x@localhost/turnos' }),
    ).not.toThrow();
  });

  it('ignora variables del entorno que no son del proyecto', () => {
    expect(() => loadConfig('app', { ...BASE_APP, PATH: '/usr/bin', HOME: '/root' })).not.toThrow();
  });
});

describe('valores por defecto y datos sensibles', () => {
  it('las variables no sensibles usan el valor por defecto documentado', () => {
    const config = loadConfig('app', BASE_APP);
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('development');
    expect(config.defaultTimezone).toBe('America/Argentina/Buenos_Aires');
    expect(config.rateLimitPublic).toBe('30/min');
    expect(config.allowSeed).toBe(false);
    expect(config.seedAllowedHosts).toEqual(['localhost', '127.0.0.1', '::1']);
  });

  it('convierte el puerto a número', () => {
    expect(loadConfig('app', { ...BASE_APP, PORT: '4000' }).port).toBe(4000);
  });

  it('ninguna variable sensible tiene valor por defecto', () => {
    const sensibles = VARIABLES.filter((v) => v.sensible);
    expect(sensibles.length).toBeGreaterThan(0);
    for (const v of sensibles) {
      expect(v.porDefecto, `${v.nombre} no debe tener valor por defecto`).toBeUndefined();
      const propiedad =
        EsquemaEntorno.properties[v.nombre as keyof typeof EsquemaEntorno.properties];
      expect(JSON.stringify(propiedad), `${v.nombre} en el esquema`).not.toContain('"default"');
    }
  });

  it('un secreto no definido queda ausente: no se inventa un valor', () => {
    const config = loadConfig('app', BASE_APP);
    expect(config.jwtAccessSecret).toBeUndefined();
    expect(config.jwtRefreshSecret).toBeUndefined();
    expect(config.emailApiKey).toBeUndefined();
  });
});

describe('secretos fuera de registros y volcados', () => {
  it('el resumen no contiene valores sensibles', () => {
    const config = loadConfig('app', {
      ...BASE_APP,
      JWT_ACCESS_SECRET: 'super-secreto-jwt',
      EMAIL_API_KEY: 're_clave_real',
    });
    const resumen = JSON.stringify(describirConfig(config));
    expect(resumen).not.toContain('secreto-123');
    expect(resumen).not.toContain('super-secreto-jwt');
    expect(resumen).not.toContain('re_clave_real');
    expect(resumen).toContain('[REDACTADO]');
  });

  it('el resumen omite las variables sensibles no definidas', () => {
    const resumen = describirConfig(loadConfig('app', BASE_APP));
    expect(resumen).not.toHaveProperty('jwtAccessSecret');
  });
});

describe('.env.example', () => {
  /** Lee el archivo en cada prueba para que un archivo ausente falle solo estas pruebas. */
  function leerEntradas(): Map<string, string> {
    const contenido = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8');
    const entradas = new Map<string, string>();
    for (const linea of contenido.split(/\r?\n/)) {
      const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(linea);
      if (m?.[1] !== undefined) entradas.set(m[1], m[2] ?? '');
    }
    return entradas;
  }

  it('documenta cada variable del esquema y del catálogo, y viceversa', () => {
    const esquema = Object.keys(EsquemaEntorno.properties).sort();
    const catalogo = VARIABLES.map((v) => v.nombre).sort();
    const ejemplo = [...leerEntradas().keys()].sort();
    expect(catalogo).toEqual(esquema);
    expect(ejemplo).toEqual(esquema);
  });

  it('deja vacías las variables sensibles', () => {
    const entradas = leerEntradas();
    for (const v of VARIABLES.filter((x) => x.sensible)) {
      expect(entradas.get(v.nombre), `${v.nombre} debe ir vacía en el ejemplo`).toBe('');
    }
  });

  it('las variables no sensibles con valor por defecto coinciden con el ejemplo', () => {
    const entradas = leerEntradas();
    for (const v of VARIABLES.filter((x) => !x.sensible && x.porDefecto !== undefined)) {
      expect(entradas.get(v.nombre), v.nombre).toBe(v.porDefecto);
    }
  });
});
