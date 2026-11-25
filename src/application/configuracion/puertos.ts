import type { FechaLocal, FranjaAtencion } from '../../domain/agenda/index.js';
import type { ServicioAuditoria } from '../auditoria/index.js';

/*
 * Puertos propios de la aplicación de configuración (design D2): subconjuntos estructurales de los
 * repositorios de C-05 y del adaptador de `clinica_config`, de modo que los adaptadores existentes
 * los satisfacen sin cambios. El tenant es implícito (RLS): un id ajeno se ve como inexistente.
 */

export interface ProfesionalDto {
  readonly id: string;
  readonly nombre: string;
  readonly apellido: string;
  readonly matricula: string | null;
  readonly activo: boolean;
}

export interface SillonDto {
  readonly id: string;
  readonly nombre: string;
  readonly bufferMinutos: number;
  readonly activo: boolean;
}

export interface PrestacionDto {
  readonly id: string;
  readonly nombre: string;
  readonly duracionMinutos: number;
  readonly activa: boolean;
}

export interface FeriadoDto {
  readonly id: string;
  readonly fecha: FechaLocal;
  readonly descripcion: string;
}

export interface ConfiguracionClinica {
  readonly id: string;
  readonly nombre: string;
  readonly slug: string;
  readonly zonaHoraria: string;
  readonly reservaRequiereConfirmacion: boolean;
  readonly cancelacionAnticipacionHoras: number;
  readonly granularidadMinutos: number;
}

export interface CambiosDeConfiguracion {
  readonly reservaRequiereConfirmacion?: boolean;
  readonly cancelacionAnticipacionHoras?: number;
  readonly granularidadMinutos?: number;
}

export interface ProfesionalesPuerto {
  crear(datos: {
    readonly nombre: string;
    readonly apellido: string;
    readonly matricula?: string | null;
  }): Promise<ProfesionalDto>;
  obtenerPorId(id: string): Promise<ProfesionalDto | null>;
  listar(): Promise<readonly ProfesionalDto[]>;
  actualizar(
    id: string,
    cambios: {
      readonly nombre?: string;
      readonly apellido?: string;
      readonly matricula?: string | null;
      readonly activo?: boolean;
    },
  ): Promise<ProfesionalDto | null>;
}

export interface SillonesPuerto {
  crear(datos: { readonly nombre: string; readonly bufferMinutos?: number }): Promise<SillonDto>;
  obtenerPorId(id: string): Promise<SillonDto | null>;
  listar(): Promise<readonly SillonDto[]>;
  actualizar(
    id: string,
    cambios: {
      readonly nombre?: string;
      readonly bufferMinutos?: number;
      readonly activo?: boolean;
    },
  ): Promise<SillonDto | null>;
}

export interface PrestacionesPuerto {
  crear(datos: {
    readonly nombre: string;
    readonly duracionMinutos: number;
  }): Promise<PrestacionDto>;
  obtenerPorId(id: string): Promise<PrestacionDto | null>;
  listar(): Promise<readonly PrestacionDto[]>;
  actualizar(
    id: string,
    cambios: {
      readonly nombre?: string;
      readonly duracionMinutos?: number;
      readonly activa?: boolean;
    },
  ): Promise<PrestacionDto | null>;
}

export interface FeriadosPuerto {
  crear(fecha: FechaLocal, descripcion: string): Promise<FeriadoDto>;
  /** `true` si existía y se borró. */
  eliminar(id: string): Promise<boolean>;
  listar(): Promise<readonly FeriadoDto[]>;
}

export interface HorariosPuerto {
  franjasDeAtencion(profesionalId: string): Promise<readonly FranjaAtencion[]>;
  /** Reemplaza todas las franjas; si falla (p. ej. solape) las anteriores quedan intactas. */
  reemplazarFranjas(profesionalId: string, franjas: readonly FranjaAtencion[]): Promise<void>;
}

export interface ConfiguracionClinicaPuerto {
  /** `bloquear`: `FOR UPDATE` sobre `clinica_config` (para auditar un `antes` exacto). */
  obtener(opciones?: { readonly bloquear?: boolean }): Promise<ConfiguracionClinica>;
  actualizar(cambios: CambiosDeConfiguracion): Promise<ConfiguracionClinica>;
}

/** Solo lectura: profesional vinculado al usuario (usuario inactivo o sin vínculo -> `null`). */
export interface VinculoProfesionalPuerto {
  profesionalDelUsuario(usuarioId: string): Promise<string | null>;
}

export type { ServicioAuditoria };
