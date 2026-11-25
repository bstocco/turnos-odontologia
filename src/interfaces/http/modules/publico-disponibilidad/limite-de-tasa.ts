export interface LimiteDeTasa {
  readonly max: number;
  readonly ventanaMs: number;
}

const VENTANA_POR_UNIDAD: Readonly<Record<string, number>> = {
  s: 1_000,
  min: 60_000,
  h: 3_600_000,
};

/** Mismo patrón que valida la configuración (`RATE_LIMIT_PUBLIC`): `<n>/<s|min|h>`, n >= 1. */
const FORMATO = /^([1-9][0-9]*)\/(s|min|h)$/;

/** Convierte `RATE_LIMIT_PUBLIC` (p. ej. `30/min`) en máximo de pedidos y ventana en ms. */
export function parsearLimiteDeTasa(texto: string): LimiteDeTasa {
  const m = FORMATO.exec(texto);
  const ventanaMs = m === null ? undefined : VENTANA_POR_UNIDAD[m[2] ?? ''];
  if (m === null || ventanaMs === undefined) {
    throw new TypeError('RATE_LIMIT_PUBLIC no tiene el formato <n>/<s|min|h>');
  }
  return { max: Number(m[1]), ventanaMs };
}
