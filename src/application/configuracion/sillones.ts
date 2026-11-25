import type { RequestContext } from '../shared/request-context.js';

import {
  crearEnCatalogo,
  listarDeCatalogo,
  modificarEnCatalogo,
  obtenerDeCatalogo,
  soloDefinidos,
  type FiltroDeLista,
} from './catalogo.js';
import type { ServicioAuditoria, SillonDto, SillonesPuerto } from './puertos.js';

const ENTIDAD = 'sillon';

export interface DependenciasDeSillones {
  readonly sillones: SillonesPuerto;
  readonly auditoria: ServicioAuditoria;
}

export interface NuevoSillonEntrada {
  readonly nombre: string;
  /** Por defecto 0 (RN-AG-05). */
  readonly bufferMinutos?: number;
}

export interface CambiosDeSillonEntrada {
  readonly nombre?: string;
  readonly bufferMinutos?: number;
  readonly activo?: boolean;
}

export function listarSillones(
  deps: Pick<DependenciasDeSillones, 'sillones'>,
  ctx: RequestContext,
  filtro: FiltroDeLista,
): Promise<readonly SillonDto[]> {
  return listarDeCatalogo(deps.sillones, ctx, filtro, (s) => s.activo);
}

export function obtenerSillon(
  deps: Pick<DependenciasDeSillones, 'sillones'>,
  ctx: RequestContext,
  id: string,
): Promise<SillonDto> {
  return obtenerDeCatalogo(deps.sillones, ctx, id);
}

export function crearSillon(
  deps: DependenciasDeSillones,
  ctx: RequestContext,
  entrada: NuevoSillonEntrada,
  ip: string | null = null,
): Promise<SillonDto> {
  return crearEnCatalogo(
    deps.sillones,
    deps.auditoria,
    ctx,
    ENTIDAD,
    { nombre: entrada.nombre.trim(), bufferMinutos: entrada.bufferMinutos ?? 0 },
    ip,
  );
}

export function modificarSillon(
  deps: DependenciasDeSillones,
  ctx: RequestContext,
  id: string,
  entrada: CambiosDeSillonEntrada,
  ip: string | null = null,
): Promise<SillonDto> {
  const cambios = soloDefinidos({
    nombre: entrada.nombre?.trim(),
    bufferMinutos: entrada.bufferMinutos,
    activo: entrada.activo,
  });
  return modificarEnCatalogo(deps.sillones, deps.auditoria, ctx, ENTIDAD, id, cambios, ip);
}
