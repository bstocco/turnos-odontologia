import { describe, expect, it } from 'vitest';

import { LimiteDeTasaPorClave } from '../../../src/infrastructure/auth/rate-limit.js';

describe('LimiteDeTasaPorClave', () => {
  it('permite el máximo de intentos dentro de la ventana y rechaza los siguientes', () => {
    const limite = new LimiteDeTasaPorClave(3, 10_000);
    expect(limite.excedido('ip')).toBe(false);
    expect(limite.excedido('ip')).toBe(false);
    expect(limite.excedido('ip')).toBe(false);
    expect(limite.excedido('ip')).toBe(true);
  });

  it('las claves se contabilizan por separado', () => {
    const limite = new LimiteDeTasaPorClave(1, 10_000);
    expect(limite.excedido('ip-1')).toBe(false);
    expect(limite.excedido('ip-2')).toBe(false);
  });

  it('vuelve a permitir después de la ventana', async () => {
    const limite = new LimiteDeTasaPorClave(1, 15);
    expect(limite.excedido('ip')).toBe(false);
    expect(limite.excedido('ip')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(limite.excedido('ip')).toBe(false);
  });
});
