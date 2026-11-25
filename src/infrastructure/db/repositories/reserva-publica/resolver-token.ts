import { consultar, esUuid, type EjecutorSql } from '../compartido/index.js';

/**
 * Resuelve el `clinica_id` de un `token_accion` perteneciente a una clínica ACTIVA mediante
 * la función `SECURITY DEFINER` `resolver_clinica_por_hash_token` (`C15_001`).
 */
export async function resolverClinicaPorHashToken(
  ejecutor: EjecutorSql,
  hashToken: string,
): Promise<string | null> {
  const { rows } = await consultar(ejecutor, 'SELECT resolver_clinica_por_hash_token($1) AS id', [
    hashToken,
  ]);
  const id = rows[0]?.['id'];
  return typeof id === 'string' && esUuid(id) ? id : null;
}
