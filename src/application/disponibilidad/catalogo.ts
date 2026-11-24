import type { DependenciasDeCatalogo, PrestacionPublica, ProfesionalPublico } from './puertos.js';

/** Comparación por código de unidad (determinista, independiente del idioma del servidor). */
function comparar(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Prestaciones activas de la clínica, por `nombre` e `id`. Proyección por lista blanca:
 * nunca expone `activa` ni otros campos (design D4).
 */
export async function listarPrestacionesPublicas(
  deps: DependenciasDeCatalogo,
): Promise<readonly PrestacionPublica[]> {
  const todas = await deps.prestaciones.listar();
  return todas
    .filter((p) => p.activa)
    .map((p): PrestacionPublica => ({
      id: p.id,
      nombre: p.nombre,
      duracionMinutos: p.duracionMinutos,
    }))
    .sort((a, b) => comparar(a.nombre, b.nombre) || comparar(a.id, b.id));
}

/** Profesionales activos, por `apellido`, `nombre` e `id`. Sin matrícula ni estado. */
export async function listarProfesionalesPublicos(
  deps: DependenciasDeCatalogo,
): Promise<readonly ProfesionalPublico[]> {
  const todos = await deps.profesionales.listar();
  return todos
    .filter((p) => p.activo)
    .map((p): ProfesionalPublico => ({ id: p.id, nombre: p.nombre, apellido: p.apellido }))
    .sort(
      (a, b) =>
        comparar(a.apellido, b.apellido) || comparar(a.nombre, b.nombre) || comparar(a.id, b.id),
    );
}
