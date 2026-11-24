import {
  CLINICA_DEL_CONTEXTO_SQL,
  booleano,
  consultar,
  esUuid,
  texto,
  textoONulo,
  type EjecutorSql,
  type Fila,
} from '../compartido/index.js';

/** Fila de profesional. Tipo propio del repositorio: NO es contrato congelado (D9). */
export interface ProfesionalRegistro {
  readonly id: string;
  readonly nombre: string;
  readonly apellido: string;
  readonly matricula: string | null;
  readonly activo: boolean;
}

export interface NuevoProfesional {
  /** Opcional: ids explícitos para datos reproducibles (seed). Por defecto lo genera la base. */
  readonly id?: string;
  readonly nombre: string;
  readonly apellido: string;
  readonly matricula?: string | null;
}

/** Lista blanca de campos actualizables: cualquier otra propiedad se ignora. */
export interface CambiosDeProfesional {
  readonly nombre?: string;
  readonly apellido?: string;
  readonly matricula?: string | null;
  readonly activo?: boolean;
}

export interface ProfesionalRepository {
  crear(datos: NuevoProfesional): Promise<ProfesionalRegistro>;
  obtenerPorId(id: string): Promise<ProfesionalRegistro | null>;
  listar(): Promise<readonly ProfesionalRegistro[]>;
  actualizar(id: string, cambios: CambiosDeProfesional): Promise<ProfesionalRegistro | null>;
  /** Baja lógica: conserva la fila (D6). */
  desactivar(id: string): Promise<ProfesionalRegistro | null>;
}

const COLUMNAS = 'id, nombre, apellido, matricula, activo';

function aRegistro(fila: Fila): ProfesionalRegistro {
  return {
    id: texto(fila, 'id'),
    nombre: texto(fila, 'nombre'),
    apellido: texto(fila, 'apellido'),
    matricula: textoONulo(fila, 'matricula'),
    activo: booleano(fila, 'activo'),
  };
}

export function crearProfesionalRepository(ejecutor: EjecutorSql): ProfesionalRepository {
  const actualizar = async (
    id: string,
    cambios: CambiosDeProfesional,
  ): Promise<ProfesionalRegistro | null> => {
    if (!esUuid(id)) return null;
    // SQL fijo: cada columna tiene su par (bandera, valor); nunca se arma texto SQL con la entrada.
    const { rows } = await consultar(
      ejecutor,
      `UPDATE profesional SET
         nombre    = CASE WHEN $2::boolean THEN $3::text ELSE nombre END,
         apellido  = CASE WHEN $4::boolean THEN $5::text ELSE apellido END,
         matricula = CASE WHEN $6::boolean THEN $7::text ELSE matricula END,
         activo    = CASE WHEN $8::boolean THEN $9::boolean ELSE activo END
       WHERE id = $1
       RETURNING ${COLUMNAS}`,
      [
        id,
        cambios.nombre !== undefined,
        cambios.nombre ?? null,
        cambios.apellido !== undefined,
        cambios.apellido ?? null,
        cambios.matricula !== undefined,
        cambios.matricula ?? null,
        cambios.activo !== undefined,
        cambios.activo ?? null,
      ],
    );
    const fila = rows[0];
    return fila === undefined ? null : aRegistro(fila);
  };

  return {
    async crear(datos) {
      const { rows } = await consultar(
        ejecutor,
        `INSERT INTO profesional (id, clinica_id, nombre, apellido, matricula)
         VALUES (COALESCE($4::uuid, gen_random_uuid()), ${CLINICA_DEL_CONTEXTO_SQL}, $1, $2, $3)
         RETURNING ${COLUMNAS}`,
        [datos.nombre, datos.apellido, datos.matricula ?? null, datos.id ?? null],
      );
      const fila = rows[0];
      if (fila === undefined) throw new Error('La inserción no devolvió la fila creada');
      return aRegistro(fila);
    },
    async obtenerPorId(id) {
      if (!esUuid(id)) return null;
      const { rows } = await consultar(
        ejecutor,
        `SELECT ${COLUMNAS} FROM profesional WHERE id = $1`,
        [id],
      );
      const fila = rows[0];
      return fila === undefined ? null : aRegistro(fila);
    },
    async listar() {
      const { rows } = await consultar(
        ejecutor,
        `SELECT ${COLUMNAS} FROM profesional ORDER BY apellido, nombre, id`,
      );
      return rows.map(aRegistro);
    },
    actualizar,
    desactivar: (id) => actualizar(id, { activo: false }),
  };
}
