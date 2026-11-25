import type {
  BuscadorTurnosRecordatorio,
  CatalogoClinicasActivas,
  ClinicaActivaRecordatorio,
  VentanaRecordatorio,
} from '../../../application/notificaciones/index.js';
import { poolDeLaAplicacion } from '../../db/pool/index.js';
import {
  CLINICA_DEL_CONTEXTO_SQL,
  consultar,
  esUuid,
  texto,
} from '../../db/repositories/compartido/index.js';
import { withTenant } from '../../db/tenant/with-tenant.js';

const SQL_LISTAR_CLINICAS_ACTIVAS = `
  SELECT id, zona_horaria
  FROM clinica
  WHERE activa = TRUE
  ORDER BY id
`;

const SQL_TURNOS_ELEGIBLES_RECORDATORIO = `
  SELECT t.id
  FROM turno t
  WHERE t.clinica_id = ${CLINICA_DEL_CONTEXTO_SQL}
    AND t.estado IN ('pendiente_confirmacion', 'confirmado')
    AND t.inicio > $1::timestamptz
    AND t.inicio <= $2::timestamptz
    AND NOT EXISTS (
      SELECT 1
      FROM notificacion n
      WHERE n.clinica_id = t.clinica_id
        AND n.turno_id = t.id
        AND n.tipo = 'recordatorio'
    )
  ORDER BY t.inicio, t.id
`;

/**
 * Lee el catálogo global de clínicas activas (`clinica` no tiene RLS por diseño C03_001).
 */
export function crearCatalogoClinicasActivasPg(): CatalogoClinicasActivas {
  return {
    async listarActivas(): Promise<readonly ClinicaActivaRecordatorio[]> {
      const { rows } = await consultar(poolDeLaAplicacion(), SQL_LISTAR_CLINICAS_ACTIVAS);
      return rows.map((fila) => ({
        id: texto(fila, 'id'),
        zonaHoraria: texto(fila, 'zona_horaria'),
      }));
    },
  };
}

/**
 * Busca los turnos elegibles de una clínica dentro de `withTenant(clinicaId)` respetando RLS.
 */
export function crearBuscadorTurnosRecordatorioPg(): BuscadorTurnosRecordatorio {
  return {
    async buscarElegiblesEnVentana(
      clinicaId: string,
      ventana: VentanaRecordatorio,
    ): Promise<readonly string[]> {
      if (!esUuid(clinicaId)) return [];
      return withTenant(clinicaId, async (cliente) => {
        const { rows } = await consultar(cliente, SQL_TURNOS_ELEGIBLES_RECORDATORIO, [
          ventana.desdeExclusivo,
          ventana.hastaInclusivo,
        ]);
        return rows.map((fila) => texto(fila, 'id'));
      });
    },
  };
}
