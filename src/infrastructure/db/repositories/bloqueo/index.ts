import {
  crearIntervaloOLanzar,
  type Bloqueo,
  type Intervalo,
} from '../../../../domain/agenda/index.js';
import type { ProfesionalId } from '../../../../domain/shared/index.js';
import {
  CLINICA_DEL_CONTEXTO_SQL,
  consultar,
  esUuid,
  instante,
  recursoNoEncontrado,
  texto,
  textoONulo,
  type EjecutorSql,
  type Fila,
} from '../compartido/index.js';

/** Bloqueo con sus datos de gestión. Tipo propio del repositorio: NO es contrato congelado (D9). */
export interface BloqueoRegistro extends Bloqueo {
  /** Texto libre: puede contener datos personales; no se loguea. */
  readonly motivo: string | null;
  readonly creadoPor: string;
}

export interface NuevoBloqueo {
  /** Opcional: ids explícitos para datos reproducibles (seed). Por defecto lo genera la base. */
  readonly id?: string;
  readonly profesionalId: string;
  readonly intervalo: Intervalo;
  readonly motivo?: string | null;
  readonly creadoPor: string;
}

export interface BloqueoRepository {
  crear(datos: NuevoBloqueo): Promise<BloqueoRegistro>;
  /** `true` si existía y se borró. */
  eliminar(id: string): Promise<boolean>;
}

export const COLUMNAS_BLOQUEO = 'id, profesional_id, inicio, fin, motivo, creado_por';

export function aBloqueoRegistro(fila: Fila): BloqueoRegistro {
  return {
    id: texto(fila, 'id'),
    profesionalId: texto(fila, 'profesional_id') as ProfesionalId,
    intervalo: crearIntervaloOLanzar(instante(fila, 'inicio'), instante(fila, 'fin')),
    motivo: textoONulo(fila, 'motivo'),
    creadoPor: texto(fila, 'creado_por'),
  };
}

export function crearBloqueoRepository(ejecutor: EjecutorSql): BloqueoRepository {
  return {
    async crear(datos) {
      if (!esUuid(datos.profesionalId)) throw recursoNoEncontrado();
      const { rows } = await consultar(
        ejecutor,
        `INSERT INTO bloqueo (id, clinica_id, profesional_id, inicio, fin, motivo, creado_por)
         VALUES (COALESCE($6::uuid, gen_random_uuid()), ${CLINICA_DEL_CONTEXTO_SQL}, $1, $2::timestamptz, $3::timestamptz, $4, $5)
         RETURNING ${COLUMNAS_BLOQUEO}`,
        [
          datos.profesionalId,
          datos.intervalo.inicio,
          datos.intervalo.fin,
          datos.motivo ?? null,
          datos.creadoPor,
          datos.id ?? null,
        ],
      );
      const fila = rows[0];
      if (fila === undefined) throw new Error('La inserción no devolvió la fila creada');
      return aBloqueoRegistro(fila);
    },
    async eliminar(id) {
      if (!esUuid(id)) return false;
      const { rowCount } = await consultar(ejecutor, 'DELETE FROM bloqueo WHERE id = $1', [id]);
      return (rowCount ?? 0) > 0;
    },
  };
}
