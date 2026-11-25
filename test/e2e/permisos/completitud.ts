export interface DiferenciasDeCompletitud {
  /** Operaciones registradas en la app que la matriz no decide. */
  readonly sinFila: string[];
  /** Filas de la matriz cuya operación ya no existe. */
  readonly filasSobrantes: string[];
}

/** Compara las operaciones registradas (`METODO /ruta`) con las filas de la matriz. */
export function diferenciasDeCompletitud(
  registradas: readonly string[],
  filas: readonly string[],
): DiferenciasDeCompletitud {
  const enFilas = new Set(filas);
  const enApp = new Set(registradas);
  return {
    sinFila: [...enApp].filter((o) => !enFilas.has(o)).sort(),
    filasSobrantes: [...enFilas].filter((o) => !enApp.has(o)).sort(),
  };
}
