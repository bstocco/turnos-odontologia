import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

import type {
  AprovisionadorRepositorio,
  ClinicaAprovisionada,
  DatosDeNuevaClinica,
} from '../../application/aprovisionamiento/index.js';
import { ErrorDeDominio } from '../../domain/shared/errores.js';
import { hashContrasena } from '../auth/contrasena.js';
import { generarTokenAleatorio } from '../crypto/index.js';
import { poolDeLaAplicacion } from '../db/pool/index.js';
import { withTenant } from '../db/tenant/with-tenant.js';

/**
 * Registra en `auditoria` la creación de la clínica con actor `sistema` (tabla de
 * auditoría, de C-07; los INSERTs son la única operación sobre `auditoria` — RN-AU-01).
 */
async function registrarAuditoriaCreacionDeClinica(
  cliente: PoolClient,
  clinicaId: string,
): Promise<void> {
  await cliente.query(
    `INSERT INTO auditoria (clinica_id, ocurrio_en, actor_tipo, accion, entidad, entidad_id)
     VALUES ($1, now(), 'sistema', 'creacion', 'clinica', $1)`,
    [clinicaId],
  );
}

/**
 * Repositorio de aprovisionamiento: crea la clínica (catálogo, sin RLS), su
 * `clinica_config` por defecto y el primer usuario del personal (administrador)
 * con una contraseña temporal. Detiene con `CLINICA_SLUG_EXISTENTE` si el slug ya existe.
 */
export const repositorioDeAprovisionamiento: AprovisionadorRepositorio = {
  async crearClinicaConAdmin(datos: DatosDeNuevaClinica): Promise<ClinicaAprovisionada> {
    const clinicaId = randomUUID();

    const cliente = await poolDeLaAplicacion().connect();
    try {
      try {
        await cliente.query('INSERT INTO clinica (id, nombre, slug) VALUES ($1, $2, $3)', [
          clinicaId,
          datos.nombre,
          datos.slug,
        ]);
      } catch (error) {
        if ((error as NodeJS.ErrnoException & { code?: string }).code === '23505') {
          throw new ErrorDeDominio(
            'CLINICA_SLUG_EXISTENTE',
            'conflicto',
            'El slug ya está en uso: creá uno distinto.',
          );
        }
        throw error;
      }

      const passwordTemporal = generarTokenAleatorio();
      await withTenant(clinicaId, async (t) => {
        await t.query('INSERT INTO clinica_config (clinica_id) VALUES ($1)', [clinicaId]);
        await t.query(
          'INSERT INTO usuario (id, clinica_id, email, hash_contrasena, rol) VALUES (gen_random_uuid(), $1, $2, $3, $4)',
          [clinicaId, datos.email, await hashContrasena(passwordTemporal), 'administrador'],
        );
        await registrarAuditoriaCreacionDeClinica(t, clinicaId);
      });

      return { id: clinicaId, slug: datos.slug, passwordTemporal };
    } finally {
      cliente.release();
    }
  },
};
