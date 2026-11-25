import type { RequestContext } from '../shared/request-context.js';

import { accesoProhibido } from './errores.js';

/** Roles del personal (`03 §RBAC`). La aplicación no importa el tipo de infraestructura. */
export type RolDePersonal = 'administrador' | 'recepcionista' | 'odontologo';

/** Quién puede dar de alta y modificar pacientes (design D3). */
export const ALTA_Y_MODIFICACION: readonly RolDePersonal[] = ['administrador', 'recepcionista'];

/** Quién puede leer y buscar pacientes (el odontólogo, solo dentro de su alcance, D4). */
export const LECTURA: readonly RolDePersonal[] = ['administrador', 'recepcionista', 'odontologo'];

/**
 * Exige que el actor tenga alguno de los roles. Un rol desconocido en el token se trata como
 * sin permiso.
 */
export function exigirRol(ctx: RequestContext, roles: readonly RolDePersonal[]): void {
  if (!roles.some((rol) => rol === ctx.actor.rol)) throw accesoProhibido();
}
