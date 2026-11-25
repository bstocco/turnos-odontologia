import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  consultarDisponibilidad,
  huecoOfrecido,
} from '../../../src/application/disponibilidad/index.js';
import { PREST, PROF, SILLON_1, SILLON_2, dobles, escenario, turno } from './dobles.js';

const DOS_SILLONES = [
  { id: SILLON_1, bufferMinutos: 0, activo: true },
  { id: SILLON_2, bufferMinutos: 0, activo: true },
];
const VERIF = (inicio: string) => ({
  profesionalId: PROF,
  prestacionId: PREST,
  inicio: new Date(inicio),
});

describe('huecoOfrecido', () => {
  it('devuelve el hueco con sus sillones asignables cuando el inicio se ofrece', async () => {
    const { deps } = dobles(escenario({ sillones: DOS_SILLONES }));
    const h = await huecoOfrecido(deps, VERIF('2026-12-09T11:00:00Z'));
    expect(h?.intervalo.inicio.toISOString()).toBe('2026-12-09T11:00:00.000Z');
    expect(h?.sillonesAsignables).toEqual([SILLON_1, SILLON_2]);
  });

  it('solo informa los sillones realmente libres en ese inicio', async () => {
    const t = turno({
      inicio: '2026-12-09T11:00:00Z',
      minutos: 30,
      sillonId: SILLON_1,
      profesionalId: 'cccccccc-0000-4000-8000-000000000009',
    });
    const { deps } = dobles(escenario({ sillones: DOS_SILLONES, turnosSillones: [t] }));
    const h = await huecoOfrecido(deps, VERIF('2026-12-09T11:00:00Z'));
    expect(h?.sillonesAsignables).toEqual([SILLON_2]);
  });

  it('inicio ocupado por otro turno del profesional: null', async () => {
    const t = turno({ inicio: '2026-12-09T11:00:00Z', minutos: 30 });
    const { deps } = dobles(escenario({ turnosProfesional: [t], turnosSillones: [t] }));
    expect(await huecoOfrecido(deps, VERIF('2026-12-09T11:00:00Z'))).toBeNull();
  });

  it('inicio desalineado con la granularidad: null', async () => {
    const { deps } = dobles(escenario());
    expect(await huecoOfrecido(deps, VERIF('2026-12-09T11:07:00Z'))).toBeNull();
  });

  it('inicio en feriado: null', async () => {
    const { deps } = dobles(escenario({ feriados: ['2026-12-09' as never] }));
    expect(await huecoOfrecido(deps, VERIF('2026-12-09T11:00:00Z'))).toBeNull();
  });

  it('inicio fuera de franja: null', async () => {
    const { deps } = dobles(escenario());
    expect(await huecoOfrecido(deps, VERIF('2026-12-09T14:00:00Z'))).toBeNull();
  });

  it('inicio pasado: null', async () => {
    const { deps } = dobles(escenario({ ahora: new Date('2026-12-09T11:20:00Z') }));
    expect(await huecoOfrecido(deps, VERIF('2026-12-09T11:00:00Z'))).toBeNull();
  });

  it.each([
    ['profesional inexistente', { profesionalActivo: null }],
    ['prestación inexistente', { prestacion: null }],
  ])('%s: RECURSO_NO_ENCONTRADO', async (_n, extra) => {
    const { deps } = dobles(escenario(extra));
    await expect(huecoOfrecido(deps, VERIF('2026-12-09T11:00:00Z'))).rejects.toMatchObject({
      codigo: 'RECURSO_NO_ENCONTRADO',
    });
  });

  it('es una consulta pura: no escribe nada (solo invoca lecturas)', async () => {
    const { deps, llamadas } = dobles(escenario());
    await huecoOfrecido(deps, VERIF('2026-12-09T11:00:00Z'));
    expect(llamadas.agenda.every((n) => !/crear|insert|guardar|actualizar/i.test(n))).toBe(true);
  });

  it('propiedad: todo hueco de consultarDisponibilidad se devuelve igual por huecoOfrecido', async () => {
    const bufferArb = fc.integer({ min: 0, max: 30 });
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 7 }), { maxLength: 4 }), // turnos: índice de slot 0..7
        bufferArb,
        fc.boolean(),
        async (slots, buffer, dosSillones) => {
          const sillones = (dosSillones ? DOS_SILLONES : DOS_SILLONES.slice(0, 1)).map((s) => ({
            ...s,
            bufferMinutos: buffer,
          }));
          const turnos = slots.map((s, i) =>
            turno({
              inicio: new Date(Date.parse('2026-12-09T11:00:00Z') + s * 15 * 60_000).toISOString(),
              minutos: 30,
              buffer,
              sillonId: sillones[i % sillones.length]?.id,
              profesionalId: i % 2 === 0 ? PROF : 'cccccccc-0000-4000-8000-000000000009',
              id: `a0000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
            }),
          );
          const esc = escenario({
            sillones,
            turnosSillones: turnos,
            turnosProfesional: turnos.filter((t) => t.profesionalId === PROF),
          });
          const { deps } = dobles(esc);
          const r = await consultarDisponibilidad(deps, {
            profesionalId: PROF,
            prestacionId: PREST,
            desde: '2026-12-09',
            hasta: '2026-12-10',
          });
          for (const hueco of r.huecos) {
            const h = await huecoOfrecido(deps, {
              profesionalId: PROF,
              prestacionId: PREST,
              inicio: new Date(hueco.inicio),
            });
            expect(h?.intervalo.inicio.toISOString()).toBe(hueco.inicio);
            expect(h?.intervalo.fin.toISOString()).toBe(hueco.fin);
            expect(h?.sillonesAsignables.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});
