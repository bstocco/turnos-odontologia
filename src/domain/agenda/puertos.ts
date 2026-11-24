import type { PrestacionId, ProfesionalId, SillonId } from '../shared/ids.js';
import type { Turno } from '../turno/turno.js';
import type { Intervalo } from './intervalo.js';
import type { FechaLocal } from './zona-horaria.js';

/*
 * Puertos de lectura de la agenda. CONTRATO CONGELADO (regla dura 14): no cambiar firmas ni agregar
 * operaciones sin PR del dueño de C-02 y aviso a C-05, C-09, C-12 y C-13.
 *
 * Tenant implícito: ninguna operación recibe `clinicaId`. El adaptador opera dentro de `withTenant`
 * (RLS), así que un recurso de otra clínica se ve como inexistente (`null`) o ausente (regla 12).
 */

/** Franja de atención semanal: `diaSemana` 0 = domingo ... 6 = sábado; horas locales en minutos (0-1440). */
export interface FranjaAtencion {
  readonly diaSemana: number;
  readonly desdeMinutos: number;
  readonly hastaMinutos: number;
}

export interface Bloqueo {
  readonly id: string;
  readonly profesionalId: ProfesionalId;
  readonly intervalo: Intervalo;
}

export interface Sillon {
  readonly id: SillonId;
  readonly bufferMinutos: number;
  readonly activo: boolean;
}

export interface Prestacion {
  readonly id: PrestacionId;
  readonly duracionMinutos: number;
}

export interface Profesional {
  readonly id: ProfesionalId;
  readonly activo: boolean;
}

export interface ConfiguracionAgenda {
  /** Identificador IANA, p. ej. `America/Argentina/Buenos_Aires`. */
  readonly zonaHoraria: string;
  /** Entero positivo que divide 1440 (por defecto 15). */
  readonly granularidadMinutos: number;
}

/** Lectura de ocupación y calendario. Solo devuelve turnos activos (RN-AG-09). */
export interface AgendaReader {
  franjasDeAtencion(profesionalId: ProfesionalId): Promise<readonly FranjaAtencion[]>;
  /** Feriados de la clínica con fecha en `[desde, hasta)`. */
  feriados(desde: FechaLocal, hasta: FechaLocal): Promise<readonly FechaLocal[]>;
  /** Bloqueos del profesional que intersectan el intervalo. */
  bloqueos(profesionalId: ProfesionalId, intervalo: Intervalo): Promise<readonly Bloqueo[]>;
  /** Turnos activos del profesional cuyo rango de profesional intersecta el intervalo. */
  turnosActivosDeProfesional(
    profesionalId: ProfesionalId,
    intervalo: Intervalo,
  ): Promise<readonly Turno[]>;
  /**
   * Turnos activos, de cualquier profesional, cuyo rango de SILLÓN (incluye buffer) intersecta el
   * intervalo. El adaptador debe ensanchar la consulta; el dominio no lo hace.
   */
  turnosActivosDeSillones(
    sillonIds: readonly SillonId[],
    intervalo: Intervalo,
  ): Promise<readonly Turno[]>;
}

/** Lectura de recursos de la clínica. Un recurso inexistente o ajeno se devuelve como `null`. */
export interface RecursosReader {
  profesional(id: ProfesionalId): Promise<Profesional | null>;
  prestacion(id: PrestacionId): Promise<Prestacion | null>;
  sillon(id: SillonId): Promise<Sillon | null>;
  sillonesActivos(): Promise<readonly Sillon[]>;
  configuracionAgenda(): Promise<ConfiguracionAgenda>;
}
