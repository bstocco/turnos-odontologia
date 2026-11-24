import {
  CLINICA_DEL_CONTEXTO_SQL,
  booleano,
  consultar,
  entero,
  esUuid,
  texto,
  type EjecutorSql,
  type Fila,
} from '../compartido/index.js';

/** Fila de sillón. Tipo propio del repositorio: NO es contrato congelado (D9). */
export interface SillonRegistro {
  readonly id: string;
  readonly nombre: string;
  readonly bufferMinutos: number;
  readonly activo: boolean;
}

export interface NuevoSillon {
  /** Opcional: ids explícitos para datos reproducibles (seed). Por defecto lo genera la base. */
  readonly id?: string;
  readonly nombre: string;
  /** Por defecto 0 (RN-AG-05). */
  readonly bufferMinutos?: number;
}

/** Lista blanca de campos actualizables. */
export interface CambiosDeSillon {
  readonly nombre?: string;
  readonly bufferMinutos?: number;
  readonly activo?: boolean;
}

export interface SillonRepository {
  crear(datos: NuevoSillon): Promise<SillonRegistro>;
  obtenerPorId(id: string): Promise<SillonRegistro | null>;
  listar(): Promise<readonly SillonRegistro[]>;
  actualizar(id: string, cambios: CambiosDeSillon): Promise<SillonRegistro | null>;
  /** Baja lógica: conserva la fila (D6). */
  desactivar(id: string): Promise<SillonRegistro | null>;
}

const COLUMNAS = 'id, nombre, buffer_minutos, activo';

export function aSillonRegistro(fila: Fila): SillonRegistro {
  return {
    id: texto(fila, 'id'),
    nombre: texto(fila, 'nombre'),
    bufferMinutos: entero(fila, 'buffer_minutos'),
    activo: booleano(fila, 'activo'),
  };
}

export function crearSillonRepository(ejecutor: EjecutorSql): SillonRepository {
  const actualizar = async (
    id: string,
    cambios: CambiosDeSillon,
  ): Promise<SillonRegistro | null> => {
    if (!esUuid(id)) return null;
    const { rows } = await consultar(
      ejecutor,
      `UPDATE sillon SET
         nombre         = CASE WHEN $2::boolean THEN $3::text ELSE nombre END,
         buffer_minutos = CASE WHEN $4::boolean THEN $5::integer ELSE buffer_minutos END,
         activo         = CASE WHEN $6::boolean THEN $7::boolean ELSE activo END
       WHERE id = $1
       RETURNING ${COLUMNAS}`,
      [
        id,
        cambios.nombre !== undefined,
        cambios.nombre ?? null,
        cambios.bufferMinutos !== undefined,
        cambios.bufferMinutos ?? null,
        cambios.activo !== undefined,
        cambios.activo ?? null,
      ],
    );
    const fila = rows[0];
    return fila === undefined ? null : aSillonRegistro(fila);
  };

  return {
    async crear(datos) {
      const { rows } = await consultar(
        ejecutor,
        `INSERT INTO sillon (id, clinica_id, nombre, buffer_minutos)
         VALUES (COALESCE($3::uuid, gen_random_uuid()), ${CLINICA_DEL_CONTEXTO_SQL}, $1, COALESCE($2::integer, 0))
         RETURNING ${COLUMNAS}`,
        [datos.nombre, datos.bufferMinutos ?? null, datos.id ?? null],
      );
      const fila = rows[0];
      if (fila === undefined) throw new Error('La inserción no devolvió la fila creada');
      return aSillonRegistro(fila);
    },
    async obtenerPorId(id) {
      if (!esUuid(id)) return null;
      const { rows } = await consultar(ejecutor, `SELECT ${COLUMNAS} FROM sillon WHERE id = $1`, [
        id,
      ]);
      const fila = rows[0];
      return fila === undefined ? null : aSillonRegistro(fila);
    },
    async listar() {
      const { rows } = await consultar(
        ejecutor,
        `SELECT ${COLUMNAS} FROM sillon ORDER BY nombre, id`,
      );
      return rows.map(aSillonRegistro);
    },
    actualizar,
    desactivar: (id) => actualizar(id, { activo: false }),
  };
}
