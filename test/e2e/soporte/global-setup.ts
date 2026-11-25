import { prepararBaseE2E } from './base.js';

/** Preparación global del proyecto `e2e`: base `_test` guardada, esquema reiniciado y migrado. */
export default async function preparar(): Promise<void> {
  await prepararBaseE2E();
}
