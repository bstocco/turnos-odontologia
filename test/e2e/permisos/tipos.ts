import type { ClinicaConfigurada } from '../soporte/puesta-en-marcha.js';
import type { ClinicaSintetica, UsuarioSintetico } from '../soporte/clinica.js';
import type { EntornoE2E } from '../soporte/entorno.js';
import type { Sesion } from '../soporte/sesion.js';

export type RolDePersonal = 'administrador' | 'recepcionista' | 'odontologo';
export type Esperado = 'permitido' | 'permitido_con_alcance' | 'prohibido';

export type Actor = 'anonimo' | RolDePersonal | 'otra_clinica';

export interface PedidoDePrueba {
  readonly metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly url: string;
  readonly payload?: unknown;
}

/** Recursos de la clínica de matriz (A) y datos de otra clínica (B) para las celdas. */
export interface Mundo {
  readonly entorno: EntornoE2E;
  readonly a: ClinicaConfigurada;
  readonly b: ClinicaSintetica;
  readonly sesiones: Readonly<Record<RolDePersonal, Sesion>>;
  readonly sesionOtraClinica: Sesion;
  readonly usuarioOdontologo: UsuarioSintetico;
  /** Paciente con un turno activo con el profesional del odontólogo de matriz. */
  readonly pacienteDelOdontologo: { readonly id: string; readonly dni: string };
  /** Paciente de la clínica sin turnos con el odontólogo de matriz. */
  readonly pacienteAjeno: { readonly id: string; readonly dni: string };
  /** Otro profesional de la clínica (no vinculado al odontólogo de matriz). */
  readonly profesionalAjenoId: string;
  /** Recursos nuevos por caso (las celdas que modifican o eliminan no dependen del orden). */
  readonly nuevo: {
    profesional(): Promise<string>;
    sillon(): Promise<string>;
    prestacion(): Promise<string>;
    feriado(): Promise<string>;
    /** Fecha libre para el alta de un feriado dentro de la prueba de la celda. */
    fechaDeFeriado(): string;
    paciente(): Promise<string>;
    usuario(): Promise<string>;
  };
  /** Credenciales válidas para login (usuario de la clínica A). */
  credencialesDeLogin(): Promise<{ slug: string; email: string; password: string }>;
  /** Un token de refresco emitido y válido de la clínica A. */
  refrescoNuevo(): Promise<string>;
}

export interface Defecto {
  readonly motivo: string;
  /** Hallazgo del informe del change (F1 a F5) y change responsable. */
  readonly change: string;
  /** Actores cuya celda difiere; por defecto, todos los autenticados. */
  readonly actores?: readonly Actor[];
}

export interface FilaDeMatriz {
  readonly tipo: 'personal' | 'publica' | 'interna';
  readonly roles?: Readonly<Record<RolDePersonal, Esperado>>;
  /** Verifica que un administrador de otra clínica reciba 404 sobre un recurso de A. */
  readonly conId?: boolean;
  /** Para `publica`: comparar el cuerpo completo (por defecto) o solo el estado. */
  readonly comparacion?: 'cuerpo' | 'estado';
  readonly pedido: (mundo: Mundo) => Promise<PedidoDePrueba>;
  /** Para `permitido_con_alcance`: afirma que el odontólogo no obtiene lo ajeno. */
  readonly alcance?: (mundo: Mundo) => Promise<void>;
  readonly defecto?: Defecto;
}
