import {
  type CanalNotificacion,
  type EjecutorTenant,
  type EntradaCrearNotificacion,
  type EstadoNotificacion,
  type NotificacionRegistrada,
  type NotificacionRepositorio,
  type ResultadoCrearNotificacion,
  type TipoNotificacion,
} from '../../application/notificaciones/index.js';
import { ErrorDeDominio } from '../../domain/shared/errores.js';
import {
  ErrorDePersistencia,
  entero,
  esUuid,
  instante,
  texto,
  textoONulo,
  type EjecutorSql,
  type Fila,
} from '../db/repositories/compartido/index.js';
import { withTenant } from '../db/tenant/with-tenant.js';

const COLUMNAS_NOTIFICACION = `
  id,
  clinica_id,
  turno_id,
  canal,
  tipo,
  estado,
  clave_idempotencia,
  intentos,
  programada_para,
  enviada_en,
  error,
  creada_en,
  actualizada_en
`;

const SQL_INSERTAR_IDEMPOTENTE = `
  INSERT INTO notificacion (
    id,
    clinica_id,
    turno_id,
    canal,
    tipo,
    estado,
    clave_idempotencia,
    intentos,
    programada_para
  )
  VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'pendiente', $6, 0, $7::timestamptz)
  ON CONFLICT (clinica_id, clave_idempotencia) DO NOTHING
  RETURNING ${COLUMNAS_NOTIFICACION}
`;

const SQL_BUSCAR_POR_CLAVE = `
  SELECT ${COLUMNAS_NOTIFICACION}
  FROM notificacion
  WHERE clinica_id = $1::uuid AND clave_idempotencia = $2
`;

const SQL_BUSCAR_POR_ID = `
  SELECT ${COLUMNAS_NOTIFICACION}
  FROM notificacion
  WHERE id = $1::uuid
`;

const SQL_MARCAR_ENVIADA = `
  UPDATE notificacion
  SET estado = 'enviada',
      intentos = intentos + 1,
      enviada_en = $2::timestamptz,
      error = NULL,
      actualizada_en = now()
  WHERE id = $1::uuid AND estado <> 'enviada'
  RETURNING ${COLUMNAS_NOTIFICACION}
`;

const SQL_REGISTRAR_FALLO = `
  UPDATE notificacion
  SET estado = CASE WHEN $2::boolean THEN 'fallida' ELSE 'pendiente' END,
      intentos = intentos + 1,
      error = $3,
      actualizada_en = now()
  WHERE id = $1::uuid AND estado <> 'enviada'
  RETURNING ${COLUMNAS_NOTIFICACION}
`;

function instanteONulo(fila: Fila, columna: string): Date | null {
  const valor = fila[columna];
  if (valor === null) return null;
  return instante(fila, columna);
}

function mapearFila(fila: Fila): NotificacionRegistrada {
  return {
    id: texto(fila, 'id'),
    clinicaId: texto(fila, 'clinica_id'),
    turnoId: textoONulo(fila, 'turno_id'),
    canal: texto(fila, 'canal') as CanalNotificacion,
    tipo: texto(fila, 'tipo') as TipoNotificacion,
    estado: texto(fila, 'estado') as EstadoNotificacion,
    claveIdempotencia: texto(fila, 'clave_idempotencia'),
    intentos: entero(fila, 'intentos'),
    programadaPara: instante(fila, 'programada_para'),
    enviadaEn: instanteONulo(fila, 'enviada_en'),
    error: textoONulo(fila, 'error'),
    creadaEn: instante(fila, 'creada_en'),
    actualizadaEn: instante(fila, 'actualizada_en'),
  };
}

const SQLSTATE = /^[0-9A-Z]{5}$/;
const CODIGOS_DATOS_INVALIDOS = new Set(['23514', '22P02', '22007', '22008']);

function textoDe(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor.length > 0 ? valor : undefined;
}

function traducirErrorNotificacionPg(error: unknown): Error {
  if (error instanceof ErrorDeDominio || error instanceof ErrorDePersistencia) {
    return error;
  }

  let sqlstate: string | undefined;
  let constraint: string | undefined;
  if (typeof error === 'object' && error !== null) {
    const code = textoDe(Reflect.get(error, 'code'));
    sqlstate = code !== undefined && SQLSTATE.test(code) ? code : undefined;
    constraint = textoDe(Reflect.get(error, 'constraint'));
  }

  if (sqlstate === '42501') {
    return new ErrorDeDominio(
      'NOTIFICACION_CONTEXTO_INVALIDO',
      'prohibido',
      'El contexto de clínica no autoriza la operación sobre notificaciones.',
    );
  }
  if (sqlstate === '23503') {
    return new ErrorDeDominio(
      'RECURSO_NO_ENCONTRADO',
      'no_encontrado',
      'La clínica asociada a la notificación no existe.',
    );
  }
  if (sqlstate !== undefined && CODIGOS_DATOS_INVALIDOS.has(sqlstate)) {
    return new ErrorDeDominio(
      'DATOS_INVALIDOS',
      'solicitud_invalida',
      'Los datos de la notificación no son válidos.',
    );
  }

  return new ErrorDePersistencia(sqlstate, constraint, 'Error de persistencia en notificaciones.');
}

/**
 * Repositorio PostgreSQL de notificaciones sobre el `EjecutorSql` transaccional de `withTenant`.
 * Pasa `clinicaId` explícitamente en la inserción para que RLS rechace cualquier desalineación.
 */
export function crearRepositorioNotificacionesPg(ejecutor: EjecutorSql): NotificacionRepositorio {
  return {
    async crearOEncontrarIdempotente(
      entrada: EntradaCrearNotificacion,
    ): Promise<ResultadoCrearNotificacion> {
      try {
        const insertada = await ejecutor.query(SQL_INSERTAR_IDEMPOTENTE, [
          entrada.id,
          entrada.clinicaId,
          entrada.turnoId,
          entrada.canal,
          entrada.tipo,
          entrada.claveIdempotencia,
          entrada.programadaPara,
        ]);
        const filaInsertada = insertada.rows[0];
        if (filaInsertada !== undefined) {
          return { creada: true, notificacion: mapearFila(filaInsertada) };
        }

        const existente = await ejecutor.query(SQL_BUSCAR_POR_CLAVE, [
          entrada.clinicaId,
          entrada.claveIdempotencia,
        ]);
        const filaExistente = existente.rows[0];
        if (filaExistente === undefined) {
          throw new ErrorDePersistencia(
            undefined,
            undefined,
            'No se pudo recuperar la notificación existente.',
          );
        }
        return { creada: false, notificacion: mapearFila(filaExistente) };
      } catch (error) {
        throw traducirErrorNotificacionPg(error);
      }
    },

    async buscarPorId(notificacionId: string): Promise<NotificacionRegistrada | null> {
      if (!esUuid(notificacionId)) return null;
      try {
        const res = await ejecutor.query(SQL_BUSCAR_POR_ID, [notificacionId]);
        const fila = res.rows[0];
        return fila === undefined ? null : mapearFila(fila);
      } catch (error) {
        throw traducirErrorNotificacionPg(error);
      }
    },

    async marcarEnviada(notificacionId: string, enviadaEn: Date): Promise<NotificacionRegistrada> {
      try {
        const res = await ejecutor.query(SQL_MARCAR_ENVIADA, [notificacionId, enviadaEn]);
        const fila = res.rows[0];
        if (fila === undefined) {
          const actual = await this.buscarPorId(notificacionId);
          if (actual !== null) return actual;
          throw new ErrorDeDominio(
            'NOTIFICACION_NO_ENCONTRADA',
            'no_encontrado',
            'No se encontró la notificación para actualizar.',
          );
        }
        return mapearFila(fila);
      } catch (error) {
        throw traducirErrorNotificacionPg(error);
      }
    },

    async registrarFalloIntento(
      notificacionId: string,
      opciones: { readonly definitivo: boolean; readonly errorSeguro: string },
    ): Promise<NotificacionRegistrada> {
      try {
        const res = await ejecutor.query(SQL_REGISTRAR_FALLO, [
          notificacionId,
          opciones.definitivo,
          opciones.errorSeguro,
        ]);
        const fila = res.rows[0];
        if (fila === undefined) {
          const actual = await this.buscarPorId(notificacionId);
          if (actual !== null) return actual;
          throw new ErrorDeDominio(
            'NOTIFICACION_NO_ENCONTRADA',
            'no_encontrado',
            'No se encontró la notificación para registrar el fallo.',
          );
        }
        return mapearFila(fila);
      } catch (error) {
        throw traducirErrorNotificacionPg(error);
      }
    },
  };
}

/** Ejecutor de casos de uso de notificación que abre una transacción `withTenant` por clínica. */
export function crearEjecutorTenantNotificaciones(): EjecutorTenant {
  return {
    ejecutar<T>(clinicaId: string, fn: (repo: NotificacionRepositorio) => Promise<T>): Promise<T> {
      return withTenant(clinicaId, (cliente) => fn(crearRepositorioNotificacionesPg(cliente)));
    },
  };
}
