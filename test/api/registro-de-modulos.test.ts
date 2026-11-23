import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { ErrorDeModulo, registrarModulos } from '../../src/interfaces/http/register-modules.js';
import { appDePrueba } from '../support/app-de-prueba.js';

const FIXTURES = resolve(process.cwd(), 'test/fixtures');

let app: FastifyInstance | undefined;
const temporales: string[] = [];

afterEach(async () => {
  await app?.close();
  app = undefined;
  for (const dir of temporales.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Crea un módulo CommonJS mínimo que expone GET /<nombre>. */
function crearModulo(raiz: string, nombre: string): void {
  const carpeta = join(raiz, nombre);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(
    join(carpeta, 'index.js'),
    `module.exports = async function (app) { app.get('/${nombre}', async () => ({ modulo: '${nombre}' })); };\n`,
  );
}

describe('carga de módulos', () => {
  it('carga todos los módulos en orden alfabético con el prefijo /api/v1', async () => {
    const instancia = Fastify();
    const cargados = await registrarModulos(instancia, join(FIXTURES, 'modulos-orden'));
    expect(cargados).toEqual(['alfa', 'beta']);

    for (const nombre of cargados) {
      const r = await instancia.inject({ method: 'GET', url: `/api/v1/${nombre}` });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({ modulo: nombre });
    }
    await instancia.close();
  });

  it('un módulo nuevo queda disponible sin editar ningún otro archivo', async () => {
    const raiz = mkdtempSync(join(tmpdir(), 'modulos-'));
    temporales.push(raiz);
    crearModulo(raiz, 'uno');

    const primero = Fastify();
    expect(await registrarModulos(primero, raiz)).toEqual(['uno']);
    await primero.close();

    crearModulo(raiz, 'dos'); // solo se agrega una carpeta
    ({ app } = await appDePrueba(raiz));
    for (const nombre of ['uno', 'dos']) {
      const r = await app.inject({ method: 'GET', url: `/api/v1/${nombre}` });
      expect(r.statusCode, nombre).toBe(200);
    }
  });

  it('GET /salud sigue disponible en la raíz junto con los módulos', async () => {
    ({ app } = await appDePrueba(join(FIXTURES, 'modulos-orden')));
    const r = await app.inject({ method: 'GET', url: '/salud' });
    expect(r.json()).toEqual({ estado: 'ok' });
  });
});

describe('módulos inválidos', () => {
  it('sin punto de entrada: el arranque falla nombrando el módulo', async () => {
    await expect(appDePrueba(join(FIXTURES, 'modulos-sin-entrada'))).rejects.toThrow(ErrorDeModulo);
    await expect(appDePrueba(join(FIXTURES, 'modulos-sin-entrada'))).rejects.toThrow(/vacio/);
  });

  it('sin exportar un plugin: el arranque falla nombrando el módulo', async () => {
    await expect(appDePrueba(join(FIXTURES, 'modulos-sin-plugin'))).rejects.toThrow(ErrorDeModulo);
    await expect(appDePrueba(join(FIXTURES, 'modulos-sin-plugin'))).rejects.toThrow(/roto/);
  });

  it('el servicio no llega a escuchar cuando un módulo es inválido', async () => {
    let escucho = false;
    try {
      const { app: instancia } = await appDePrueba(join(FIXTURES, 'modulos-sin-plugin'));
      await instancia.listen({ port: 0 });
      escucho = true;
      await instancia.close();
    } catch {
      /* se espera el fallo del arranque */
    }
    expect(escucho).toBe(false);
  });
});

describe('carpeta inexistente', () => {
  it('equivale a sin módulos y deja una advertencia', async () => {
    const inexistente = join(FIXTURES, 'no-existe-esta-carpeta');
    const montado = await appDePrueba(inexistente);
    app = montado.app;
    const advertencias = montado.logs.registros().filter((l) => l.level === 40);
    expect(advertencias.length).toBe(1);
    expect((await app.inject({ method: 'GET', url: '/salud' })).statusCode).toBe(200);
  });
});
