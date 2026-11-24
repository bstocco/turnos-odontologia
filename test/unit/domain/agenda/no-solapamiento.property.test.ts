import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  detectarSolape,
  type OcupacionCandidata,
  type OcupacionExistente,
} from '../../../../src/domain/agenda/ocupacion.js';
import type { ProfesionalId, SillonId } from '../../../../src/domain/shared/ids.js';
import { ESTADOS_TURNO, esActivo, type EstadoTurno } from '../../../../src/domain/turno/estado.js';
import { instanteEnMinutos as m } from '../arbitrarios.js';

interface Candidato {
  readonly prof: number;
  readonly sillon: number;
  readonly inicio: number;
  readonly duracion: number;
  readonly buffer: number;
  readonly estado: EstadoTurno;
}

const arbCandidato: fc.Arbitrary<Candidato> = fc.record({
  prof: fc.integer({ min: 0, max: 2 }),
  sillon: fc.integer({ min: 0, max: 2 }),
  inicio: fc.integer({ min: 0, max: 240 }),
  duracion: fc.integer({ min: 1, max: 90 }),
  buffer: fc.integer({ min: 0, max: 60 }),
  estado: fc.constantFrom(...ESTADOS_TURNO),
});

function aOcupacion(c: Candidato): OcupacionExistente {
  return {
    profesionalId: `p${c.prof}` as ProfesionalId,
    sillonId: `s${c.sillon}` as SillonId,
    inicio: m(c.inicio),
    fin: m(c.inicio + c.duracion),
    finSillon: m(c.inicio + c.duracion + c.buffer),
    estado: c.estado,
  };
}

/** Aceptación uno a uno con el detector; devuelve los aceptados. */
function aceptar(candidatos: readonly Candidato[]): OcupacionExistente[] {
  const aceptados: OcupacionExistente[] = [];
  for (const c of candidatos) {
    const o = aOcupacion(c);
    const r = detectarSolape(o, aceptados);
    if (r.ok) aceptados.push(o);
  }
  return aceptados;
}

/** Verificador por fuerza bruta, independiente de la implementación (usa milisegundos crudos). */
function violaciones(aceptados: readonly OcupacionExistente[]): string[] {
  const activos = aceptados.filter((t) => esActivo(t.estado));
  const out: string[] = [];
  for (let i = 0; i < activos.length; i++) {
    for (let j = i + 1; j < activos.length; j++) {
      const a = activos[i];
      const b = activos[j];
      if (a === undefined || b === undefined) continue;
      if (
        a.profesionalId === b.profesionalId &&
        a.inicio.getTime() < b.fin.getTime() &&
        b.inicio.getTime() < a.fin.getTime()
      ) {
        out.push(`profesional ${i}-${j}`);
      }
      if (
        a.sillonId === b.sillonId &&
        a.inicio.getTime() < b.finSillon.getTime() &&
        b.inicio.getTime() < a.finSillon.getTime()
      ) {
        out.push(`sillon ${i}-${j}`);
      }
    }
  }
  return out;
}

describe('invariante de no solapamiento (RN-AG-01, RN-AG-02)', () => {
  it('ningún par de turnos activos aceptados viola profesional ni sillón', () => {
    fc.assert(
      fc.property(fc.array(arbCandidato, { maxLength: 40 }), (candidatos) => {
        expect(violaciones(aceptar(candidatos))).toEqual([]);
      }),
      {
        examples: [
          // fin = inicio es un borde: el turno de duración 1 que empieza donde otro termina
          [
            [
              { prof: 0, sillon: 0, inicio: 0, duracion: 30, buffer: 0, estado: 'confirmado' },
              { prof: 0, sillon: 0, inicio: 30, duracion: 1, buffer: 0, estado: 'confirmado' },
            ],
          ],
          // buffer 0 y buffer que cubre justo el inicio siguiente
          [
            [
              { prof: 0, sillon: 0, inicio: 0, duracion: 30, buffer: 10, estado: 'confirmado' },
              {
                prof: 1,
                sillon: 0,
                inicio: 40,
                duracion: 30,
                buffer: 0,
                estado: 'pendiente_confirmacion',
              },
              { prof: 1, sillon: 0, inicio: 39, duracion: 1, buffer: 0, estado: 'confirmado' },
            ],
          ],
        ],
      },
    );
  });

  it('el verificador detecta una violación real (sanidad del propio verificador)', () => {
    const a = aOcupacion({
      prof: 0,
      sillon: 0,
      inicio: 0,
      duracion: 30,
      buffer: 0,
      estado: 'confirmado',
    });
    const b = aOcupacion({
      prof: 0,
      sillon: 1,
      inicio: 15,
      duracion: 30,
      buffer: 0,
      estado: 'atendido',
    });
    expect(violaciones([a, b])).toEqual(['profesional 0-1']);
    const c = aOcupacion({
      prof: 1,
      sillon: 0,
      inicio: 15,
      duracion: 30,
      buffer: 0,
      estado: 'ausente',
    });
    expect(violaciones([a, c])).toEqual(['sillon 0-1']);
  });

  it('el detector acepta todo candidato que no choca con nada (no es trivialmente restrictivo)', () => {
    fc.assert(
      fc.property(arbCandidato, (c) => {
        const o: OcupacionCandidata = aOcupacion(c);
        expect(detectarSolape(o, []).ok).toBe(true);
      }),
    );
  });
});
