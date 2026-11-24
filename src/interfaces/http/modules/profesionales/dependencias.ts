import type { PoolClient } from 'pg';

import type {
  DependenciasDeHorarios,
  DependenciasDeProfesionales,
  VinculoProfesionalPuerto,
} from '../../../../application/configuracion/index.js';
import type { ProfesionalId } from '../../../../domain/shared/index.js';
import { crearAuditoriaPg } from '../../../../infrastructure/audit/index.js';
import { buscarUsuarioPorId } from '../../../../infrastructure/auth/repositorio-de-usuarios.js';
import { crearCalendarioReader } from '../../../../infrastructure/db/repositories/calendario/index.js';
import { esUuid } from '../../../../infrastructure/db/repositories/compartido/index.js';
import { crearHorarioRepository } from '../../../../infrastructure/db/repositories/horario/index.js';
import { crearProfesionalRepository } from '../../../../infrastructure/db/repositories/profesional/index.js';

/** Arma los puertos sobre el cliente de `withTenant`: repositorios y auditoría comparten la transacción. */
export function dependenciasDeProfesionales(cliente: PoolClient): DependenciasDeProfesionales {
  return {
    profesionales: crearProfesionalRepository(cliente),
    auditoria: crearAuditoriaPg(cliente),
  };
}

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

export function dependenciasDeHorarios(
  cliente: PoolClient,
  clinicaId: string,
): DependenciasDeHorarios {
  const horarios = crearHorarioRepository(cliente);
  const calendario = crearCalendarioReader(cliente);
  return {
    profesionales: crearProfesionalRepository(cliente),
    horarios: {
      franjasDeAtencion: (profesionalId) =>
        calendario.franjasDeAtencion(profesionalId as ProfesionalId),
      reemplazarFranjas: (profesionalId, franjas) =>
        horarios.reemplazarFranjas(profesionalId, franjas),
    },
    vinculo: vinculoProfesional(cliente, clinicaId),
    auditoria: crearAuditoriaPg(cliente),
  };
}
