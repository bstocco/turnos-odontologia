import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';

import { poolDeLaAplicacion } from '../../../src/infrastructure/db/pool/index.js';
import { appDePrueba } from '../../support/app-de-prueba.js';

import { asegurarEsquemaE2E } from './base.js';

export type RegistroDeLogs = Awaited<ReturnType<typeof appDePrueba>>['logs'];

export interface PedidoE2E {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly payload?: unknown;
  /** IP de origen del pedido; por defecto cada pedido sale de una IP distinta (límites por IP). */
  readonly ip?: string;
}

export interface EntornoE2E {
  readonly app: FastifyInstance;
  readonly logs: RegistroDeLogs;
  inject(pedido: PedidoE2E): Promise<LightMyRequestResponse>;
  cerrar(): Promise<void>;
}

let contadorDeIp = 0;

/** IP sintética distinta por pedido (rango 10.0.0.0/8, reservado) para no compartir cupos. */
export function ipNueva(): string {
  contadorDeIp += 1;
  const n = contadorDeIp;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}

/**
 * Abre la app COMPLETA (todos los módulos reales) sobre la base PostgreSQL de pruebas migrada.
 * Solo el email y el reloj se pueden simular; la base nunca (spec pruebas-e2e-flujos).
 */
export async function abrirEntorno(): Promise<EntornoE2E> {
  await asegurarEsquemaE2E();
  const { app, logs } = await appDePrueba();
  await app.ready();

  return {
    app,
    logs,
    inject(pedido: PedidoE2E): Promise<LightMyRequestResponse> {
      const opciones: InjectOptions = {
        method: pedido.method,
        url: pedido.url,
        remoteAddress: pedido.ip ?? ipNueva(),
        ...(pedido.headers === undefined ? {} : { headers: pedido.headers }),
        ...(pedido.payload === undefined ? {} : { payload: pedido.payload as object }),
      };
      return app.inject(opciones);
    },
    async cerrar(): Promise<void> {
      await app.close();
      await poolDeLaAplicacion().end();
    },
  };
}
