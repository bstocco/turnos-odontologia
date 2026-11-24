import { describe, expect, it } from 'vitest';

import {
  calcularDisponibilidad,
  crearFechaLocal,
  crearIntervaloOLanzar,
  type FechaLocal,
} from '../../../src/domain/agenda/index.js';
import { valorOLanzar } from '../../../src/domain/shared/resultado.js';
import { consultarDisponibilidad } from '../../../src/application/disponibilidad/index.js';
import { CONFIG, PREST, PROF, SILLON_1, SILLON_2, dobles, escenario, turno } from './dobles.js';

const fecha = (s: string): FechaLocal => valorOLanzar(crearFechaLocal(s));
const CONSULTA = {
  profesionalId: PROF,
  prestacionId: PREST,
  desde: '2026-12-09',
  hasta: '2026-12-10',
};

describe('consultarDisponibilidad: recursos inexistentes', () => {
  it.each([
    ['profesional inexistente', { profesionalActivo: null }],
    ['profesional inactivo', { profesionalActivo: false }],
    ['prestación inexistente', { prestacion: null }],
    [
      'prestación inactiva',
      { prestacion: { id: PREST, nombre: 'X', duracionMinutos: 30, activa: false } },
    ],
  ])('%s responde el mismo ErrorDeDominio RECURSO_NO_ENCONTRADO', async (_n, extra) => {
    const { deps } = dobles(escenario(extra));
    await expect(consultarDisponibilidad(deps, CONSULTA)).rejects.toMatchObject({
      codigo: 'RECURSO_NO_ENCONTRADO',
      tipo: 'no_encontrado',
      message: 'El recurso solicitado no existe.',
    });
  });

  it('un profesional inexistente no llega al AgendaReader (que no valida UUID)', async () => {
    const { deps, llamadas } = dobles(escenario({ profesionalActivo: null }));
    await expect(consultarDisponibilidad(deps, CONSULTA)).rejects.toBeDefined();
    expect(llamadas.agenda).toEqual([]);
  });

  it('orden de comprobaciones: rango antes que recursos, horizonte antes que profesional', async () => {
    const a = dobles(escenario({ profesionalActivo: null, prestacion: null }));
    await expect(
      consultarDisponibilidad(a.deps, { ...CONSULTA, hasta: CONSULTA.desde }),
    ).rejects.toMatchObject({ codigo: 'RANGO_FECHAS_INVALIDO' });
    const b = dobles(escenario({ profesionalActivo: null, prestacion: null }));
    await expect(
      consultarDisponibilidad(b.deps, { ...CONSULTA, desde: '2028-01-01', hasta: '2028-01-05' }),
    ).rejects.toMatchObject({ codigo: 'RANGO_FECHAS_INVALIDO' });
    // Con rango válido y ambos recursos inexistentes: el 404 llega al final.
    const c = dobles(escenario({ profesionalActivo: null, prestacion: null }));
    await expect(consultarDisponibilidad(c.deps, CONSULTA)).rejects.toMatchObject({
      codigo: 'RECURSO_NO_ENCONTRADO',
    });
  });
});

describe('consultarDisponibilidad: cálculo', () => {
  it('día libre de 08:00 a 10:00 con prestación de 30: 7 huecos en UTC y zona horaria', async () => {
    const { deps } = dobles(escenario());
    const r = await consultarDisponibilidad(deps, CONSULTA);
    expect(r.zonaHoraria).toBe(CONFIG.zonaHoraria);
    expect(r.profesionalId).toBe(PROF);
    expect(r.prestacionId).toBe(PREST);
    expect(r.huecos).toHaveLength(7);
    expect(r.huecos[0]).toEqual({
      inicio: '2026-12-09T11:00:00.000Z',
      fin: '2026-12-09T11:30:00.000Z',
    });
    expect(r.huecos[6]).toEqual({
      inicio: '2026-12-09T12:30:00.000Z',
      fin: '2026-12-09T13:00:00.000Z',
    });
  });

  it('coincide con calcularDisponibilidad sobre los mismos datos (con turnos de ambos orígenes)', async () => {
    const delProfesional = turno({
      inicio: '2026-12-09T12:00:00Z',
      minutos: 30,
      id: 'a0000000-0000-4000-8000-000000000001',
    });
    const deOtroEnSillon = turno({
      profesionalId: 'cccccccc-0000-4000-8000-000000000009',
      inicio: '2026-12-09T11:00:00Z',
      minutos: 30,
      buffer: 15,
      id: 'a0000000-0000-4000-8000-000000000002',
    });
    const sillones = [
      { id: SILLON_1, bufferMinutos: 15, activo: true },
      { id: SILLON_2, bufferMinutos: 0, activo: true },
    ];
    const esc = escenario({
      sillones,
      turnosProfesional: [delProfesional],
      turnosSillones: [delProfesional, deOtroEnSillon],
      feriados: [fecha('2026-12-12')],
    });
    const { deps } = dobles(esc);
    const r = await consultarDisponibilidad(deps, CONSULTA);

    const esperado = valorOLanzar(
      calcularDisponibilidad({
        profesionalId: PROF as never,
        duracionMinutos: 30,
        desde: fecha('2026-12-09'),
        hasta: fecha('2026-12-10'),
        franjas: esc.franjas,
        feriados: esc.feriados,
        bloqueos: [],
        turnos: [delProfesional, deOtroEnSillon],
        sillones,
        config: CONFIG,
        ahora: esc.ahora,
      }),
    );
    expect(r.huecos).toEqual(
      esperado.map((h) => ({
        inicio: h.intervalo.inicio.toISOString(),
        fin: h.intervalo.fin.toISOString(),
      })),
    );
    expect(r.huecos.length).toBeGreaterThan(0);
    expect(r.huecos.length).toBeLessThan(7);
  });

  it('la salida no contiene pacienteId ni sillonesAsignables ni ids de turno o sillón', async () => {
    const t = turno({
      inicio: '2026-12-09T11:00:00Z',
      minutos: 30,
      id: 'a0000000-0000-4000-8000-0000000000ff',
    });
    const { deps } = dobles(escenario({ turnosProfesional: [t], turnosSillones: [t] }));
    const texto = JSON.stringify(await consultarDisponibilidad(deps, CONSULTA));
    expect(texto).not.toContain(t.pacienteId);
    expect(texto).not.toContain(t.id);
    expect(texto).not.toContain(SILLON_1);
    expect(texto).not.toContain('sillonesAsignables');
  });

  it('ensancha la ventana de consulta un día a cada lado del rango', async () => {
    const { deps, llamadas } = dobles(escenario());
    await consultarDisponibilidad(deps, CONSULTA);
    // 2026-12-09 00:00 y 2026-12-10 00:00 en Buenos Aires = 03:00Z.
    const ventana = llamadas.ventanas[0];
    expect(ventana).toEqual(
      crearIntervaloOLanzar(new Date('2026-12-08T03:00:00Z'), new Date('2026-12-11T03:00:00Z')),
    );
  });

  it('deduplica por id los turnos del profesional y de los sillones', async () => {
    const t = turno({
      inicio: '2026-12-09T11:00:00Z',
      minutos: 30,
      id: 'a0000000-0000-4000-8000-0000000000aa',
    });
    const unico = dobles(escenario({ turnosProfesional: [t], turnosSillones: [] }));
    const duplicado = dobles(escenario({ turnosProfesional: [t], turnosSillones: [t, t] }));
    const a = await consultarDisponibilidad(unico.deps, CONSULTA);
    const b = await consultarDisponibilidad(duplicado.deps, CONSULTA);
    expect(b.huecos).toEqual(a.huecos);
    expect(a.huecos).toHaveLength(5);
  });

  it('sin sillones activos no consulta turnosActivosDeSillones y no hay huecos', async () => {
    const { deps, llamadas } = dobles(
      escenario({ sillones: [{ id: SILLON_1, bufferMinutos: 0, activo: false }] }),
    );
    const r = await consultarDisponibilidad(deps, CONSULTA);
    expect(r.huecos).toEqual([]);
    expect(llamadas.agenda).not.toContain('turnosActivosDeSillones');
  });

  it('sin franjas devuelve huecos vacíos', async () => {
    const { deps } = dobles(escenario({ franjas: [] }));
    expect((await consultarDisponibilidad(deps, CONSULTA)).huecos).toEqual([]);
  });

  it('un bloqueo del profesional quita los huecos solapados', async () => {
    const bloqueo = {
      id: 'blq-1',
      profesionalId: PROF as never,
      intervalo: crearIntervaloOLanzar(
        new Date('2026-12-09T12:00:00Z'),
        new Date('2026-12-09T13:00:00Z'),
      ),
    };
    const { deps } = dobles(escenario({ bloqueos: [bloqueo] }));
    const r = await consultarDisponibilidad(deps, CONSULTA);
    expect(r.huecos.map((h) => h.inicio)).toEqual([
      '2026-12-09T11:00:00.000Z',
      '2026-12-09T11:15:00.000Z',
      '2026-12-09T11:30:00.000Z',
    ]);
  });
});
