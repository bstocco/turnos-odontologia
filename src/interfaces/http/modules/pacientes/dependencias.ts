import type { PoolClient } from 'pg';

import type {
  DependenciasDePacientes,
  VinculoProfesionalPuerto,
} from '../../../../application/pacientes/index.js';
import { crearAuditoriaPg } from '../../../../infrastructure/audit/index.js';
import { buscarUsuarioPorId } from '../../../../infrastructure/auth/repositorio-de-usuarios.js';
import { esUuid } from '../../../../infrastructure/db/repositories/compartido/index.js';
import { crearPacienteRepository } from '../../../../infrastructure/db/repositories/paciente/index.js';
import { crearAccesoPacientesReader } from '../../../../infrastructure/db/repositories/paciente-acceso/index.js';

/** Solo lectura sobre `usuario` (C-06): usuario inactivo, inexistente o sin vínculo -> `null`. */
function vinculoProfesional(cliente: PoolClient, clinicaId: string): VinculoProfesionalPuerto {
  return {
    async profesionalDelUsuario(usuarioId) {
      if (!esUuid(usuarioId)) return null;
      const usuario = await buscarUsuarioPorId(cliente, clinicaId, usuarioId);
      if (usuario === undefined || !usuario.activo) return null;
      return usuario.profesionalId ?? null;
    },
  };
}

/** Arma los puertos sobre el cliente de `withTenant`: repositorios y auditoría comparten la transacción. */
export function dependenciasDePacientes(
  cliente: PoolClient,
  clinicaId: string,
): DependenciasDePacientes {
  return {
    pacientes: crearPacienteRepository(cliente),
    acceso: crearAccesoPacientesReader(cliente),
    vinculo: vinculoProfesional(cliente, clinicaId),
    auditoria: crearAuditoriaPg(cliente),
  };
}
