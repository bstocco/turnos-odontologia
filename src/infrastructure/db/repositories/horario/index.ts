import type { FranjaAtencion } from '../../../../domain/agenda/index.js';
import {
  CLINICA_DEL_CONTEXTO_SQL,
  consultar,
  entero,
  esUuid,
  horaAMinutos,
  minutosAHora,
  recursoNoEncontrado,
  texto,
  type EjecutorSql,
  type Fila,
} from '../compartido/index.js';

/** Escritura de las franjas de atención semanales (D9: interfaz propia, no congelada). */
export interface HorarioRepository {
  /**
   * Reemplaza TODAS las franjas del profesional (DELETE + INSERT) con un savepoint: si alguna
   * falla (p. ej. solape), las anteriores quedan intactas y la transacción sigue usable.
   */
  reemplazarFranjas(profesionalId: string, franjas: readonly FranjaAtencion[]): Promise<void>;
}

/** `hora_desde`/`hora_hasta` (time de pg: `HH:MM:SS`) -> minutos locales (0-1440). */
export function aFranja(fila: Fila): FranjaAtencion {
  return {
    diaSemana: entero(fila, 'dia_semana'),
    desdeMinutos: horaAMinutos(texto(fila, 'hora_desde')),
    hastaMinutos: horaAMinutos(texto(fila, 'hora_hasta')),
  };
}

export function crearHorarioRepository(ejecutor: EjecutorSql): HorarioRepository {
  return {
    async reemplazarFranjas(profesionalId, franjas) {
      if (!esUuid(profesionalId)) throw recursoNoEncontrado();
      // Se convierten antes de tocar la base: una hora fuera de rango no deja nada a medias.
      const filas = franjas.map((f) => ({
        dia: f.diaSemana,
        desde: minutosAHora(f.desdeMinutos),
        hasta: minutosAHora(f.hastaMinutos),
      }));
      await consultar(ejecutor, 'SAVEPOINT reemplazo_franjas');
      try {
        await consultar(ejecutor, 'DELETE FROM horario_atencion WHERE profesional_id = $1', [
          profesionalId,
        ]);
        for (const fila of filas) {
          await consultar(
            ejecutor,
            `INSERT INTO horario_atencion (clinica_id, profesional_id, dia_semana, hora_desde, hora_hasta)
             VALUES (${CLINICA_DEL_CONTEXTO_SQL}, $1, $2::smallint, $3::time, $4::time)`,
            [profesionalId, fila.dia, fila.desde, fila.hasta],
          );
        }
        await consultar(ejecutor, 'RELEASE SAVEPOINT reemplazo_franjas');
      } catch (error) {
        await ejecutor.query('ROLLBACK TO SAVEPOINT reemplazo_franjas').catch(() => undefined);
        throw error;
      }
    },
  };
}
