import {
  calcularDisponibilidad,
  crearFechaLocal,
  crearIntervaloOLanzar,
  instanteALocal,
  localAInstante,
  sumarDias,
  type ConfiguracionAgenda,
  type FechaLocal,
  type Hueco,
} from '../../domain/agenda/index.js';
import type { OcupacionExistente } from '../../domain/agenda/index.js';
import type { PrestacionId, ProfesionalId } from '../../domain/shared/index.js';
import { valorOLanzar } from '../../domain/shared/resultado.js';
import type { Turno } from '../../domain/turno/index.js';

import { rangoFechasInvalido, recursoPublicoNoEncontrado } from './errores.js';
import type {
  ConsultaDeDisponibilidad,
  DependenciasDeDisponibilidad,
  DisponibilidadPublica,
  VerificacionDeHueco,
} from './puertos.js';

/** Máximo de días del rango consultado y horizonte de reserva (design, provisionales ajustables). */
export const MAX_DIAS_DE_RANGO = 14;
export const HORIZONTE_EN_DIAS = 90;

const DIA_MS = 86_400_000;

function diasEntre(desde: FechaLocal, hasta: FechaLocal): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS);
}

/** Medianoche local como instante; si no existe (cambio de horario), medianoche UTC (se ensancha igual). */
function medianoche(fecha: FechaLocal, zona: string): Date {
  const r = localAInstante(fecha, 0, zona);
  return r.ok ? r.valor : new Date(`${fecha}T00:00:00Z`);
}

function aOcupacion(t: Turno): OcupacionExistente {
  // Solo lo que el dominio necesita: el pacienteId no atraviesa este paso.
  return {
    profesionalId: t.profesionalId,
    sillonId: t.sillonId,
    inicio: t.inicio,
    fin: t.fin,
    finSillon: t.finSillon,
    estado: t.estado,
  };
}

interface ParametrosDeCalculo {
  readonly profesionalId: ProfesionalId;
  readonly duracionMinutos: number;
  readonly desde: FechaLocal;
  readonly hasta: FechaLocal;
  readonly config: ConfiguracionAgenda;
  readonly ahora: Date;
}

/** Lee la agenda y calcula los huecos con la función de dominio (un único cálculo, D3/D6). */
async function calcularHuecos(
  deps: DependenciasDeDisponibilidad,
  p: ParametrosDeCalculo,
): Promise<readonly Hueco[]> {
  const ventana = crearIntervaloOLanzar(
    new Date(medianoche(p.desde, p.config.zonaHoraria).getTime() - DIA_MS),
    new Date(medianoche(p.hasta, p.config.zonaHoraria).getTime() + DIA_MS),
  );
  const [franjas, feriados, bloqueos, delProfesional, sillones] = await Promise.all([
    deps.agenda.franjasDeAtencion(p.profesionalId),
    deps.agenda.feriados(p.desde, p.hasta),
    deps.agenda.bloqueos(p.profesionalId, ventana),
    deps.agenda.turnosActivosDeProfesional(p.profesionalId, ventana),
    deps.recursos.sillonesActivos(),
  ]);
  const deSillones =
    sillones.length === 0
      ? []
      : await deps.agenda.turnosActivosDeSillones(
          sillones.map((s) => s.id),
          ventana,
        );
  const porId = new Map<string, Turno>();
  for (const t of [...delProfesional, ...deSillones]) porId.set(t.id, t);

  return valorOLanzar(
    calcularDisponibilidad({
      profesionalId: p.profesionalId,
      duracionMinutos: p.duracionMinutos,
      desde: p.desde,
      hasta: p.hasta,
      franjas,
      feriados,
      bloqueos,
      turnos: [...porId.values()].map(aOcupacion),
      sillones,
      config: p.config,
      ahora: p.ahora,
    }),
  );
}

/** Profesional activo y prestación activa de la clínica; si no, el mismo 404 (D3). */
async function resolverRecursos(
  deps: DependenciasDeDisponibilidad,
  profesionalId: string,
  prestacionId: string,
): Promise<{ profesionalId: ProfesionalId; duracionMinutos: number; prestacionId: PrestacionId }> {
  const profesional = await deps.recursos.profesional(profesionalId as ProfesionalId);
  if (profesional === null || !profesional.activo) throw recursoPublicoNoEncontrado();
  const prestacion = await deps.prestaciones.obtenerPorId(prestacionId);
  if (prestacion === null || !prestacion.activa) throw recursoPublicoNoEncontrado();
  return {
    profesionalId: profesional.id,
    prestacionId: prestacion.id as PrestacionId,
    duracionMinutos: prestacion.duracionMinutos,
  };
}

/**
 * Disponibilidad pública de un profesional para una prestación (design D3).
 * Orden: rango (sin base) → configuración/horizonte → profesional → prestación → cálculo.
 */
export async function consultarDisponibilidad(
  deps: DependenciasDeDisponibilidad,
  consulta: ConsultaDeDisponibilidad,
): Promise<DisponibilidadPublica> {
  const desde = crearFechaLocal(consulta.desde);
  const hasta = crearFechaLocal(consulta.hasta);
  if (!desde.ok || !hasta.ok) throw rangoFechasInvalido();
  const dias = diasEntre(desde.valor, hasta.valor);
  if (dias <= 0 || dias > MAX_DIAS_DE_RANGO) throw rangoFechasInvalido();

  const config = await deps.recursos.configuracionAgenda();
  const ahora = deps.reloj();
  const hoy = valorOLanzar(instanteALocal(ahora, config.zonaHoraria)).fecha;
  if (hasta.valor > sumarDias(hoy, HORIZONTE_EN_DIAS)) throw rangoFechasInvalido();

  const recursos = await resolverRecursos(deps, consulta.profesionalId, consulta.prestacionId);
  const huecos = await calcularHuecos(deps, {
    profesionalId: recursos.profesionalId,
    duracionMinutos: recursos.duracionMinutos,
    desde: desde.valor,
    hasta: hasta.valor,
    config,
    ahora,
  });

  return {
    zonaHoraria: config.zonaHoraria,
    profesionalId: recursos.profesionalId,
    prestacionId: recursos.prestacionId,
    desde: desde.valor,
    hasta: hasta.valor,
    huecos: huecos.map((h) => ({
      inicio: h.intervalo.inicio.toISOString(),
      fin: h.intervalo.fin.toISOString(),
    })),
  };
}

/**
 * Verifica que `inicio` siga siendo un hueco ofrecido y devuelve sus sillones asignables (contrato
 * para C-15, design D6). Sin efectos: solo lecturas. `null` si ya no se ofrece.
 */
export async function huecoOfrecido(
  deps: DependenciasDeDisponibilidad,
  verificacion: VerificacionDeHueco,
): Promise<Hueco | null> {
  const config = await deps.recursos.configuracionAgenda();
  const ahora = deps.reloj();
  const recursos = await resolverRecursos(
    deps,
    verificacion.profesionalId,
    verificacion.prestacionId,
  );
  const local = instanteALocal(verificacion.inicio, config.zonaHoraria);
  if (!local.ok) return null;

  const huecos = await calcularHuecos(deps, {
    profesionalId: recursos.profesionalId,
    duracionMinutos: recursos.duracionMinutos,
    desde: local.valor.fecha,
    hasta: sumarDias(local.valor.fecha, 1),
    config,
    ahora,
  });
  const objetivo = verificacion.inicio.getTime();
  return huecos.find((h) => h.intervalo.inicio.getTime() === objetivo) ?? null;
}
