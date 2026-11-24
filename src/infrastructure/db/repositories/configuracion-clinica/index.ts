import {
  CLINICA_DEL_CONTEXTO_SQL,
  ErrorDePersistencia,
  booleano,
  consultar,
  entero,
  texto,
  type EjecutorSql,
  type Fila,
} from '../compartido/index.js';

/** Clínica y su configuración operativa. Tipo propio del repositorio: NO es contrato congelado. */
export interface ConfiguracionClinicaRegistro {
  readonly id: string;
  readonly nombre: string;
  readonly slug: string;
  readonly zonaHoraria: string;
  readonly reservaRequiereConfirmacion: boolean;
  readonly cancelacionAnticipacionHoras: number;
  readonly granularidadMinutos: number;
}

/** Lista blanca de campos modificables de `clinica_config`. */
export interface CambiosDeConfiguracionRegistro {
  readonly reservaRequiereConfirmacion?: boolean;
  readonly cancelacionAnticipacionHoras?: number;
  readonly granularidadMinutos?: number;
}

export interface ConfiguracionClinicaRepository {
  /** `bloquear`: `FOR UPDATE` sobre `clinica_config` para leer un valor que se va a modificar. */
  obtener(opciones?: { readonly bloquear?: boolean }): Promise<ConfiguracionClinicaRegistro>;
  actualizar(cambios: CambiosDeConfiguracionRegistro): Promise<ConfiguracionClinicaRegistro>;
}

// `clinica` no tiene RLS: el filtro por la clínica del contexto es obligatorio en toda lectura.
const SELECCION = `SELECT c.id, c.nombre, c.slug, c.zona_horaria,
       cc.reserva_requiere_confirmacion, cc.cancelacion_anticipacion_horas, cc.granularidad_minutos
  FROM clinica c
  JOIN clinica_config cc ON cc.clinica_id = c.id
 WHERE c.id = ${CLINICA_DEL_CONTEXTO_SQL}`;

function aRegistro(fila: Fila): ConfiguracionClinicaRegistro {
  return {
    id: texto(fila, 'id'),
    nombre: texto(fila, 'nombre'),
    slug: texto(fila, 'slug'),
    zonaHoraria: texto(fila, 'zona_horaria'),
    reservaRequiereConfirmacion: booleano(fila, 'reserva_requiere_confirmacion'),
    cancelacionAnticipacionHoras: entero(fila, 'cancelacion_anticipacion_horas'),
    granularidadMinutos: entero(fila, 'granularidad_minutos'),
  };
}

/** Toda clínica tiene `clinica_config` desde C-17: la ausencia es un error de persistencia. */
function filaOError(filas: readonly Fila[]): Fila {
  const fila = filas[0];
  if (fila === undefined) {
    throw new ErrorDePersistencia(
      undefined,
      undefined,
      'No hay configuración para la clínica del contexto.',
    );
  }
  return fila;
}

export function crearConfiguracionClinicaRepository(
  ejecutor: EjecutorSql,
): ConfiguracionClinicaRepository {
  const obtener = async (
    opciones: { readonly bloquear?: boolean } = {},
  ): Promise<ConfiguracionClinicaRegistro> => {
    const sql = opciones.bloquear === true ? `${SELECCION} FOR UPDATE OF cc` : SELECCION;
    const { rows } = await consultar(ejecutor, sql);
    return aRegistro(filaOError(rows));
  };

  return {
    obtener,
    async actualizar(cambios) {
      // SQL fijo: cada columna tiene su par (bandera, valor); nunca se arma SQL con la entrada.
      const { rowCount } = await consultar(
        ejecutor,
        `UPDATE clinica_config SET
           reserva_requiere_confirmacion  = CASE WHEN $1::boolean THEN $2::boolean ELSE reserva_requiere_confirmacion END,
           cancelacion_anticipacion_horas = CASE WHEN $3::boolean THEN $4::integer ELSE cancelacion_anticipacion_horas END,
           granularidad_minutos           = CASE WHEN $5::boolean THEN $6::integer ELSE granularidad_minutos END
         WHERE clinica_id = ${CLINICA_DEL_CONTEXTO_SQL}`,
        [
          cambios.reservaRequiereConfirmacion !== undefined,
          cambios.reservaRequiereConfirmacion ?? null,
          cambios.cancelacionAnticipacionHoras !== undefined,
          cambios.cancelacionAnticipacionHoras ?? null,
          cambios.granularidadMinutos !== undefined,
          cambios.granularidadMinutos ?? null,
        ],
      );
      if ((rowCount ?? 0) === 0) filaOError([]);
      return obtener();
    },
  };
}
