import {
  crearAuditoriaService,
  type AuditoriaRepositorio,
  type FiltrosDeListarAuditoria,
  type RegistroAuditoriaAInsertar,
  type RegistroAuditoriaCreado,
  type ServicioAuditoria,
} from '../../application/auditoria/index.js';
import type { TipoActor } from '../../application/shared/request-context.js';
import {
  instante,
  texto,
  textoONulo,
  type EjecutorSql,
  type Fila,
} from '../db/repositories/compartido/index.js';

import { ErrorDeAuditoriaPersistencia, traducirErrorAuditoriaPg } from './errores.js';

const SQL_INSERTAR_AUDITORIA = `
  INSERT INTO auditoria (
    clinica_id,
    actor_tipo,
    actor_id,
    accion,
    entidad,
    entidad_id,
    datos_antes,
    datos_despues,
    ip
  )
  VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid, $7::jsonb, $8::jsonb, $9::inet)
  RETURNING id::text AS id,
            clinica_id,
            ocurrio_en,
            actor_tipo,
            actor_id,
            accion,
            entidad,
            entidad_id,
            datos_antes,
            datos_despues,
            host(ip) AS ip
`;

const SQL_LISTAR_AUDITORIA = `
  SELECT id::text AS id,
         clinica_id,
         ocurrio_en,
         actor_tipo,
         actor_id,
         accion,
         entidad,
         entidad_id,
         datos_antes,
         datos_despues,
         host(ip) AS ip
  FROM auditoria
  WHERE TRUE
`;

function filtrosALaLista(filtros: FiltrosDeListarAuditoria): { sql: string; valores: unknown[] } {
  const condiciones: string[] = [];
  const valores: unknown[] = [];
  if (filtros.entidad !== undefined) {
    valores.push(filtros.entidad);
    condiciones.push(`entidad = $${valores.length}`);
  }
  if (filtros.actorId !== undefined) {
    valores.push(filtros.actorId);
    condiciones.push(`actor_id = $${valores.length}`);
  }
  if (filtros.desde !== undefined && filtros.desde !== null) {
    valores.push(filtros.desde);
    condiciones.push(`ocurrio_en >= $${valores.length}::timestamptz`);
  }
  if (filtros.hasta !== undefined && filtros.hasta !== null) {
    valores.push(filtros.hasta);
    condiciones.push(`ocurrio_en <= $${valores.length}::timestamptz`);
  }
  return { sql: condiciones.join(' AND '), valores };
}

/** Repositorio de lectura de la auditoría, sobre el `EjecutorSql` de un `withTenant`. */
export function crearRepositorioDeAuditoriaDeLectura(ejecutor: EjecutorSql): AuditoriaRepositorio {
  return {
    async insertar(registro: RegistroAuditoriaAInsertar): Promise<RegistroAuditoriaCreado> {
      try {
        const resultado = await ejecutor.query(SQL_INSERTAR_AUDITORIA, [
          registro.clinicaId,
          registro.actorTipo,
          registro.actorId,
          registro.accion,
          registro.entidad,
          registro.entidadId,
          serializarJsonb(registro.datosAntes),
          serializarJsonb(registro.datosDespues),
          registro.ip,
        ]);
        const fila = resultado.rows[0];
        if (fila === undefined) {
          throw new ErrorDeAuditoriaPersistencia(undefined, undefined);
        }
        return mapearFila(fila);
      } catch (error) {
        throw traducirErrorAuditoriaPg(error);
      }
    },
    async listar(
      filtros: FiltrosDeListarAuditoria,
      ejecutor: EjecutorSql,
    ): Promise<RegistroAuditoriaCreado[]> {
      const { sql, valores } = filtrosALaLista(filtros);
      const consulta = `${SQL_LISTAR_AUDITORIA}${sql ? `\n  AND ${sql}` : ''}\n  ORDER BY ocurrio_en DESC, id`;
      const resultado = await ejecutor.query(consulta, valores);
      return resultado.rows.map(mapearFila);
    },
  };
}

function serializarJsonb(valor: unknown | null): string | null {
  return valor === null ? null : JSON.stringify(valor);
}

function mapearFila(fila: Fila): RegistroAuditoriaCreado {
  return {
    id: texto(fila, 'id'),
    clinicaId: texto(fila, 'clinica_id'),
    ocurrioEn: instante(fila, 'ocurrio_en'),
    actorTipo: texto(fila, 'actor_tipo') as TipoActor,
    actorId: textoONulo(fila, 'actor_id'),
    accion: texto(fila, 'accion'),
    entidad: texto(fila, 'entidad'),
    entidadId: textoONulo(fila, 'entidad_id'),
    datosAntes: fila['datos_antes'] ?? null,
    datosDespues: fila['datos_despues'] ?? null,
    ip: textoONulo(fila, 'ip'),
  };
}

/** Repositorio append-only de auditoría sobre el `EjecutorSql` transaccional de `withTenant`. */
export const crearRepositorioAuditoriaPg = crearRepositorioDeAuditoriaDeLectura;

/** Crea `ServicioAuditoria` acoplado al adaptador PostgreSQL dentro de la transacción activa. */
export function crearAuditoriaPg(ejecutor: EjecutorSql): ServicioAuditoria {
  return crearAuditoriaService(crearRepositorioAuditoriaPg(ejecutor));
}
