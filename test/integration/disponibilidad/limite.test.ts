import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { firmarTokenDeAcceso } from '../../../src/infrastructure/auth/jwt.js';
import { poolDeLaAplicacion } from '../../../src/infrastructure/db/pool/index.js';
import { appDePrueba } from '../../support/app-de-prueba.js';
import { CLINICA_A, cerrarPool, crearAppPublica, prepararBaseDeDisponibilidad } from './soporte.js';

const SECRETO = 'secreto-de-prueba-c13-0123456789abcdef0123456789';
let app: FastifyInstance;

const RUTA = (slug: string) => `/api/v1/publico/${slug}/prestaciones`;
const pedir = (slug: string, ip: string) =>
  app.inject({ method: 'GET', url: RUTA(slug), remoteAddress: ip });

beforeAll(async () => {
  await prepararBaseDeDisponibilidad();
  process.env.RATE_LIMIT_PUBLIC = '3/min';
  process.env.JWT_ACCESS_SECRET = SECRETO;
  ({ app } = await crearAppPublica());
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  delete process.env.RATE_LIMIT_PUBLIC;
  delete process.env.JWT_ACCESS_SECRET;
  await app.close();
  await cerrarPool();
});

describe('límite de tasa público por IP', () => {
  it('con 3/min: 3 pedidos pasan y el 4.º responde 429 DEMASIADOS_PEDIDOS con retry-after', async () => {
    const ip = '10.1.0.1';
    for (let i = 0; i < 3; i++) expect((await pedir(CLINICA_A.slug, ip)).statusCode).toBe(200);
    const r = await pedir(CLINICA_A.slug, ip);
    expect(r.statusCode).toBe(429);
    expect(r.json()).toMatchObject({ codigo: 'DEMASIADOS_PEDIDOS' });
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('otra IP no está limitada aunque la primera esté agotada', async () => {
    for (let i = 0; i < 4; i++) await pedir(CLINICA_A.slug, '10.1.0.2');
    expect((await pedir(CLINICA_A.slug, '10.1.0.2')).statusCode).toBe(429);
    expect((await pedir(CLINICA_A.slug, '10.1.0.3')).statusCode).toBe(200);
  });

  it('slugs existentes e inexistentes comparten el cupo y el 429 es idéntico', async () => {
    const ip = '10.1.0.4';
    expect((await pedir(CLINICA_A.slug, ip)).statusCode).toBe(200);
    expect((await pedir('no-existe-uno', ip)).statusCode).toBe(404);
    expect((await pedir('no-existe-dos', ip)).statusCode).toBe(404);
    const conExistente = await pedir(CLINICA_A.slug, ip);
    const conInexistente = await pedir('no-existe-tres', ip);
    expect(conExistente.statusCode).toBe(429);
    expect(conInexistente.statusCode).toBe(429);
    expect(conExistente.body).toBe(conInexistente.body);
  });

  it('el pedido rechazado con 429 no ejecuta ninguna consulta a la base', async () => {
    const ip = '10.1.0.5';
    for (let i = 0; i < 3; i++) await pedir(CLINICA_A.slug, ip);
    const pool = poolDeLaAplicacion();
    const query = vi.spyOn(pool, 'query');
    const connect = vi.spyOn(pool, 'connect');
    const r = await pedir(CLINICA_A.slug, ip);
    expect(r.statusCode).toBe(429);
    expect(query).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it('GET /salud no consume ni sufre el límite público', async () => {
    const ip = '10.1.0.6';
    for (let i = 0; i < 5; i++) await pedir(CLINICA_A.slug, ip);
    for (let i = 0; i < 5; i++) {
      const r = await app.inject({ method: 'GET', url: '/salud', remoteAddress: ip });
      expect(r.statusCode).toBe(200);
    }
  });

  it('una ruta autenticada del personal no consume el cupo público', async () => {
    const ip = '10.1.0.7';
    const token = await firmarTokenDeAcceso(SECRETO, {
      clinicaId: CLINICA_A.id,
      usuarioId: '99999999-9999-4999-8999-999999999999',
      rol: 'administrador',
    });
    for (let i = 0; i < 6; i++) {
      const r = await app.inject({
        method: 'GET',
        url: '/api/v1/prestaciones',
        headers: { authorization: `Bearer ${token}` },
        remoteAddress: ip,
      });
      expect(r.statusCode).toBe(200);
    }
    expect((await pedir(CLINICA_A.slug, ip)).statusCode).toBe(200);
  });
});

describe('memoria acotada del contador', () => {
  it('con el doble de IPs que la capacidad, todo responde y el almacén no crece más allá', async () => {
    const dir = fileURLToPath(new URL('../../fixtures/modulos-publico-acotado', import.meta.url));
    const { CAPACIDAD } =
      (await import('../../fixtures/modulos-publico-acotado/publico/index.js')) as {
        CAPACIDAD: number;
      };
    // Observa el almacén real del plugin: `incr` se ejecuta con `this` = LocalStore (LRU interno).
    const LocalStore = createRequire(import.meta.url)('@fastify/rate-limit/store/LocalStore') as {
      prototype: { incr: (...a: unknown[]) => void; lru?: { size: number } };
    };
    const almacenes = new Set<{ size: number }>();
    const original = LocalStore.prototype.incr;
    vi.spyOn(LocalStore.prototype, 'incr').mockImplementation(function (
      this: { lru: { size: number } },
      ...args: unknown[]
    ) {
      almacenes.add(this.lru);
      return original.apply(this, args);
    });
    const { app: acotada } = await appDePrueba(dir, {}, { rateLimitGlobalCache: CAPACIDAD });
    await acotada.ready();
    try {
      for (let i = 0; i < CAPACIDAD * 2; i++) {
        const r = await acotada.inject({
          method: 'GET',
          url: RUTA(CLINICA_A.slug),
          remoteAddress: `10.2.0.${i + 1}`,
        });
        expect(r.statusCode).toBe(200);
      }
      expect(almacenes.size).toBeGreaterThan(0);
      const tamano = Math.max(...[...almacenes].map((l) => l.size));
      expect(tamano).toBe(CAPACIDAD);
    } finally {
      await acotada.close();
    }
  });
});
