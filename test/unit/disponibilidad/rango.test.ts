import { describe, expect, it } from 'vitest';

import { consultarDisponibilidad } from '../../../src/application/disponibilidad/index.js';
import { PREST, PROF, dobles, escenario } from './dobles.js';

// "Hoy" = 2026-12-01 09:00 en Buenos Aires.
const AHORA = new Date('2026-12-01T12:00:00Z');

const consultar = (desde: string, hasta: string) => {
  const { deps, llamadas } = dobles(escenario({ ahora: AHORA }));
  return {
    llamadas,
    ejecutar: () =>
      consultarDisponibilidad(deps, { profesionalId: PROF, prestacionId: PREST, desde, hasta }),
  };
};

describe('rango de fechas de consultarDisponibilidad', () => {
  it.each([
    ['fecha inexistente en desde', '2026-02-30', '2026-03-05'],
    ['fecha inexistente en hasta', '2026-12-05', '2026-12-32'],
    ['formato inválido', '05/12/2026', '2026-12-10'],
    ['hasta igual a desde', '2026-12-10', '2026-12-10'],
    ['hasta anterior a desde', '2026-12-10', '2026-12-09'],
    ['15 días', '2026-12-01', '2026-12-16'],
    ['hasta a 91 días de hoy', '2027-02-20', '2027-03-02'],
  ])(
    'rechaza %s con RANGO_FECHAS_INVALIDO antes de tocar los puertos',
    async (_n, desde, hasta) => {
      const { ejecutar, llamadas } = consultar(desde, hasta);
      await expect(ejecutar()).rejects.toMatchObject({
        codigo: 'RANGO_FECHAS_INVALIDO',
        tipo: 'solicitud_invalida',
      });
      // Las comprobaciones sin base van primero (solo las de horizonte consultan la configuración).
      expect(llamadas.agenda).toEqual([]);
      expect(llamadas.prestaciones).toEqual([]);
    },
  );

  it('los rechazos puramente de forma no invocan ningún puerto', async () => {
    const { ejecutar, llamadas } = consultar('2026-12-10', '2026-12-10');
    await expect(ejecutar()).rejects.toMatchObject({ codigo: 'RANGO_FECHAS_INVALIDO' });
    expect(llamadas.recursos).toEqual([]);
    expect(llamadas.agenda).toEqual([]);
    expect(llamadas.prestaciones).toEqual([]);
  });

  it('acepta 14 días exactos', async () => {
    const r = await consultar('2026-12-01', '2026-12-15').ejecutar();
    expect(r.desde).toBe('2026-12-01');
    expect(r.hasta).toBe('2026-12-15');
  });

  it('acepta un hasta a exactamente 90 días de la fecha local de hoy', async () => {
    // hoy local = 2026-12-01; +90 días = 2027-03-01.
    const r = await consultar('2027-02-20', '2027-03-01').ejecutar();
    expect(r.huecos).toHaveLength(7);
  });

  it('acepta un desde pasado (los inicios pasados no se ofrecen)', async () => {
    const r = await consultar('2026-11-20', '2026-11-25').ejecutar();
    expect(r.huecos).toEqual([]);
  });

  it('el horizonte usa la fecha local de la clínica, no la UTC', async () => {
    // 2026-12-02T01:00Z = 2026-12-01 22:00 en Buenos Aires: hoy local sigue siendo el 1.
    const { deps } = dobles(escenario({ ahora: new Date('2026-12-02T01:00:00Z') }));
    const r = await consultarDisponibilidad(deps, {
      profesionalId: PROF,
      prestacionId: PREST,
      desde: '2027-02-20',
      hasta: '2027-03-01',
    });
    expect(r.hasta).toBe('2027-03-01');
  });
});
