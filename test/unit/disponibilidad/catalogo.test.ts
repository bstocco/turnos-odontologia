import { describe, expect, it } from 'vitest';

import {
  listarPrestacionesPublicas,
  listarProfesionalesPublicos,
  type PrestacionLeida,
  type ProfesionalLeido,
} from '../../../src/application/disponibilidad/index.js';

const prest = (id: string, nombre: string, activa = true): PrestacionLeida => ({
  id,
  nombre,
  duracionMinutos: 30,
  activa,
});
const prof = (id: string, nombre: string, apellido: string, activo = true): ProfesionalLeido => ({
  id,
  nombre,
  apellido,
  activo,
});

const depsPrest = (lista: PrestacionLeida[]) => ({
  prestaciones: { listar: async () => lista, obtenerPorId: async () => null },
  profesionales: { listar: async () => [] },
});
const depsProf = (lista: ProfesionalLeido[]) => ({
  prestaciones: { listar: async () => [], obtenerPorId: async () => null },
  profesionales: { listar: async () => lista },
});

describe('listarPrestacionesPublicas', () => {
  it('incluye solo activas y expone exactamente id, nombre y duracionMinutos', async () => {
    const r = await listarPrestacionesPublicas(
      depsPrest([
        prest('1', 'Limpieza'),
        prest('2', 'Blanqueamiento', false),
        prest('3', 'Consulta'),
      ]),
    );
    expect(r).toEqual([
      { id: '3', nombre: 'Consulta', duracionMinutos: 30 },
      { id: '1', nombre: 'Limpieza', duracionMinutos: 30 },
    ]);
    for (const p of r) expect(Object.keys(p).sort()).toEqual(['duracionMinutos', 'id', 'nombre']);
  });

  it('ordena por nombre y desempata por id', async () => {
    const r = await listarPrestacionesPublicas(
      depsPrest([prest('b', 'Igual'), prest('a', 'Igual'), prest('c', 'Anterior')]),
    );
    expect(r.map((p) => p.id)).toEqual(['c', 'a', 'b']);
  });

  it('lista vacía si no hay activas', async () => {
    expect(await listarPrestacionesPublicas(depsPrest([prest('1', 'X', false)]))).toEqual([]);
  });
});

describe('listarProfesionalesPublicos', () => {
  it('incluye solo activos y expone exactamente id, nombre y apellido', async () => {
    const conMatricula = { ...prof('1', 'Ana', 'Zeta'), matricula: 'MP-123' };
    const r = await listarProfesionalesPublicos(
      depsProf([conMatricula, prof('2', 'Beto', 'Alfa', false), prof('3', 'Carla', 'Beta')]),
    );
    expect(r).toEqual([
      { id: '3', nombre: 'Carla', apellido: 'Beta' },
      { id: '1', nombre: 'Ana', apellido: 'Zeta' },
    ]);
    expect(JSON.stringify(r)).not.toContain('MP-123');
    for (const p of r) expect(Object.keys(p).sort()).toEqual(['apellido', 'id', 'nombre']);
  });

  it('ordena por apellido, nombre e id', async () => {
    const r = await listarProfesionalesPublicos(
      depsProf([
        prof('z', 'Ana', 'Perez'),
        prof('y', 'Ana', 'Perez'),
        prof('x', 'Abel', 'Perez'),
        prof('w', 'Zoe', 'Acosta'),
      ]),
    );
    expect(r.map((p) => p.id)).toEqual(['w', 'x', 'y', 'z']);
  });
});
