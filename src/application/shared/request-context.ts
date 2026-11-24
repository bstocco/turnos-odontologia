/** Tipos de actor que puede generar una acción, según `knowledge-base/03_actores_y_roles.md`. */
export type TipoActor = 'usuario' | 'paciente_enlace' | 'sistema';

/** Identidad del actor: tipo, id y rol, según el modelo de autenticación. */
export interface Actor {
  readonly tipo: TipoActor;
  readonly id: string;
  readonly rol: string;
}

/**
 * Contrato compartido del contexto de tenant que viaja por los casos de uso: identifica la
 * clínica y al actor (tipo, id y rol) que invoca al caso de uso (ver `migrations/C03_001_tenant_rls.sql`).
 */
export interface RequestContext {
  readonly clinicaId: string;
  readonly actor: Actor;
}
