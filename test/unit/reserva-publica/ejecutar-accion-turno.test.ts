import { describe, expect, it } from 'vitest';

import { ejecutarAccionPublicaTurno } from '../../../src/application/reserva-publica/ejecutar-accion.js';
import type {
  ConfiguracionClinicaPublica,
  DependenciasAccionPublica,
  TokenAccionRegistro,
} from '../../../src/application/reserva-publica/puertos.js';
import type {
  PacienteId,
  PrestacionId,
  ProfesionalId,
  SillonId,
  TurnoId,
} from '../../../src/domain/shared/ids.js';
import type { EstadoTurno, EventoDeTurno, Turno } from '../../../src/domain/turno/index.js';
import { cryptoComunicacion } from '../../../src/infrastructure/crypto/index.js';

function crearEscenarioAccion(
  opts: {
    readonly ahora?: Date;
    readonly inicioTurno?: Date;
    readonly estadoTurno?: EstadoTurno;
    readonly propositoToken?: 'confirmar' | 'cancelar';
    readonly usado?: boolean;
    readonly vencido?: boolean;
    readonly sinClinica?: boolean;
    readonly anticipacionHoras?: number;
    readonly tokenInexistente?: boolean;
  } = {},
) {
  const ahora = opts.ahora ?? new Date('2026-12-10T14:00:00.000Z');
  const inicio = opts.inicioTurno ?? new Date('2026-12-11T14:00:00.000Z'); // exactamente 24h
  const tokenPlano = 'token-aleatorio-256-bits-sintetico';
  const hashReal = cryptoComunicacion.hashSha256(tokenPlano);

  let tokenRow: TokenAccionRegistro | null = opts.tokenInexistente
    ? null
    : {
        id: 'tok-1',
        clinicaId: 'clinica-1',
        turnoId: 'turno-1' as TurnoId,
        proposito: opts.propositoToken ?? 'confirmar',
        hashToken: hashReal,
        venceEn: opts.vencido
          ? new Date(ahora.getTime() - 1000)
          : new Date(ahora.getTime() + 86_400_000),
        usadoEn: opts.usado ? new Date(ahora.getTime() - 5000) : null,
        creadoEn: new Date(ahora.getTime() - 10_000),
      };

  let turno: Turno = {
    id: 'turno-1' as TurnoId,
    pacienteId: 'pac-1' as PacienteId,
    profesionalId: 'prof-1' as ProfesionalId,
    sillonId: 'sil-1' as SillonId,
    prestacionId: 'pres-1' as PrestacionId,
    inicio,
    fin: new Date(inicio.getTime() + 30 * 60_000),
    bufferMinutos: 0,
    finSillon: new Date(inicio.getTime() + 30 * 60_000),
    estado: opts.estadoTurno ?? 'pendiente_confirmacion',
    origen: 'enlace_web',
    reprogramadoDe: null,
    duracionRealMinutos: null,
    creadoEn: new Date(ahora.getTime() - 10_000),
    actualizadoEn: new Date(ahora.getTime() - 10_000),
  };

  const clinicaConfig: ConfiguracionClinicaPublica = {
    id: 'clinica-1',
    nombre: 'Clínica Sur',
    slug: 'clinica-sur',
    zonaHoraria: 'America/Argentina/Buenos_Aires',
    reservaRequiereConfirmacion: true,
    cancelacionAnticipacionHoras: opts.anticipacionHoras ?? 24,
    granularidadMinutos: 15,
  };

  const auditorias: { accion: string; actorTipo: string }[] = [];
  const eventos: EventoDeTurno[] = [];

  const deps: DependenciasAccionPublica = {
    resolverClinicaPorHashToken: async () => (opts.sinClinica ? null : 'clinica-1'),
    ejecutor: {
      async ejecutar(_clinicaId, fn) {
        const snapToken = tokenRow ? { ...tokenRow } : null;
        const snapTurno = { ...turno };
        try {
          return await fn({
            clinicaConfig,
            tokens: {
              async insertar() {
                throw new Error('no usado');
              },
              async obtenerPorHashParaActualizar(h) {
                return tokenRow && tokenRow.hashToken === h ? { ...tokenRow } : null;
              },
              async marcarUsado(_id, usadoEn) {
                if (tokenRow) tokenRow = { ...tokenRow, usadoEn };
              },
            },
            turnos: {
              async obtenerPorIdParaActualizar(id) {
                return turno.id === id ? { ...turno } : null;
              },
              async actualizarEstado(nuevo) {
                turno = nuevo;
                return nuevo;
              },
            },
            auditoria: {
              async registrar(ctx, entrada) {
                auditorias.push({ accion: entrada.accion, actorTipo: ctx.actor.tipo });
                return {
                  id: 'aud-1',
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
          tokenRow = snapToken;
          turno = snapTurno;
          throw error;
        }
      },
    },
    crypto: cryptoComunicacion,
    reloj: { ahora: () => ahora },
    publicadorPorClinica: () => ({
      async publicar(e) {
        eventos.push(e);
      },
    }),
    logger: { info() {}, warn() {}, error() {} },
  };

  return {
    deps,
    tokenPlano,
    getToken: () => tokenRow,
    getTurno: () => turno,
    auditorias,
    eventos,
  };
}

describe('ejecutarAccionPublicaTurno (C-15)', () => {
  it('confirma turno pendiente_confirmacion, consume token, audita y publica evento', async () => {
    const esc = crearEscenarioAccion({
      propositoToken: 'confirmar',
      estadoTurno: 'pendiente_confirmacion',
    });

    const res = await ejecutarAccionPublicaTurno(esc.deps, {
      token: esc.tokenPlano,
      accion: 'confirmar',
      ip: '190.1.2.3',
    });

    expect(res.estado).toBe('confirmado');
    expect(res.accion).toBe('confirmar');
    expect(esc.getToken()?.usadoEn).not.toBeNull();
    expect(esc.auditorias).toEqual([{ accion: 'confirmacion', actorTipo: 'paciente_enlace' }]);
    expect(esc.eventos).toEqual([{ tipo: 'confirmado', turnoId: 'turno-1' }]);
  });

  it('cancela turno exactamente en el límite de 24h y respeta anticipación configurable', async () => {
    const exacto24h = crearEscenarioAccion({
      propositoToken: 'cancelar',
      estadoTurno: 'confirmado',
      ahora: new Date('2026-12-10T14:00:00.000Z'),
      inicioTurno: new Date('2026-12-11T14:00:00.000Z'),
      anticipacionHoras: 24,
    });
    const res = await ejecutarAccionPublicaTurno(exacto24h.deps, { token: exacto24h.tokenPlano });
    expect(res.estado).toBe('cancelado');
    expect(exacto24h.getToken()?.usadoEn).not.toBeNull();
    expect(exacto24h.eventos).toEqual([{ tipo: 'cancelado', turnoId: 'turno-1' }]);
  });

  it('rechaza cancelación con menos de 24h (409 CANCELACION_FUERA_DE_PLAZO) sin consumir el token', async () => {
    const menos24h = crearEscenarioAccion({
      propositoToken: 'cancelar',
      estadoTurno: 'confirmado',
      ahora: new Date('2026-12-10T14:01:00.000Z'),
      inicioTurno: new Date('2026-12-11T14:00:00.000Z'),
      anticipacionHoras: 24,
    });

    await expect(
      ejecutarAccionPublicaTurno(menos24h.deps, { token: menos24h.tokenPlano }),
    ).rejects.toMatchObject({ codigo: 'CANCELACION_FUERA_DE_PLAZO' });
    expect(menos24h.getToken()?.usadoEn).toBeNull();
    expect(menos24h.getTurno().estado).toBe('confirmado');
  });

  it('rechaza uniformemente con TOKEN_ACCION_INVALIDO si no existe, está usado, vencido, propósito cruzado o clínica inactiva', async () => {
    for (const caso of [
      { sinClinica: true },
      { tokenInexistente: true },
      { usado: true },
      { vencido: true },
    ]) {
      const esc = crearEscenarioAccion(caso);
      await expect(
        ejecutarAccionPublicaTurno(esc.deps, { token: esc.tokenPlano }),
      ).rejects.toMatchObject({ codigo: 'TOKEN_ACCION_INVALIDO' });
    }

    const cruzado = crearEscenarioAccion({ propositoToken: 'confirmar' });
    await expect(
      ejecutarAccionPublicaTurno(cruzado.deps, {
        token: cruzado.tokenPlano,
        accion: 'cancelar',
      }),
    ).rejects.toMatchObject({ codigo: 'TOKEN_ACCION_INVALIDO' });
  });

  it('rechaza confirmar un turno ya cancelado con TRANSICION_TURNO_INVALIDA', async () => {
    const esc = crearEscenarioAccion({
      propositoToken: 'confirmar',
      estadoTurno: 'cancelado',
    });
    await expect(
      ejecutarAccionPublicaTurno(esc.deps, { token: esc.tokenPlano }),
    ).rejects.toMatchObject({ codigo: 'TRANSICION_TURNO_INVALIDA' });
    expect(esc.getToken()?.usadoEn).toBeNull();
  });
});
