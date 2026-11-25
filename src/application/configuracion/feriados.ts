import { crearFechaLocal, type FechaLocal } from '../../domain/agenda/index.js';
import { conAuditoriaDeCambio } from '../auditoria/index.js';
import type { RequestContext } from '../shared/request-context.js';

import { plantillaFeriadosNoDisponible, recursoNoEncontrado } from './errores.js';
import { plantillaDeFeriados, type FeriadoDePlantilla } from './feriados-nacionales.js';
import { ESCRITURA, LECTURA, exigirRol } from './permisos.js';
import type { FeriadoDto, FeriadosPuerto, ServicioAuditoria } from './puertos.js';

export interface DependenciasDeFeriados {
  readonly feriados: FeriadosPuerto;
  readonly auditoria: ServicioAuditoria;
}

export interface PlantillaDeFeriados {
  readonly anio: number;
  readonly feriados: readonly FeriadoDePlantilla[];
}

export interface ResultadoDeCopia {
  readonly anio: number;
  readonly creados: readonly FeriadoDto[];
  /** Fechas que la clínica ya tenía: no se tocan. */
  readonly omitidas: readonly string[];
}

type OrigenDeFeriado = 'manual' | 'plantilla_nacional';

function fechaValida(texto: string): FechaLocal {
  const fecha = crearFechaLocal(texto);
  if (!fecha.ok) throw fecha.error;
  return fecha.valor;
}

/** Crea un feriado y audita `creacion` con su origen (design D9). */
function crearAuditado(
  deps: DependenciasDeFeriados,
  ctx: RequestContext,
  fecha: FechaLocal,
  descripcion: string,
  origen: OrigenDeFeriado,
  ip: string | null,
): Promise<FeriadoDto> {
  return conAuditoriaDeCambio(
    deps.auditoria,
    ctx,
    {
      accion: 'creacion',
      entidad: 'feriado',
      antes: null,
      ip,
      extraerEntidadId: (creado: FeriadoDto) => creado.id,
      extraerDespues: (creado: FeriadoDto) => ({
        fecha: creado.fecha,
        descripcion: creado.descripcion,
        origen,
      }),
    },
    () => deps.feriados.crear(fecha, descripcion),
  );
}

export async function listarFeriados(
  deps: Pick<DependenciasDeFeriados, 'feriados'>,
  ctx: RequestContext,
  filtro: { readonly anio?: number },
): Promise<readonly FeriadoDto[]> {
  exigirRol(ctx, LECTURA);
  const todos = await deps.feriados.listar();
  if (filtro.anio === undefined) return todos;
  const prefijo = `${String(filtro.anio).padStart(4, '0')}-`;
  return todos.filter((f) => f.fecha.startsWith(prefijo));
}

export async function crearFeriado(
  deps: DependenciasDeFeriados,
  ctx: RequestContext,
  entrada: { readonly fecha: string; readonly descripcion: string },
  ip: string | null = null,
): Promise<FeriadoDto> {
  exigirRol(ctx, ESCRITURA);
  const fecha = fechaValida(entrada.fecha);
  return crearAuditado(deps, ctx, fecha, entrada.descripcion.trim(), 'manual', ip);
}

export async function eliminarFeriado(
  deps: DependenciasDeFeriados,
  ctx: RequestContext,
  id: string,
  ip: string | null = null,
): Promise<void> {
  exigirRol(ctx, ESCRITURA);
  const existente = (await deps.feriados.listar()).find((f) => f.id === id);
  if (existente === undefined) throw recursoNoEncontrado();
  await conAuditoriaDeCambio(
    deps.auditoria,
    ctx,
    {
      accion: 'eliminacion',
      entidad: 'feriado',
      entidadId: id,
      antes: { fecha: existente.fecha, descripcion: existente.descripcion },
      despues: null,
      ip,
    },
    async () => {
      if (!(await deps.feriados.eliminar(id))) throw recursoNoEncontrado();
    },
  );
}

export function obtenerPlantilla(ctx: RequestContext, anio: number): PlantillaDeFeriados {
  exigirRol(ctx, LECTURA);
  const feriados = plantillaDeFeriados(anio);
  if (feriados === undefined) throw plantillaFeriadosNoDisponible();
  return { anio, feriados };
}

/**
 * Copia la plantilla nacional del año a la clínica de forma idempotente: crea solo las fechas
 * ausentes (nunca pisa una descripción propia) y audita un evento por feriado creado.
 */
export async function copiarPlantilla(
  deps: DependenciasDeFeriados,
  ctx: RequestContext,
  anio: number,
  ip: string | null = null,
): Promise<ResultadoDeCopia> {
  exigirRol(ctx, ESCRITURA);
  const plantilla = plantillaDeFeriados(anio);
  if (plantilla === undefined) throw plantillaFeriadosNoDisponible();

  const existentes = new Set((await deps.feriados.listar()).map((f) => f.fecha as string));
  const creados: FeriadoDto[] = [];
  const omitidas: string[] = [];
  for (const { fecha, descripcion } of plantilla) {
    if (existentes.has(fecha)) {
      omitidas.push(fecha);
      continue;
    }
    creados.push(
      await crearAuditado(deps, ctx, fechaValida(fecha), descripcion, 'plantilla_nacional', ip),
    );
  }
  return { anio, creados, omitidas };
}
