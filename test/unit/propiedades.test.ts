import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { calcularHuella, validarYOrdenar } from '../../src/infrastructure/db/migraciones.js';

/**
 * Pruebas basadas en propiedades (fast-check). Demuestran que la herramienta corre y fijan dos
 * invariantes del runner de migraciones. C-02 las usa para el invariante central de la agenda.
 */
describe('propiedades del runner de migraciones', () => {
  it('la huella no depende de los fines de línea, para cualquier contenido', () => {
    fc.assert(
      fc.property(fc.string(), (contenido) => {
        const conCrlf = contenido.replace(/\r\n|\r|\n/g, '\r\n');
        const conLf = contenido.replace(/\r\n|\r|\n/g, '\n');
        expect(calcularHuella(conCrlf)).toBe(calcularHuella(conLf));
        expect(calcularHuella(conCrlf)).toBe(calcularHuella(contenido));
      }),
    );
  });

  it('el orden resultante es siempre ascendente por (change, secuencia), en cualquier permutación', () => {
    const par = fc.tuple(fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 999 }));
    fc.assert(
      fc.property(
        fc.uniqueArray(par, { selector: ([c, s]) => `${c}-${s}`, minLength: 1, maxLength: 30 }),
        (pares) => {
          const nombres = pares.map(
            ([c, s]) => `C${String(c).padStart(2, '0')}_${String(s).padStart(3, '0')}_x.sql`,
          );
          const ordenadas = validarYOrdenar(nombres);
          expect(ordenadas).toHaveLength(nombres.length);
          for (let i = 1; i < ordenadas.length; i++) {
            const anterior = ordenadas[i - 1];
            const actual = ordenadas[i];
            expect(anterior).toBeDefined();
            expect(actual).toBeDefined();
            if (anterior === undefined || actual === undefined) return;
            const ascendente =
              anterior.cambio < actual.cambio ||
              (anterior.cambio === actual.cambio && anterior.secuencia < actual.secuencia);
            expect(ascendente).toBe(true);
          }
        },
      ),
    );
  });
});
