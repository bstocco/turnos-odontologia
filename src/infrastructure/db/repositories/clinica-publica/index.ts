import { consultar, esUuid, type EjecutorSql } from '../compartido/index.js';

/**
 * Resuelve el id de una clínica ACTIVA por su slug con la función `resolver_clinica_por_slug`
 * (C13_001, SECURITY DEFINER de mínimo alcance). Inexistente e inactiva dan `null` (regla 12).
 * Se ejecuta SIN contexto de tenant: es lo que permite obtener el id para abrir `withTenant`.
 * Lo reutiliza C-15 (contrato congelado).
 */
export async function resolverClinicaPorSlug(
  ejecutor: EjecutorSql,
  slug: string,
): Promise<string | null> {
  const { rows } = await consultar(ejecutor, 'SELECT resolver_clinica_por_slug($1) AS id', [slug]);
  const id = rows[0]?.['id'];
  return typeof id === 'string' && esUuid(id) ? id : null;
}
