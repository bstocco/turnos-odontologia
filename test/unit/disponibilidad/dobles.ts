import type {
  AgendaReader,
  Bloqueo,
  ConfiguracionAgenda,
  FechaLocal,
  FranjaAtencion,
  Intervalo,
  RecursosReader,
  Sillon,
} from '../../../src/domain/agenda/index.js';
import type { ProfesionalId, SillonId } from '../../../src/domain/shared/index.js';
import type { Turno } from '../../../src/domain/turno/index.js';
import type {
  CatalogoPrestacionesPuerto,
  DependenciasDeDisponibilidad,
  PrestacionLeida,
} from '../../../src/application/disponibilidad/index.js';

export const PROF = '3b1b6f0e-0000-4000-8000-000000000001';
export const PREST = '3b1b6f0e-0000-4000-8000-000000000002';
export const SILLON_1 = '3b1b6f0e-0000-4000-8000-0000000000a1' as SillonId;
export const SILLON_2 = '3b1b6f0e-0000-4000-8000-0000000000a2' as SillonId;
export const CONFIG: ConfiguracionAgenda = {
  zonaHoraria: 'America/Argentina/Buenos_Aires',
  granularidadMinutos: 15,
};

export interface EscenarioDeDobles {
  profesionalActivo: boolean | null; // null = inexistente
  prestacion: PrestacionLeida | null;
  config: ConfiguracionAgenda;
  franjas: FranjaAtencion[];
  feriados: FechaLocal[];
  bloqueos: Bloqueo[];
  turnosProfesional: Turno[];
  turnosSillones: Turno[];
  sillones: Sillon[];
  ahora: Date;
}

export function escenario(extra: Partial<EscenarioDeDobles> = {}): EscenarioDeDobles {
  return {
    profesionalActivo: true,
    prestacion: { id: PREST, nombre: 'Consulta', duracionMinutos: 30, activa: true },
    config: CONFIG,
    // Miércoles 2026-12-09 en Buenos Aires = día 3; 08:00 a 10:00.
    franjas: [{ diaSemana: 3, desdeMinutos: 480, hastaMinutos: 600 }],
    feriados: [],
    bloqueos: [],
    turnosProfesional: [],
    turnosSillones: [],
    sillones: [{ id: SILLON_1, bufferMinutos: 0, activo: true }],
    ahora: new Date('2026-12-01T12:00:00Z'),
    ...extra,
  };
}

export interface Llamadas {
  readonly agenda: string[];
  readonly recursos: string[];
  readonly prestaciones: string[];
  ventanas: Intervalo[];
}

export function dobles(e: EscenarioDeDobles): {
  deps: DependenciasDeDisponibilidad;
  llamadas: Llamadas;
} {
  const llamadas: Llamadas = { agenda: [], recursos: [], prestaciones: [], ventanas: [] };
  const recursos: RecursosReader = {
    async profesional(id) {
      llamadas.recursos.push('profesional');
      return e.profesionalActivo === null
        ? null
        : { id: id as ProfesionalId, activo: e.profesionalActivo };
    },
    async prestacion() {
      llamadas.recursos.push('prestacion');
      return null;
    },
    async sillon() {
      llamadas.recursos.push('sillon');
      return null;
    },
    async sillonesActivos() {
      llamadas.recursos.push('sillonesActivos');
      return e.sillones.filter((s) => s.activo);
    },
    async configuracionAgenda() {
      llamadas.recursos.push('configuracionAgenda');
      return e.config;
    },
  };
  const agenda: AgendaReader = {
    async franjasDeAtencion() {
      llamadas.agenda.push('franjasDeAtencion');
      return e.franjas;
    },
    async feriados() {
      llamadas.agenda.push('feriados');
      return e.feriados;
    },
    async bloqueos(_id, intervalo) {
      llamadas.agenda.push('bloqueos');
      llamadas.ventanas.push(intervalo);
      return e.bloqueos;
    },
    async turnosActivosDeProfesional() {
      llamadas.agenda.push('turnosActivosDeProfesional');
      return e.turnosProfesional;
    },
    async turnosActivosDeSillones() {
      llamadas.agenda.push('turnosActivosDeSillones');
      return e.turnosSillones;
    },
  };
  const prestaciones: CatalogoPrestacionesPuerto = {
    async listar() {
      llamadas.prestaciones.push('listar');
      return e.prestacion === null ? [] : [e.prestacion];
    },
    async obtenerPorId() {
      llamadas.prestaciones.push('obtenerPorId');
      return e.prestacion;
    },
  };
  return { deps: { prestaciones, recursos, agenda, reloj: () => e.ahora }, llamadas };
}

let secuencia = 0;
/** Turno sintético activo; `pacienteId` identificable para probar que nunca sale. */
export function turno(datos: {
  profesionalId?: string;
  sillonId?: SillonId;
  inicio: string;
  minutos: number;
  buffer?: number;
  estado?: Turno['estado'];
  id?: string;
}): Turno {
  const inicio = new Date(datos.inicio);
  const fin = new Date(inicio.getTime() + datos.minutos * 60_000);
  const buffer = datos.buffer ?? 0;
  secuencia += 1;
  return {
    id: (datos.id ??
      `aaaaaaaa-0000-4000-8000-${String(secuencia).padStart(12, '0')}`) as Turno['id'],
    pacienteId: 'bbbbbbbb-0000-4000-8000-000000000001' as Turno['pacienteId'],
    profesionalId: (datos.profesionalId ?? PROF) as ProfesionalId,
    sillonId: datos.sillonId ?? SILLON_1,
    prestacionId: PREST as Turno['prestacionId'],
    inicio,
    fin,
    bufferMinutos: buffer,
    finSillon: new Date(fin.getTime() + buffer * 60_000),
    estado: datos.estado ?? 'confirmado',
    origen: 'recepcion',
    reprogramadoDe: null,
    duracionRealMinutos: null,
    creadoEn: new Date('2026-11-01T00:00:00Z'),
    actualizadoEn: new Date('2026-11-01T00:00:00Z'),
  };
}
