import { operacionesDe, type Contrato } from './comparar.js';

export interface ResultadoDeRespuestas {
  /** Operaciones sin esquema de respuesta exitosa y sin excepción registrada. */
  readonly sinEsquema: string[];
  /** Excepciones que ya no hacen falta (la operación tiene esquema o dejó de existir). */
  readonly sobrantes: string[];
}

function tieneEsquemaExitoso(operacion: Record<string, unknown>): boolean {
  const respuestas = operacion.responses;
  if (respuestas === null || typeof respuestas !== 'object') return false;
  return Object.entries(respuestas).some(([codigo, respuesta]) => {
    if (!codigo.startsWith('2')) return false;
    const contenido = (respuesta as { content?: Record<string, { schema?: unknown }> }).content;
    return contenido?.['application/json']?.schema !== undefined;
  });
}

/**
 * Toda operación declara el esquema de su respuesta exitosa, salvo las de la lista de excepciones
 * (`METODO /ruta` → motivo y change responsable). La lista solo puede achicarse: una excepción
 * sobrante también es un error.
 */
export function verificarRespuestasDeclaradas(
  contrato: Contrato,
  excepciones: Readonly<Record<string, string>>,
): ResultadoDeRespuestas {
  const operaciones = operacionesDe(contrato);
  const exceptuada = (nombre: string): boolean => (excepciones[nombre] ?? '').trim() !== '';

  const sinEsquema = [...operaciones]
    .filter(([nombre, op]) => !tieneEsquemaExitoso(op) && !exceptuada(nombre))
    .map(([nombre]) => nombre)
    .sort();
  const sobrantes = Object.keys(excepciones)
    .filter((nombre) => {
      const operacion = operaciones.get(nombre);
      return operacion === undefined || tieneEsquemaExitoso(operacion);
    })
    .sort();
  return { sinEsquema, sobrantes };
}
