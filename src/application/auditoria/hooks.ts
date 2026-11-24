import type { RequestContext } from '../shared/request-context.js';

import type { AccionAuditoriaConocida, ServicioAuditoria, ValorAuditoria } from './puertos.js';

export interface OpcionesAuditoriaCambio<T> {
  readonly accion: AccionAuditoriaConocida | (string & {});
  readonly entidad: string;
  readonly entidadId?: string | null;
  readonly antes?: ValorAuditoria;
  readonly despues?: ValorAuditoria;
  readonly ip?: string | null;
  readonly extraerEntidadId?: (resultado: T) => string | null | undefined;
  readonly extraerAntes?: (resultado: T) => ValorAuditoria;
  readonly extraerDespues?: (resultado: T) => ValorAuditoria;
}

export interface OpcionesAuditoriaLecturaPaciente {
  readonly pacienteId: string;
  readonly ip?: string | null;
}

export interface MetadatosExportacionAuditoria {
  readonly formato: string;
  readonly entidades: readonly string[];
  readonly conteos: Readonly<Record<string, number>>;
  readonly [claveExtra: string]: unknown;
}

export interface OpcionesAuditoriaExportacion<T> {
  readonly entidadId?: string | null;
  readonly ip?: string | null;
  readonly metadatos?: MetadatosExportacionAuditoria | Record<string, unknown>;
  readonly extraerEntidadId?: (resultado: T) => string | null | undefined;
  readonly extraerMetadatos?: (
    resultado: T,
  ) => MetadatosExportacionAuditoria | Record<string, unknown>;
}

/**
 * Ejecuta una operación que muta estado (`RN-AU-02`) y audita al completarse con éxito.
 * Modo fail-closed: si falla la auditoría, el error se propaga para revertir la transacción.
 */
export async function conAuditoriaDeCambio<T>(
  auditoria: ServicioAuditoria,
  ctx: RequestContext,
  opciones: OpcionesAuditoriaCambio<T>,
  ejecutar: () => Promise<T>,
): Promise<T> {
  const resultado = await ejecutar();
  await auditoria.registrar(ctx, {
    accion: opciones.accion,
    entidad: opciones.entidad,
    entidadId: opciones.extraerEntidadId
      ? (opciones.extraerEntidadId(resultado) ?? null)
      : (opciones.entidadId ?? null),
    antes: opciones.extraerAntes ? opciones.extraerAntes(resultado) : opciones.antes,
    despues: opciones.extraerDespues ? opciones.extraerDespues(resultado) : opciones.despues,
    ip: opciones.ip ?? null,
  });
  return resultado;
}

/**
 * Envuelve la consulta de ficha de un paciente (`RN-AU-03`). Si existe, registra `lectura_ficha`
 * sin persistir los datos leídos antes de devolver la ficha; si no existe, no audita.
 */
export async function conAuditoriaDeLecturaPaciente<T>(
  auditoria: ServicioAuditoria,
  ctx: RequestContext,
  opciones: OpcionesAuditoriaLecturaPaciente,
  consultar: () => Promise<T | null | undefined>,
): Promise<T | null | undefined> {
  const ficha = await consultar();
  if (ficha === null || ficha === undefined) {
    return ficha;
  }
  await auditoria.registrar(ctx, {
    accion: 'lectura_ficha',
    entidad: 'paciente',
    entidadId: opciones.pacienteId,
    antes: null,
    despues: null,
    ip: opciones.ip ?? null,
  });
  return ficha;
}

/**
 * Envuelve una exportación de datos (`RN-AU-03`, `RN-DA-04`) registrando sus metadatos
 * saneados antes de entregar el resultado.
 */
export async function conAuditoriaDeExportacion<T>(
  auditoria: ServicioAuditoria,
  ctx: RequestContext,
  opciones: OpcionesAuditoriaExportacion<T>,
  exportar: () => Promise<T>,
): Promise<T> {
  const resultado = await exportar();
  await auditoria.registrar(ctx, {
    accion: 'exportacion',
    entidad: 'exportacion',
    entidadId: opciones.extraerEntidadId
      ? (opciones.extraerEntidadId(resultado) ?? null)
      : (opciones.entidadId ?? null),
    antes: null,
    despues: opciones.extraerMetadatos
      ? opciones.extraerMetadatos(resultado)
      : (opciones.metadatos ?? null),
    ip: opciones.ip ?? null,
  });
  return resultado;
}
