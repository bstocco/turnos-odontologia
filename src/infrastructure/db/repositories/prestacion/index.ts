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

/** Fila de prestación. Tipo propio del repositorio: NO es contrato congelado (D9). */
export interface PrestacionRegistro {
  readonly id: string;
  readonly nombre: string;
  readonly duracionMinutos: number;
  readonly activa: boolean;
}

export interface NuevaPrestacion {
  /** Opcional: ids explícitos para datos reproducibles (seed). Por defecto lo genera la base. */
  readonly id?: string;
  readonly nombre: string;
  readonly duracionMinutos: number;
}

/** Lista blanca de campos actualizables. */
export interface CambiosDePrestacion {
  readonly nombre?: string;
  readonly duracionMinutos?: number;
  readonly activa?: boolean;
}

export interface PrestacionRepository {
  crear(datos: NuevaPrestacion): Promise<PrestacionRegistro>;
  obtenerPorId(id: string): Promise<PrestacionRegistro | null>;
  listar(): Promise<readonly PrestacionRegistro[]>;
  actualizar(id: string, cambios: CambiosDePrestacion): Promise<PrestacionRegistro | null>;
  /** Baja lógica: conserva la fila (D6). */
  desactivar(id: string): Promise<PrestacionRegistro | null>;
}

const COLUMNAS = 'id, nombre, duracion_minutos, activa';

function aRegistro(fila: Fila): PrestacionRegistro {
  return {
    id: texto(fila, 'id'),
    nombre: texto(fila, 'nombre'),
    duracionMinutos: entero(fila, 'duracion_minutos'),
    activa: booleano(fila, 'activa'),
  };
}

export function crearPrestacionRepository(ejecutor: EjecutorSql): PrestacionRepository {
  const actualizar = async (
    id: string,
    cambios: CambiosDePrestacion,
  ): Promise<PrestacionRegistro | null> => {
    if (!esUuid(id)) return null;
    const { rows } = await consultar(
      ejecutor,
      `UPDATE prestacion SET
         nombre           = CASE WHEN $2::boolean THEN $3::text ELSE nombre END,
         duracion_minutos = CASE WHEN $4::boolean THEN $5::integer ELSE duracion_minutos END,
         activa           = CASE WHEN $6::boolean THEN $7::boolean ELSE activa END
       WHERE id = $1
       RETURNING ${COLUMNAS}`,
      [
        id,
        cambios.nombre !== undefined,
        cambios.nombre ?? null,
        cambios.duracionMinutos !== undefined,
        cambios.duracionMinutos ?? null,
        cambios.activa !== undefined,
        cambios.activa ?? null,
      ],
    );
    const fila = rows[0];
    return fila === undefined ? null : aRegistro(fila);
  };

  return {
    async crear(datos) {
      const { rows } = await consultar(
        ejecutor,
        `INSERT INTO prestacion (id, clinica_id, nombre, duracion_minutos)
         VALUES (COALESCE($3::uuid, gen_random_uuid()), ${CLINICA_DEL_CONTEXTO_SQL}, $1, $2)
         RETURNING ${COLUMNAS}`,
        [datos.nombre, datos.duracionMinutos, datos.id ?? null],
      );
      const fila = rows[0];
      if (fila === undefined) throw new Error('La inserción no devolvió la fila creada');
      return aRegistro(fila);
    },
    async obtenerPorId(id) {
      if (!esUuid(id)) return null;
      const { rows } = await consultar(
        ejecutor,
        `SELECT ${COLUMNAS} FROM prestacion WHERE id = $1`,
        [id],
      );
      const fila = rows[0];
      return fila === undefined ? null : aRegistro(fila);
    },
    async listar() {
      const { rows } = await consultar(
        ejecutor,
        `SELECT ${COLUMNAS} FROM prestacion ORDER BY nombre, id`,
      );
      return rows.map(aRegistro);
    },
    actualizar,
    desactivar: (id) => actualizar(id, { activa: false }),
  };
}
