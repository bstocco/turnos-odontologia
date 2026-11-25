import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  ANTICIPACION_RECORDATORIO_HORAS_DEFECTO,
  calcularVentanaRecordatorio,
  estaEnVentanaRecordatorio,
} from '../../../src/application/notificaciones/turnos/ventana-recordatorio.js';
import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';

describe('calcularVentanaRecordatorio', () => {
  it('calcula ventana de 24 horas en America/Argentina/Buenos_Aires por defecto', () => {
    const ahora = new Date('2026-11-24T13:30:00.000Z');
    const ventana = calcularVentanaRecordatorio({
      ahora,
      zonaHoraria: 'America/Argentina/Buenos_Aires',
    });

    expect(ANTICIPACION_RECORDATORIO_HORAS_DEFECTO).toBe(24);
    expect(ventana.desdeExclusivo).toEqual(ahora);
    expect(ventana.hastaInclusivo).toEqual(new Date('2026-11-25T13:30:00.000Z'));
  });

  it('soporta anticipacionHoras parametrizable (12, 36 y 48 horas)', () => {
    const ahora = new Date('2026-11-24T12:00:00.000Z');

    const v12 = calcularVentanaRecordatorio({
      ahora,
      zonaHoraria: 'America/Argentina/Buenos_Aires',
      anticipacionHoras: 12,
    });
    expect(v12.hastaInclusivo).toEqual(new Date('2026-11-25T00:00:00.000Z'));

    const v36 = calcularVentanaRecordatorio({
      ahora,
      zonaHoraria: 'America/Argentina/Buenos_Aires',
      anticipacionHoras: 36,
    });
    expect(v36.hastaInclusivo).toEqual(new Date('2026-11-26T00:00:00.000Z'));

    const v48 = calcularVentanaRecordatorio({
      ahora,
      zonaHoraria: 'America/Argentina/Buenos_Aires',
      anticipacionHoras: 48,
    });
    expect(v48.hastaInclusivo).toEqual(new Date('2026-11-26T12:00:00.000Z'));
  });

  it('calcula la misma hora local en transiciones DST (días de 23h y 25h) en America/New_York', () => {
    // 2026-03-08 adelanta reloj a las 02:00 EST -> 03:00 EDT (día de 23h)
    const antesSpringForward = new Date('2026-03-07T15:00:00.000Z'); // 10:00 EST
    const ventana23h = calcularVentanaRecordatorio({
      ahora: antesSpringForward,
      zonaHoraria: 'America/New_York',
      anticipacionHoras: 24,
    });
    // 10:00 EDT del 2026-03-08 es 14:00 UTC (23 horas reales después)
    expect(ventana23h.hastaInclusivo).toEqual(new Date('2026-03-08T14:00:00.000Z'));

    // 2026-11-01 atrasa reloj a las 02:00 EDT -> 01:00 EST (día de 25h)
    const antesFallBack = new Date('2026-10-31T14:00:00.000Z'); // 10:00 EDT
    const ventana25h = calcularVentanaRecordatorio({
      ahora: antesFallBack,
      zonaHoraria: 'America/New_York',
      anticipacionHoras: 24,
    });
    // 10:00 EST del 2026-11-01 es 15:00 UTC (25 horas reales después)
    expect(ventana25h.hastaInclusivo).toEqual(new Date('2026-11-01T15:00:00.000Z'));
  });

  it('resuelve determinísticamente sin lanzar si la hora local objetivo no existe por adelanto DST', () => {
    // 2026-03-07T07:30:00Z = 02:30 EST en America/New_York; 02:30 no existe el 2026-03-08
    const ahora = new Date('2026-03-07T07:30:00.000Z');
    const ventana = calcularVentanaRecordatorio({
      ahora,
      zonaHoraria: 'America/New_York',
      anticipacionHoras: 24,
    });

    // Primer instante local válido desde 02:30 es 03:00 EDT = 07:00Z (23h30m reales después)
    expect(ventana.desdeExclusivo).toEqual(ahora);
    expect(ventana.hastaInclusivo).toEqual(new Date('2026-03-08T07:00:00.000Z'));
  });

  it('rechaza zonas con desplazamiento fijo, zonas inválidas, fechas inválidas y anticipación no entera positiva', () => {
    const ahora = new Date('2026-11-24T12:00:00.000Z');

    for (const zonaInvalida of ['', 'UTC-3', '-03:00', 'Zona/Inexistente']) {
      expect(() => calcularVentanaRecordatorio({ ahora, zonaHoraria: zonaInvalida })).toThrowError(
        ErrorDeDominio,
      );
    }

    expect(() =>
      calcularVentanaRecordatorio({
        ahora: new Date('fecha-invalida'),
        zonaHoraria: 'America/Argentina/Buenos_Aires',
      }),
    ).toThrowError(ErrorDeDominio);

    for (const anticipacionInvalida of [0, -1, 1.5, Number.NaN]) {
      expect(() =>
        calcularVentanaRecordatorio({
          ahora,
          zonaHoraria: 'America/Argentina/Buenos_Aires',
          anticipacionHoras: anticipacionInvalida,
        }),
      ).toThrowError(
        expect.objectContaining({
          codigo: 'ANTICIPACION_RECORDATORIO_INVALIDA',
        }),
      );
    }
  });

  it('excluye inicio <= ahora e incluye inicio === hastaInclusivo en estaEnVentanaRecordatorio', () => {
    const ahora = new Date('2026-11-24T12:00:00.000Z');
    const ventana = calcularVentanaRecordatorio({
      ahora,
      zonaHoraria: 'America/Argentina/Buenos_Aires',
    });

    expect(estaEnVentanaRecordatorio(new Date('2026-11-24T11:59:59.000Z'), ventana)).toBe(false);
    expect(estaEnVentanaRecordatorio(ahora, ventana)).toBe(false);
    expect(estaEnVentanaRecordatorio(new Date('2026-11-24T12:00:00.001Z'), ventana)).toBe(true);
    expect(estaEnVentanaRecordatorio(ventana.hastaInclusivo, ventana)).toBe(true);
    expect(estaEnVentanaRecordatorio(new Date('2026-11-25T12:00:00.001Z'), ventana)).toBe(false);
  });

  it('propiedad (fast-check): siempre produce hastaInclusivo > desdeExclusivo en cualquier zona IANA y fecha', () => {
    const zonas = fc.constantFrom(
      'America/Argentina/Buenos_Aires',
      'America/New_York',
      'Europe/Madrid',
      'America/Mexico_City',
      'UTC',
    );
    const fechas = fc.date({
      min: new Date('2025-01-01T00:00:00.000Z'),
      max: new Date('2027-12-31T23:59:59.000Z'),
      noInvalidDate: true,
    });
    const horas = fc.integer({ min: 1, max: 168 });

    fc.assert(
      fc.property(fechas, zonas, horas, (ahora, zonaHoraria, anticipacionHoras) => {
        const ventana = calcularVentanaRecordatorio({ ahora, zonaHoraria, anticipacionHoras });
        expect(ventana.desdeExclusivo.getTime()).toBe(ahora.getTime());
        expect(ventana.hastaInclusivo.getTime()).toBeGreaterThan(ventana.desdeExclusivo.getTime());
      }),
    );
  });
});
