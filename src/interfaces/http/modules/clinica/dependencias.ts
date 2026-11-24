import type { PoolClient } from 'pg';

import type { DependenciasDeClinica } from '../../../../application/configuracion/index.js';
import { crearAuditoriaPg } from '../../../../infrastructure/audit/index.js';
import { crearConfiguracionClinicaRepository } from '../../../../infrastructure/db/repositories/configuracion-clinica/index.js';

/** Arma los puertos sobre el cliente de `withTenant`: repositorio y auditoría comparten la transacción. */
export function dependenciasDeClinica(cliente: PoolClient): DependenciasDeClinica {
  return {
    configuracion: crearConfiguracionClinicaRepository(cliente),
    auditoria: crearAuditoriaPg(cliente),
  };
}
