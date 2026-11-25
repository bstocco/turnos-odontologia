import { ESTADOS_ACTIVOS_LIST } from '../../../../domain/turno/estado.js';
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
import type { PacienteRegistro } from '../paciente/index.js';

/*
 * Lector de solo lectura del alcance del odontólogo (C-10, design D4/D5): un paciente es "de un
 * profesional" si tiene al menos un turno en estado activo con él. Archivo propio (no edita los
 * repositorios de C-05 ni de C-09). Dato de salud (Ley 25.326): este módulo no registra logs ni
 * arma mensajes con datos personales; los errores salen de `consultar`.
 */

export interface AccesoPacientesReader {
  /** `false` para id no UUID, inexistente, de otra clínica o sin turno activo con el profesional. */
  esPacienteDeProfesional(pacienteId: string, profesionalId: string): Promise<boolean>;
  /** DNI exacto, solo si el paciente tiene turno activo con el profesional. */
  buscarPorDniDeProfesional(dni: string, profesionalId: string): Promise<PacienteRegistro | null>;
  /** Mismo prefijo, orden y escape que `buscarPorApellido` de C-05, filtrado en SQL. */
  buscarPorApellidoDeProfesional(
    prefijo: string,
    profesionalId: string,
    limite: number,
  ): Promise<readonly PacienteRegistro[]>;
}

const COLUMNAS =
  'p.id, p.clinica_id, p.nombre, p.apellido, p.dni, p.telefono, p.email, p.obra_social, p.creado_en';
const LIMITE_MAXIMO = 200;

// Copiados de `paciente/index.ts` (C-05, no los exporta): una prueba de integración verifica
// que ambos repositorios devuelven lo mismo para el mismo prefijo.
const APELLIDO_NORMALIZADO = "translate(lower(p.apellido), 'áéíóúü', 'aeiouu')";

function escaparLike(prefijo: string): string {
  return prefijo.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

/** Turno activo del profesional (`$2` = profesional, `$3` = estados activos) para el paciente `p`. */
const EXISTE_TURNO_ACTIVO = `EXISTS (
  SELECT 1 FROM turno t
   WHERE t.clinica_id = p.clinica_id AND t.paciente_id = p.id
     AND t.profesional_id = $2 AND t.estado = ANY($3::text[]))`;

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

export function crearAccesoPacientesReader(ejecutor: EjecutorSql): AccesoPacientesReader {
  const estados = [...ESTADOS_ACTIVOS_LIST];
  return {
    async esPacienteDeProfesional(pacienteId, profesionalId) {
      if (!esUuid(pacienteId) || !esUuid(profesionalId)) return false;
      const { rows } = await consultar(
        ejecutor,
        `SELECT EXISTS (
           SELECT 1 FROM turno t
            WHERE t.clinica_id = ${CLINICA_DEL_CONTEXTO_SQL} AND t.paciente_id = $1
              AND t.profesional_id = $2 AND t.estado = ANY($3::text[])
         ) AS vinculado`,
        [pacienteId, profesionalId, estados],
      );
      return rows[0]?.vinculado === true;
    },

    async buscarPorDniDeProfesional(dni, profesionalId) {
      if (!esUuid(profesionalId)) return null;
      const { rows } = await consultar(
        ejecutor,
        `SELECT ${COLUMNAS} FROM paciente p
          WHERE p.dni = $1 AND ${EXISTE_TURNO_ACTIVO}`,
        [dni, profesionalId, estados],
      );
      const fila = rows[0];
      return fila === undefined ? null : aRegistro(fila);
    },

    async buscarPorApellidoDeProfesional(prefijo, profesionalId, limite) {
      if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_MAXIMO) throw datosInvalidos();
      if (!esUuid(profesionalId)) return [];
      const patron = `${escaparLike(prefijo)}%`;
      const { rows } = await consultar(
        ejecutor,
        `SELECT ${COLUMNAS} FROM paciente p
          WHERE ${APELLIDO_NORMALIZADO} LIKE translate(lower($1::text), 'áéíóúü', 'aeiouu')
            AND ${EXISTE_TURNO_ACTIVO}
          ORDER BY p.apellido, p.nombre, p.id
          LIMIT $4`,
        [patron, profesionalId, estados, limite],
      );
      return rows.map(aRegistro);
    },
  };
}
