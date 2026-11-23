import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

async function reglasInfringidas(codigo: string, filePath: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [resultado] = await eslint.lintText(codigo, { filePath });
  return (resultado?.messages ?? []).map((m) => m.ruleId ?? 'sin-regla');
}

describe('reglas de capas hexagonales', () => {
  it('el dominio no puede importar infrastructure', async () => {
    const reglas = await reglasInfringidas(
      "import { pool } from '../../infrastructure/db/pool.js';\nexport const p = pool;\n",
      'src/domain/agenda/ejemplo.ts',
    );
    expect(reglas).toContain('no-restricted-imports');
  });

  it('el dominio no puede importar pg ni fastify', async () => {
    const pg = await reglasInfringidas(
      "import pg from 'pg';\nexport default pg;\n",
      'src/domain/agenda/ejemplo.ts',
    );
    const fastify = await reglasInfringidas(
      "import Fastify from 'fastify';\nexport default Fastify;\n",
      'src/domain/agenda/ejemplo.ts',
    );
    expect(pg).toContain('no-restricted-imports');
    expect(fastify).toContain('no-restricted-imports');
  });

  it('la aplicación no puede importar infrastructure pero sí el dominio', async () => {
    const mala = await reglasInfringidas(
      "import { repo } from '../infrastructure/db/repo.js';\nexport const r = repo;\n",
      'src/application/turnos/ejemplo.ts',
    );
    const buena = await reglasInfringidas(
      "import { Intervalo } from '../../domain/agenda/intervalo.js';\nexport const i = Intervalo;\n",
      'src/application/turnos/ejemplo.ts',
    );
    expect(mala).toContain('no-restricted-imports');
    expect(buena).not.toContain('no-restricted-imports');
  });

  it('la infraestructura sí puede importar pg', async () => {
    const reglas = await reglasInfringidas(
      "import pg from 'pg';\nexport default pg;\n",
      'src/infrastructure/db/ejemplo.ts',
    );
    expect(reglas).not.toContain('no-restricted-imports');
  });
});

describe('lectura del entorno', () => {
  const codigo = 'export const puerto = process.env.PORT;\n';

  it('process.env se rechaza fuera de src/config/', async () => {
    expect(await reglasInfringidas(codigo, 'src/application/ejemplo.ts')).toContain(
      'no-restricted-properties',
    );
    expect(await reglasInfringidas(codigo, 'src/interfaces/http/ejemplo.ts')).toContain(
      'no-restricted-properties',
    );
  });

  it('process.env se permite en src/config/', async () => {
    expect(await reglasInfringidas(codigo, 'src/config/ejemplo.ts')).not.toContain(
      'no-restricted-properties',
    );
  });
});

describe('tipado estricto', () => {
  it('rechaza any explícito y @ts-ignore', async () => {
    const conAny = await reglasInfringidas('export const f = (x: any) => x;\n', 'src/ejemplo.ts');
    const conIgnore = await reglasInfringidas(
      '// @ts-ignore\nexport const n: number = "a";\n',
      'src/ejemplo.ts',
    );
    expect(conAny).toContain('@typescript-eslint/no-explicit-any');
    expect(conIgnore).toContain('@typescript-eslint/ban-ts-comment');
  });

  it('el código limpio no tiene infracciones', async () => {
    const reglas = await reglasInfringidas(
      'export const sumar = (a: number, b: number): number => a + b;\n',
      'src/domain/ejemplo.ts',
    );
    expect(reglas).toEqual([]);
  });
});
