import type { RequestContext } from '../shared/request-context.js';

import {
  crearEnCatalogo,
  listarDeCatalogo,
  modificarEnCatalogo,
  obtenerDeCatalogo,
  soloDefinidos,
  type FiltroDeLista,
} from './catalogo.js';
import type { PrestacionDto, PrestacionesPuerto, ServicioAuditoria } from './puertos.js';

const ENTIDAD = 'prestacion';

export interface DependenciasDePrestaciones {
  readonly prestaciones: PrestacionesPuerto;
  readonly auditoria: ServicioAuditoria;
}

export interface NuevaPrestacionEntrada {
  readonly nombre: string;
  readonly duracionMinutos: number;
}

export interface CambiosDePrestacionEntrada {
  readonly nombre?: string;
  readonly duracionMinutos?: number;
  readonly activa?: boolean;
}

export function listarPrestaciones(
  deps: Pick<DependenciasDePrestaciones, 'prestaciones'>,
  ctx: RequestContext,
  filtro: FiltroDeLista,
): Promise<readonly PrestacionDto[]> {
  return listarDeCatalogo(deps.prestaciones, ctx, filtro, (p) => p.activa);
}

export function obtenerPrestacion(
  deps: Pick<DependenciasDePrestaciones, 'prestaciones'>,
  ctx: RequestContext,
  id: string,
): Promise<PrestacionDto> {
  return obtenerDeCatalogo(deps.prestaciones, ctx, id);
}

export function crearPrestacion(
  deps: DependenciasDePrestaciones,
  ctx: RequestContext,
  entrada: NuevaPrestacionEntrada,
  ip: string | null = null,
): Promise<PrestacionDto> {
  return crearEnCatalogo(
    deps.prestaciones,
    deps.auditoria,
    ctx,
    ENTIDAD,
    { nombre: entrada.nombre.trim(), duracionMinutos: entrada.duracionMinutos },
    ip,
  );
}

export function modificarPrestacion(
  deps: DependenciasDePrestaciones,
  ctx: RequestContext,
  id: string,
  entrada: CambiosDePrestacionEntrada,
  ip: string | null = null,
): Promise<PrestacionDto> {
  const cambios = soloDefinidos({
    nombre: entrada.nombre?.trim(),
    duracionMinutos: entrada.duracionMinutos,
    activa: entrada.activa,
  });
  return modificarEnCatalogo(deps.prestaciones, deps.auditoria, ctx, ENTIDAD, id, cambios, ip);
}
