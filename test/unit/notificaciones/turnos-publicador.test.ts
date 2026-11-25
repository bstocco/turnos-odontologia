import { describe, expect, it, vi } from 'vitest';

import type { AgendaReader } from '../../../src/domain/agenda/puertos.js';
import type {
  PacienteId,
  PrestacionId,
  ProfesionalId,
  SillonId,
  TurnoId,
} from '../../../src/domain/shared/ids.js';
import type {
  EventoDeTurno,
  Turno,
  TurnoEventPublisher,
  TurnoRepository,
} from '../../../src/domain/turno/index.js';
import {
  agendarTurno,
  cancelarTurno,
  confirmarTurno,
  reprogramarTurno,
} from '../../../src/application/turnos/index.js';

const PACIENTE_ID = '11111111-1111-4111-8111-111111111111' as PacienteId;
const PROFESIONAL_ID = '22222222-2222-4222-8222-222222222222' as ProfesionalId;
const SILLON_ID = '33333333-3333-4333-8333-333333333333' as SillonId;
const PRESTACION_ID = '44444444-4444-4444-8444-444444444444' as PrestacionId;
const TURNO_ID = '55555555-5555-4555-8555-555555555555' as TurnoId;
const TURNO_NUEVO_ID = '66666666-6666-4666-8666-666666666666' as TurnoId;

const AHORA = new Date('2026-12-01T10:00:00.000Z');
const INICIO_TURNO = new Date('2026-12-02T14:00:00.000Z'); // Miércoles 11:00 ART

function crearTurnoBase(overrides: Partial<Turno> = {}): Turno {
  return {
    id: TURNO_ID,
    pacienteId: PACIENTE_ID,
    profesionalId: PROFESIONAL_ID,
    sillonId: SILLON_ID,
    prestacionId: PRESTACION_ID,
    inicio: INICIO_TURNO,
    fin: new Date('2026-12-02T14:30:00.000Z'),
    bufferMinutos: 0,
    finSillon: new Date('2026-12-02T14:30:00.000Z'),
    estado: 'pendiente_confirmacion',
    origen: 'recepcion',
    reprogramadoDe: null,
    duracionRealMinutos: null,
    creadoEn: AHORA,
    actualizadoEn: AHORA,
    ...overrides,
  };
}

function crearAgendaMock(): AgendaReader {
  return {
    franjasDeAtencion: vi.fn().mockResolvedValue([
      { diaSemana: 3, desdeMinutos: 9 * 60, hastaMinutos: 18 * 60 },
      { diaSemana: 4, desdeMinutos: 9 * 60, hastaMinutos: 18 * 60 },
    ]),
    feriados: vi.fn().mockResolvedValue([]),
    bloqueos: vi.fn().mockResolvedValue([]),
    turnosActivosDeProfesional: vi.fn().mockResolvedValue([]),
    turnosActivosDeSillones: vi.fn().mockResolvedValue([]),
  };
}

describe('cableado de TurnoEventPublisher en casos de uso de turnos (Q2 + Q4)', () => {
  it('mantiene compatibilidad cuando no se pasa publicador', async () => {
    const creado = crearTurnoBase();
    const actualizado = crearTurnoBase({ estado: 'confirmado' });
    const repo: TurnoRepository = {
      obtenerPorId: vi.fn().mockResolvedValue(creado),
      insertar: vi.fn().mockResolvedValue(creado),
      actualizar: vi.fn().mockResolvedValue(actualizado),
    };

    const resAgendar = await agendarTurno(
      repo,
      crearAgendaMock(),
      {
        config: { zonaHoraria: 'America/Argentina/Buenos_Aires', granularidadMinutos: 15 },
        ahora: AHORA,
      },
      {
        pacienteId: PACIENTE_ID,
        profesionalId: PROFESIONAL_ID,
        sillonId: SILLON_ID,
        prestacionId: PRESTACION_ID,
        inicio: INICIO_TURNO,
        duracionMinutos: 30,
        bufferMinutos: 0,
        origen: 'recepcion',
      },
    );
    expect(resAgendar.id).toBe(TURNO_ID);

    const resConfirmar = await confirmarTurno(repo, TURNO_ID, AHORA);
    expect(resConfirmar.estado).toBe('confirmado');
  });

  it('publica creado, confirmado, cancelado y reprogramado (con id del turno nuevo)', async () => {
    const eventos: EventoDeTurno[] = [];
    const publicador: TurnoEventPublisher = {
      publicar: (e) => {
        eventos.push(e);
      },
    };

    const original = crearTurnoBase({ estado: 'confirmado' });
    const turnoNuevo = crearTurnoBase({
      id: TURNO_NUEVO_ID,
      estado: 'confirmado',
      inicio: new Date('2026-12-03T15:00:00.000Z'),
      fin: new Date('2026-12-03T15:30:00.000Z'),
      finSillon: new Date('2026-12-03T15:30:00.000Z'),
      reprogramadoDe: TURNO_ID,
    });

    const actualizar = vi.fn<TurnoRepository['actualizar']>().mockImplementation(async (t) => t);
    const insertar = vi
      .fn<TurnoRepository['insertar']>()
      .mockResolvedValueOnce(crearTurnoBase())
      .mockResolvedValueOnce(turnoNuevo);

    const repo: TurnoRepository = {
      obtenerPorId: vi.fn().mockResolvedValue(original),
      insertar,
      actualizar,
    };

    await agendarTurno(
      repo,
      crearAgendaMock(),
      {
        config: { zonaHoraria: 'America/Argentina/Buenos_Aires', granularidadMinutos: 15 },
        ahora: AHORA,
      },
      {
        pacienteId: PACIENTE_ID,
        profesionalId: PROFESIONAL_ID,
        sillonId: SILLON_ID,
        prestacionId: PRESTACION_ID,
        inicio: INICIO_TURNO,
        duracionMinutos: 30,
        bufferMinutos: 0,
        origen: 'recepcion',
      },
      { intentos: 1 },
      publicador,
    );

    await confirmarTurno(
      { ...repo, obtenerPorId: vi.fn().mockResolvedValue(crearTurnoBase()) },
      TURNO_ID,
      AHORA,
      publicador,
    );
    await cancelarTurno(repo, TURNO_ID, AHORA, publicador);

    const resultadoReprog = await reprogramarTurno(
      repo,
      TURNO_ID,
      {
        pacienteId: PACIENTE_ID,
        profesionalId: PROFESIONAL_ID,
        sillonId: SILLON_ID,
        prestacionId: PRESTACION_ID,
        inicio: new Date('2026-12-03T15:00:00.000Z'),
        duracionMinutos: 30,
        bufferMinutos: 0,
        origen: 'recepcion',
      },
      {
        config: { zonaHoraria: 'America/Argentina/Buenos_Aires', granularidadMinutos: 15 },
        ahora: AHORA,
      },
      publicador,
    );

    expect(resultadoReprog.id).toBe(TURNO_NUEVO_ID);
    // Verifica que reprogramarTurno transicionó el original al estado 'reprogramado' desde su estado real
    expect(actualizar).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: TURNO_ID, estado: 'reprogramado' }),
      'confirmado',
    );
    expect(eventos).toEqual([
      { tipo: 'creado', turnoId: TURNO_ID },
      { tipo: 'confirmado', turnoId: TURNO_ID },
      { tipo: 'cancelado', turnoId: TURNO_ID },
      { tipo: 'reprogramado', turnoId: TURNO_NUEVO_ID },
    ]);
  });

  it('no publica eventos cuando la transición falla o el repositorio rechaza', async () => {
    const publicar = vi.fn();
    const publicador: TurnoEventPublisher = { publicar };

    const repoFinal: TurnoRepository = {
      obtenerPorId: vi.fn().mockResolvedValue(crearTurnoBase({ estado: 'cancelado' })),
      insertar: vi.fn().mockRejectedValue(new Error('DB_ERROR')),
      actualizar: vi.fn(),
    };

    await expect(confirmarTurno(repoFinal, TURNO_ID, AHORA, publicador)).rejects.toThrow();
    await expect(cancelarTurno(repoFinal, TURNO_ID, AHORA, publicador)).rejects.toThrow();
    await expect(
      agendarTurno(
        repoFinal,
        crearAgendaMock(),
        {
          config: { zonaHoraria: 'America/Argentina/Buenos_Aires', granularidadMinutos: 15 },
          ahora: AHORA,
        },
        {
          pacienteId: PACIENTE_ID,
          profesionalId: PROFESIONAL_ID,
          sillonId: SILLON_ID,
          prestacionId: PRESTACION_ID,
          inicio: INICIO_TURNO,
          duracionMinutos: 30,
          bufferMinutos: 0,
          origen: 'recepcion',
        },
        { intentos: 1 },
        publicador,
      ),
    ).rejects.toThrow();

    expect(publicar).not.toHaveBeenCalled();
  });
});
