import { PgBoss } from 'pg-boss';

import {
  validarPayloadColaEmail,
  type ColaNotificaciones,
  type OpcionesEncoladoCola,
  type PayloadColaEmail,
} from '../../application/notificaciones/index.js';

export const NOMBRE_COLA_EMAIL = 'notificaciones.email';

export interface PoliticaReintentosCola {
  readonly retryLimit: number;
  readonly retryDelay: number;
  readonly retryBackoff: boolean;
  readonly retryDelayMax?: number;
}

export const DEFAULTS_REINTENTOS_COLA: PoliticaReintentosCola = {
  retryLimit: 4,
  retryDelay: 30,
  retryBackoff: true,
  retryDelayMax: 1800,
};

export interface OpcionesPgBossApp {
  readonly connectionString: string;
}

export function resolverPoliticaReintentos(
  parcial?: Partial<PoliticaReintentosCola>,
): PoliticaReintentosCola {
  const retryBackoff = parcial?.retryBackoff ?? DEFAULTS_REINTENTOS_COLA.retryBackoff;
  const retryDelayMax = parcial?.retryDelayMax ?? DEFAULTS_REINTENTOS_COLA.retryDelayMax;
  return {
    retryLimit: parcial?.retryLimit ?? DEFAULTS_REINTENTOS_COLA.retryLimit,
    retryDelay: parcial?.retryDelay ?? DEFAULTS_REINTENTOS_COLA.retryDelay,
    retryBackoff,
    ...(retryBackoff && retryDelayMax !== undefined ? { retryDelayMax } : {}),
  };
}

/**
 * Instancia `PgBoss` para el rol `app` sin permisos DDL (Q3):
 * `migrate: false`, `createSchema: false`, `reindex: false`, `persistQueueStats: false`.
 */
export function crearPgBossApp(opciones: OpcionesPgBossApp): PgBoss {
  return new PgBoss({
    connectionString: opciones.connectionString,
    schema: 'pgboss',
    migrate: false,
    createSchema: false,
    supervise: true,
    schedule: false,
    reindex: false,
    persistQueueStats: false,
    registerInstance: false,
  });
}

/** Asegura que exista la cola `notificaciones.email` sin particionado (compatible con rol `app`). */
export async function asegurarColaEmail(
  boss: PgBoss,
  politica?: Partial<PoliticaReintentosCola>,
): Promise<void> {
  const p = resolverPoliticaReintentos(politica);
  await boss.createQueue(NOMBRE_COLA_EMAIL, {
    partition: false,
    policy: 'standard',
    retryLimit: p.retryLimit,
    retryDelay: p.retryDelay,
    retryBackoff: p.retryBackoff,
    ...(p.retryBackoff && p.retryDelayMax !== undefined ? { retryDelayMax: p.retryDelayMax } : {}),
  });
}

/**
 * Adaptador de `ColaNotificaciones` sobre `pg-boss`.
 * Revalida que el payload contenga únicamente `{ clinicaId, notificacionId }` antes de enviarlo.
 */
export async function crearColaNotificacionesPgBoss(
  boss: PgBoss,
  politica?: Partial<PoliticaReintentosCola>,
): Promise<ColaNotificaciones> {
  const p = resolverPoliticaReintentos(politica);
  await boss.start();
  await asegurarColaEmail(boss, p);

  return {
    async encolar(
      payload: PayloadColaEmail,
      opciones?: OpcionesEncoladoCola,
    ): Promise<string | null> {
      const validado = validarPayloadColaEmail(payload);
      return await boss.send(NOMBRE_COLA_EMAIL, validado, {
        retryLimit: p.retryLimit,
        retryDelay: p.retryDelay,
        retryBackoff: p.retryBackoff,
        ...(p.retryBackoff && p.retryDelayMax !== undefined
          ? { retryDelayMax: p.retryDelayMax }
          : {}),
        ...(opciones?.singletonKey !== undefined ? { singletonKey: opciones.singletonKey } : {}),
        ...(opciones?.startAfter !== undefined ? { startAfter: opciones.startAfter } : {}),
      });
    },
  };
}
