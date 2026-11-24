import { conAuditoriaDeCambio } from '../auditoria/index.js';
import type { RequestContext } from '../shared/request-context.js';

import { cambiosVacios, granularidadInvalida } from './errores.js';
import { ESCRITURA, LECTURA, exigirRol } from './permisos.js';
import type {
  CambiosDeConfiguracion,
  ConfiguracionClinica,
  ConfiguracionClinicaPuerto,
  ServicioAuditoria,
} from './puertos.js';
import { esGranularidadValida } from './validaciones.js';

export interface DependenciasDeClinica {
  readonly configuracion: ConfiguracionClinicaPuerto;
  readonly auditoria: ServicioAuditoria;
}

/** Los tres parámetros operativos, tal como se auditan (design D9). */
function parametros(config: ConfiguracionClinica): Record<string, unknown> {
  return {
    reservaRequiereConfirmacion: config.reservaRequiereConfirmacion,
    cancelacionAnticipacionHoras: config.cancelacionAnticipacionHoras,
    granularidadMinutos: config.granularidadMinutos,
  };
}

export async function obtenerConfiguracionClinica(
  deps: Pick<DependenciasDeClinica, 'configuracion'>,
  ctx: RequestContext,
): Promise<ConfiguracionClinica> {
  exigirRol(ctx, LECTURA);
  return deps.configuracion.obtener();
}

export async function modificarConfiguracionClinica(
  deps: DependenciasDeClinica,
  ctx: RequestContext,
  entrada: CambiosDeConfiguracion,
  ip: string | null = null,
): Promise<ConfiguracionClinica> {
  exigirRol(ctx, ESCRITURA);
  const cambios: CambiosDeConfiguracion = {
    ...(entrada.reservaRequiereConfirmacion !== undefined && {
      reservaRequiereConfirmacion: entrada.reservaRequiereConfirmacion,
    }),
    ...(entrada.cancelacionAnticipacionHoras !== undefined && {
      cancelacionAnticipacionHoras: entrada.cancelacionAnticipacionHoras,
    }),
    ...(entrada.granularidadMinutos !== undefined && {
      granularidadMinutos: entrada.granularidadMinutos,
    }),
  };
  if (Object.keys(cambios).length === 0) throw cambiosVacios();
  if (
    cambios.granularidadMinutos !== undefined &&
    !esGranularidadValida(cambios.granularidadMinutos)
  ) {
    throw granularidadInvalida();
  }

  const antes = await deps.configuracion.obtener({ bloquear: true });
  return conAuditoriaDeCambio(
    deps.auditoria,
    ctx,
    {
      accion: 'modificacion',
      entidad: 'clinica_config',
      entidadId: ctx.clinicaId,
      antes: parametros(antes),
      ip,
      extraerDespues: parametros,
    },
    () => deps.configuracion.actualizar(cambios),
  );
}
