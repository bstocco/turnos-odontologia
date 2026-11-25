import {
  crearIntervaloOLanzar,
  detectarSolape,
  instanteALocal,
  rangoProfesional,
  rangoSillon,
  sumarDias,
  turnoSolapadoProfesional,
  turnoSolapadoSillon,
  validarTurnoPrevio,
  type ConfiguracionAgenda,
  type Sillon,
} from '../../domain/agenda/index.js';
import {
  verificarCodigoVerificacion,
  type MotivoCodigoVerificacionInvalido,
} from '../../domain/comunicacion/index.js';
import type { ErrorDeDominio } from '../../domain/shared/errores.js';
import type { PacienteId, PrestacionId, ProfesionalId } from '../../domain/shared/ids.js';
import { valorOLanzar } from '../../domain/shared/resultado.js';
import { crearTurno, turnoEventPublisherNulo, type EstadoTurno } from '../../domain/turno/index.js';
import { conAuditoriaDeCambio } from '../auditoria/hooks.js';
import { sanearCodigoError } from '../notificaciones/errores.js';
import type { RequestContext } from '../shared/request-context.js';

import {
  codigoVerificacionAgotado,
  codigoVerificacionInvalido,
  codigoVerificacionUsado,
  codigoVerificacionVencido,
  recursoPublicoNoEncontrado,
  topeReservasActivasAlcanzado,
} from './errores.js';
import type { DependenciasReservaPublica } from './puertos.js';
import { normalizarDatosPacienteReserva, type EntradaPacienteReserva } from './validaciones.js';

const TOPE_RESERVAS_PUBLICAS_ACTIVAS = 2;

export interface EntradaReservaPublica {
  readonly clinicaId: string;
  readonly profesionalId: string;
  readonly prestacionId: string;
  readonly inicio: Date;
  readonly codigoVerificacion: string;
  readonly paciente: EntradaPacienteReserva;
  readonly ip?: string | null;
}

export interface ResultadoReservaPublica {
  readonly turnoId: string;
  readonly estado: EstadoTurno;
  readonly inicio: Date;
  readonly fin: Date;
  readonly zonaHoraria: string;
  readonly profesionalId: string;
  readonly prestacionId: string;
}

function errorPorMotivoOtp(
  motivo: MotivoCodigoVerificacionInvalido,
  agotado: boolean,
): ErrorDeDominio {
  switch (motivo) {
    case 'codigo_invalido':
      return agotado ? codigoVerificacionAgotado() : codigoVerificacionInvalido();
    case 'intentos_agotados':
      return codigoVerificacionAgotado();
    case 'vencido':
      return codigoVerificacionVencido();
    case 'ya_consumido':
      return codigoVerificacionUsado();
  }
}

function seleccionarSillonesAsignables(params: {
  readonly profesionalId: ProfesionalId;
  readonly inicio: Date;
  readonly fin: Date;
  readonly duracionMinutos: number;
  readonly sillones: readonly Sillon[];
  readonly turnosSillones: Parameters<typeof detectarSolape>[1];
}): readonly Sillon[] {
  return params.sillones.filter((sillon) => {
    if (!sillon.activo) return false;
    const rangoS = rangoSillon(params.inicio, params.duracionMinutos, sillon.bufferMinutos);
    if (!rangoS.ok) return false;
    return detectarSolape(
      {
        profesionalId: params.profesionalId,
        sillonId: sillon.id,
        inicio: params.inicio,
        fin: params.fin,
        finSillon: rangoS.valor.fin,
      },
      params.turnosSillones,
    ).ok;
  });
}

/**
 * Crea una reserva pública validando el código OTP por email (con persistencia de intentos
 * fallidos antes de devolver 422), controlando el tope `PO-09` (máximo 2 reservas activas),
 * reutilizando o creando el paciente por DNI (`RN-RE-04`), asignando un sillón libre (`RN-RE-03`),
 * auditando fail-closed y publicando el evento de turno post-commit fail-open (`RN-NO-03`).
 */
export async function reservarTurnoPublico(
  deps: DependenciasReservaPublica,
  entrada: EntradaReservaPublica,
): Promise<ResultadoReservaPublica> {
  const paciente = normalizarDatosPacienteReserva(entrada.paciente);
  const codigoIngresado = entrada.codigoVerificacion.trim();
  if (codigoIngresado.length === 0) {
    throw codigoVerificacionInvalido();
  }

  // Paso 1: transacción corta dedicada para validar OTP y confirmar incrementos de `intentos`.
  const verificacion = await deps.ejecutor.verificarOtp(entrada.clinicaId, async (codigos) => {
    const registro = await codigos.obtenerUltimoParaActualizar(paciente.email);
    if (registro === null) {
      return { ok: false as const, error: codigoVerificacionInvalido() };
    }

    const res = verificarCodigoVerificacion({
      codigoIngresado,
      registro,
      ahora: deps.reloj.ahora(),
      crypto: deps.crypto,
    });
    if (!res.valido) {
      if (res.motivo === 'codigo_invalido') {
        await codigos.actualizarIntentos(registro.id, res.intentosActualizados);
      }
      return { ok: false as const, error: errorPorMotivoOtp(res.motivo, res.agotado) };
    }

    return { ok: true as const, codigoId: registro.id };
  });

  if (!verificacion.ok) {
    throw verificacion.error;
  }

  // Paso 2: transacción atómica de reserva (re-lock OTP + PO-09 + paciente + turno + auditoría).
  const persistido = await deps.ejecutor.reservar(entrada.clinicaId, async (ctx) => {
    const ahora = deps.reloj.ahora();

    const otp = await ctx.codigos.obtenerPorIdParaActualizar(verificacion.codigoId);
    if (otp === null) throw codigoVerificacionInvalido();
    const recheck = verificarCodigoVerificacion({
      codigoIngresado,
      registro: otp,
      ahora,
      crypto: deps.crypto,
    });
    if (!recheck.valido) {
      throw errorPorMotivoOtp(recheck.motivo, recheck.agotado);
    }
    await ctx.codigos.marcarConsumido(otp.id, ahora);

    const profesional = await ctx.recursos.profesional(entrada.profesionalId as ProfesionalId);
    if (profesional === null || !profesional.activo) throw recursoPublicoNoEncontrado();

    const prestacion = await ctx.prestaciones.obtenerPorId(entrada.prestacionId);
    if (prestacion === null || !prestacion.activa) throw recursoPublicoNoEncontrado();

    await ctx.po09.bloquearIdentidad(entrada.clinicaId, paciente.dni, paciente.email);
    const activas = await ctx.po09.contarReservasPublicasActivas(
      paciente.dni,
      paciente.email,
      ahora,
    );
    if (activas >= TOPE_RESERVAS_PUBLICAS_ACTIVAS) {
      throw topeReservasActivasAlcanzado();
    }

    const configAgenda: ConfiguracionAgenda = {
      zonaHoraria: ctx.clinicaConfig.zonaHoraria,
      granularidadMinutos: ctx.clinicaConfig.granularidadMinutos,
    };
    const rangoProf = valorOLanzar(rangoProfesional(entrada.inicio, prestacion.duracionMinutos));
    const local = valorOLanzar(instanteALocal(entrada.inicio, configAgenda.zonaHoraria));

    const [franjas, feriados, bloqueos, sillones, turnosProf] = await Promise.all([
      ctx.agenda.franjasDeAtencion(profesional.id),
      ctx.agenda.feriados(local.fecha, sumarDias(local.fecha, 1)),
      ctx.agenda.bloqueos(profesional.id, rangoProf),
      ctx.recursos.sillonesActivos(),
      ctx.agenda.turnosActivosDeProfesional(profesional.id, rangoProf),
    ]);

    const validacionAgenda = validarTurnoPrevio({
      inicio: rangoProf.inicio,
      rangoProfesional: rangoProf,
      ahora,
      config: configAgenda,
      feriados,
      franjas,
      bloqueos,
    });
    if (!validacionAgenda.ok) throw validacionAgenda.error;

    const solapeProf = detectarSolape(
      {
        profesionalId: profesional.id,
        sillonId: sillones[0]?.id ?? ('' as Sillon['id']),
        inicio: rangoProf.inicio,
        fin: rangoProf.fin,
        finSillon: rangoProf.fin,
      },
      turnosProf,
    );
    if (!solapeProf.ok) {
      throw turnoSolapadoProfesional();
    }

    const sillonesActivos = sillones.filter((s) => s.activo);
    if (sillonesActivos.length === 0) {
      throw turnoSolapadoSillon();
    }

    const maxBuffer = Math.max(0, ...sillonesActivos.map((s) => s.bufferMinutos));
    const ventanaSillones = crearIntervaloOLanzar(
      rangoProf.inicio,
      new Date(rangoProf.fin.getTime() + maxBuffer * 60_000),
    );
    const turnosSillones = await ctx.agenda.turnosActivosDeSillones(
      sillonesActivos.map((s) => s.id),
      ventanaSillones,
    );
    const asignables = seleccionarSillonesAsignables({
      profesionalId: profesional.id,
      inicio: rangoProf.inicio,
      fin: rangoProf.fin,
      duracionMinutos: prestacion.duracionMinutos,
      sillones: sillonesActivos,
      turnosSillones,
    });
    if (asignables.length === 0) {
      throw turnoSolapadoSillon();
    }

    // Alta o reutilización segura de paciente por DNI (RN-RE-04, Q4).
    let pacienteActual = await ctx.pacientes.buscarPorDni(paciente.dni);
    if (pacienteActual === null) {
      const { paciente: creado, creado: fueCreado } =
        await ctx.pacientes.crearConManejoDeDuplicado(paciente);
      pacienteActual = creado;
      if (fueCreado) {
        const ctxPaciente: RequestContext = {
          clinicaId: entrada.clinicaId,
          actor: { tipo: 'paciente_enlace', id: creado.id, rol: 'paciente' },
        };
        await conAuditoriaDeCambio(
          ctx.auditoria,
          ctxPaciente,
          {
            accion: 'creacion',
            entidad: 'paciente',
            entidadId: creado.id,
            antes: null,
            despues: { id: creado.id, origen: 'enlace_web' },
            ip: entrada.ip ?? null,
          },
          async () => creado,
        );
      }
    } else if (pacienteActual.email === null) {
      const actualizado = await ctx.pacientes.completarEmailSiNulo(
        pacienteActual.id,
        paciente.email,
      );
      if (actualizado !== null) {
        pacienteActual = actualizado;
        const ctxPaciente: RequestContext = {
          clinicaId: entrada.clinicaId,
          actor: { tipo: 'paciente_enlace', id: pacienteActual.id, rol: 'paciente' },
        };
        await conAuditoriaDeCambio(
          ctx.auditoria,
          ctxPaciente,
          {
            accion: 'modificacion',
            entidad: 'paciente',
            entidadId: pacienteActual.id,
            antes: { emailPresente: false },
            despues: { emailPresente: true },
            ip: entrada.ip ?? null,
          },
          async () => actualizado,
        );
      }
    }

    const estadoInicial: EstadoTurno = ctx.clinicaConfig.reservaRequiereConfirmacion
      ? 'pendiente_confirmacion'
      : 'confirmado';
    const bufferPorSillon = new Map(asignables.map((s) => [s.id, s.bufferMinutos]));

    const ctxTurno: RequestContext = {
      clinicaId: entrada.clinicaId,
      actor: { tipo: 'paciente_enlace', id: pacienteActual.id, rol: 'paciente' },
    };

    const turno = await conAuditoriaDeCambio(
      ctx.auditoria,
      ctxTurno,
      {
        accion: 'creacion',
        entidad: 'turno',
        extraerEntidadId: (t) => t.id,
        antes: null,
        extraerDespues: (t) => ({
          estado: t.estado,
          origen: t.origen,
          profesionalId: t.profesionalId,
          prestacionId: t.prestacionId,
          inicio: t.inicio.toISOString(),
          fin: t.fin.toISOString(),
        }),
        ip: entrada.ip ?? null,
      },
      () =>
        ctx.turnos.insertarConReintentoSillon(
          asignables.map((s) => s.id),
          (sillonId) =>
            valorOLanzar(
              crearTurno({
                pacienteId: pacienteActual.id as PacienteId,
                profesionalId: profesional.id,
                sillonId,
                prestacionId: prestacion.id as PrestacionId,
                inicio: rangoProf.inicio,
                duracionMinutos: prestacion.duracionMinutos,
                bufferMinutos: bufferPorSillon.get(sillonId) ?? 0,
                estado: estadoInicial,
                origen: 'enlace_web',
                reprogramadoDe: null,
              }),
            ),
        ),
    );

    return {
      turno,
      zonaHoraria: ctx.clinicaConfig.zonaHoraria,
    };
  });

  // Paso 3: publicación de evento post-commit fail-open (RN-NO-03).
  const publicador = deps.publicadorPorClinica?.(entrada.clinicaId) ?? turnoEventPublisherNulo();
  try {
    await publicador.publicar({ tipo: 'creado', turnoId: persistido.turno.id });
  } catch (error) {
    deps.logger.warn(
      {
        clinicaId: entrada.clinicaId,
        turnoId: persistido.turno.id,
        codigo: sanearCodigoError(error, 'ERROR_PUBLICAR_EVENTO_TURNO'),
      },
      'No se pudo publicar evento de turno tras reserva pública',
    );
  }

  return {
    turnoId: persistido.turno.id,
    estado: persistido.turno.estado,
    inicio: persistido.turno.inicio,
    fin: persistido.turno.fin,
    zonaHoraria: persistido.zonaHoraria,
    profesionalId: persistido.turno.profesionalId,
    prestacionId: persistido.turno.prestacionId,
  };
}
