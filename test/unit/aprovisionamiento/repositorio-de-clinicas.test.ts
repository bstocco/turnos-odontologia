import { describe, expect, it, vi } from 'vitest';

const { cliente, consultas, estado } = vi.hoisted(() => {
  const consultas: string[] = [];
  const estado = { failOnClinica: false };
  const cliente = {
    query: vi.fn(async (sql: string) => {
      consultas.push(sql);
      if (estado.failOnClinica && sql.startsWith('INSERT INTO clinica')) {
        const error = new Error('duplicate key') as NodeJS.ErrnoException & { code: string };
        error.code = '23505';
        throw error;
      }
      return { rows: [] };
    }),
    release: () => undefined,
  };
  return { cliente, consultas, estado };
});

vi.mock('../../../src/infrastructure/db/pool/index.js', () => ({
  poolDeLaAplicacion: () => ({ connect: () => Promise.resolve(cliente) }),
}));

vi.mock('../../../src/infrastructure/db/tenant/with-tenant.js', () => ({
  withTenant: async (_clinicaId: string, fn: (c: unknown) => Promise<unknown>) => fn(cliente),
}));

import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';
import { repositorioDeAprovisionamiento } from '../../../src/infrastructure/aprovisionamiento/repositorio-de-clinicas.js';

describe('repositorio de aprovisionamiento (C-17)', () => {
  it('crea la clínica, su config por defecto, el primer admin y audita con actor sistema', async () => {
    const resultado = await repositorioDeAprovisionamiento.crearClinicaConAdmin({
      slug: 'clinica-prueba-01',
      nombre: 'Clínica de prueba',
      email: 'admin@clinica-prueba.local',
    });

    expect(resultado.slug).toBe('clinica-prueba-01');
    expect(resultado.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(resultado.passwordTemporal.length).toBeGreaterThan(8);

    const executed = consultas.join('\n');
    expect(executed).toMatch(/INSERT INTO clinica \(id, nombre, slug\) VALUES \(\$1, \$2, \$3\)/);
    expect(executed).toMatch(/_config \(clinica_id\)/);
    expect(executed).toMatch(/INSERT INTO usuario \(id, clinica_id, email, hash_contrasena, rol\)/);
    expect(executed).toMatch(/INSERT INTO auditoria/);
  });

  it('slug repetido → ErrorDeDominio CLINICA_SLUG_EXISTENTE', async () => {
    estado.failOnClinica = true;
    await expect(
      repositorioDeAprovisionamiento.crearClinicaConAdmin({
        slug: 'slug-repetido',
        nombre: 'Clínica repetida',
        email: 'admin@repetida.local',
      }),
    ).rejects.toMatchObject({ codigo: 'CLINICA_SLUG_EXISTENTE', tipo: 'conflicto' });
    await expect(
      repositorioDeAprovisionamiento.crearClinicaConAdmin({
        slug: 'slug-repetido-2',
        nombre: 'Otra repetida',
        email: 'admin@repetida2.local',
      }),
    ).rejects.toBeInstanceOf(ErrorDeDominio);
  });
});
