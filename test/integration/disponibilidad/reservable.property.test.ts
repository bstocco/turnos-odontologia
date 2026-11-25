import fc from 'fast-check';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { huecoOfrecido } from '../../../src/application/disponibilidad/index.js';
import { crearTurno } from '../../../src/domain/turno/index.js';
import type {
  PacienteId,
  PrestacionId,
  ProfesionalId,
  SillonId,
} from '../../../src/domain/shared/index.js';
import { valorOLanzar } from '../../../src/domain/shared/resultado.js';
import { crearRepositorioDeTurnos } from '../../../src/infrastructure/db/repositories/turno/index.js';
import { withTenant } from '../../../src/infrastructure/db/tenant/with-tenant.js';
import { dependenciasDeDisponibilidad } from '../../../src/interfaces/http/modules/publico-disponibilidad/dependencias.js';
import {
  CLINICA_A,
  cerrarPool,
  comoApp,
  crearAppPublica,
  insertarBloqueo,
  insertarFeriado,
  insertarHorario,
  insertarPaciente,
  insertarPrestacion,
  insertarProfesional,
  insertarSillon,
  insertarTurnoSintetico,
  prepararBaseDeDisponibilidad,
} from './soporte.js';

/*
 * Propiedad "todo hueco ofrecido es reservable" (spec api-publica-disponibilidad): se siembra una
 * agenda al azar como `app` contra PostgreSQL real, se consulta por HTTP, se toma un hueco y se
 * inserta con el repositorio real en un sillón devuelto por `huecoOfrecido`.
 */
let app: FastifyInstance;
let paciente: string;
const DIA = '2026-12-09'; // miércoles
const BASE_UTC = Date.parse('2026-12-09T11:00:00Z'); // 08:00 locales (UTC-3)

const sillonArb = fc.record({ buffer: fc.constantFrom(0, 15, 30) });
const turnoArb = fc.record({
  slot: fc.integer({ min: 0, max: 15 }), // 15 minutos desde las 08:00
  sillon: fc.nat(2),
  propio: fc.boolean(),
  minutos: fc.constantFrom(15, 30, 45),
});
const bloqueoArb = fc.record({
  slot: fc.integer({ min: 0, max: 14 }),
  slots: fc.integer({ min: 1, max: 3 }),
});

const iso = (slot: number) => new Date(BASE_UTC + slot * 15 * 60_000).toISOString();

beforeAll(async () => {
  await prepararBaseDeDisponibilidad();
  process.env.RATE_LIMIT_PUBLIC = '100000/h';
  paciente = await insertarPaciente(CLINICA_A.id, 'Paciente');
  ({ app } = await crearAppPublica());
});
afterAll(async () => {
  vi.useRealTimers();
  delete process.env.RATE_LIMIT_PUBLIC;
  await app.close();
  await cerrarPool();
});

async function ignorandoConflictos(accion: () => Promise<unknown>): Promise<void> {
  try {
    await accion();
  } catch (error) {
    // Una semilla al azar puede chocar con las exclusiones de la base: esa semilla se descarta.
    const code = (error as { code?: string }).code;
    if (code !== '23P01') throw error;
  }
}

describe('todo hueco ofrecido es reservable', () => {
  it('insertar un turno en un hueco ofrecido, en un sillón asignable, nunca viola validaciones ni exclusiones', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-01T12:00:00Z'));
    let huecosVerificados = 0;

    await fc.assert(
      fc.asyncProperty(
        fc.array(sillonArb, { minLength: 1, maxLength: 3 }),
        fc.array(turnoArb, { maxLength: 5 }),
        fc.array(bloqueoArb, { maxLength: 2 }),
        fc.boolean(),
        fc.nat(),
        async (sillonesGen, turnosGen, bloqueosGen, feriado, eleccion) => {
          await comoApp(CLINICA_A.id, async (c) => {
            await c.query('DELETE FROM turno');
            await c.query('DELETE FROM bloqueo');
            await c.query('DELETE FROM feriado');
            await c.query('UPDATE sillon SET activo = FALSE');
          });
          const prof = await insertarProfesional(CLINICA_A.id);
          const otro = await insertarProfesional(CLINICA_A.id);
          const prest = await insertarPrestacion(CLINICA_A.id, 'Consulta', 30);
          await insertarHorario(CLINICA_A.id, prof, 3, '08:00', '12:00');
          const sillones: { id: string; buffer: number }[] = [];
          for (const s of sillonesGen) {
            sillones.push({
              id: await insertarSillon(CLINICA_A.id, 'S', s.buffer),
              buffer: s.buffer,
            });
          }
          if (feriado && eleccion % 7 === 0) await insertarFeriado(CLINICA_A.id, DIA);
          for (const t of turnosGen) {
            const sillon = sillones[t.sillon % sillones.length];
            if (sillon === undefined) continue;
            await ignorandoConflictos(() =>
              insertarTurnoSintetico(CLINICA_A.id, {
                pacienteId: paciente,
                profesionalId: t.propio ? prof : otro,
                sillonId: sillon.id,
                prestacionId: prest,
                inicio: iso(t.slot),
                minutos: t.minutos,
                buffer: sillon.buffer,
              }),
            );
          }
          for (const b of bloqueosGen) {
            await ignorandoConflictos(() =>
              insertarBloqueo(CLINICA_A.id, prof, iso(b.slot), iso(b.slot + b.slots)),
            );
          }

          const r = await app.inject({
            method: 'GET',
            url: `/api/v1/publico/${CLINICA_A.slug}/disponibilidad?profesionalId=${prof}&prestacionId=${prest}&desde=${DIA}&hasta=2026-12-10`,
          });
          expect(r.statusCode).toBe(200);
          const { huecos } = r.json() as { huecos: { inicio: string }[] };
          if (huecos.length === 0) return;
          const elegido = huecos[eleccion % huecos.length] as { inicio: string };

          // Misma transacción: se verifica el hueco, se toma un sillón asignable y se inserta.
          await withTenant(CLINICA_A.id, async (cliente) => {
            const deps = dependenciasDeDisponibilidad(cliente, () => new Date());
            const hueco = await huecoOfrecido(deps, {
              profesionalId: prof,
              prestacionId: prest,
              inicio: new Date(elegido.inicio),
            });
            expect(hueco).not.toBeNull();
            const sillonId = hueco?.sillonesAsignables[0] as SillonId;
            const buffer = sillones.find((s) => s.id === sillonId)?.buffer ?? 0;
            const nuevo = valorOLanzar(
              crearTurno({
                pacienteId: paciente as PacienteId,
                profesionalId: prof as ProfesionalId,
                sillonId,
                prestacionId: prest as PrestacionId,
                inicio: new Date(elegido.inicio),
                duracionMinutos: 30,
                bufferMinutos: buffer,
                estado: 'pendiente_confirmacion',
                origen: 'enlace_web',
                reprogramadoDe: null,
              }),
            );
            await expect(crearRepositorioDeTurnos(cliente).insertar(nuevo)).resolves.toBeDefined();
          });
          huecosVerificados += 1;
        },
      ),
      { numRuns: 15 },
    );
    // La propiedad no debe ser vacía: alguna corrida tuvo huecos.
    expect(huecosVerificados).toBeGreaterThan(0);
  }, 120_000);
});
