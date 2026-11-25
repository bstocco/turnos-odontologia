import { describe, expect, it } from 'vitest';

import { LimiteDeTasaPorEmail } from '../../../src/interfaces/http/modules/publico-reservas/limite-email.js';

describe('LimiteDeTasaPorEmail (C-15)', () => {
  it('permite hasta el máximo configurado en la ventana y luego rechaza con retryAfterSegundos', () => {
    let ahoraMs = 1_000_000;
    const limitador = new LimiteDeTasaPorEmail({
      maximo: 3,
      ventanaMs: 60_000,
      capacidad: 100,
      reloj: () => ahoraMs,
    });

    expect(limitador.consumir('paciente@ejemplo.test')).toEqual({ permitido: true });
    expect(limitador.consumir('paciente@ejemplo.test')).toEqual({ permitido: true });
    expect(limitador.consumir('paciente@ejemplo.test')).toEqual({ permitido: true });

    ahoraMs += 10_000;
    const rechazado = limitador.consumir('paciente@ejemplo.test');
    expect(rechazado).toEqual({ permitido: false, retryAfterSegundos: 50 });

    // Otro email tiene su propio cupo independiente
    expect(limitador.consumir('otro@ejemplo.test')).toEqual({ permitido: true });

    // Al vencer la ventana vuelve a permitir
    ahoraMs += 50_000;
    expect(limitador.consumir('paciente@ejemplo.test')).toEqual({ permitido: true });
  });

  it('acota la memoria LRU sin superar la capacidad máxima', () => {
    const ahoraMs = 1_000_000;
    const limitador = new LimiteDeTasaPorEmail({
      maximo: 2,
      ventanaMs: 60_000,
      capacidad: 3,
      reloj: () => ahoraMs,
    });

    limitador.consumir('a@ejemplo.test');
    limitador.consumir('b@ejemplo.test');
    limitador.consumir('c@ejemplo.test');
    expect(limitador.tamano()).toBe(3);

    limitador.consumir('d@ejemplo.test');
    expect(limitador.tamano()).toBe(3);

    // 'a@ejemplo.test' fue desalojado por LRU, por lo que al reingresar reinicia su ventana
    expect(limitador.consumir('a@ejemplo.test')).toEqual({ permitido: true });
    expect(limitador.tamano()).toBe(3);
  });
});
