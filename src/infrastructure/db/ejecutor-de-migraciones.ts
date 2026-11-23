import pg from 'pg';

import { ErrorDeMigracion, leerMigraciones } from './migraciones.js';

export interface OpcionesDeMigracion {
  /** Conexión del rol de migraciones. Nunca se sustituye por la de la aplicación. */
  readonly urlDeMigracion: string | undefined;
  readonly directorio: string;
  readonly log?: (mensaje: string) => void;
}

export interface ResultadoDeMigracion {
  /** Migraciones aplicadas en esta ejecución, en orden. */
  readonly aplicadas: readonly string[];
  /** Migraciones que ya estaban aplicadas y no se tocaron. */
  readonly yaAplicadas: number;
  /** Aplicadas ahora aunque su orden es anterior a otra ya aplicada (changes independientes). */
  readonly fueraDeOrden: readonly string[];
}

const TABLA_DE_CONTROL = 'schema_migrations';
const CLAVE_DEL_BLOQUEO = 'turnos-odontologia:migraciones';

interface FilaAplicada {
  nombre: string;
  huella: string;
}

/**
 * Aplica las migraciones pendientes: orden (NN, seq), una transacción por migración,
 * huella verificada, bloqueo asesor contra ejecuciones simultáneas y rol de migraciones propio.
 */
export async function aplicarMigraciones(
  opciones: OpcionesDeMigracion,
): Promise<ResultadoDeMigracion> {
  const log = opciones.log ?? ((): void => undefined);

  if (opciones.urlDeMigracion === undefined || opciones.urlDeMigracion.trim() === '') {
    throw new ErrorDeMigracion(
      'SIN_CONEXION_DE_MIGRACIONES',
      'Falta la conexión del rol de migraciones (DATABASE_MIGRATION_URL). No se usa la de la aplicación.',
    );
  }

  // Valida nombres y duplicados ANTES de abrir ninguna conexión.
  const archivos = await leerMigraciones(opciones.directorio);

  const cliente = new pg.Client({ connectionString: opciones.urlDeMigracion });
  await cliente.connect();
  try {
    // Espera su turno si hay otra ejecución en curso; el bloqueo se libera al cerrar la sesión.
    await cliente.query('SELECT pg_advisory_lock(hashtext($1))', [CLAVE_DEL_BLOQUEO]);

    await cliente.query(`
      CREATE TABLE IF NOT EXISTS ${TABLA_DE_CONTROL} (
        nombre      text PRIMARY KEY,
        huella      text NOT NULL,
        aplicada_en timestamptz NOT NULL DEFAULT now()
      )`);

    const { rows } = await cliente.query<FilaAplicada>(
      `SELECT nombre, huella FROM ${TABLA_DE_CONTROL} ORDER BY nombre`,
    );
    const aplicadas = new Map(rows.map((f) => [f.nombre, f.huella]));
    const enDisco = new Map(archivos.map((a) => [a.nombre, a]));

    // Lo ya aplicado no puede haber cambiado ni haber desaparecido.
    for (const [nombre, huella] of aplicadas) {
      const archivo = enDisco.get(nombre);
      if (archivo === undefined) {
        throw new ErrorDeMigracion(
          'MIGRACION_AUSENTE',
          `La migración '${nombre}' figura como aplicada pero ya no está en el directorio.`,
          nombre,
        );
      }
      if (archivo.huella !== huella) {
        throw new ErrorDeMigracion(
          'HUELLA_DISTINTA',
          `La migración '${nombre}' ya fue aplicada y su contenido cambió. Las migraciones aplicadas son inmutables: creá una nueva.`,
          nombre,
        );
      }
    }

    const pendientes = archivos.filter((a) => !aplicadas.has(a.nombre));
    const ultimaAplicada = [...aplicadas.keys()].sort().at(-1);
    const resultado: { aplicadas: string[]; fueraDeOrden: string[] } = {
      aplicadas: [],
      fueraDeOrden: [],
    };

    for (const migracion of pendientes) {
      try {
        await cliente.query('BEGIN');
        await cliente.query(migracion.contenido);
        await cliente.query(`INSERT INTO ${TABLA_DE_CONTROL} (nombre, huella) VALUES ($1, $2)`, [
          migracion.nombre,
          migracion.huella,
        ]);
        await cliente.query('COMMIT');
      } catch (error) {
        await cliente.query('ROLLBACK').catch(() => undefined);
        const detalle = error instanceof Error ? error.message : 'error desconocido';
        throw new ErrorDeMigracion(
          'FALLO_EN_MIGRACION',
          `Falló la migración '${migracion.nombre}' y se revirtió completa: ${detalle}`,
          migracion.nombre,
        );
      }
      resultado.aplicadas.push(migracion.nombre);
      if (ultimaAplicada !== undefined && migracion.nombre < ultimaAplicada) {
        resultado.fueraDeOrden.push(migracion.nombre);
      }
      log(`Aplicada ${migracion.nombre}`);
    }

    return { ...resultado, yaAplicadas: aplicadas.size };
  } finally {
    await cliente.end();
  }
}
