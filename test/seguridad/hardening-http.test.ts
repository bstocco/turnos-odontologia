import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/interfaces/http/app.js';
import { generarContrato } from '../e2e/contrato/generar.js';
import { RUTA_CONTRATO, RUTA_REGISTRO } from '../e2e/contrato/soporte-contrato.js';
import { appDePrueba, capturarLogs, configDePrueba } from '../support/app-de-prueba.js';

const MODULOS_PRUEBA = resolve(process.cwd(), 'test/fixtures/modulos-prueba');

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function afirmarCabecerasDeSeguridad(cabeceras: Record<string, unknown>): void {
  expect(cabeceras['x-content-type-options']).toBe('nosniff');
  expect(cabeceras['x-frame-options']).toBe('DENY');
  expect(cabeceras['referrer-policy']).toBe('no-referrer');
  expect(String(cabeceras['content-security-policy'])).toContain("default-src 'none'");
  expect(String(cabeceras['content-security-policy'])).toContain("frame-ancestors 'none'");
  expect(cabeceras['cross-origin-resource-policy']).toBe('same-origin');
  expect(cabeceras['cross-origin-opener-policy']).toBe('same-origin');
  expect(cabeceras['strict-transport-security']).toBeDefined();
  expect(cabeceras['x-powered-by']).toBeUndefined();
  expect(cabeceras['server']).toBeUndefined();
}

describe('cabeceras de seguridad HTTP (Helmet)', () => {
  it('incluye cabeceras restrictivas en GET /salud, /api/v1/* y errores 4xx', async () => {
    ({ app } = await appDePrueba(MODULOS_PRUEBA));

    const salud = await app.inject({ method: 'GET', url: '/salud', remoteAddress: '10.80.0.1' });
    expect(salud.statusCode).toBe(200);
    afirmarCabecerasDeSeguridad(salud.headers);

    const apiOk = await app.inject({
      method: 'GET',
      url: '/api/v1/pacientes',
      remoteAddress: '10.80.0.2',
    });
    expect(apiOk.statusCode).toBe(200);
    afirmarCabecerasDeSeguridad(apiOk.headers);

    const noEncontrada = await app.inject({
      method: 'GET',
      url: '/no/existe',
      remoteAddress: '10.80.0.3',
    });
    expect(noEncontrada.statusCode).toBe(404);
    afirmarCabecerasDeSeguridad(noEncontrada.headers);
  });
});

describe('política CORS restrictiva sin comodín', () => {
  it('deniega cualquier origen cruzado por defecto cuando CORS_ALLOWED_ORIGINS está vacía', async () => {
    ({ app } = await appDePrueba(MODULOS_PRUEBA));

    const res = await app.inject({
      method: 'GET',
      url: '/salud',
      headers: { origin: 'https://malicioso.example' },
      remoteAddress: '10.80.1.1',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();

    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/pacientes',
      headers: {
        origin: 'https://malicioso.example',
        'access-control-request-method': 'GET',
      },
      remoteAddress: '10.80.1.2',
    });
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('habilita únicamente el origen exacto en lista blanca y rechaza otros orígenes', async () => {
    ({ app } = await appDePrueba(MODULOS_PRUEBA, {
      CORS_ALLOWED_ORIGINS: 'https://app.clinica.example, http://localhost:5173',
    }));

    const permitido = await app.inject({
      method: 'GET',
      url: '/salud',
      headers: { origin: 'https://app.clinica.example' },
      remoteAddress: '10.80.1.3',
    });
    expect(permitido.headers['access-control-allow-origin']).toBe('https://app.clinica.example');
    expect(permitido.headers['access-control-allow-origin']).not.toBe('*');

    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/pacientes',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
      },
      remoteAddress: '10.80.1.4',
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const denegado = await app.inject({
      method: 'GET',
      url: '/salud',
      headers: { origin: 'https://otro.example' },
      remoteAddress: '10.80.1.5',
    });
    expect(denegado.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('no altera el contrato OpenAPI versionado con rutas OPTIONS', async () => {
    const logs = capturarLogs();
    app = await buildApp(configDePrueba({ CORS_ALLOWED_ORIGINS: 'https://app.clinica.example' }), {
      destinoDeLogs: logs.destino,
    });
    await app.ready();

    const generado = generarContrato(app, readFileSync(RUTA_REGISTRO, 'utf8'));
    const versionado = readFileSync(RUTA_CONTRATO, 'utf8');
    expect(generado).toBe(versionado);
  });
});

describe('límite de tamaño de cuerpo (bodyLimit)', () => {
  it('acepta cuerpos dentro de HTTP_BODY_LIMIT_BYTES y rechaza excedentes con 413', async () => {
    ({ app } = await appDePrueba(MODULOS_PRUEBA, { HTTP_BODY_LIMIT_BYTES: '1024' }));

    const chico = await app.inject({
      method: 'POST',
      url: '/api/v1/errores/validacion',
      payload: { nombre: 'Ana' },
      remoteAddress: '10.80.2.1',
    });
    expect(chico.statusCode).toBe(200);

    const grande = await app.inject({
      method: 'POST',
      url: '/api/v1/errores/validacion',
      payload: { nombre: 'x'.repeat(2000) },
      remoteAddress: '10.80.2.2',
    });
    expect(grande.statusCode).toBe(413);
    expect(grande.json()).toMatchObject({ codigo: 'CUERPO_DEMASIADO_GRANDE' });
  });
});

describe('límite de tasa global por IP y exclusión de /salud', () => {
  it('rechaza con 429 DEMASIADOS_PEDIDOS + retry-after al superar RATE_LIMIT_GLOBAL y excluye GET /salud', async () => {
    const logs = capturarLogs();
    app = await buildApp(configDePrueba({ RATE_LIMIT_GLOBAL: '3/min' }), {
      destinoDeLogs: logs.destino,
      directorioDeModulos: MODULOS_PRUEBA,
      rateLimitGlobalCache: 50,
    });

    const ip = '10.80.3.1';
    for (let i = 0; i < 3; i += 1) {
      const ok = await app.inject({ method: 'GET', url: '/api/v1/pacientes', remoteAddress: ip });
      expect(ok.statusCode).toBe(200);
    }

    const bloqueado = await app.inject({
      method: 'GET',
      url: '/api/v1/pacientes',
      remoteAddress: ip,
    });
    expect(bloqueado.statusCode).toBe(429);
    expect(bloqueado.json()).toMatchObject({ codigo: 'DEMASIADOS_PEDIDOS' });
    expect(bloqueado.headers['retry-after']).toBeDefined();

    // GET /salud sigue respondiendo 200 aunque la IP esté bloqueada.
    const salud = await app.inject({ method: 'GET', url: '/salud', remoteAddress: ip });
    expect(salud.statusCode).toBe(200);

    // Otra IP no se ve afectada.
    const otraIp = await app.inject({
      method: 'GET',
      url: '/api/v1/pacientes',
      remoteAddress: '10.80.3.2',
    });
    expect(otraIp.statusCode).toBe(200);
  });

  it('coexiste con RATE_LIMIT_PUBLIC más estricto en /api/v1/publico/*', async () => {
    const previoPublic = process.env.RATE_LIMIT_PUBLIC;
    process.env.RATE_LIMIT_PUBLIC = '2/min';
    try {
      const logs = capturarLogs();
      app = await buildApp(
        configDePrueba({ RATE_LIMIT_PUBLIC: '2/min', RATE_LIMIT_GLOBAL: '5/min' }),
        { destinoDeLogs: logs.destino, rateLimitGlobalCache: 50 },
      );

      const ip = '10.80.3.99';
      for (let i = 0; i < 2; i += 1) {
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/publico/clinica-inexistente/prestaciones',
          remoteAddress: ip,
        });
        expect(res.statusCode).toBe(404);
      }

      // El 3er pedido público cae por RATE_LIMIT_PUBLIC (2/min), antes que el global (5/min).
      const publicoBloqueado = await app.inject({
        method: 'GET',
        url: '/api/v1/publico/clinica-inexistente/prestaciones',
        remoteAddress: ip,
      });
      expect(publicoBloqueado.statusCode).toBe(429);
      expect(publicoBloqueado.json()).toMatchObject({ codigo: 'DEMASIADOS_PEDIDOS' });

      // Una ruta fuera de /publico/* aún tiene cupo en el límite global (5/min) hasta agotarlo.
      for (let i = 0; i < 2; i += 1) {
        const clinica = await app.inject({
          method: 'GET',
          url: '/api/v1/clinica',
          remoteAddress: ip,
        });
        expect(clinica.statusCode).toBe(401);
      }

      const globalBloqueado = await app.inject({
        method: 'GET',
        url: '/api/v1/clinica',
        remoteAddress: ip,
      });
      expect(globalBloqueado.statusCode).toBe(429);
      expect(globalBloqueado.json()).toMatchObject({ codigo: 'DEMASIADOS_PEDIDOS' });
    } finally {
      if (previoPublic === undefined) {
        delete process.env.RATE_LIMIT_PUBLIC;
      } else {
        process.env.RATE_LIMIT_PUBLIC = previoPublic;
      }
    }
  });
});
