import type { PoolClient } from 'pg';

import {
  recursoPublicoNoEncontrado,
  validarSlug,
  type DependenciasDeCatalogo,
  type DependenciasDeDisponibilidad,
  type Reloj,
} from '../../../../application/disponibilidad/index.js';
import { poolDeLaAplicacion } from '../../../../infrastructure/db/pool/index.js';
import { resolverClinicaPorSlug } from '../../../../infrastructure/db/repositories/clinica-publica/index.js';
import { crearPrestacionRepository } from '../../../../infrastructure/db/repositories/prestacion/index.js';
import { crearProfesionalRepository } from '../../../../infrastructure/db/repositories/profesional/index.js';
import { crearRecursosReader } from '../../../../infrastructure/db/repositories/recursos/index.js';
import { crearAgendaReader } from '../../../../infrastructure/db/repositories/turno/index.js';
import { withTenant } from '../../../../infrastructure/db/tenant/with-tenant.js';

/** Puertos del catálogo sobre el cliente de `withTenant`. */
export function dependenciasDeCatalogo(cliente: PoolClient): DependenciasDeCatalogo {
  return {
    prestaciones: crearPrestacionRepository(cliente),
    profesionales: crearProfesionalRepository(cliente),
  };
}

/** Puertos de la disponibilidad: readers de C-05 y C-09 compartiendo la transacción. */
export function dependenciasDeDisponibilidad(
  cliente: PoolClient,
  reloj: Reloj,
): DependenciasDeDisponibilidad {
  return {
    prestaciones: crearPrestacionRepository(cliente),
    recursos: crearRecursosReader(cliente),
    agenda: crearAgendaReader(cliente),
    reloj,
  };
}

/**
 * Composición por pedido (design D2): valida el slug sin base, resuelve la clínica activa y abre
 * `withTenant` en una transacción de SOLO LECTURA (defensa en profundidad: una escritura falla con
 * `25006`). Slug inválido, inexistente o de clínica inactiva dan el mismo `404`.
 */
export async function conClinicaPublica<T>(
  slug: string,
  fn: (cliente: PoolClient) => Promise<T>,
): Promise<T> {
  if (!validarSlug(slug)) throw recursoPublicoNoEncontrado();
  const clinicaId = await resolverClinicaPorSlug(poolDeLaAplicacion(), slug);
  if (clinicaId === null) throw recursoPublicoNoEncontrado();
  return withTenant(clinicaId, async (cliente) => {
    await cliente.query('SET TRANSACTION READ ONLY');
    return fn(cliente);
  });
}
