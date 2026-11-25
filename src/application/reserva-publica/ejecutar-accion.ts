import { validarTokenAccion, type PropositoTokenAccion } from '../../domain/comunicacion/index.js';
import {
  transicionar,
  turnoEventPublisherNulo,
  type EstadoTurno,
} from '../../domain/turno/index.js';
import { conAuditoriaDeCambio } from '../auditoria/hooks.js';
import { sanearCodigoError } from '../notificaciones/errores.js';
import type { RequestContext } from '../shared/request-context.js';

import { cancelacionFueraDePlazo, tokenAccionInvalido } from './errores.js';
import type { DependenciasAccionPublica } from './puertos.js';
import { puedeCancelarConAnticipacion } from './validaciones.js';

export interface EntradaAccionPublicaTurno {
  readonly token: string;
  readonly accion?: PropositoTokenAccion;
  readonly ip?: string | null;
}

export interface ResultadoAccionPublicaTurno {
  readonly turnoId: string;
  readonly accion: PropositoTokenAccion;
  readonly estado: EstadoTurno;
  readonly inicio: Date;
  readonly fin: Date;
}

/**
 * Ejecuta confirmación o cancelación online mediante un token de un solo uso (`Flujo 4`, `US-032`),
 * rechazando uniformemente con `404 TOKEN_ACCION_INVALIDO` cualquier token inexistente, usado,
 * vencido, de propósito incompatible o de clínica inactiva (`Q5`), y validando `RN-RE-02` en
 * cancelaciones sin quemar el token cuando falta menos que la anticipación configurada.
 */
export async function ejecutarAccionPublicaTurno(
  deps: DependenciasAccionPublica,
  entrada: EntradaAccionPublicaTurno,
): Promise<ResultadoAccionPublicaTurno> {
  const tokenPlano = entrada.token.trim();
  if (tokenPlano.length === 0) {
    throw tokenAccionInvalido();
  }

  const hashToken = deps.crypto.hashSha256(tokenPlano);
  const clinicaId = await deps.resolverClinicaPorHashToken(hashToken);
  if (clinicaId === null) {
    throw tokenAccionInvalido();
  }

  const persistido = await deps.ejecutor.ejecutar(clinicaId, async (ctx) => {
    const ahora = deps.reloj.ahora();
    const registro = await ctx.tokens.obtenerPorHashParaActualizar(hashToken);
    if (registro === null) {
      throw tokenAccionInvalido();
    }

    const propositoEsperado = entrada.accion ?? registro.proposito;
    const validacion = validarTokenAccion({
      tokenPlano,
      propositoEsperado,
      registro,
      ahora,
      crypto: deps.crypto,
    });
    if (!validacion.valido) {
      throw tokenAccionInvalido();
    }

    const turno = await ctx.turnos.obtenerPorIdParaActualizar(registro.turnoId);
    if (turno === null) {
      throw tokenAccionInvalido();
    }

    const estadoDestino: EstadoTurno =
      registro.proposito === 'confirmar' ? 'confirmado' : 'cancelado';
    const transicion = transicionar(turno, estadoDestino, ahora);
    if (!transicion.ok) {
      throw transicion.error;
    }

    if (
      registro.proposito === 'cancelar' &&
      !puedeCancelarConAnticipacion(
        ahora,
        turno.inicio,
        ctx.clinicaConfig.cancelacionAnticipacionHoras,
      )
    ) {
      throw cancelacionFueraDePlazo(ctx.clinicaConfig.cancelacionAnticipacionHoras);
    }

    const ctxAuditoria: RequestContext = {
      clinicaId,
      actor: { tipo: 'paciente_enlace', id: turno.pacienteId, rol: 'paciente' },
    };

    const turnoActualizado = await conAuditoriaDeCambio(
      ctx.auditoria,
      ctxAuditoria,
      {
        accion: registro.proposito === 'confirmar' ? 'confirmacion' : 'cancelacion',
        entidad: 'turno',
        entidadId: turno.id,
        antes: { estado: turno.estado },
        despues: { estado: transicion.valor.estado },
        ip: entrada.ip ?? null,
      },
      async () => {
        const actualizado = await ctx.turnos.actualizarEstado(transicion.valor, turno.estado);
        await ctx.tokens.marcarUsado(registro.id, ahora);
        return actualizado;
      },
    );

    return {
      turno: turnoActualizado,
      accion: registro.proposito,
    };
  });

  const publicador = deps.publicadorPorClinica?.(clinicaId) ?? turnoEventPublisherNulo();
  try {
    await publicador.publicar({
      tipo: persistido.accion === 'confirmar' ? 'confirmado' : 'cancelado',
      turnoId: persistido.turno.id,
    });
  } catch (error) {
    deps.logger.warn(
      {
        clinicaId,
        turnoId: persistido.turno.id,
        accion: persistido.accion,
        codigo: sanearCodigoError(error, 'ERROR_PUBLICAR_EVENTO_TURNO'),
      },
      'No se pudo publicar evento de turno tras acción pública por token',
    );
  }

  return {
    turnoId: persistido.turno.id,
    accion: persistido.accion,
    estado: persistido.turno.estado,
    inicio: persistido.turno.inicio,
    fin: persistido.turno.fin,
  };
}
