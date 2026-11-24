import type { FranjaAtencion } from '../../domain/agenda/index.js';
import { conAuditoriaDeCambio } from '../auditoria/index.js';
import type { RequestContext } from '../shared/request-context.js';

import { accesoProhibido, recursoNoEncontrado } from './errores.js';
import { ESCRITURA, LECTURA, exigirRol } from './permisos.js';
import type {
  HorariosPuerto,
  ProfesionalesPuerto,
  ServicioAuditoria,
  VinculoProfesionalPuerto,
} from './puertos.js';
import { formatearMinutos, validarFranjas, type FranjaEntrada } from './validaciones.js';

export interface DependenciasDeHorarios {
  readonly profesionales: Pick<ProfesionalesPuerto, 'obtenerPorId'>;
  readonly horarios: HorariosPuerto;
  readonly vinculo: VinculoProfesionalPuerto;
  readonly auditoria: ServicioAuditoria;
}

export interface HorariosDto {
  readonly profesionalId: string;
  readonly franjas: readonly FranjaEntrada[];
}

function aDto(profesionalId: string, franjas: readonly FranjaAtencion[]): HorariosDto {
  return {
    profesionalId,
    franjas: franjas.map((f) => ({
      diaSemana: f.diaSemana,
      horaDesde: formatearMinutos(f.desdeMinutos),
      horaHasta: formatearMinutos(f.hastaMinutos),
    })),
  };
}

/**
 * Franjas semanales de un profesional. Administrador y recepcionista leen cualquiera; el
 * odontólogo solo el suyo. El profesional se busca primero: un id inexistente o ajeno es 404 para
 * todos los roles (no se distingue "ajeno" de "inexistente"); dentro de la propia clínica, un
 * odontólogo que pide otro profesional recibe 403.
 */
export async function obtenerHorarios(
  deps: Pick<DependenciasDeHorarios, 'profesionales' | 'horarios' | 'vinculo'>,
  ctx: RequestContext,
  profesionalId: string,
): Promise<HorariosDto> {
  exigirRol(ctx, LECTURA);
  if ((await deps.profesionales.obtenerPorId(profesionalId)) === null) {
    throw recursoNoEncontrado();
  }
  if (ctx.actor.rol === 'odontologo') {
    const propio = await deps.vinculo.profesionalDelUsuario(ctx.actor.id);
    if (propio !== profesionalId) throw accesoProhibido();
  }
  return aDto(profesionalId, await deps.horarios.franjasDeAtencion(profesionalId));
}

/** Reemplaza TODAS las franjas del profesional (solo administrador); lista vacía las borra. */
export async function reemplazarHorarios(
  deps: DependenciasDeHorarios,
  ctx: RequestContext,
  profesionalId: string,
  entrada: { readonly franjas: readonly FranjaEntrada[] },
  ip: string | null = null,
): Promise<HorariosDto> {
  exigirRol(ctx, ESCRITURA);
  const franjas = validarFranjas(entrada.franjas);
  if ((await deps.profesionales.obtenerPorId(profesionalId)) === null) {
    throw recursoNoEncontrado();
  }
  const antes = aDto(profesionalId, await deps.horarios.franjasDeAtencion(profesionalId));
  return conAuditoriaDeCambio(
    deps.auditoria,
    ctx,
    {
      accion: 'modificacion',
      entidad: 'horario_atencion',
      entidadId: profesionalId,
      antes: { franjas: antes.franjas },
      ip,
      extraerDespues: (resultado: HorariosDto) => ({ franjas: resultado.franjas }),
    },
    async () => {
      await deps.horarios.reemplazarFranjas(profesionalId, franjas);
      return aDto(profesionalId, franjas);
    },
  );
}
