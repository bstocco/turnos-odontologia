import type {
  ConfiguracionAgenda,
  Prestacion,
  Profesional,
  RecursosReader,
  Sillon,
} from '../../../../domain/agenda/index.js';
import type { PrestacionId, ProfesionalId, SillonId } from '../../../../domain/shared/index.js';
import {
  ErrorDePersistencia,
  booleano,
  consultar,
  entero,
  esUuid,
  texto,
  type EjecutorSql,
  type Fila,
} from '../compartido/index.js';

const aProfesional = (fila: Fila): Profesional => ({
  id: texto(fila, 'id') as ProfesionalId,
  activo: booleano(fila, 'activo'),
});

const aPrestacion = (fila: Fila): Prestacion => ({
  id: texto(fila, 'id') as PrestacionId,
  duracionMinutos: entero(fila, 'duracion_minutos'),
});

const aSillon = (fila: Fila): Sillon => ({
  id: texto(fila, 'id') as SillonId,
  bufferMinutos: entero(fila, 'buffer_minutos'),
  activo: booleano(fila, 'activo'),
});

/**
 * Adaptador de `RecursosReader` (contrato congelado de C-02, sin cambios). Tenant implícito:
 * el contexto llega por RLS en la transacción de `withTenant`; un recurso ajeno es `null`.
 * D12: `prestacion(id)` devuelve también prestaciones inactivas (el tipo no trae `activa`).
 */
export function crearRecursosReader(ejecutor: EjecutorSql): RecursosReader {
  return {
    async profesional(id) {
      if (!esUuid(id)) return null;
      const { rows } = await consultar(
        ejecutor,
        'SELECT id, activo FROM profesional WHERE id = $1',
        [id],
      );
      const fila = rows[0];
      return fila === undefined ? null : aProfesional(fila);
    },
    async prestacion(id) {
      if (!esUuid(id)) return null;
      const { rows } = await consultar(
        ejecutor,
        'SELECT id, duracion_minutos FROM prestacion WHERE id = $1',
        [id],
      );
      const fila = rows[0];
      return fila === undefined ? null : aPrestacion(fila);
    },
    async sillon(id) {
      if (!esUuid(id)) return null;
      const { rows } = await consultar(
        ejecutor,
        'SELECT id, buffer_minutos, activo FROM sillon WHERE id = $1',
        [id],
      );
      const fila = rows[0];
      return fila === undefined ? null : aSillon(fila);
    },
    async sillonesActivos() {
      const { rows } = await consultar(
        ejecutor,
        'SELECT id, buffer_minutos, activo FROM sillon WHERE activo ORDER BY nombre, id',
      );
      return rows.map(aSillon);
    },
    async configuracionAgenda(): Promise<ConfiguracionAgenda> {
      // `clinica` no tiene RLS: el filtro explícito por la clínica del contexto es obligatorio (D11).
      const { rows } = await consultar(
        ejecutor,
        `SELECT c.zona_horaria, cc.granularidad_minutos
           FROM clinica c
           JOIN clinica_config cc ON cc.clinica_id = c.id
          WHERE c.id = NULLIF(current_setting('app.clinica_id', true), '')::uuid`,
      );
      const fila = rows[0];
      if (fila === undefined) {
        throw new ErrorDePersistencia(
          undefined,
          undefined,
          'Falta la configuración de agenda de la clínica del contexto',
        );
      }
      return {
        zonaHoraria: texto(fila, 'zona_horaria'),
        granularidadMinutos: entero(fila, 'granularidad_minutos'),
      };
    },
  };
}
