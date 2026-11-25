import type { RequestContext } from '../shared/request-context.js';

import { accesoProhibido } from './errores.js';

/** Roles del personal (`03 §RBAC`). La aplicación no importa el tipo de infraestructura. */
export type RolDePersonal = 'administrador' | 'recepcionista' | 'odontologo';

/** Quién puede leer los catálogos de configuración (design D5). */
export const LECTURA: readonly RolDePersonal[] = ['administrador', 'recepcionista', 'odontologo'];

/** Quién puede modificarlos. */
export const ESCRITURA: readonly RolDePersonal[] = ['administrador'];

/**
 * Exige que el actor tenga alguno de los roles. Mismo código y mensaje que `requireRole` de C-06
 * (que solo admite un rol). Un rol desconocido en el token se trata como sin permiso.
 */
export function exigirRol(ctx: RequestContext, roles: readonly RolDePersonal[]): void {
  if (!roles.some((rol) => rol === ctx.actor.rol)) throw accesoProhibido();
}
