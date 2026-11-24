import type { PoolClient } from 'pg';

import type { DependenciasDeFeriados } from '../../../../application/configuracion/index.js';
import { crearAuditoriaPg } from '../../../../infrastructure/audit/index.js';
import { crearFeriadoRepository } from '../../../../infrastructure/db/repositories/feriado/index.js';

/** Arma los puertos sobre el cliente de `withTenant`: repositorio y auditoría comparten la transacción. */
export function dependenciasDeFeriados(cliente: PoolClient): DependenciasDeFeriados {
  const repositorio = crearFeriadoRepository(cliente);
  return {
    feriados: {
      crear: (fecha, descripcion) => repositorio.crear(fecha, descripcion),
      eliminar: (id) => repositorio.eliminar(id),
      listar: () => repositorio.listar(),
    },
    auditoria: crearAuditoriaPg(cliente),
  };
}
