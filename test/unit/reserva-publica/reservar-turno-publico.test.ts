import { describe, expect, it } from 'vitest';

import {
  reservarTurnoPublico,
  type EntradaReservaPublica,
} from '../../../src/application/reserva-publica/reservar-turno.js';
import type {
  CodigoVerificacionRegistro,
  ConfiguracionClinicaPublica,
  DependenciasReservaPublica,
  PacientePublicoRegistro,
  PrestacionPublicaLeida,
} from '../../../src/application/reserva-publica/puertos.js';
import type {
  PrestacionId,
  ProfesionalId,
  SillonId,
  TurnoId,
} from '../../../src/domain/shared/ids.js';
import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';
import type { EventoDeTurno, Turno } from '../../../src/domain/turno/index.js';
import { cryptoComunicacion } from '../../../src/infrastructure/crypto/index.js';

const PROFESIONAL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as ProfesionalId;
const PRESTACION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as PrestacionId;
const SILLON_1 = '11111111-1111-4111-8111-111111111111' as SillonId;
const SILLON_2 = '22222222-2222-4222-8222-222222222222' as SillonId;

function crearEscenarioReserva(
  opts: {
    readonly codigoPlano?: string;
    readonly intentosIniciales?: number;
    readonly vencido?: boolean;
    readonly consumido?: boolean;
    readonly sinCodigo?: boolean;
    readonly activasPo09?: number;
    readonly reservaRequiereConfirmacion?: boolean;
    readonly pacienteExistente?: PacientePublicoRegistro;
    readonly sillon1OcupadoEnBase?: boolean;
    readonly profesionalOcupadoEnBase?: boolean;
    readonly falloPublicador?: boolean;
  } = {},
) {
  const ahora = new Date('2026-12-10T10:00:00.000Z');
  const inicioTurno = new Date('2026-12-11T13:00:00.000Z'); // 10:00 ART (viernes)
  const codigoReal = opts.codigoPlano ?? '042918';

  let codigoRow: CodigoVerificacionRegistro | null = opts.sinCodigo
    ? null
    : {
        id: 'cod-1',
        clinicaId: 'clinica-1',
        email: 'lucia@ejemplo.test',
        hashCodigo: cryptoComunicacion.hashSha256(codigoReal),
        venceEn: opts.vencido
          ? new Date('2026-12-10T09:59:00.000Z')
          : new Date('2026-12-10T10:10:00.000Z'),
        intentos: opts.intentosIniciales ?? 0,
        consumidoEn: opts.consumido ? new Date('2026-12-10T09:50:00.000Z') : null,
        creadoEn: new Date('2026-12-10T09:55:00.000Z'),
      };

  const pacienteExistente = opts.pacienteExistente ?? null;
  let pacienteGuardado: PacientePublicoRegistro | null = pacienteExistente;
  let emailCompletado: string | null = null;
  const turnosCreados: Turno[] = [];
  const auditorias: { accion: string; entidad: string; actorTipo: string; despues: unknown }[] = [];
  const eventos: EventoDeTurno[] = [];
  let verificarOtpCommits = 0;

  const clinicaConfig: ConfiguracionClinicaPublica = {
    id: 'clinica-1',
    nombre: 'Clínica Norte',
    slug: 'clinica-norte',
    zonaHoraria: 'America/Argentina/Buenos_Aires',
    reservaRequiereConfirmacion: opts.reservaRequiereConfirmacion ?? true,
    cancelacionAnticipacionHoras: 24,
    granularidadMinutos: 15,
  };

  const prestacion: PrestacionPublicaLeida = {
    id: PRESTACION_ID,
    nombre: 'Limpieza',
    duracionMinutos: 30,
    activa: true,
  };

  const codigosRepo = {
    async invalidarPendientesPorEmail() {},
    async insertar() {
      throw new Error('no usado');
    },
    async obtenerUltimoParaActualizar() {
      return codigoRow ? { ...codigoRow } : null;
    },
    async obtenerPorIdParaActualizar() {
      return codigoRow ? { ...codigoRow } : null;
    },
    async actualizarIntentos(_id: string, intentos: number) {
      if (codigoRow) codigoRow = { ...codigoRow, intentos };
    },
    async marcarConsumido(_id: string, consumidoEn: Date) {
      if (codigoRow) codigoRow = { ...codigoRow, consumidoEn };
    },
  };

  const deps: DependenciasReservaPublica = {
    ejecutor: {
      async verificarOtp(_clinicaId, fn) {
        const res = await fn(codigosRepo);
        verificarOtpCommits += 1;
        return res;
      },
      async reservar(_clinicaId, fn) {
        const snapshotCodigo = codigoRow ? { ...codigoRow } : null;
        try {
          return await fn({
            codigos: codigosRepo,
            clinicaConfig,
            recursos: {
              async profesional(id) {
                return id === PROFESIONAL_ID ? { id: PROFESIONAL_ID, activo: true } : null;
              },
              async prestacion(id) {
                return id === PRESTACION_ID ? { id: PRESTACION_ID, duracionMinutos: 30 } : null;
              },
              async sillon() {
                return null;
              },
              async sillonesActivos() {
                return [
                  { id: SILLON_1, bufferMinutos: 0, activo: true },
                  { id: SILLON_2, bufferMinutos: 0, activo: true },
                ];
              },
              async configuracionAgenda() {
                return {
                  zonaHoraria: clinicaConfig.zonaHoraria,
                  granularidadMinutos: clinicaConfig.granularidadMinutos,
                };
              },
            },
            agenda: {
              async franjasDeAtencion() {
                return [{ diaSemana: 5, desdeMinutos: 9 * 60, hastaMinutos: 13 * 60 }];
              },
              async feriados() {
                return [];
              },
              async bloqueos() {
                return [];
              },
              async turnosActivosDeProfesional() {
                return [];
              },
              async turnosActivosDeSillones() {
                return [];
              },
            },
            prestaciones: {
              async obtenerPorId(id) {
                return id === PRESTACION_ID ? prestacion : null;
              },
            },
            pacientes: {
              async buscarPorDni(dni) {
                return pacienteGuardado && pacienteGuardado.dni === dni ? pacienteGuardado : null;
              },
              async crearConManejoDeDuplicado(datos) {
                const creado: PacientePublicoRegistro = {
                  id: 'pac-nuevo-1',
                  ...datos,
                };
                pacienteGuardado = creado;
                return { paciente: creado, creado: true };
              },
              async completarEmailSiNulo(_id, email) {
                emailCompletado = email;
                if (pacienteGuardado) {
                  pacienteGuardado = { ...pacienteGuardado, email };
                }
                return pacienteGuardado;
              },
            },
            po09: {
              async bloquearIdentidad() {},
              async contarReservasPublicasActivas() {
                return opts.activasPo09 ?? 0;
              },
            },
            turnos: {
              async insertarConReintentoSillon(sillones, construir) {
                if (opts.profesionalOcupadoEnBase) {
                  throw new ErrorDeDominio(
                    'TURNO_SOLAPADO_PROFESIONAL',
                    'conflicto',
                    'El profesional ya tiene un turno en ese horario',
                  );
                }
                for (const sillonId of sillones) {
                  if (sillonId === SILLON_1 && opts.sillon1OcupadoEnBase) {
                    continue;
                  }
                  const validado = construir(sillonId);
                  const turno: Turno = {
                    id: 'turno-1' as TurnoId,
                    ...validado,
                    duracionRealMinutos: null,
                    creadoEn: ahora,
                    actualizadoEn: ahora,
                  };
                  turnosCreados.push(turno);
                  return turno;
                }
                throw new ErrorDeDominio(
                  'TURNO_SOLAPADO_SILLON',
                  'conflicto',
                  'El sillón está ocupado en ese horario',
                );
              },
            },
            auditoria: {
              async registrar(ctx, entrada) {
                auditorias.push({
                  accion: entrada.accion,
                  entidad: entrada.entidad,
                  actorTipo: ctx.actor.tipo,
                  despues: entrada.despues,
                });
                return {
                  id: `aud-${auditorias.length}`,
                  clinicaId: ctx.clinicaId,
                  ocurrioEn: ahora,
                  actorTipo: ctx.actor.tipo,
                  actorId: ctx.actor.id,
                  accion: entrada.accion,
                  entidad: entrada.entidad,
                  entidadId: entrada.entidadId ?? null,
                  datosAntes: entrada.antes ?? null,
                  datosDespues: entrada.despues ?? null,
                  ip: entrada.ip ?? null,
                };
              },
            },
          });
        } catch (error) {
          // Simula rollback de la transacción de reserva sobre codigo_verificacion
          codigoRow = snapshotCodigo;
          throw error;
        }
      },
    },
    crypto: cryptoComunicacion,
    reloj: { ahora: () => ahora },
    publicadorPorClinica: () => ({
      async publicar(evento) {
        if (opts.falloPublicador) throw new Error('Cola caída');
        eventos.push(evento);
      },
    }),
    logger: { info() {}, warn() {}, error() {} },
  };

  const entrada: EntradaReservaPublica = {
    clinicaId: 'clinica-1',
    profesionalId: PROFESIONAL_ID,
    prestacionId: PRESTACION_ID,
    inicio: inicioTurno,
    codigoVerificacion: codigoReal,
    paciente: {
      nombre: 'Lucía',
      apellido: 'Gómez',
      dni: '30.123.456',
      telefono: '011 15-4321-8765',
      email: 'Lucia@Ejemplo.Test',
      obraSocial: 'OSDE',
    },
    ip: '190.1.2.3',
  };

  return {
    deps,
    entrada,
    getCodigo: () => codigoRow,
    getVerificarOtpCommits: () => verificarOtpCommits,
    getPaciente: () => pacienteGuardado,
    getEmailCompletado: () => emailCompletado,
    turnosCreados,
    auditorias,
    eventos,
  };
}

describe('reservarTurnoPublico (C-15)', () => {
  it('crea reserva pública pendiente_confirmacion, consume OTP, asigna sillón libre, audita y publica evento', async () => {
    const esc = crearEscenarioReserva({ reservaRequiereConfirmacion: true });
    const res = await reservarTurnoPublico(esc.deps, esc.entrada);

    expect(res).toEqual({
      turnoId: 'turno-1',
      estado: 'pendiente_confirmacion',
      inicio: new Date('2026-12-11T13:00:00.000Z'),
      fin: new Date('2026-12-11T13:30:00.000Z'),
      zonaHoraria: 'America/Argentina/Buenos_Aires',
      profesionalId: PROFESIONAL_ID,
      prestacionId: PRESTACION_ID,
    });
    expect(esc.getCodigo()?.consumidoEn).not.toBeNull();
    expect(esc.turnosCreados[0]?.sillonId).toBe(SILLON_1);
    expect(esc.turnosCreados[0]?.origen).toBe('enlace_web');
    expect(esc.auditorias.map((a) => `${a.actorTipo}:${a.entidad}:${a.accion}`)).toEqual([
      'paciente_enlace:paciente:creacion',
      'paciente_enlace:turno:creacion',
    ]);
    expect(esc.eventos).toEqual([{ tipo: 'creado', turnoId: 'turno-1' }]);
  });

  it('respeta reservaRequiereConfirmacion=false dejando el turno confirmado', async () => {
    const esc = crearEscenarioReserva({ reservaRequiereConfirmacion: false });
    const res = await reservarTurnoPublico(esc.deps, esc.entrada);
    expect(res.estado).toBe('confirmado');
  });

  it('persiste intentos fallidos de OTP antes de lanzar 422 y agota al 5° fallo', async () => {
    const esc = crearEscenarioReserva({ codigoPlano: '111111', intentosIniciales: 0 });

    for (let i = 1; i <= 4; i++) {
      await expect(
        reservarTurnoPublico(esc.deps, { ...esc.entrada, codigoVerificacion: '999999' }),
      ).rejects.toMatchObject({ codigo: 'CODIGO_VERIFICACION_INVALIDO' });
      expect(esc.getCodigo()?.intentos).toBe(i);
    }
    expect(esc.getVerificarOtpCommits()).toBe(4);

    // 5° fallo → agotado
    await expect(
      reservarTurnoPublico(esc.deps, { ...esc.entrada, codigoVerificacion: '999999' }),
    ).rejects.toMatchObject({ codigo: 'CODIGO_VERIFICACION_AGOTADO' });
    expect(esc.getCodigo()?.intentos).toBe(5);

    // Intento 6 incluso con el código correcto sigue rechazado como agotado
    await expect(
      reservarTurnoPublico(esc.deps, { ...esc.entrada, codigoVerificacion: '111111' }),
    ).rejects.toMatchObject({ codigo: 'CODIGO_VERIFICACION_AGOTADO' });
  });

  it('rechaza código vencido o ya consumido y no quema OTP ante conflicto 409', async () => {
    const vencido = crearEscenarioReserva({ vencido: true });
    await expect(reservarTurnoPublico(vencido.deps, vencido.entrada)).rejects.toMatchObject({
      codigo: 'CODIGO_VERIFICACION_VENCIDO',
    });

    const usado = crearEscenarioReserva({ consumido: true });
    await expect(reservarTurnoPublico(usado.deps, usado.entrada)).rejects.toMatchObject({
      codigo: 'CODIGO_VERIFICACION_USADO',
    });

    const conflicto = crearEscenarioReserva({ profesionalOcupadoEnBase: true });
    await expect(reservarTurnoPublico(conflicto.deps, conflicto.entrada)).rejects.toMatchObject({
      codigo: 'TURNO_SOLAPADO_PROFESIONAL',
    });
    expect(conflicto.getCodigo()?.consumidoEn).toBeNull();
  });

  it('rechaza la tercera reserva activa (PO-09) con TOPE_RESERVAS_ACTIVAS_ALCANZADO', async () => {
    const esc = crearEscenarioReserva({ activasPo09: 2 });
    await expect(reservarTurnoPublico(esc.deps, esc.entrada)).rejects.toMatchObject({
      codigo: 'TOPE_RESERVAS_ACTIVAS_ALCANZADO',
    });
    expect(esc.turnosCreados).toHaveLength(0);
  });

  it('reutiliza paciente existente por DNI sin sobrescribir datos y completa solo email si era null (Q4)', async () => {
    const esc = crearEscenarioReserva({
      pacienteExistente: {
        id: 'pac-existente',
        nombre: 'Nombre Original',
        apellido: 'Apellido Original',
        dni: '30123456',
        telefono: '+5491199999999',
        email: null,
        obraSocial: 'Swiss',
      },
    });
    await reservarTurnoPublico(esc.deps, esc.entrada);
    expect(esc.turnosCreados[0]?.pacienteId).toBe('pac-existente');
    expect(esc.getEmailCompletado()).toBe('lucia@ejemplo.test');
    expect(esc.getPaciente()?.nombre).toBe('Nombre Original');
    expect(esc.auditorias.map((a) => `${a.entidad}:${a.accion}`)).toEqual([
      'paciente:modificacion',
      'turno:creacion',
    ]);
  });

  it('reintenta con el segundo sillón libre y no aborta ante fallo post-commit del publicador', async () => {
    const esc = crearEscenarioReserva({ sillon1OcupadoEnBase: true, falloPublicador: true });
    const res = await reservarTurnoPublico(esc.deps, esc.entrada);
    expect(res.turnoId).toBe('turno-1');
    expect(esc.turnosCreados[0]?.sillonId).toBe(SILLON_2);
  });
});
