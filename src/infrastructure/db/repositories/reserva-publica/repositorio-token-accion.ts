import type {
  NuevoTokenAccion,
  TokenAccionRegistro,
  TokenAccionRepositorio,
} from '../../../../application/reserva-publica/index.js';
import type { PropositoTokenAccion } from '../../../../domain/comunicacion/index.js';
import type { TurnoId } from '../../../../domain/shared/ids.js';

import {
  CLINICA_DEL_CONTEXTO_SQL,
  consultar,
  instante,
  texto,
  type EjecutorSql,
  type Fila,
} from '../compartido/index.js';

const COLUMNAS_TOKEN =
  'id, clinica_id, turno_id, proposito, hash_token, vence_en, usado_en, creado_en';

function instanteONulo(fila: Fila, columna: string): Date | null {
  const valor = fila[columna];
  return valor === null || valor === undefined ? null : instante(fila, columna);
}

function mapearToken(fila: Fila): TokenAccionRegistro {
  return {
    id: texto(fila, 'id'),
    clinicaId: texto(fila, 'clinica_id'),
    turnoId: texto(fila, 'turno_id') as TurnoId,
    proposito: texto(fila, 'proposito') as PropositoTokenAccion,
    hashToken: texto(fila, 'hash_token'),
    venceEn: instante(fila, 'vence_en'),
    usadoEn: instanteONulo(fila, 'usado_en'),
    creadoEn: instante(fila, 'creado_en'),
  };
}

export function crearRepositorioTokenAccionPg(ejecutor: EjecutorSql): TokenAccionRepositorio {
  return {
    async insertar(entrada: NuevoTokenAccion): Promise<TokenAccionRegistro> {
      const { rows } = await consultar(
        ejecutor,
        `INSERT INTO token_accion (id, clinica_id, turno_id, proposito, hash_token, vence_en)
         VALUES ($1::uuid, ${CLINICA_DEL_CONTEXTO_SQL}, $2::uuid, $3, $4, $5::timestamptz)
         RETURNING ${COLUMNAS_TOKEN}`,
        [entrada.id, entrada.turnoId, entrada.proposito, entrada.hashToken, entrada.venceEn],
      );
      const fila = rows[0];
      if (fila === undefined) {
        throw new Error('La inserción en token_accion no devolvió la fila creada.');
      }
      return mapearToken(fila);
    },

    async obtenerPorHashParaActualizar(hashToken: string): Promise<TokenAccionRegistro | null> {
      const { rows } = await consultar(
        ejecutor,
        `SELECT ${COLUMNAS_TOKEN}
         FROM token_accion
         WHERE hash_token = $1 AND clinica_id = ${CLINICA_DEL_CONTEXTO_SQL}
         FOR UPDATE`,
        [hashToken],
      );
      const fila = rows[0];
      return fila === undefined ? null : mapearToken(fila);
    },

    async marcarUsado(id: string, usadoEn: Date): Promise<void> {
      await consultar(
        ejecutor,
        `UPDATE token_accion
         SET usado_en = $2::timestamptz
         WHERE id = $1::uuid AND clinica_id = ${CLINICA_DEL_CONTEXTO_SQL}`,
        [id, usadoEn],
      );
    },
  };
}
