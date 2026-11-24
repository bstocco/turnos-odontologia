import { conAuditoriaDeCambio } from '../auditoria/index.js';
import type { RequestContext } from '../shared/request-context.js';

import { cambiosVacios, recursoNoEncontrado } from './errores.js';
import { ESCRITURA, LECTURA, exigirRol } from './permisos.js';
import type { ServicioAuditoria } from './puertos.js';

/*
 * Casos de uso comunes de los catálogos de la clínica (profesionales, sillones, prestaciones):
 * lectura con filtro, alta y modificación auditadas. Cada recurso aporta su `entidad` y sus
 * normalizaciones (`profesionales.ts`, `sillones.ts`, `prestaciones.ts`).
 */

/** Filtro de las listas: `activo` aplica al estado activo del recurso (para prestaciones, `activa`). */
export interface FiltroDeLista {
  readonly activo?: boolean;
}

export async function listarDeCatalogo<T>(
  puerto: { listar(): Promise<readonly T[]> },
  ctx: RequestContext,
  filtro: FiltroDeLista,
  estaActivo: (recurso: T) => boolean,
): Promise<readonly T[]> {
  exigirRol(ctx, LECTURA);
  const todos = await puerto.listar();
  if (filtro.activo === undefined) return todos;
  return todos.filter((recurso) => estaActivo(recurso) === filtro.activo);
}

export async function obtenerDeCatalogo<T>(
  puerto: { obtenerPorId(id: string): Promise<T | null> },
  ctx: RequestContext,
  id: string,
): Promise<T> {
  exigirRol(ctx, LECTURA);
  const recurso = await puerto.obtenerPorId(id);
  if (recurso === null) throw recursoNoEncontrado();
  return recurso;
}

export async function crearEnCatalogo<T extends { readonly id: string }, N>(
  puerto: { crear(datos: N): Promise<T> },
  auditoria: ServicioAuditoria,
  ctx: RequestContext,
  entidad: string,
  datos: N,
  ip: string | null,
): Promise<T> {
  exigirRol(ctx, ESCRITURA);
  return conAuditoriaDeCambio(
    auditoria,
    ctx,
    {
      accion: 'creacion',
      entidad,
      antes: null,
      ip,
      extraerEntidadId: (creado: T) => creado.id,
      extraerDespues: (creado: T) => creado,
    },
    () => puerto.crear(datos),
  );
}

/** Copia solo las propiedades definidas (un `undefined` no es un cambio). */
export function soloDefinidos<C extends object>(cambios: C): Partial<C> {
  return Object.fromEntries(
    Object.entries(cambios).filter(([, valor]) => valor !== undefined),
  ) as Partial<C>;
}

export async function modificarEnCatalogo<T extends { readonly id: string }, C extends object>(
  puerto: {
    obtenerPorId(id: string): Promise<T | null>;
    actualizar(id: string, cambios: C): Promise<T | null>;
  },
  auditoria: ServicioAuditoria,
  ctx: RequestContext,
  entidad: string,
  id: string,
  cambios: C,
  ip: string | null,
): Promise<T> {
  exigirRol(ctx, ESCRITURA);
  if (Object.keys(cambios).length === 0) throw cambiosVacios();
  const antes = await puerto.obtenerPorId(id);
  if (antes === null) throw recursoNoEncontrado();
  return conAuditoriaDeCambio(
    auditoria,
    ctx,
    {
      accion: 'modificacion',
      entidad,
      entidadId: id,
      antes,
      ip,
      extraerDespues: (despues: T) => despues,
    },
    async () => {
      const despues = await puerto.actualizar(id, cambios);
      if (despues === null) throw recursoNoEncontrado();
      return despues;
    },
  );
}
