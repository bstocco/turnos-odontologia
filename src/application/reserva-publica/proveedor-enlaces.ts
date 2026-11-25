import { randomUUID } from 'node:crypto';

import { emitirTokenAccion, type PropositoTokenAccion } from '../../domain/comunicacion/index.js';
import type { TurnoId } from '../../domain/shared/ids.js';
import type {
  ContextoEnlacesTurno,
  EnlacesTurno,
  ProveedorEnlacesTurno,
} from '../notificaciones/turnos/puertos.js';

import type { DependenciasProveedorEnlaces } from './puertos.js';
import { calcularVencimientoTokenAccion, construirEnlaceAccionPublica } from './validaciones.js';

function propositosParaContexto(ctx: ContextoEnlacesTurno): readonly PropositoTokenAccion[] {
  if (ctx.tipo === 'cancelacion') return [];
  if (
    ctx.estadoTurno === 'pendiente_confirmacion' &&
    (ctx.tipo === 'creacion' || ctx.tipo === 'recordatorio')
  ) {
    return ['confirmar', 'cancelar'];
  }
  if (ctx.estadoTurno === 'confirmado' || ctx.tipo === 'reprogramacion') {
    return ['cancelar'];
  }
  return [];
}

/**
 * Implementación de `ProveedorEnlacesTurno` (`C-14`): emite tokens de un solo uso de 256 bits
 * al momento de renderizar un correo de turno, almacena exclusivamente `hash_token` en
 * `token_accion` dentro de `withTenant(clinicaId)` y construye URLs desde `PUBLIC_BASE_URL`.
 */
export function crearProveedorEnlacesTurno(
  deps: DependenciasProveedorEnlaces,
): ProveedorEnlacesTurno {
  const generarId = deps.generarId ?? randomUUID;

  return {
    async obtenerEnlaces(ctx: ContextoEnlacesTurno): Promise<EnlacesTurno> {
      const propositos = propositosParaContexto(ctx);
      if (propositos.length === 0) return {};

      const ahora = deps.reloj.ahora();

      return deps.ejecutor.ejecutar(ctx.clinicaId, ctx.turnoId, async ({ inicioTurno, tokens }) => {
        if (inicioTurno === null || inicioTurno.getTime() <= ahora.getTime()) {
          return {};
        }

        const venceEn = calcularVencimientoTokenAccion(ahora, inicioTurno);
        let enlaceConfirmar: string | undefined;
        let enlaceCancelar: string | undefined;

        for (const proposito of propositos) {
          const emitido = emitirTokenAccion({
            proposito,
            ahora,
            crypto: deps.crypto,
            ttlMs: Math.max(1, venceEn.getTime() - ahora.getTime()),
          });

          await tokens.insertar({
            id: generarId(),
            turnoId: ctx.turnoId as TurnoId,
            proposito,
            hashToken: emitido.hashToken,
            venceEn,
          });

          const url = construirEnlaceAccionPublica(deps.publicBaseUrl, emitido.token, proposito);
          if (proposito === 'confirmar') enlaceConfirmar = url;
          else enlaceCancelar = url;
        }

        return {
          ...(enlaceConfirmar !== undefined ? { enlaceConfirmar } : {}),
          ...(enlaceCancelar !== undefined ? { enlaceCancelar } : {}),
        };
      });
    },
  };
}
