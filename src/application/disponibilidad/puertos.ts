import type { AgendaReader, RecursosReader } from '../../domain/agenda/index.js';

/*
 * Puertos propios de la consulta pública (C-13, design D2). Son estructurales: los repositorios de
 * C-05 (`PrestacionRepository`, `ProfesionalRepository`) y de C-09 (`AgendaReader`) los satisfacen
 * sin cambios. La aplicación no importa `infrastructure/` ni `interfaces/`.
 */

/** Lectura de prestaciones con lo mínimo que la consulta pública necesita. */
export interface PrestacionLeida {
  readonly id: string;
  readonly nombre: string;
  readonly duracionMinutos: number;
  readonly activa: boolean;
}

export interface ProfesionalLeido {
  readonly id: string;
  readonly nombre: string;
  readonly apellido: string;
  readonly activo: boolean;
}

export interface CatalogoPrestacionesPuerto {
  listar(): Promise<readonly PrestacionLeida[]>;
  obtenerPorId(id: string): Promise<PrestacionLeida | null>;
}

export interface CatalogoProfesionalesPuerto {
  listar(): Promise<readonly ProfesionalLeido[]>;
}

/** Reloj inyectable: la hora actual la decide quien compone, no la aplicación. */
export type Reloj = () => Date;

export interface DependenciasDeCatalogo {
  readonly prestaciones: CatalogoPrestacionesPuerto;
  readonly profesionales: CatalogoProfesionalesPuerto;
}

export interface DependenciasDeDisponibilidad {
  readonly prestaciones: CatalogoPrestacionesPuerto;
  readonly recursos: RecursosReader;
  readonly agenda: AgendaReader;
  readonly reloj: Reloj;
}

/** Elemento público del catálogo de prestaciones (lista blanca, design D4). */
export interface PrestacionPublica {
  readonly id: string;
  readonly nombre: string;
  readonly duracionMinutos: number;
}

/** Elemento público del catálogo de profesionales (lista blanca, design D4). */
export interface ProfesionalPublico {
  readonly id: string;
  readonly nombre: string;
  readonly apellido: string;
}

export interface ConsultaDeDisponibilidad {
  readonly profesionalId: string;
  readonly prestacionId: string;
  /** Fecha local `AAAA-MM-DD` de la clínica. */
  readonly desde: string;
  readonly hasta: string;
}

/** Salida pública: nunca lleva sillones, pacientes ni turnos. */
export interface DisponibilidadPublica {
  readonly zonaHoraria: string;
  readonly profesionalId: string;
  readonly prestacionId: string;
  readonly desde: string;
  readonly hasta: string;
  readonly huecos: readonly { readonly inicio: string; readonly fin: string }[];
}

export interface VerificacionDeHueco {
  readonly profesionalId: string;
  readonly prestacionId: string;
  readonly inicio: Date;
}
