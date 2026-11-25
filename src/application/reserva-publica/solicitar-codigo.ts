import { randomUUID } from 'node:crypto';

import {
  TTL_CODIGO_VERIFICACION_MS,
  emitirCodigoVerificacion,
  plantillaCodigoVerificacion,
} from '../../domain/comunicacion/index.js';
import { sanearCodigoError } from '../notificaciones/errores.js';

import type { DependenciasSolicitudCodigo } from './puertos.js';
import { normalizarEmailPublico } from './validaciones.js';

const VIGENCIA_CODIGO_MINUTOS = Math.round(TTL_CODIGO_VERIFICACION_MS / 60_000);

export interface EntradaSolicitudCodigo {
  readonly clinicaId: string;
  readonly email: string;
}

export type ResultadoSolicitudCodigo =
  | { readonly estado: 'enviado'; readonly vigenciaMinutos: number }
  | { readonly estado: 'error_envio'; readonly codigo: 'ERROR_PROVEEDOR_EMAIL' };

/**
 * Emite un código OTP de 6 dígitos para reserva pública, guarda únicamente su hash SHA-256,
 * registra trazabilidad en `notificacion` (`tipo = 'codigo'`, `turno_id = NULL`) y envía el correo
 * fuera de la transacción de base de datos sin depositar PII ni el código en `pg-boss` ni logs.
 */
export async function solicitarCodigoVerificacion(
  deps: DependenciasSolicitudCodigo,
  entrada: EntradaSolicitudCodigo,
): Promise<ResultadoSolicitudCodigo> {
  const emailNormalizado = normalizarEmailPublico(entrada.email);
  const generarId = deps.generarId ?? randomUUID;
  const ahora = deps.reloj.ahora();

  const emision = await deps.ejecutor.iniciarEmision(entrada.clinicaId, async (ctx) => {
    await ctx.codigos.invalidarPendientesPorEmail(emailNormalizado, ahora);

    const emitido = emitirCodigoVerificacion({
      ahora,
      crypto: deps.crypto,
    });
    const codigoId = generarId();

    await ctx.codigos.insertar({
      id: codigoId,
      email: emailNormalizado,
      hashCodigo: emitido.hashCodigo,
      venceEn: emitido.venceEn,
    });

    const notificacionId = generarId();
    await ctx.notificaciones.crearOEncontrarIdempotente({
      id: notificacionId,
      clinicaId: entrada.clinicaId,
      turnoId: null,
      canal: 'email',
      tipo: 'codigo',
      claveIdempotencia: `codigo:${codigoId}`,
      programadaPara: ahora,
    });

    return {
      nombreClinica: ctx.nombreClinica,
      codigo: emitido.codigo,
      notificacionId,
    };
  });

  const plantilla = plantillaCodigoVerificacion({
    nombreClinica: emision.nombreClinica,
    codigo: emision.codigo,
    vigenciaMinutos: VIGENCIA_CODIGO_MINUTOS,
  });

  try {
    await deps.emailSender.enviar({
      para: emailNormalizado,
      asunto: plantilla.asunto,
      texto: plantilla.cuerpo,
    });
    await deps.ejecutor.finalizarNotificacion(entrada.clinicaId, (notificaciones) =>
      notificaciones.marcarEnviada(emision.notificacionId, deps.reloj.ahora()),
    );
    return { estado: 'enviado', vigenciaMinutos: VIGENCIA_CODIGO_MINUTOS };
  } catch (error) {
    const errorSeguro = sanearCodigoError(error, 'ERROR_PROVEEDOR_EMAIL');
    await deps.ejecutor.finalizarNotificacion(entrada.clinicaId, (notificaciones) =>
      notificaciones.registrarFalloIntento(emision.notificacionId, {
        definitivo: true,
        errorSeguro,
      }),
    );
    deps.logger.warn(
      {
        clinicaId: entrada.clinicaId,
        notificacionId: emision.notificacionId,
        codigo: errorSeguro,
      },
      'No se pudo entregar el código de verificación por email',
    );
    return { estado: 'error_envio', codigo: 'ERROR_PROVEEDOR_EMAIL' };
  }
}
