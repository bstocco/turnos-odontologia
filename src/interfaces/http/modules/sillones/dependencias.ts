import type { PoolClient } from 'pg';

import type { DependenciasDeSillones } from '../../../../application/configuracion/index.js';
import { crearAuditoriaPg } from '../../../../infrastructure/audit/index.js';
import { crearSillonRepository } from '../../../../infrastructure/db/repositories/sillon/index.js';

/** Arma los puertos sobre el cliente de `withTenant`: repositorio y auditoría comparten la transacción. */
export function dependenciasDeSillones(cliente: PoolClient): DependenciasDeSillones {
  return {
    sillones: crearSillonRepository(cliente),
    auditoria: crearAuditoriaPg(cliente),
  };
}
