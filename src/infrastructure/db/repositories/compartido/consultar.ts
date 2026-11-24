import type { EjecutorSql, ResultadoSql } from './ejecutor.js';
import { traducirErrorPg } from './errores.js';

/** Ejecuta una consulta parametrizada y traduce cualquier fallo de PostgreSQL (D10). */
export async function consultar(
  ejecutor: EjecutorSql,
  texto: string,
  valores: unknown[] = [],
): Promise<ResultadoSql> {
  try {
    return await ejecutor.query(texto, valores);
  } catch (error) {
    throw traducirErrorPg(error);
  }
}
