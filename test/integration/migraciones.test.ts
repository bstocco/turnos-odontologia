import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aplicarMigraciones } from '../../src/infrastructure/db/ejecutor-de-migraciones.js';
import { ErrorDeMigracion } from '../../src/infrastructure/db/migraciones.js';
import {
  configDeBaseDePrueba,
  consultarComoMigra,
  reiniciarEsquema,
} from '../support/base-de-datos.js';

const config = configDeBaseDePrueba();
const URL_MIGRA = config.testDatabaseMigrationUrl as string;

const temporales: string[] = [];

function directorio(archivos: Record<string, string> = {}): string {
  const raiz = mkdtempSync(join(tmpdir(), 'migraciones-it-'));
  temporales.push(raiz);
  for (const [nombre, contenido] of Object.entries(archivos)) {
    writeFileSync(join(raiz, nombre), contenido);
  }
  return raiz;
}

const aplicar = (dir: string) => aplicarMigraciones({ urlDeMigracion: URL_MIGRA, directorio: dir });

async function existeTabla(nombre: string): Promise<boolean> {
  const filas = await consultarComoMigra<{ existe: boolean }>(
    URL_MIGRA,
    'SELECT to_regclass($1) IS NOT NULL AS existe',
    [`public.${nombre}`],
  );
  return filas[0]?.existe === true;
}

async function filasDeControl(): Promise<string[]> {
  const filas = await consultarComoMigra<{ nombre: string }>(
    URL_MIGRA,
    'SELECT nombre FROM schema_migrations ORDER BY nombre',
  );
  return filas.map((f) => f.nombre);
}

async function captura(promesa: Promise<unknown>): Promise<ErrorDeMigracion> {
  try {
    await promesa;
  } catch (e) {
    if (e instanceof ErrorDeMigracion) return e;
    throw e;
  }
  throw new Error('Se esperaba que la ejecución fallara');
}

beforeEach(async () => {
  await reiniciarEsquema(URL_MIGRA);
});

afterEach(() => {
  for (const d of temporales.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('migración de ejemplo de los fixtures', () => {
  it('se aplica desde el directorio de fixtures y no desde migrations/', async () => {
    const fixtures = join(process.cwd(), 'test/fixtures/migraciones-ejemplo');
    const resultado = await aplicar(fixtures);
    expect(resultado.aplicadas).toEqual(['C99_001_ejemplo.sql']);
    expect(await existeTabla('ejemplo_fixture')).toBe(true);
  });
});

describe('registro de migraciones aplicadas', () => {
  it('segunda ejecución sin cambios: no aplica nada y termina bien', async () => {
    const dir = directorio({ 'C03_001_base.sql': 'CREATE TABLE base (id int);\n' });

    const primera = await aplicar(dir);
    expect(primera.aplicadas).toEqual(['C03_001_base.sql']);

    const segunda = await aplicar(dir);
    expect(segunda.aplicadas).toEqual([]);
    expect(segunda.yaAplicadas).toBe(1);
    expect(await filasDeControl()).toEqual(['C03_001_base.sql']);
  });

  it('registra nombre, huella e instante de cada migración', async () => {
    const dir = directorio({ 'C03_001_base.sql': 'CREATE TABLE base (id int);\n' });
    await aplicar(dir);
    const filas = await consultarComoMigra<{ huella: string; aplicada_en: Date }>(
      URL_MIGRA,
      'SELECT huella, aplicada_en FROM schema_migrations',
    );
    expect(filas[0]?.huella).toMatch(/^[0-9a-f]{64}$/);
    expect(filas[0]?.aplicada_en).toBeInstanceOf(Date);
  });

  it('migración nueva con orden posterior: aplica solo esa', async () => {
    const dir = directorio({ 'C03_001_base.sql': 'CREATE TABLE base (id int);\n' });
    await aplicar(dir);

    writeFileSync(join(dir, 'C03_002_extra.sql'), 'CREATE TABLE extra (id int);\n');
    const resultado = await aplicar(dir);
    expect(resultado.aplicadas).toEqual(['C03_002_extra.sql']);
    expect(await existeTabla('extra')).toBe(true);
  });

  it('aplica una migración de orden anterior (changes independientes) y lo informa', async () => {
    const dir = directorio({ 'C07_001_audit.sql': 'CREATE TABLE audit (id int);\n' });
    await aplicar(dir);

    writeFileSync(join(dir, 'C06_001_auth.sql'), 'CREATE TABLE auth (id int);\n');
    const resultado = await aplicar(dir);
    expect(resultado.aplicadas).toEqual(['C06_001_auth.sql']);
    expect(resultado.fueraDeOrden).toEqual(['C06_001_auth.sql']);
  });

  it('un cambio de fines de línea no se considera una edición', async () => {
    const sql = 'CREATE TABLE base (id int);\nCREATE TABLE otra (id int);\n';
    const dir = directorio({ 'C03_001_base.sql': sql });
    await aplicar(dir);

    writeFileSync(join(dir, 'C03_001_base.sql'), sql.replace(/\n/g, '\r\n'));
    const resultado = await aplicar(dir);
    expect(resultado.aplicadas).toEqual([]);
  });
});

describe('inmutabilidad de lo ya aplicado', () => {
  it('una migración editada falla nombrando el archivo y no aplica las posteriores', async () => {
    const dir = directorio({ 'C03_001_base.sql': 'CREATE TABLE base (id int);\n' });
    await aplicar(dir);

    writeFileSync(join(dir, 'C03_001_base.sql'), 'CREATE TABLE base (id int, extra int);\n');
    writeFileSync(join(dir, 'C03_002_nueva.sql'), 'CREATE TABLE nueva (id int);\n');

    const error = await captura(aplicar(dir));
    expect(error.codigo).toBe('HUELLA_DISTINTA');
    expect(error.archivo).toBe('C03_001_base.sql');
    expect(error.message).toContain('C03_001_base.sql');
    expect(await existeTabla('nueva')).toBe(false);
  });

  it('una migración aplicada que desapareció del directorio falla', async () => {
    const dir = directorio({ 'C03_001_base.sql': 'CREATE TABLE base (id int);\n' });
    await aplicar(dir);
    unlinkSync(join(dir, 'C03_001_base.sql'));

    const error = await captura(aplicar(dir));
    expect(error.codigo).toBe('MIGRACION_AUSENTE');
  });
});

describe('atomicidad por migración', () => {
  it('una sentencia inválida a mitad de archivo revierte todo y no queda registrada', async () => {
    const dir = directorio({
      'C03_001_rota.sql': 'CREATE TABLE parcial (id int);\nSELEC 1;\n',
    });
    const error = await captura(aplicar(dir));
    expect(error.codigo).toBe('FALLO_EN_MIGRACION');
    expect(error.archivo).toBe('C03_001_rota.sql');

    expect(await existeTabla('parcial')).toBe(false);
    expect(await filasDeControl()).toEqual([]);
  });

  it('las migraciones anteriores a la que falla permanecen aplicadas', async () => {
    const dir = directorio({
      'C03_001_ok.sql': 'CREATE TABLE ok (id int);\n',
      'C03_002_rota.sql': 'CREATE TABLE a_medias (id int);\nSELEC 1;\n',
      'C03_003_nunca.sql': 'CREATE TABLE nunca (id int);\n',
    });
    await captura(aplicar(dir));

    expect(await existeTabla('ok')).toBe(true);
    expect(await existeTabla('a_medias')).toBe(false);
    expect(await existeTabla('nunca')).toBe(false);
    expect(await filasDeControl()).toEqual(['C03_001_ok.sql']);
  });
});

describe('ejecución única y con rol propio', () => {
  it('dos ejecuciones simultáneas: solo una aplica y la otra no duplica nada', async () => {
    const dir = directorio({
      'C03_001_lenta.sql': 'CREATE TABLE lenta (id int);\nSELECT pg_sleep(1);\n',
    });

    const [a, b] = await Promise.all([aplicar(dir), aplicar(dir)]);
    expect(a.aplicadas.length + b.aplicadas.length).toBe(1);
    expect(await filasDeControl()).toEqual(['C03_001_lenta.sql']);
    expect(await existeTabla('lenta')).toBe(true);
  });

  it('las migraciones se ejecutan con el rol de migraciones', async () => {
    const dir = directorio({
      'C03_001_quien.sql':
        'CREATE TABLE quien (usuario text);\nINSERT INTO quien VALUES (current_user);\n',
    });
    await aplicar(dir);
    const filas = await consultarComoMigra<{ usuario: string }>(
      URL_MIGRA,
      'SELECT usuario FROM quien',
    );
    expect(filas[0]?.usuario).toBe('migra');
  });

  it('sin conexión de migraciones falla y no usa la de la aplicación', async () => {
    const dir = directorio({ 'C03_001_base.sql': 'CREATE TABLE base (id int);\n' });
    const error = await captura(aplicarMigraciones({ urlDeMigracion: undefined, directorio: dir }));
    expect(error.codigo).toBe('SIN_CONEXION_DE_MIGRACIONES');
    expect(await existeTabla('base')).toBe(false);
  });

  it('valida nombres y duplicados antes de abrir ninguna conexión', async () => {
    const dir = directorio({ 'C03_001_a.sql': 'SELECT 1;\n', 'C03_001_b.sql': 'SELECT 2;\n' });
    const error = await captura(
      aplicarMigraciones({
        // Un host inalcanzable: si intentara conectar, fallaría con otro error.
        urlDeMigracion: 'postgres://x:y@127.0.0.1:1/inexistente',
        directorio: dir,
      }),
    );
    expect(error.codigo).toBe('SECUENCIA_REPETIDA');
  });
});
