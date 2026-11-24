import {
  CLINICA_DEL_CONTEXTO_SQL,
  consultar,
  datosInvalidos,
  esUuid,
  instante,
  texto,
  textoONulo,
  type EjecutorSql,
  type Fila,
} from '../compartido/index.js';

/*
 * Repositorio de pacientes. Dato de salud (Ley 25.326, regla dura 1): este módulo NO registra
 * logs ni arma mensajes con nombre, apellido, DNI, teléfono, email u obra social. Los errores
 * salen de `consultar` (traducción por SQLSTATE/constraint, sin el `detail` del motor).
 */

/** Ficha básica. Tipo propio del repositorio: NO es contrato congelado (D9). */
export interface PacienteRegistro {
  readonly id: string;
  readonly clinicaId: string;
  readonly nombre: string;
  readonly apellido: string;
  readonly dni: string;
  /** Formato internacional (RN-PA-03), ya normalizado por la capa de aplicación. */
  readonly telefono: string;
  readonly email: string | null;
  readonly obraSocial: string | null;
  /** Fecha de alta, instante UTC. */
  readonly creadoEn: Date;
}

export interface NuevoPaciente {
  /** Opcional: ids explícitos para datos reproducibles (seed). Por defecto lo genera la base. */
  readonly id?: string;
  readonly nombre: string;
  readonly apellido: string;
  readonly dni: string;
  readonly telefono: string;
  readonly email?: string | null | undefined;
  readonly obraSocial?: string | null | undefined;
}

/** Lista blanca de campos actualizables: cualquier otra propiedad se ignora. */
export interface CambiosDePaciente {
  readonly nombre?: string;
  readonly apellido?: string;
  readonly dni?: string;
  readonly telefono?: string;
  readonly email?: string | null;
  readonly obraSocial?: string | null;
}

export interface PacienteRepository {
  crear(datos: NuevoPaciente): Promise<PacienteRegistro>;
  obtenerPorId(id: string): Promise<PacienteRegistro | null>;
  /** DNI exacto en la clínica del contexto (reutilización del registro, RN-RE-04). */
  buscarPorDni(dni: string): Promise<PacienteRegistro | null>;
  /** Prefijo de apellido sin distinguir mayúsculas ni tildes, ordenado por apellido y nombre. */
  buscarPorApellido(prefijo: string, limite: number): Promise<readonly PacienteRegistro[]>;
  actualizar(id: string, cambios: CambiosDePaciente): Promise<PacienteRegistro | null>;
}

const COLUMNAS = 'id, clinica_id, nombre, apellido, dni, telefono, email, obra_social, creado_en';
const LIMITE_MAXIMO = 200;

/** Misma expresión que el índice `paciente_apellido_idx` (C05_001). */
const APELLIDO_NORMALIZADO = "translate(lower(apellido), 'áéíóúü', 'aeiouu')";

function aRegistro(fila: Fila): PacienteRegistro {
  return {
    id: texto(fila, 'id'),
    clinicaId: texto(fila, 'clinica_id'),
    nombre: texto(fila, 'nombre'),
    apellido: texto(fila, 'apellido'),
    dni: texto(fila, 'dni'),
    telefono: texto(fila, 'telefono'),
    email: textoONulo(fila, 'email'),
    obraSocial: textoONulo(fila, 'obra_social'),
    creadoEn: instante(fila, 'creado_en'),
  };
}

/** Escapa `\`, `%` y `_` para que el prefijo se compare como texto literal en `LIKE`. */
function escaparLike(prefijo: string): string {
  return prefijo.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

export function crearPacienteRepository(ejecutor: EjecutorSql): PacienteRepository {
  return {
    async crear(datos) {
      const { rows } = await consultar(
        ejecutor,
        `INSERT INTO paciente (id, clinica_id, nombre, apellido, dni, telefono, email, obra_social)
         VALUES (COALESCE($7::uuid, gen_random_uuid()), ${CLINICA_DEL_CONTEXTO_SQL}, $1, $2, $3, $4, $5, $6)
         RETURNING ${COLUMNAS}`,
        [
          datos.nombre,
          datos.apellido,
          datos.dni,
          datos.telefono,
          datos.email ?? null,
          datos.obraSocial ?? null,
          datos.id ?? null,
        ],
      );
      const fila = rows[0];
      if (fila === undefined) throw new Error('La inserción no devolvió la fila creada');
      return aRegistro(fila);
    },

    async obtenerPorId(id) {
      if (!esUuid(id)) return null;
      const { rows } = await consultar(ejecutor, `SELECT ${COLUMNAS} FROM paciente WHERE id = $1`, [
        id,
      ]);
      const fila = rows[0];
      return fila === undefined ? null : aRegistro(fila);
    },

    async buscarPorDni(dni) {
      const { rows } = await consultar(
        ejecutor,
        `SELECT ${COLUMNAS} FROM paciente WHERE dni = $1`,
        [dni],
      );
      const fila = rows[0];
      return fila === undefined ? null : aRegistro(fila);
    },

    async buscarPorApellido(prefijo, limite) {
      if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_MAXIMO) throw datosInvalidos();
      const patron = `${escaparLike(prefijo)}%`;
      const { rows } = await consultar(
        ejecutor,
        `SELECT ${COLUMNAS} FROM paciente
          WHERE ${APELLIDO_NORMALIZADO} LIKE translate(lower($1::text), 'áéíóúü', 'aeiouu')
          ORDER BY apellido, nombre, id
          LIMIT $2`,
        [patron, limite],
      );
      return rows.map(aRegistro);
    },

    async actualizar(id, cambios) {
      if (!esUuid(id)) return null;
      // SQL fijo: cada columna tiene su par (bandera, valor); nunca se arma texto SQL con la entrada.
      const { rows } = await consultar(
        ejecutor,
        `UPDATE paciente SET
           nombre      = CASE WHEN $2::boolean  THEN $3::text  ELSE nombre END,
           apellido    = CASE WHEN $4::boolean  THEN $5::text  ELSE apellido END,
           dni         = CASE WHEN $6::boolean  THEN $7::text  ELSE dni END,
           telefono    = CASE WHEN $8::boolean  THEN $9::text  ELSE telefono END,
           email       = CASE WHEN $10::boolean THEN $11::text ELSE email END,
           obra_social = CASE WHEN $12::boolean THEN $13::text ELSE obra_social END
         WHERE id = $1
         RETURNING ${COLUMNAS}`,
        [
          id,
          cambios.nombre !== undefined,
          cambios.nombre ?? null,
          cambios.apellido !== undefined,
          cambios.apellido ?? null,
          cambios.dni !== undefined,
          cambios.dni ?? null,
          cambios.telefono !== undefined,
          cambios.telefono ?? null,
          cambios.email !== undefined,
          cambios.email ?? null,
          cambios.obraSocial !== undefined,
          cambios.obraSocial ?? null,
        ],
      );
      const fila = rows[0];
      return fila === undefined ? null : aRegistro(fila);
    },
  };
}
