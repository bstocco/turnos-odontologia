import type {
  CodigoVerificacionRegistro,
  CodigoVerificacionRepositorio,
  NuevoCodigoVerificacion,
} from '../../../../application/reserva-publica/index.js';

import {
  CLINICA_DEL_CONTEXTO_SQL,
  consultar,
  entero,
  esUuid,
  instante,
  texto,
  type EjecutorSql,
  type Fila,
} from '../compartido/index.js';

const COLUMNAS_OTP =
  'id, clinica_id, email, hash_codigo, vence_en, intentos, consumido_en, creado_en';

function instanteONulo(fila: Fila, columna: string): Date | null {
  const valor = fila[columna];
  return valor === null || valor === undefined ? null : instante(fila, columna);
}

function mapearCodigo(fila: Fila): CodigoVerificacionRegistro {
  return {
    id: texto(fila, 'id'),
    clinicaId: texto(fila, 'clinica_id'),
    email: texto(fila, 'email'),
    hashCodigo: texto(fila, 'hash_codigo'),
    venceEn: instante(fila, 'vence_en'),
    intentos: entero(fila, 'intentos'),
    consumidoEn: instanteONulo(fila, 'consumido_en'),
    creadoEn: instante(fila, 'creado_en'),
  };
}

export function crearRepositorioCodigoVerificacionPg(
  ejecutor: EjecutorSql,
): CodigoVerificacionRepositorio {
  return {
    async invalidarPendientesPorEmail(email: string, ahora: Date): Promise<void> {
      await consultar(
        ejecutor,
        `UPDATE codigo_verificacion
         SET consumido_en = $2::timestamptz
         WHERE clinica_id = ${CLINICA_DEL_CONTEXTO_SQL}
           AND email = $1
           AND consumido_en IS NULL`,
        [email, ahora],
      );
    },

    async insertar(entrada: NuevoCodigoVerificacion): Promise<CodigoVerificacionRegistro> {
      const { rows } = await consultar(
        ejecutor,
        `INSERT INTO codigo_verificacion (id, clinica_id, email, hash_codigo, vence_en)
         VALUES ($1::uuid, ${CLINICA_DEL_CONTEXTO_SQL}, $2, $3, $4::timestamptz)
         RETURNING ${COLUMNAS_OTP}`,
        [entrada.id, entrada.email, entrada.hashCodigo, entrada.venceEn],
      );
      const fila = rows[0];
      if (fila === undefined) {
        throw new Error('La inserción en codigo_verificacion no devolvió la fila creada.');
      }
      return mapearCodigo(fila);
    },

    async obtenerUltimoParaActualizar(email: string): Promise<CodigoVerificacionRegistro | null> {
      const { rows } = await consultar(
        ejecutor,
        `SELECT ${COLUMNAS_OTP}
         FROM codigo_verificacion
         WHERE clinica_id = ${CLINICA_DEL_CONTEXTO_SQL} AND email = $1
         ORDER BY creado_en DESC, id DESC
         LIMIT 1
         FOR UPDATE`,
        [email],
      );
      const fila = rows[0];
      return fila === undefined ? null : mapearCodigo(fila);
    },

    async obtenerPorIdParaActualizar(id: string): Promise<CodigoVerificacionRegistro | null> {
      if (!esUuid(id)) return null;
      const { rows } = await consultar(
        ejecutor,
        `SELECT ${COLUMNAS_OTP}
         FROM codigo_verificacion
         WHERE id = $1::uuid AND clinica_id = ${CLINICA_DEL_CONTEXTO_SQL}
         FOR UPDATE`,
        [id],
      );
      const fila = rows[0];
      return fila === undefined ? null : mapearCodigo(fila);
    },

    async actualizarIntentos(id: string, intentos: number): Promise<void> {
      await consultar(
        ejecutor,
        `UPDATE codigo_verificacion
         SET intentos = $2
         WHERE id = $1::uuid AND clinica_id = ${CLINICA_DEL_CONTEXTO_SQL}`,
        [id, intentos],
      );
    },

    async marcarConsumido(id: string, consumidoEn: Date): Promise<void> {
      await consultar(
        ejecutor,
        `UPDATE codigo_verificacion
         SET consumido_en = $2::timestamptz
         WHERE id = $1::uuid AND clinica_id = ${CLINICA_DEL_CONTEXTO_SQL}`,
        [id, consumidoEn],
      );
    },
  };
}
