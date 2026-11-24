import type { AgendaReader, Bloqueo } from '../../../../domain/agenda/index.js';
import { consultar, esUuid, type EjecutorSql } from '../compartido/index.js';
import { aBloqueoRegistro, COLUMNAS_BLOQUEO } from '../bloqueo/index.js';
import { aFechaLocal } from '../feriado/index.js';
import { aFranja } from '../horario/index.js';

/** Parte de `AgendaReader` que implementa C-05; los turnos los aporta C-09 (D8). */
export type CalendarioReader = Pick<AgendaReader, 'franjasDeAtencion' | 'feriados' | 'bloqueos'>;

export function crearCalendarioReader(ejecutor: EjecutorSql): CalendarioReader {
  return {
    async franjasDeAtencion(profesionalId) {
      if (!esUuid(profesionalId)) return [];
      const { rows } = await consultar(
        ejecutor,
        `SELECT dia_semana, hora_desde::text AS hora_desde, hora_hasta::text AS hora_hasta
           FROM horario_atencion
          WHERE profesional_id = $1
          ORDER BY dia_semana, hora_desde`,
        [profesionalId],
      );
      return rows.map(aFranja);
    },
    async feriados(desde, hasta) {
      const { rows } = await consultar(
        ejecutor,
        `SELECT fecha::text AS fecha FROM feriado
          WHERE fecha >= $1::date AND fecha < $2::date
          ORDER BY fecha`,
        [desde, hasta],
      );
      return rows.map((fila) => aFechaLocal(fila));
    },
    async bloqueos(profesionalId, intervalo) {
      if (!esUuid(profesionalId)) return [];
      const { rows } = await consultar(
        ejecutor,
        `SELECT ${COLUMNAS_BLOQUEO} FROM bloqueo
          WHERE profesional_id = $1
            AND tstzrange(inicio, fin, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
          ORDER BY inicio`,
        [profesionalId, intervalo.inicio, intervalo.fin],
      );
      return rows.map((fila): Bloqueo => {
        const { id, profesionalId: prof, intervalo: rango } = aBloqueoRegistro(fila);
        return { id, profesionalId: prof, intervalo: rango };
      });
    },
  };
}
