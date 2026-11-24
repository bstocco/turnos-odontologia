import { describe, expect, it } from 'vitest';

import {
  calcularDisponibilidad,
  crearFechaLocal,
  crearIntervaloOLanzar,
  detectarSolape,
  seSolapa,
  turnoModificadoConcurrentemente,
  type AgendaReader,
  type Bloqueo,
  type ConfiguracionAgenda,
  type FechaLocal,
  type FranjaAtencion,
  type Intervalo,
  type Prestacion,
  type Profesional,
  type RecursosReader,
  type Sillon,
} from '../../../src/domain/agenda/index.js';
import {
  ErrorDeDominio,
  type PacienteId,
  type PrestacionId,
  type ProfesionalId,
  type SillonId,
  type TurnoId,
} from '../../../src/domain/shared/index.js';
import {
  crearTurno,
  esActivo,
  type EstadoTurno,
  type NuevoTurnoValidado,
  type Turno,
  type TurnoRepository,
} from '../../../src/domain/turno/index.js';

const BA = 'America/Argentina/Buenos_Aires';
const P = 'prof-P' as ProfesionalId;
const Q = 'prof-Q' as ProfesionalId;
const S1 = 'sil-1' as SillonId;
const S2 = 'sil-2' as SillonId;
const PRE = 'pre-1' as PrestacionId;
const PAC = 'pac-1' as PacienteId;
const local = (h: number, min = 0): Date => new Date(Date.UTC(2026, 2, 10, h + 3, min));
const fecha = (s: string): FechaLocal => {
  const r = crearFechaLocal(s);
  if (!r.ok) throw r.error;
  return r.valor;
};

/** Datos en memoria de UNA clínica; el tenant es implícito, como con RLS bajo `withTenant`. */
interface Almacen {
  turnos: Map<string, Turno>;
  turnosDeOtraClinica: Map<string, Turno>;
  franjas: FranjaAtencion[];
  feriados: FechaLocal[];
  bloqueos: Bloqueo[];
  sillones: Sillon[];
  prestaciones: Prestacion[];
  profesionales: Profesional[];
  config: ConfiguracionAgenda | null;
}

function almacenVacio(): Almacen {
  return {
    turnos: new Map(),
    turnosDeOtraClinica: new Map(),
    franjas: [],
    feriados: [],
    bloqueos: [],
    sillones: [],
    prestaciones: [],
    profesionales: [],
    config: null,
  };
}

function enMemoria(a: Almacen): {
  repo: TurnoRepository;
  agenda: AgendaReader;
  recursos: RecursosReader;
} {
  let secuencia = 0;
  const activos = () => [...a.turnos.values()].filter((t) => esActivo(t.estado));
  const repo: TurnoRepository = {
    obtenerPorId: (id) => Promise.resolve(a.turnos.get(id) ?? null),
    insertar: (nuevo: NuevoTurnoValidado) => {
      const choque = detectarSolape(nuevo, activos());
      if (!choque.ok) return Promise.reject(choque.error);
      secuencia += 1;
      const turno: Turno = {
        ...nuevo,
        id: `t-${String(secuencia)}` as TurnoId,
        duracionRealMinutos: null,
        creadoEn: new Date(0),
        actualizadoEn: new Date(0),
      };
      a.turnos.set(turno.id, turno);
      return Promise.resolve(turno);
    },
    actualizar: (turno, estadoEsperado) => {
      const actual = a.turnos.get(turno.id);
      if (actual?.estado !== estadoEsperado)
        return Promise.reject(turnoModificadoConcurrentemente());
      a.turnos.set(turno.id, turno);
      return Promise.resolve(turno);
    },
  };
  const agenda: AgendaReader = {
    franjasDeAtencion: () => Promise.resolve(a.franjas),
    feriados: (desde, hasta) => Promise.resolve(a.feriados.filter((f) => f >= desde && f < hasta)),
    bloqueos: (profesionalId, intervalo) =>
      Promise.resolve(
        a.bloqueos.filter(
          (b) => b.profesionalId === profesionalId && seSolapa(b.intervalo, intervalo),
        ),
      ),
    turnosActivosDeProfesional: (profesionalId, intervalo) =>
      Promise.resolve(
        activos().filter(
          (t) =>
            t.profesionalId === profesionalId &&
            seSolapa(crearIntervaloOLanzar(t.inicio, t.fin), intervalo),
        ),
      ),
    turnosActivosDeSillones: (ids, intervalo) =>
      Promise.resolve(
        activos().filter(
          (t) =>
            ids.includes(t.sillonId) &&
            seSolapa(crearIntervaloOLanzar(t.inicio, t.finSillon), intervalo),
        ),
      ),
  };
  const recursos: RecursosReader = {
    profesional: (id) => Promise.resolve(a.profesionales.find((p) => p.id === id) ?? null),
    prestacion: (id) => Promise.resolve(a.prestaciones.find((p) => p.id === id) ?? null),
    sillon: (id) => Promise.resolve(a.sillones.find((s) => s.id === id) ?? null),
    sillonesActivos: () => Promise.resolve(a.sillones.filter((s) => s.activo)),
    configuracionAgenda: () =>
      Promise.resolve(
        a.config ?? { zonaHoraria: 'America/Argentina/Buenos_Aires', granularidadMinutos: 15 },
      ),
  };
  return { repo, agenda, recursos };
}

function nuevoTurno(
  prof: ProfesionalId,
  sil: SillonId,
  inicio: Date,
  dur: number,
  buffer: number,
  estado: EstadoTurno = 'confirmado',
): NuevoTurnoValidado {
  const r = crearTurno({
    pacienteId: PAC,
    profesionalId: prof,
    sillonId: sil,
    prestacionId: PRE,
    inicio,
    duracionMinutos: dur,
    bufferMinutos: buffer,
    estado: estado === 'pendiente_confirmacion' ? 'pendiente_confirmacion' : 'confirmado',
    origen: 'recepcion',
    reprogramadoDe: null,
  });
  if (!r.ok) throw r.error;
  return r.valor;
}

const rango = (a: Date, b: Date): Intervalo => crearIntervaloOLanzar(a, b);
const DIA = rango(local(0), local(23, 59));

describe('puertos del dominio con dobles en memoria (tenant implícito)', () => {
  it('obtenerPorId de un id de otra clínica o inexistente devuelve null', async () => {
    const a = almacenVacio();
    const { repo } = enMemoria(a);
    const propio = await repo.insertar(nuevoTurno(P, S1, local(9), 30, 0));
    a.turnosDeOtraClinica.set('ajeno', { ...propio, id: 'ajeno' as TurnoId });
    expect(await repo.obtenerPorId(propio.id)).toEqual(propio);
    expect(await repo.obtenerPorId('ajeno' as TurnoId)).toBeNull();
    expect(await repo.obtenerPorId('no-existe' as TurnoId)).toBeNull();
  });

  it('insertar que choca falla con el código de solape (profesional y sillón)', async () => {
    const { repo } = enMemoria(almacenVacio());
    await repo.insertar(nuevoTurno(P, S1, local(9), 30, 10));
    await expect(repo.insertar(nuevoTurno(P, S2, local(9, 15), 30, 0))).rejects.toMatchObject({
      codigo: 'TURNO_SOLAPADO_PROFESIONAL',
    });
    await expect(repo.insertar(nuevoTurno(Q, S1, local(9, 30), 30, 0))).rejects.toMatchObject({
      codigo: 'TURNO_SOLAPADO_SILLON',
    });
  });

  it('actualizar con estado esperado desactualizado -> TURNO_MODIFICADO_CONCURRENTEMENTE y no cambia nada', async () => {
    const a = almacenVacio();
    const { repo } = enMemoria(a);
    const t = await repo.insertar(nuevoTurno(P, S1, local(9), 30, 0, 'pendiente_confirmacion'));
    a.turnos.set(t.id, { ...t, estado: 'cancelado' });
    const intento = repo.actualizar({ ...t, estado: 'confirmado' }, 'pendiente_confirmacion');
    await expect(intento).rejects.toBeInstanceOf(ErrorDeDominio);
    await expect(intento).rejects.toMatchObject({
      codigo: 'TURNO_MODIFICADO_CONCURRENTEMENTE',
      tipo: 'conflicto',
    });
    expect((await repo.obtenerPorId(t.id))?.estado).toBe('cancelado');
  });

  it('actualizar con el estado esperado correcto persiste el cambio', async () => {
    const { repo } = enMemoria(almacenVacio());
    const t = await repo.insertar(nuevoTurno(P, S1, local(9), 30, 0, 'pendiente_confirmacion'));
    const nuevo = await repo.actualizar({ ...t, estado: 'confirmado' }, 'pendiente_confirmacion');
    expect(nuevo.estado).toBe('confirmado');
    expect((await repo.obtenerPorId(t.id))?.estado).toBe('confirmado');
  });

  it('turnosActivosDeSillones incluye turnos de otro profesional cuyo buffer entra y excluye cancelados', async () => {
    const a = almacenVacio();
    const { repo, agenda } = enMemoria(a);
    await repo.insertar(nuevoTurno(Q, S1, local(9), 30, 15)); // sillón ocupado hasta 09:45
    const cancelado = await repo.insertar(nuevoTurno(P, S2, local(9), 30, 0));
    a.turnos.set(cancelado.id, { ...cancelado, estado: 'cancelado' });

    const ventana = rango(local(9, 30), local(9, 40)); // dentro del buffer, fuera del turno
    const delSillon = await agenda.turnosActivosDeSillones([S1, S2], ventana);
    expect(delSillon.map((t) => t.sillonId)).toEqual([S1]);
    expect(await agenda.turnosActivosDeProfesional(Q, ventana)).toEqual([]); // el buffer no ocupa al profesional
    expect(await agenda.turnosActivosDeProfesional(Q, DIA)).toHaveLength(1);
    expect(await agenda.turnosActivosDeProfesional(P, DIA)).toEqual([]); // el cancelado no cuenta
  });

  it('configuracionAgenda por defecto: Buenos Aires y 15 minutos', async () => {
    const { recursos } = enMemoria(almacenVacio());
    expect(await recursos.configuracionAgenda()).toEqual({
      zonaHoraria: BA,
      granularidadMinutos: 15,
    });
  });

  it('recursos inexistentes se devuelven como null', async () => {
    const { recursos } = enMemoria(almacenVacio());
    expect(await recursos.profesional(P)).toBeNull();
    expect(await recursos.prestacion(PRE)).toBeNull();
    expect(await recursos.sillon(S1)).toBeNull();
    expect(await recursos.sillonesActivos()).toEqual([]);
  });

  it('flujo de reserva compuesto con los puertos: lo ofrecido se inserta y deja de ofrecerse', async () => {
    const a = almacenVacio();
    a.franjas = [{ diaSemana: 2, desdeMinutos: 480, hastaMinutos: 540 }];
    a.sillones = [{ id: S1, bufferMinutos: 15, activo: true }];
    a.prestaciones = [{ id: PRE, duracionMinutos: 30 }];
    const { repo, agenda, recursos } = enMemoria(a);

    async function huecos() {
      const [config, franjas, sillones, prestacion] = await Promise.all([
        recursos.configuracionAgenda(),
        agenda.franjasDeAtencion(P),
        recursos.sillonesActivos(),
        recursos.prestacion(PRE),
      ]);
      const [turnosProf, turnosSillones, feriados, bloqueos] = await Promise.all([
        agenda.turnosActivosDeProfesional(P, DIA),
        agenda.turnosActivosDeSillones(
          sillones.map((s) => s.id),
          DIA,
        ),
        agenda.feriados(fecha('2026-03-10'), fecha('2026-03-11')),
        agenda.bloqueos(P, DIA),
      ]);
      const r = calcularDisponibilidad({
        profesionalId: P,
        duracionMinutos: prestacion?.duracionMinutos ?? 0,
        desde: fecha('2026-03-10'),
        hasta: fecha('2026-03-11'),
        franjas,
        feriados,
        bloqueos,
        turnos: [...turnosProf, ...turnosSillones],
        sillones,
        config,
        ahora: local(0),
      });
      if (!r.ok) throw r.error;
      return r.valor;
    }

    const antes = await huecos();
    expect(antes.map((h) => h.intervalo.inicio.toISOString())).toEqual([
      '2026-03-10T11:00:00.000Z',
      '2026-03-10T11:15:00.000Z',
      '2026-03-10T11:30:00.000Z',
    ]);
    const primero = antes[0];
    if (primero === undefined) throw new Error('sin huecos');
    await repo.insertar(nuevoTurno(P, S1, primero.intervalo.inicio, 30, 15));
    const despues = await huecos();
    expect(despues).toEqual([]); // 08:00-08:30 + buffer 15 ocupa hasta 08:45; 08:30 no cabe y 08:45 + 30 > 09:00
  });
});
