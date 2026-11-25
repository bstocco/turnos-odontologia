import type { ServicioAuditoria } from '../auditoria/index.js';

/** Ficha tal como la entrega el repositorio de pacientes (C-05); subconjunto estructural. */
export interface PacienteRegistro {
  readonly id: string;
  readonly nombre: string;
  readonly apellido: string;
  readonly dni: string;
  readonly telefono: string;
  readonly email: string | null;
  readonly obraSocial: string | null;
  readonly creadoEn: Date;
}

export interface NuevoPacienteDatos {
  readonly nombre: string;
  readonly apellido: string;
  readonly dni: string;
  readonly telefono: string;
  readonly email?: string | null | undefined;
  readonly obraSocial?: string | null | undefined;
}

export interface CambiosDePacienteDatos {
  readonly nombre?: string;
  readonly apellido?: string;
  readonly dni?: string;
  readonly telefono?: string;
  readonly email?: string | null;
  readonly obraSocial?: string | null;
}

/** Subconjunto estructural de `PacienteRepository` (C-05): la infraestructura lo satisface. */
export interface PacientesPuerto {
  crear(datos: NuevoPacienteDatos): Promise<PacienteRegistro>;
  obtenerPorId(id: string): Promise<PacienteRegistro | null>;
  buscarPorDni(dni: string): Promise<PacienteRegistro | null>;
  buscarPorApellido(prefijo: string, limite: number): Promise<readonly PacienteRegistro[]>;
  actualizar(id: string, cambios: CambiosDePacienteDatos): Promise<PacienteRegistro | null>;
}

/** Solo lectura: alcance del odontólogo por turnos activos con su profesional (design D4/D5). */
export interface AccesoPacientesPuerto {
  esPacienteDeProfesional(pacienteId: string, profesionalId: string): Promise<boolean>;
  buscarPorDniDeProfesional(dni: string, profesionalId: string): Promise<PacienteRegistro | null>;
  buscarPorApellidoDeProfesional(
    prefijo: string,
    profesionalId: string,
    limite: number,
  ): Promise<readonly PacienteRegistro[]>;
}

/** Solo lectura: profesional vinculado al usuario (inactivo, inexistente o sin vínculo -> `null`). */
export interface VinculoProfesionalPuerto {
  profesionalDelUsuario(usuarioId: string): Promise<string | null>;
}

/** Ficha completa (design D10). */
export interface PacienteDto {
  readonly id: string;
  readonly nombre: string;
  readonly apellido: string;
  readonly dni: string;
  readonly telefono: string;
  readonly email: string | null;
  readonly obraSocial: string | null;
  /** ISO-8601 UTC. */
  readonly creadoEn: string;
}

/** Elemento de la lista de búsqueda: mínimo necesario (design D8). */
export interface PacienteResumenDto {
  readonly id: string;
  readonly nombre: string;
  readonly apellido: string;
  readonly dni: string;
}

export interface DependenciasDePacientes {
  readonly pacientes: PacientesPuerto;
  readonly acceso: AccesoPacientesPuerto;
  readonly vinculo: VinculoProfesionalPuerto;
  readonly auditoria: ServicioAuditoria;
}

export type { ServicioAuditoria };
