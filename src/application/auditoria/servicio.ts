import type { RequestContext } from '../shared/request-context.js';

import type {
  AuditoriaRepositorio,
  EntradaAuditoria,
  RegistroAuditoriaCreado,
  ServicioAuditoria,
} from './puertos.js';
import { prepararRegistroAuditoria } from './validaciones.js';

/** Crea el servicio de auditoría sobre el puerto append-only sin depender de infraestructura. */
export function crearAuditoriaService(repositorio: AuditoriaRepositorio): ServicioAuditoria {
  return {
    async registrar(
      ctx: RequestContext,
      entrada: EntradaAuditoria,
    ): Promise<RegistroAuditoriaCreado> {
      const registro = prepararRegistroAuditoria(ctx, entrada);
      return repositorio.insertar(registro);
    },
  };
}
