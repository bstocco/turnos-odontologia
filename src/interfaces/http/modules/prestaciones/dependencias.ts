import type { PoolClient } from 'pg';

import type { DependenciasDePrestaciones } from '../../../../application/configuracion/index.js';
import { crearAuditoriaPg } from '../../../../infrastructure/audit/index.js';
import { crearPrestacionRepository } from '../../../../infrastructure/db/repositories/prestacion/index.js';

/** Arma los puertos sobre el cliente de `withTenant`: repositorio y auditoría comparten la transacción. */
export function dependenciasDePrestaciones(cliente: PoolClient): DependenciasDePrestaciones {
  return {
    prestaciones: crearPrestacionRepository(cliente),
    auditoria: crearAuditoriaPg(cliente),
  };
}
