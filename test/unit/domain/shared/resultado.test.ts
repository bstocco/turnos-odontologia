import { describe, expect, it } from 'vitest';

import { ErrorDeDominio } from '../../../../src/domain/shared/errores.js';
import { error, ok } from '../../../../src/domain/shared/resultado.js';

describe('Resultado', () => {
  it('ok() envuelve el valor', () => {
    expect(ok(42)).toEqual({ ok: true, valor: 42 });
    expect(ok('x')).toEqual({ ok: true, valor: 'x' });
  });

  it('error() envuelve el error de dominio', () => {
    const e = new ErrorDeDominio('ALGO_MAL', 'conflicto', 'mal');
    const r = error(e);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe(e);
  });
});
