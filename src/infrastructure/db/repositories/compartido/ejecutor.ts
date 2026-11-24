/** Resultado mínimo de una consulta (compatible con `pg.QueryResult`). */
export interface ResultadoSql {
  readonly rows: readonly Record<string, unknown>[];
  readonly rowCount: number | null;
}

/**
 * Cliente transaccional que reciben los repositorios (D7). Lo satisface el `PoolClient` que
 * `withTenant` entrega a su callback: los repositorios no abren conexiones ni conocen el tenant,
 * el contexto llega por `app.clinica_id` (RLS).
 */
export interface EjecutorSql {
  query(texto: string, valores?: unknown[]): Promise<ResultadoSql>;
}

/**
 * Clínica del contexto de la transacción. Las escrituras la usan como valor de `clinica_id` para
 * que el llamador nunca la indique; sin contexto resulta NULL y la base rechaza la escritura.
 */
export const CLINICA_DEL_CONTEXTO_SQL = "NULLIF(current_setting('app.clinica_id', true), '')::uuid";
