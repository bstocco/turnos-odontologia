import { crearModuloPublico } from '../../../../src/interfaces/http/modules/publico-disponibilidad/index.js';

/** Módulo público con el almacén de contadores reducido a 5 IPs (solo pruebas, C-13). */
export const CAPACIDAD = 5;

export default crearModuloPublico({ cache: CAPACIDAD });
