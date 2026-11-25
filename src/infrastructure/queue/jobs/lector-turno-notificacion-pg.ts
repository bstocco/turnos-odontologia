import {
  type DatosNotificacionTurno,
  type LectorDatosNotificacionTurno,
} from '../../../application/notificaciones/index.js';
import { parsearEstado } from '../../../domain/turno/estado.js';
import { valorOLanzar } from '../../../domain/shared/resultado.js';
import {
  CLINICA_DEL_CONTEXTO_SQL,
  consultar,
  esUuid,
  instante,
  texto,
  textoONulo,
  type Fila,
} from '../../db/repositories/compartido/index.js';
import { withTenant } from '../../db/tenant/with-tenant.js';

const SQL_LECTURA_TURNO_NOTIFICACION = `
  SELECT
    t.id               AS turno_id,
    t.clinica_id       AS clinica_id,
    c.nombre           AS clinica_nombre,
    c.zona_horaria     AS clinica_zona_horaria,
    t.estado           AS estado_turno,
    t.inicio           AS inicio,
    t_ant.inicio       AS inicio_anterior,
    pac.nombre         AS paciente_nombre,
    pac.apellido       AS paciente_apellido,
    pac.email          AS paciente_email,
    prof.nombre        AS profesional_nombre,
    prof.apellido      AS profesional_apellido,
    pres.nombre        AS prestacion_nombre
  FROM turno t
  JOIN clinica c
    ON c.id = t.clinica_id
  JOIN paciente pac
    ON pac.clinica_id = t.clinica_id AND pac.id = t.paciente_id
  JOIN profesional prof
    ON prof.clinica_id = t.clinica_id AND prof.id = t.profesional_id
  JOIN prestacion pres
    ON pres.clinica_id = t.clinica_id AND pres.id = t.prestacion_id
  LEFT JOIN turno t_ant
    ON t_ant.clinica_id = t.clinica_id AND t_ant.id = t.reprogramado_de
  WHERE t.id = $1::uuid
    AND t.clinica_id = ${CLINICA_DEL_CONTEXTO_SQL}
`;

function instanteONulo(fila: Fila, columna: string): Date | null {
  const valor = fila[columna];
  if (valor === null || valor === undefined) return null;
  return instante(fila, columna);
}

function mapearDatosTurno(fila: Fila): DatosNotificacionTurno {
  return {
    turnoId: texto(fila, 'turno_id'),
    clinicaId: texto(fila, 'clinica_id'),
    clinicaNombre: texto(fila, 'clinica_nombre'),
    clinicaZonaHoraria: texto(fila, 'clinica_zona_horaria'),
    estadoTurno: valorOLanzar(parsearEstado(fila['estado_turno'])),
    inicio: instante(fila, 'inicio'),
    inicioAnterior: instanteONulo(fila, 'inicio_anterior'),
    pacienteNombre: texto(fila, 'paciente_nombre'),
    pacienteApellido: texto(fila, 'paciente_apellido'),
    pacienteEmail: textoONulo(fila, 'paciente_email'),
    profesionalNombre: texto(fila, 'profesional_nombre'),
    profesionalApellido: texto(fila, 'profesional_apellido'),
    prestacionNombre: texto(fila, 'prestacion_nombre'),
  };
}

/**
 * Lector PostgreSQL de datos de turno para el resolvedor diferido de emails.
 * Ejecuta todas las lecturas dentro de `withTenant(clinicaId)` garantizando aislamiento RLS.
 */
export function crearLectorDatosTurnoPg(): LectorDatosNotificacionTurno {
  return {
    async obtenerPorTurnoId(
      clinicaId: string,
      turnoId: string,
    ): Promise<DatosNotificacionTurno | null> {
      if (!esUuid(clinicaId) || !esUuid(turnoId)) return null;
      return withTenant(clinicaId, async (cliente) => {
        const { rows } = await consultar(cliente, SQL_LECTURA_TURNO_NOTIFICACION, [turnoId]);
        const fila = rows[0];
        return fila === undefined ? null : mapearDatosTurno(fila);
      });
    },
  };
}
