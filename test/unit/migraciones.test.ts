import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ErrorDeMigracion,
  analizarNombre,
  calcularHuella,
  leerMigraciones,
  validarYOrdenar,
} from '../../src/infrastructure/db/migraciones.js';

function codigoDelError(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErrorDeMigracion) return e.codigo;
    throw e;
  }
  throw new Error('Se esperaba un ErrorDeMigracion');
}

describe('nombres y orden', () => {
  it('ordena entre changes: C03 antes que C05, sin importar el orden de entrada', () => {
    const orden = validarYOrdenar([
      'C05_001_recursos.sql',
      'C03_002_roles.sql',
      'C03_001_base.sql',
    ]);
    expect(orden.map((m) => m.nombre)).toEqual([
      'C03_001_base.sql',
      'C03_002_roles.sql',
      'C05_001_recursos.sql',
    ]);
  });

  it('ordena numéricamente por change y luego por secuencia', () => {
    const orden = validarYOrdenar(['C10_001_x.sql', 'C09_002_x.sql', 'C09_010_x.sql']);
    expect(orden.map((m) => m.nombre)).toEqual(['C09_002_x.sql', 'C09_010_x.sql', 'C10_001_x.sql']);
  });

  it('analiza change, secuencia y descripción', () => {
    expect(analizarNombre('C03_001_base.sql')).toEqual({
      nombre: 'C03_001_base.sql',
      cambio: 3,
      secuencia: 1,
      descripcion: 'base',
    });
  });

  it.each([
    'migracion.sql',
    'C3_1_base.sql',
    'C03_001_Base.sql',
    'C03_001_base.txt',
    'c03_001_base.sql',
    'C03_001.sql',
    'C03_001_con espacio.sql',
  ])('rechaza el nombre fuera del patrón: %s', (nombre) => {
    expect(analizarNombre(nombre)).toBeUndefined();
    expect(codigoDelError(() => validarYOrdenar(['C03_001_ok.sql', nombre]))).toBe(
      'NOMBRE_INVALIDO',
    );
  });

  it('el error de nombre inválido nombra el archivo', () => {
    try {
      validarYOrdenar(['malo.sql']);
    } catch (e) {
      expect((e as ErrorDeMigracion).archivo).toBe('malo.sql');
      expect((e as ErrorDeMigracion).message).toContain('malo.sql');
    }
  });

  it('rechaza dos archivos con el mismo change y secuencia', () => {
    expect(codigoDelError(() => validarYOrdenar(['C03_001_a.sql', 'C03_001_b.sql']))).toBe(
      'SECUENCIA_REPETIDA',
    );
  });

  it('permite la misma secuencia en changes distintos', () => {
    expect(() => validarYOrdenar(['C03_001_a.sql', 'C05_001_a.sql'])).not.toThrow();
  });
});

describe('huella', () => {
  it('es idéntica para el mismo contenido con CRLF y con LF', () => {
    const lf = 'CREATE TABLE a (id int);\nCREATE TABLE b (id int);\n';
    const crlf = lf.replace(/\n/g, '\r\n');
    expect(calcularHuella(crlf)).toBe(calcularHuella(lf));
  });

  it('ignora la marca de orden de bytes (BOM)', () => {
    expect(calcularHuella('﻿SELECT 1;\n')).toBe(calcularHuella('SELECT 1;\n'));
  });

  it('cambia cuando cambia el contenido', () => {
    expect(calcularHuella('SELECT 1;\n')).not.toBe(calcularHuella('SELECT 2;\n'));
  });

  it('tiene formato SHA-256 hexadecimal', () => {
    expect(calcularHuella('x')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('lectura del directorio', () => {
  const temporales: string[] = [];
  afterEach(() => {
    for (const d of temporales.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function directorio(archivos: Record<string, string>): string {
    const raiz = mkdtempSync(join(tmpdir(), 'migraciones-'));
    temporales.push(raiz);
    for (const [nombre, contenido] of Object.entries(archivos)) {
      writeFileSync(join(raiz, nombre), contenido);
    }
    return raiz;
  }

  it('lee en orden, con huella, e ignora archivos ocultos como .gitkeep', async () => {
    const dir = directorio({
      '.gitkeep': '',
      'C05_001_b.sql': 'SELECT 2;\n',
      'C03_001_a.sql': 'SELECT 1;\n',
    });
    const leidas = await leerMigraciones(dir);
    expect(leidas.map((m) => m.nombre)).toEqual(['C03_001_a.sql', 'C05_001_b.sql']);
    expect(leidas[0]?.huella).toBe(calcularHuella('SELECT 1;\n'));
  });

  it('un archivo fuera del patrón hace fallar la lectura completa', async () => {
    const dir = directorio({ 'C03_001_a.sql': 'SELECT 1;\n', 'notas.txt': 'hola' });
    await expect(leerMigraciones(dir)).rejects.toMatchObject({
      codigo: 'NOMBRE_INVALIDO',
      archivo: 'notas.txt',
    });
  });

  it('una subcarpeta también se rechaza', async () => {
    const dir = directorio({});
    mkdirSync(join(dir, 'subcarpeta'));
    await expect(leerMigraciones(dir)).rejects.toMatchObject({ codigo: 'NOMBRE_INVALIDO' });
  });

  it('un directorio inexistente da un error claro', async () => {
    await expect(leerMigraciones(join(tmpdir(), 'no-existe-xyz-123'))).rejects.toMatchObject({
      codigo: 'DIRECTORIO_INEXISTENTE',
    });
  });

  it('un directorio vacío es válido (aún no hay migraciones)', async () => {
    expect(await leerMigraciones(directorio({ '.gitkeep': '' }))).toEqual([]);
  });
});
