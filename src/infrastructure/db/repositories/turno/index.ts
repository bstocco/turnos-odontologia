import type {
  PacienteId,
  PrestacionId,
  ProfesionalId,
  SillonId,
  TurnoId,
} from '../../../../domain/shared/index.js';
import {
  crearIntervaloOLanzar,
  parsearHoraLocal,
  type AgendaReader,
  type Bloqueo,
  type FechaLocal,
  type FranjaAtencion,
} from '../../../../domain/agenda/index.js';
import { turnoModificadoConcurrentemente } from '../../../../domain/agenda/errores-agenda.js';
import { error, ok, valorOLanzar, type Resultado } from '../../../../domain/shared/resultado.js';
import { ESTADOS_ACTIVOS_LIST, parsearEstado } from '../../../../domain/turno/estado.js';
import type { Turno, TurnoRepository } from '../../../../domain/turno/index.js';

import {
  CLINICA_DEL_CONTEXTO_SQL,
  consultar,
  datosInvalidos,
  entero,
  esUuid,
  instante,
  texto,
  textoONulo,
  type EjecutorSql,
  type Fila,
} from '../compartido/index.js';

const COLUMNAS_TURNO = `id, clinica_id, paciente_id, profesional_id, sillon_id, prestacion_id,
                         inicio, fin, buffer_minutos, fin_sillon, estado, origen, reprogramado_de,
                         duracion_real_minutos, creado_en, actualizado_en`;

function enteroNulo(fila: Fila, columna: string): Resultado<number | null> {
  const valor = fila[columna];
  if (valor === null || valor === undefined) return ok(null);
  return typeof valor === 'number' && Number.isInteger(valor) ? ok(valor) : error(datosInvalidos());
}

function aTurno(fila: Fila): Turno {
  const reprogramadoDe = textoONulo(fila, 'reprogramado_de');
  return {
    id: texto(fila, 'id') as TurnoId,
    pacienteId: texto(fila, 'paciente_id') as PacienteId,
    profesionalId: texto(fila, 'profesional_id') as ProfesionalId,
    sillonId: texto(fila, 'sillon_id') as SillonId,
    prestacionId: texto(fila, 'prestacion_id') as PrestacionId,
    inicio: instante(fila, 'inicio'),
    fin: instante(fila, 'fin'),
    bufferMinutos: entero(fila, 'buffer_minutos'),
    finSillon: instante(fila, 'fin_sillon'),
    estado: valorOLanzar(parsearEstado(fila['estado'])),
    origen: texto(fila, 'origen') as Turno['origen'],
    reprogramadoDe: reprogramadoDe === null ? null : (reprogramadoDe as TurnoId),
    duracionRealMinutos: valorOLanzar(enteroNulo(fila, 'duracion_real_minutos')),
    creadoEn: instante(fila, 'creado_en'),
    actualizadoEn: instante(fila, 'actualizado_en'),
  };
}

export function crearRepositorioDeTurnos(ejecutor: EjecutorSql): TurnoRepository {
  return {
    async obtenerPorId(id: TurnoId): Promise<Turno | null> {
      if (!esUuid(id)) return null;
      const { rows } = await consultar(
        ejecutor,
        `SELECT ${COLUMNAS_TURNO} FROM turno WHERE id = $1 AND clinica_id = ${CLINICA_DEL_CONTEXTO_SQL}`,
        [id],
      );
      const fila = rows[0];
      return fila === undefined ? null : aTurno(fila);
    },

    async insertar(nuevo) {
      const { rows } = await consultar(
        ejecutor,
        `INSERT INTO turno
           (id, clinica_id, paciente_id, profesional_id, sillon_id, prestacion_id,
            inicio, fin, buffer_minutos, fin_sillon, estado, origen, reprogramado_de)
         VALUES (gen_random_uuid(), ${CLINICA_DEL_CONTEXTO_SQL},
                 $1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7, $8::timestamptz, $9, $10, $11)
         RETURNING ${COLUMNAS_TURNO}`,
        [
          nuevo.pacienteId,
          nuevo.profesionalId,
          nuevo.sillonId,
          nuevo.prestacionId,
          nuevo.inicio,
          nuevo.fin,
          nuevo.bufferMinutos,
          nuevo.finSillon,
          nuevo.estado,
          nuevo.origen,
          nuevo.reprogramadoDe ?? null,
        ],
      );
      const fila = rows[0];
      if (fila === undefined) throw new Error('La inserción de turno no devolvió la fila creada');
      return aTurno(fila);
    },

    async actualizar(turno, estadoEsperado) {
      const { rows, rowCount } = await consultar(
        ejecutor,
        `UPDATE turno SET estado = $1, actualizado_en = now()
         WHERE id = $2 AND estado = $3 AND clinica_id = ${CLINICA_DEL_CONTEXTO_SQL}
         RETURNING ${COLUMNAS_TURNO}`,
        [turno.estado, turno.id, estadoEsperado],
      );
      if ((rowCount ?? 0) === 0 || rows[0] === undefined) throw turnoModificadoConcurrentemente();
      return aTurno(rows[0]);
    },
  };
}

function aBloqueo(fila: Fila): Bloqueo {
  return {
    id: texto(fila, 'id') as string,
    profesionalId: texto(fila, 'profesional_id') as ProfesionalId,
    intervalo: crearIntervaloOLanzar(instante(fila, 'inicio'), instante(fila, 'fin')),
  };
}

export function crearAgendaReader(ejecutor: EjecutorSql): AgendaReader {
  return {
    async franjasDeAtencion(profesionalId: ProfesionalId) {
      const { rows } = await consultar(
        ejecutor,
        `SELECT dia_semana, hora_desde, hora_hasta FROM horario_atencion
         WHERE profesional_id = $1 AND clinica_id = ${CLINICA_DEL_CONTEXTO_SQL}
         ORDER BY dia_semana, hora_desde`,
        [profesionalId],
      );
      return rows.map((fila): FranjaAtencion => ({
        diaSemana: entero(fila, 'dia_semana'),
        desdeMinutos: valorOLanzar(parsearHoraLocal(texto(fila, 'hora_desde'))),
        hastaMinutos: valorOLanzar(parsearHoraLocal(texto(fila, 'hora_hasta'))),
      }));
    },

    async feriados(desde: FechaLocal, hasta: FechaLocal) {
      const { rows } = await consultar(
        ejecutor,
        `SELECT fecha::text AS fecha FROM feriado
         WHERE clinica_id = ${CLINICA_DEL_CONTEXTO_SQL} AND fecha >= $1 AND fecha < $2
         ORDER BY fecha`,
        [desde, hasta],
      );
      return rows.map((fila): FechaLocal => texto(fila, 'fecha') as FechaLocal);
    },

    async bloqueos(profesionalId: ProfesionalId, intervalo) {
      const { rows } = await consultar(
        ejecutor,
        `SELECT id, profesional_id, inicio, fin FROM bloqueo
         WHERE profesional_id = $1 AND clinica_id = ${CLINICA_DEL_CONTEXTO_SQL}
           AND inicio < $3 AND fin > $2
         ORDER BY inicio`,
        [profesionalId, intervalo.inicio, intervalo.fin],
      );
      return rows.map(aBloqueo);
    },

    async turnosActivosDeProfesional(profesionalId: ProfesionalId, intervalo) {
      const { rows } = await consultar(
        ejecutor,
        `SELECT ${COLUMNAS_TURNO} FROM turno
         WHERE profesional_id = $1 AND clinica_id = ${CLINICA_DEL_CONTEXTO_SQL}
           AND estado = ANY($2::text[]) AND rango_profesional && tstzrange($3, $4, '[)')
         ORDER BY inicio`,
        [profesionalId, ESTADOS_ACTIVOS_LIST, intervalo.inicio, intervalo.fin],
      );
      return rows.map(aTurno);
    },

    async turnosActivosDeSillones(sillonIds: readonly SillonId[], intervalo) {
      const { rows } = await consultar(
        ejecutor,
        `SELECT ${COLUMNAS_TURNO} FROM turno
         WHERE sillon_id = ANY($1::uuid[]) AND clinica_id = ${CLINICA_DEL_CONTEXTO_SQL}
           AND estado = ANY($2::text[]) AND rango_sillon && tstzrange($3, $4, '[)')
         ORDER BY inicio`,
        [sillonIds, ESTADOS_ACTIVOS_LIST, intervalo.inicio, intervalo.fin],
      );
      return rows.map(aTurno);
    },
  };
}
