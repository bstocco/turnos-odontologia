import type { RequestContext, TipoActor } from '../shared/request-context.js';

/** Ejecutor transaccional que recibe los repositorios (D7); mínimo estructural (aplicación: puertos). */
export interface EjecutorDeConsulta {
  query(texto: string, valores?: unknown[]): Promise<ResultadoSql>;
}

export interface ResultadoSql {
  readonly rows: readonly Record<string, unknown>[];
}

export type ValorAuditoria = unknown;

export const ACCIONES_AUDITORIA = [
  'creacion',
  'modificacion',
  'confirmacion',
  'cancelacion',
  'reprogramacion',
  'atendido',
  'ausente',
  'lectura_ficha',
  'exportacion',
  'bloqueo',
  'desbloqueo',
  'inicio_sesion',
  'cierre_sesion',
] as const;

export type AccionAuditoriaConocida = (typeof ACCIONES_AUDITORIA)[number];

/** Entrada recibida por el servicio desde casos de uso o rutas (`ip` opcional sin alterar RequestContext). */
export interface EntradaAuditoria {
  readonly accion: AccionAuditoriaConocida | (string & {});
  readonly entidad: string;
  readonly entidadId?: string | null;
  readonly antes?: ValorAuditoria;
  readonly despues?: ValorAuditoria;
  readonly ip?: string | null;
}

/** Carga validada, normalizada y ya enmascarada lista para persistir en `auditoria`. */
export interface RegistroAuditoriaAInsertar {
  readonly clinicaId: string;
  readonly actorTipo: TipoActor;
  readonly actorId: string | null;
  readonly accion: string;
  readonly entidad: string;
  readonly entidadId: string | null;
  readonly datosAntes: unknown | null;
  readonly datosDespues: unknown | null;
  readonly ip: string | null;
}

/** Registro persistido devuelto por el repositorio append-only. */
export interface RegistroAuditoriaCreado {
  readonly id: string;
  readonly clinicaId: string;
  readonly ocurrioEn: Date;
  readonly actorTipo: TipoActor;
  readonly actorId: string | null;
  readonly accion: string;
  readonly entidad: string;
  readonly entidadId: string | null;
  readonly datosAntes: unknown | null;
  readonly datosDespues: unknown | null;
  readonly ip: string | null;
}

/** Filtros para `listar` en el repositorio append-only de auditoría (lectura). */
export interface FiltrosDeListarAuditoria {
  readonly entidad?: string;
  readonly actorId?: string;
  readonly desde?: Date | null;
  readonly hasta?: Date | null;
}

/**
 * Puerto append-only de auditoría (`RN-AU-01`): expone únicamente inserción, nunca
 * actualización ni borrado. La lectura (`listar`) es de solo-lectura y filtrable.
 */
export interface AuditoriaRepositorio {
  insertar(registro: RegistroAuditoriaAInsertar): Promise<RegistroAuditoriaCreado>;
  listar(
    filtros: FiltrosDeListarAuditoria,
    ejecutor: EjecutorDeConsulta,
  ): Promise<RegistroAuditoriaCreado[]>;
}

/** Servicio de aplicación para registrar eventos de auditoría con enmascaramiento automático. */
export interface ServicioAuditoria {
  registrar(ctx: RequestContext, entrada: EntradaAuditoria): Promise<RegistroAuditoriaCreado>;
}

export type AuditoriaService = ServicioAuditoria;
