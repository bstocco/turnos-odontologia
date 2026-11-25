import type { FastifyInstance } from 'fastify';

/** Ordena las claves de los objetos de forma recursiva (los arreglos conservan su orden). */
export function normalizar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(normalizar);
  if (valor !== null && typeof valor === 'object') {
    const ordenado: Record<string, unknown> = {};
    for (const clave of Object.keys(valor).sort()) {
      ordenado[clave] = normalizar((valor as Record<string, unknown>)[clave]);
    }
    return ordenado;
  }
  return valor;
}

/** Solo cuentan los encabezados con fecha real: los ejemplos del registro usan `AAAA-MM-DD`. */
const ENCABEZADO_DE_VERSION = /^## \[(\d+)\.(\d+)\.(\d+)\] - \d{4}-\d{2}-\d{2}/gm;

/** Versiones declaradas en `docs/api/CHANGELOG.md` (encabezados `## [X.Y.Z] - AAAA-MM-DD`). */
export function versionesDelRegistro(registro: string): string[] {
  return [...registro.matchAll(ENCABEZADO_DE_VERSION)].map(
    (m) => `${m[1] ?? ''}.${m[2] ?? ''}.${m[3] ?? ''}`,
  );
}

function aNumeros(version: string): number[] {
  return version.split('.').map(Number);
}

export function compararVersiones(a: string, b: string): number {
  const [aMayor = 0, aMenor = 0, aParche = 0] = aNumeros(a);
  const [bMayor = 0, bMenor = 0, bParche = 0] = aNumeros(b);
  return aMayor - bMayor || aMenor - bMenor || aParche - bParche;
}

/** La versión más alta declarada en el registro de cambios; falla si no hay ninguna. */
export function versionDelRegistro(registro: string): string {
  const versiones = versionesDelRegistro(registro).sort(compararVersiones);
  const ultima = versiones.at(-1);
  if (ultima === undefined) {
    throw new Error('El registro de cambios del contrato no declara ninguna versión.');
  }
  return ultima;
}

/**
 * Contrato OpenAPI normalizado a partir de la app real (nunca escrito a mano): claves ordenadas,
 * sin campos variables y con `info.version` tomada del registro de cambios.
 */
export function generarContrato(app: FastifyInstance, registro: string): string {
  const crudo = JSON.parse(JSON.stringify(app.swagger())) as {
    info: { version: string };
  };
  crudo.info.version = versionDelRegistro(registro);
  return `${JSON.stringify(normalizar(crudo), null, 2)}\n`;
}
