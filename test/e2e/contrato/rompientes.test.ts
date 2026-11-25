import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Contrato } from './comparar.js';
import {
  leerBaseDesdeGit,
  seccionDeVersion,
  verificarCambiosRompientes,
  type LecturaDeBase,
} from './rompientes.js';

const ejecutar = promisify(execFile);

function contrato(version: string, propiedades: string[]): string {
  const doc: Contrato = {
    openapi: '3.0.3',
    info: { title: 't', version },
    paths: {
      '/a': {
        get: {
          responses: {
            '200': {
              description: 'ok',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: Object.fromEntries(propiedades.map((p) => [p, { type: 'string' }])),
                  },
                },
              },
            },
          },
        },
      },
    },
  };
  return JSON.stringify(doc);
}

const registro = (...entradas: string[]): string => entradas.join('\n\n');
const base = (texto: string): LecturaDeBase => ({ estado: 'leida', contrato: texto });

describe('verificarCambiosRompientes', () => {
  it('pasa si main todavía no tiene contrato (primer contrato)', async () => {
    const resultado = await verificarCambiosRompientes({
      leerBase: async () => ({ estado: 'sin_contrato' }),
      actual: contrato('1.0.0', ['id']),
      registro: registro('## [1.0.0] - 2026-11-24'),
      ci: true,
    });
    expect(resultado.estado).toBe('ok');
  });

  it('un cambio aditivo pasa sin exigir subida de versión mayor', async () => {
    const resultado = await verificarCambiosRompientes({
      leerBase: async () => base(contrato('1.0.0', ['id'])),
      actual: contrato('1.0.0', ['id', 'nueva']),
      registro: registro('## [1.0.0] - 2026-11-24'),
      ci: true,
    });
    expect(resultado.estado).toBe('ok');
  });

  it('un rompiente sin declarar falla y lista el cambio', async () => {
    const resultado = await verificarCambiosRompientes({
      leerBase: async () => base(contrato('1.0.0', ['id', 'nombre'])),
      actual: contrato('1.0.0', ['id']),
      registro: registro('## [1.0.0] - 2026-11-24'),
      ci: true,
    });
    expect(resultado.estado).toBe('falla');
    expect(resultado.mensajes.join('\n')).toContain('GET /a');
    expect(resultado.mensajes.join('\n')).toContain('nombre');
  });

  it('un rompiente declarado (versión mayor y entrada marcada) pasa', async () => {
    const resultado = await verificarCambiosRompientes({
      leerBase: async () => base(contrato('1.0.0', ['id', 'nombre'])),
      actual: contrato('2.0.0', ['id']),
      registro: registro(
        '## [2.0.0] - 2026-12-01\n\n- **Rompiente**: se quita `nombre` de `GET /a`.',
        '## [1.0.0] - 2026-11-24',
      ),
      ci: true,
    });
    expect(resultado.estado).toBe('ok');
  });

  it('sube la versión mayor pero la entrada del registro no está marcada: falla', async () => {
    const resultado = await verificarCambiosRompientes({
      leerBase: async () => base(contrato('1.0.0', ['id', 'nombre'])),
      actual: contrato('2.0.0', ['id']),
      registro: registro(
        '## [2.0.0] - 2026-12-01\n\n- Se quita `nombre`.',
        '## [1.0.0] - 2026-11-24',
      ),
      ci: true,
    });
    expect(resultado.estado).toBe('falla');
    expect(resultado.mensajes.join('\n')).toContain('Rompiente');
  });

  it('la entrada está marcada pero la versión mayor no subió: falla', async () => {
    const resultado = await verificarCambiosRompientes({
      leerBase: async () => base(contrato('1.0.0', ['id', 'nombre'])),
      actual: contrato('1.1.0', ['id']),
      registro: registro('## [1.1.0] - 2026-12-01\n\n- **Rompiente**: se quita `nombre`.'),
      ci: true,
    });
    expect(resultado.estado).toBe('falla');
    expect(resultado.mensajes.join('\n')).toContain('mayor');
  });

  it('en CI, una base ilegible hace fallar la verificación', async () => {
    const resultado = await verificarCambiosRompientes({
      leerBase: async () => ({ estado: 'ilegible', motivo: 'sin origin/main' }),
      actual: contrato('1.0.0', ['id']),
      registro: registro('## [1.0.0] - 2026-11-24'),
      ci: true,
    });
    expect(resultado.estado).toBe('falla');
    expect(resultado.mensajes.join('\n')).toContain('sin origin/main');
  });

  it('fuera de CI, una base ilegible se omite con un aviso', async () => {
    const resultado = await verificarCambiosRompientes({
      leerBase: async () => ({ estado: 'ilegible', motivo: 'sin origin/main' }),
      actual: contrato('1.0.0', ['id']),
      registro: registro('## [1.0.0] - 2026-11-24'),
      ci: false,
    });
    expect(resultado.estado).toBe('omitido');
    expect(resultado.mensajes.join('\n')).toContain('sin origin/main');
  });
});

describe('seccionDeVersion', () => {
  const texto = registro(
    '# Registro',
    '## [2.0.0] - 2026-12-01\n\n- **Rompiente**: algo.',
    '## [1.0.0] - 2026-11-24\n\n- Inicial.',
  );

  it('devuelve solo el texto de la versión pedida', () => {
    expect(seccionDeVersion(texto, '2.0.0')).toContain('Rompiente');
    expect(seccionDeVersion(texto, '1.0.0')).not.toContain('Rompiente');
    expect(seccionDeVersion(texto, '1.0.0')).toContain('Inicial');
  });

  it('devuelve vacío si la versión no está declarada', () => {
    expect(seccionDeVersion(texto, '3.0.0')).toBe('');
  });
});

describe('leerBaseDesdeGit (repositorio temporal, sin shell)', () => {
  let directorio: string;
  const git = (...args: string[]) =>
    ejecutar(
      'git',
      ['-c', 'user.name=Prueba', '-c', 'user.email=prueba@ejemplo.invalid', ...args],
      { cwd: directorio },
    );

  beforeAll(async () => {
    directorio = await mkdtemp(join(tmpdir(), 'c18-git-'));
    await git('init', '--quiet');
    await writeFile(join(directorio, 'otro.txt'), 'x');
    await git('add', '.');
    await git('commit', '--quiet', '-m', 'sin contrato');
    await git('tag', 'sin-contrato');
    await mkdir(join(directorio, 'docs', 'api'), { recursive: true });
    await writeFile(join(directorio, 'docs', 'api', 'openapi.json'), '{"openapi":"3.0.3"}\n');
    await git('add', '.');
    await git('commit', '--quiet', '-m', 'con contrato');
    await git('tag', 'con-contrato');
  });

  afterAll(async () => {
    await rm(directorio, { recursive: true, force: true });
  });

  it('lee el contrato de la referencia indicada', async () => {
    const lectura = await leerBaseDesdeGit('con-contrato', directorio)();
    expect(lectura).toEqual({ estado: 'leida', contrato: '{"openapi":"3.0.3"}\n' });
  });

  it('una referencia sin contrato es "sin_contrato"', async () => {
    expect((await leerBaseDesdeGit('sin-contrato', directorio)()).estado).toBe('sin_contrato');
  });

  it('una referencia inexistente es "ilegible"', async () => {
    const lectura = await leerBaseDesdeGit('origin/no-existe', directorio)();
    expect(lectura.estado).toBe('ilegible');
  });

  it('no interpreta la referencia como una opción ni como un comando', async () => {
    const lectura = await leerBaseDesdeGit('--output=/tmp/x', directorio)();
    expect(lectura.estado).toBe('ilegible');
  });
});
