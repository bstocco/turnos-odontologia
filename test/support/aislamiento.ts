import { poolDeLaAplicacion } from '../../src/infrastructure/db/pool/index.js';
import { withTenant } from '../../src/infrastructure/db/tenant/with-tenant.js';

/** Clínicas sintéticas del arnés de aislamiento (no se usan datos reales de pacientes, RN-DA). */
export const CLINICA_A = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'clinica-a-sintetica',
  nombre: 'Clínica A sintética',
} as const;

export const CLINICA_B = {
  id: '22222222-2222-4222-8222-222222222222',
  slug: 'clinica-b-sintetica',
  nombre: 'Clínica B sintética',
} as const;

/** Inserta la clínica (catálogo `clinica`, sin RLS) y su fila de `clinica_config`, con contexto de tenant. */
export async function insertarConfigDeClinica(clinica: {
  readonly id: string;
  readonly slug: string;
  readonly nombre: string;
}): Promise<void> {
  await withTenant(clinica.id, async (cliente) => {
    await cliente.query(
      'INSERT INTO clinica (id, nombre, slug) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
      [clinica.id, clinica.nombre, clinica.slug],
    );
    await cliente.query('INSERT INTO clinica_config (clinica_id) VALUES ($1)', [clinica.id]);
  });
}

/**
 * Lista las clínicas de configuración visibles desde el contexto de tenant indicado.
 * Sin clínica: el pool sin contexto (la política queda cerrada).
 */
export async function listarIdsDeConfiguracion(clinicaId?: string): Promise<string[]> {
  if (clinicaId !== undefined) {
    const { rows } = await withTenant(clinicaId, (cliente) =>
      cliente.query<{ clinica_id: string }>('SELECT clinica_id FROM clinica_config'),
    );
    return rows.map((fila) => fila.clinica_id);
  }
  const { rows } = await poolDeLaAplicacion().query<{ clinica_id: string }>(
    'SELECT clinica_id FROM clinica_config',
  );
  return rows.map((fila) => fila.clinica_id);
}
