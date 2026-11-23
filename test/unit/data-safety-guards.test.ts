import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config/index.js';
import {
  SeedBloqueadoError,
  assertNoProduction,
  hostDeLaBase,
} from '../../src/infrastructure/seed/assert-no-production.js';

const URL_LOCAL = 'postgres://app:secreto-123@localhost:5432/turnos';

function configurar(extra: Record<string, string>) {
  return loadConfig('seed', { DATABASE_URL: URL_LOCAL, ...extra });
}

function mensajeDeRechazo(config: ReturnType<typeof configurar>): string {
  try {
    assertNoProduction(config);
  } catch (e) {
    if (e instanceof SeedBloqueadoError) return e.message;
    throw e;
  }
  throw new Error('Se esperaba que la guarda rechazara la ejecución');
}

describe('seeds deshabilitados por defecto', () => {
  it('sin ALLOW_SEED explica que están deshabilitados', () => {
    expect(mensajeDeRechazo(configurar({}))).toContain('deshabilitados');
  });

  it('ALLOW_SEED=false también se rechaza', () => {
    expect(mensajeDeRechazo(configurar({ ALLOW_SEED: 'false' }))).toContain('deshabilitados');
  });

  it('la guarda es síncrona y no abre conexiones', () => {
    expect(assertNoProduction(configurar({ ALLOW_SEED: 'true' }))).toBeUndefined();
  });
});

describe('negativa a ejecutar contra producción', () => {
  it('rechaza en producción aunque los seeds estén habilitados', () => {
    const config = configurar({ ALLOW_SEED: 'true', NODE_ENV: 'production' });
    expect(mensajeDeRechazo(config)).toContain('producción');
  });

  it('rechaza un host fuera de la lista permitida y nombra el host', () => {
    const config = loadConfig('seed', {
      DATABASE_URL: 'postgres://app:secreto-123@db.prod.example.com:5432/turnos',
      ALLOW_SEED: 'true',
    });
    expect(mensajeDeRechazo(config)).toContain('db.prod.example.com');
  });

  it('permite los hosts locales por defecto', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      const config = loadConfig('seed', {
        DATABASE_URL: `postgres://app:x@${host}:5432/turnos`,
        ALLOW_SEED: 'true',
      });
      expect(() => assertNoProduction(config), host).not.toThrow();
    }
  });

  it('respeta una lista de hosts permitidos configurada', () => {
    const config = loadConfig('seed', {
      DATABASE_URL: 'postgres://app:x@db:5432/turnos',
      ALLOW_SEED: 'true',
      SEED_ALLOWED_HOSTS: 'localhost, DB',
    });
    expect(() => assertNoProduction(config)).not.toThrow();
  });

  it('rechaza si no se puede determinar el host', () => {
    const config = loadConfig('seed', {
      DATABASE_URL: 'postgres:///turnos',
      ALLOW_SEED: 'true',
    });
    expect(mensajeDeRechazo(config)).toContain('host');
  });
});

describe('mensajes sin credenciales', () => {
  it('ningún rechazo incluye usuario, contraseña ni la cadena de conexión', () => {
    const casos = [
      configurar({}),
      configurar({ ALLOW_SEED: 'true', NODE_ENV: 'production' }),
      loadConfig('seed', {
        DATABASE_URL: 'postgres://usuario-x:secreto-123@db.prod.example.com:5432/turnos',
        ALLOW_SEED: 'true',
      }),
    ];
    for (const config of casos) {
      const mensaje = mensajeDeRechazo(config);
      expect(mensaje).not.toContain('secreto-123');
      expect(mensaje).not.toContain('usuario-x');
      expect(mensaje).not.toContain('postgres://');
    }
  });
});

describe('hostDeLaBase', () => {
  it('extrae el host sin credenciales ni corchetes', () => {
    expect(hostDeLaBase('postgres://u:p@Mi-Host:5432/db')).toBe('mi-host');
    expect(hostDeLaBase('postgres://u:p@[::1]:5432/db')).toBe('::1');
    expect(hostDeLaBase(undefined)).toBeUndefined();
    expect(hostDeLaBase('no es una url')).toBeUndefined();
  });
});
