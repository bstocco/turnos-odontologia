export interface EjecutorCatalogoPg {
  query<Fila extends Record<string, unknown>>(
    sql: string,
    valores?: readonly unknown[],
  ): Promise<{ rows: Fila[] }>;
}

export interface ResultadoPosturaSeguridadBd {
  readonly ok: boolean;
  readonly rolApp: string;
  readonly tablasMultiTenantVerificadas: readonly string[];
  readonly funcionesSecurityDefinerVerificadas: readonly string[];
  readonly hallazgos: readonly string[];
}

interface FilaRol extends Record<string, unknown> {
  rolsuper: boolean;
  rolbypassrls: boolean;
  rolcreatedb: boolean;
  rolcreaterole: boolean;
}

interface FilaPropietario extends Record<string, unknown> {
  tablename: string;
}

interface FilaTablaRls extends Record<string, unknown> {
  tabla: string;
  rls_habilitada: boolean;
  rls_forzada: boolean;
  politicas: string[];
}

interface FilaPrivilegio extends Record<string, unknown> {
  privilege_type: string;
}

interface FilaFuncionDefiner extends Record<string, unknown> {
  nombre: string;
  args: string;
  config: string[] | null;
  public_execute: boolean;
  app_execute: boolean;
}

const PRIVILEGIOS_PROHIBIDOS_AUDITORIA = ['UPDATE', 'DELETE', 'TRUNCATE'] as const;

async function verificarRolApp(
  ejecutor: EjecutorCatalogoPg,
  rolApp: string,
  hallazgos: string[],
): Promise<void> {
  const { rows } = await ejecutor.query<FilaRol>(
    `SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
     FROM pg_roles
     WHERE rolname = $1`,
    [rolApp],
  );
  const rol = rows[0];
  if (rol === undefined) {
    hallazgos.push(`No existe el rol de aplicación '${rolApp}' en pg_roles.`);
    return;
  }
  if (rol.rolsuper) hallazgos.push(`El rol '${rolApp}' tiene rolsuper=true.`);
  if (rol.rolbypassrls) hallazgos.push(`El rol '${rolApp}' tiene rolbypassrls=true (BYPASSRLS).`);
  if (rol.rolcreatedb) hallazgos.push(`El rol '${rolApp}' tiene rolcreatedb=true.`);
  if (rol.rolcreaterole) hallazgos.push(`El rol '${rolApp}' tiene rolcreaterole=true.`);

  const { rows: propias } = await ejecutor.query<FilaPropietario>(
    `SELECT tablename
     FROM pg_tables
     WHERE schemaname = 'public' AND tableowner = $1
     ORDER BY tablename`,
    [rolApp],
  );
  for (const fila of propias) {
    hallazgos.push(`El rol '${rolApp}' es propietario de la tabla public.${fila.tablename}.`);
  }
}

async function verificarTablasMultiTenant(
  ejecutor: EjecutorCatalogoPg,
  hallazgos: string[],
): Promise<string[]> {
  const { rows } = await ejecutor.query<FilaTablaRls>(
    `SELECT c.relname AS tabla,
            c.relrowsecurity AS rls_habilitada,
            c.relforcerowsecurity AS rls_forzada,
            COALESCE(
              ARRAY_AGG(
                p.policyname || ':' || COALESCE(p.qual, '') || '|' || COALESCE(p.with_check, '')
              ) FILTER (WHERE p.policyname IS NOT NULL),
              '{}'
            ) AS politicas
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     JOIN pg_attribute a ON a.attrelid = c.oid
     LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
       AND a.attname = 'clinica_id'
       AND NOT a.attisdropped
     GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
     ORDER BY c.relname`,
  );

  const verificadas: string[] = [];
  for (const fila of rows) {
    verificadas.push(fila.tabla);
    if (!fila.rls_habilitada) {
      hallazgos.push(`La tabla public.${fila.tabla} con clinica_id no tiene RLS habilitada.`);
    }
    if (!fila.rls_forzada) {
      hallazgos.push(
        `La tabla public.${fila.tabla} con clinica_id no tiene FORCE ROW LEVEL SECURITY.`,
      );
    }
    const tienePoliticaTenant = fila.politicas.some((p) => p.includes('app.clinica_id'));
    if (!tienePoliticaTenant) {
      hallazgos.push(
        `La tabla public.${fila.tabla} carece de política RLS basada en app.clinica_id.`,
      );
    }
  }
  return verificadas;
}

async function verificarPrivilegiosAuditoria(
  ejecutor: EjecutorCatalogoPg,
  rolApp: string,
  hallazgos: string[],
): Promise<void> {
  const { rows } = await ejecutor.query<FilaPrivilegio>(
    `SELECT privilege_type
     FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name = 'auditoria'
       AND grantee = $1`,
    [rolApp],
  );
  const otorgados = new Set(rows.map((r) => r.privilege_type.toUpperCase()));
  if (!otorgados.has('SELECT')) {
    hallazgos.push(`El rol '${rolApp}' no tiene privilegio SELECT sobre public.auditoria.`);
  }
  if (!otorgados.has('INSERT')) {
    hallazgos.push(`El rol '${rolApp}' no tiene privilegio INSERT sobre public.auditoria.`);
  }
  for (const prohibido of PRIVILEGIOS_PROHIBIDOS_AUDITORIA) {
    if (otorgados.has(prohibido)) {
      hallazgos.push(`El rol '${rolApp}' tiene privilegio prohibido ${prohibido} en auditoria.`);
    }
  }
}

async function verificarFuncionesSecurityDefiner(
  ejecutor: EjecutorCatalogoPg,
  rolApp: string,
  hallazgos: string[],
): Promise<string[]> {
  const { rows } = await ejecutor.query<FilaFuncionDefiner>(
    `SELECT p.proname AS nombre,
            pg_get_function_identity_arguments(p.oid) AS args,
            p.proconfig AS config,
            has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute,
            has_function_privilege($1, p.oid, 'EXECUTE') AS app_execute
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef = true
     ORDER BY p.proname`,
    [rolApp],
  );

  const verificadas: string[] = [];
  for (const fn of rows) {
    verificadas.push(fn.nombre);
    const tieneSearchPath =
      Array.isArray(fn.config) && fn.config.some((c) => c.startsWith('search_path='));
    if (!tieneSearchPath) {
      hallazgos.push(
        `La función SECURITY DEFINER public.${fn.nombre}(${fn.args}) no fija search_path.`,
      );
    }
    if (fn.public_execute) {
      hallazgos.push(
        `La función SECURITY DEFINER public.${fn.nombre}(${fn.args}) mantiene EXECUTE para PUBLIC.`,
      );
    }
    if (!fn.app_execute) {
      hallazgos.push(
        `La función SECURITY DEFINER public.${fn.nombre}(${fn.args}) no otorga EXECUTE a '${rolApp}'.`,
      );
    }
  }
  return verificadas;
}

/**
 * Audita los catálogos reales de PostgreSQL para garantizar mínimo privilegio del rol de la app,
 * RLS habilitada y forzada en toda tabla multi-tenant, inmutabilidad de `auditoria` y
 * endurecimiento de funciones `SECURITY DEFINER`.
 */
export async function verificarPosturaSeguridadBd(
  ejecutor: EjecutorCatalogoPg,
  rolApp = 'app',
): Promise<ResultadoPosturaSeguridadBd> {
  const hallazgos: string[] = [];

  await verificarRolApp(ejecutor, rolApp, hallazgos);
  const tablasMultiTenantVerificadas = await verificarTablasMultiTenant(ejecutor, hallazgos);
  await verificarPrivilegiosAuditoria(ejecutor, rolApp, hallazgos);
  const funcionesSecurityDefinerVerificadas = await verificarFuncionesSecurityDefiner(
    ejecutor,
    rolApp,
    hallazgos,
  );

  return {
    ok: hallazgos.length === 0,
    rolApp,
    tablasMultiTenantVerificadas,
    funcionesSecurityDefinerVerificadas,
    hallazgos,
  };
}
