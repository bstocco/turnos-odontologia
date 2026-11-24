import { crearFechaLocal, type FechaLocal } from '../../../../domain/agenda/index.js';
import {
  CLINICA_DEL_CONTEXTO_SQL,
  consultar,
  esUuid,
  texto,
  type EjecutorSql,
  type Fila,
} from '../compartido/index.js';

/** Feriado de la clínica. Tipo propio del repositorio: NO es contrato congelado (D9). */
export interface FeriadoRegistro {
  readonly id: string;
  readonly fecha: FechaLocal;
  readonly descripcion: string;
}

export interface FeriadoRepository {
  /** `id` opcional: ids explícitos para datos reproducibles (seed). */
  crear(fecha: FechaLocal, descripcion: string, id?: string): Promise<FeriadoRegistro>;
  /** `true` si existía y se borró. */
  eliminar(id: string): Promise<boolean>;
  listar(): Promise<readonly FeriadoRegistro[]>;
}

/** `fecha::text` evita que `pg` convierta el `date` a un `Date` en la zona del proceso (D11). */
export function aFechaLocal(fila: Fila, columna = 'fecha'): FechaLocal {
  const resultado = crearFechaLocal(texto(fila, columna));
  if (!resultado.ok) throw resultado.error;
  return resultado.valor;
}

const COLUMNAS = 'id, fecha::text AS fecha, descripcion';

function aRegistro(fila: Fila): FeriadoRegistro {
  return {
    id: texto(fila, 'id'),
    fecha: aFechaLocal(fila),
    descripcion: texto(fila, 'descripcion'),
  };
}

export function crearFeriadoRepository(ejecutor: EjecutorSql): FeriadoRepository {
  return {
    async crear(fecha, descripcion, id) {
      const { rows } = await consultar(
        ejecutor,
        `INSERT INTO feriado (id, clinica_id, fecha, descripcion)
         VALUES (COALESCE($3::uuid, gen_random_uuid()), ${CLINICA_DEL_CONTEXTO_SQL}, $1::date, $2)
         RETURNING ${COLUMNAS}`,
        [fecha, descripcion, id ?? null],
      );
      const fila = rows[0];
      if (fila === undefined) throw new Error('La inserción no devolvió la fila creada');
      return aRegistro(fila);
    },
    async eliminar(id) {
      if (!esUuid(id)) return false;
      const { rowCount } = await consultar(ejecutor, 'DELETE FROM feriado WHERE id = $1', [id]);
      return (rowCount ?? 0) > 0;
    },
    async listar() {
      const { rows } = await consultar(ejecutor, `SELECT ${COLUMNAS} FROM feriado ORDER BY fecha`);
      return rows.map(aRegistro);
    },
  };
}
