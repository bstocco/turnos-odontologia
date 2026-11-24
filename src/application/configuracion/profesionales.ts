import type { RequestContext } from '../shared/request-context.js';

import {
  crearEnCatalogo,
  listarDeCatalogo,
  modificarEnCatalogo,
  obtenerDeCatalogo,
  soloDefinidos,
  type FiltroDeLista,
} from './catalogo.js';
import type { ProfesionalDto, ProfesionalesPuerto, ServicioAuditoria } from './puertos.js';

const ENTIDAD = 'profesional';

export interface DependenciasDeProfesionales {
  readonly profesionales: ProfesionalesPuerto;
  readonly auditoria: ServicioAuditoria;
}

export interface NuevoProfesionalEntrada {
  readonly nombre: string;
  readonly apellido: string;
  readonly matricula?: string | null;
}

export interface CambiosDeProfesionalEntrada {
  readonly nombre?: string;
  readonly apellido?: string;
  readonly matricula?: string | null;
  readonly activo?: boolean;
}

const recortar = (texto: string | null | undefined): string | null | undefined =>
  typeof texto === 'string' ? texto.trim() : texto;

export function listarProfesionales(
  deps: Pick<DependenciasDeProfesionales, 'profesionales'>,
  ctx: RequestContext,
  filtro: FiltroDeLista,
): Promise<readonly ProfesionalDto[]> {
  return listarDeCatalogo(deps.profesionales, ctx, filtro, (p) => p.activo);
}

export function obtenerProfesional(
  deps: Pick<DependenciasDeProfesionales, 'profesionales'>,
  ctx: RequestContext,
  id: string,
): Promise<ProfesionalDto> {
  return obtenerDeCatalogo(deps.profesionales, ctx, id);
}

export function crearProfesional(
  deps: DependenciasDeProfesionales,
  ctx: RequestContext,
  entrada: NuevoProfesionalEntrada,
  ip: string | null = null,
): Promise<ProfesionalDto> {
  return crearEnCatalogo(
    deps.profesionales,
    deps.auditoria,
    ctx,
    ENTIDAD,
    {
      nombre: entrada.nombre.trim(),
      apellido: entrada.apellido.trim(),
      matricula: recortar(entrada.matricula) ?? null,
    },
    ip,
  );
}

export function modificarProfesional(
  deps: DependenciasDeProfesionales,
  ctx: RequestContext,
  id: string,
  entrada: CambiosDeProfesionalEntrada,
  ip: string | null = null,
): Promise<ProfesionalDto> {
  const cambios = soloDefinidos({
    nombre: recortar(entrada.nombre) ?? undefined,
    apellido: recortar(entrada.apellido) ?? undefined,
    // `null` es un cambio válido (borra la matrícula); `undefined` no.
    matricula: recortar(entrada.matricula),
    activo: entrada.activo,
  });
  return modificarEnCatalogo(deps.profesionales, deps.auditoria, ctx, ENTIDAD, id, cambios, ip);
}
