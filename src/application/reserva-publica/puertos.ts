import type { AgendaReader, RecursosReader } from '../../domain/agenda/index.js';
import type {
  CryptoComunicacion,
  PropositoTokenAccion,
  RegistroCodigoVerificacion,
  RegistroTokenAccion,
} from '../../domain/comunicacion/index.js';
import type { SillonId, TurnoId } from '../../domain/shared/ids.js';
import type {
  EstadoTurno,
  NuevoTurnoValidado,
  Turno,
  TurnoEventPublisher,
} from '../../domain/turno/index.js';
import type { ServicioAuditoria } from '../auditoria/puertos.js';
import type {
  EmailSender,
  LoggerNotificaciones,
  NotificacionRepositorio,
  RelojNotificaciones,
} from '../notificaciones/puertos.js';

/** Configuración relevante de la clínica para la reserva pública y las cancelaciones. */
export interface ConfiguracionClinicaPublica {
  readonly id: string;
  readonly nombre: string;
  readonly slug: string;
  readonly zonaHoraria: string;
  readonly reservaRequiereConfirmacion: boolean;
  readonly cancelacionAnticipacionHoras: number;
  readonly granularidadMinutos: number;
}

export interface PrestacionPublicaLeida {
  readonly id: string;
  readonly nombre: string;
  readonly duracionMinutos: number;
  readonly activa: boolean;
}

export interface CatalogoPrestacionPublica {
  obtenerPorId(id: string): Promise<PrestacionPublicaLeida | null>;
}

export interface CodigoVerificacionRegistro extends RegistroCodigoVerificacion {
  readonly id: string;
  readonly clinicaId: string;
  readonly email: string;
  readonly creadoEn: Date;
}

export interface NuevoCodigoVerificacion {
  readonly id: string;
  readonly email: string;
  readonly hashCodigo: string;
  readonly venceEn: Date;
}

export interface CodigoVerificacionRepositorio {
  invalidarPendientesPorEmail(email: string, ahora: Date): Promise<void>;
  insertar(entrada: NuevoCodigoVerificacion): Promise<CodigoVerificacionRegistro>;
  obtenerUltimoParaActualizar(email: string): Promise<CodigoVerificacionRegistro | null>;
  obtenerPorIdParaActualizar(id: string): Promise<CodigoVerificacionRegistro | null>;
  actualizarIntentos(id: string, intentos: number): Promise<void>;
  marcarConsumido(id: string, consumidoEn: Date): Promise<void>;
}

export interface TokenAccionRegistro extends RegistroTokenAccion {
  readonly id: string;
  readonly clinicaId: string;
  readonly turnoId: TurnoId;
  readonly creadoEn: Date;
}

export interface NuevoTokenAccion {
  readonly id: string;
  readonly turnoId: TurnoId;
  readonly proposito: PropositoTokenAccion;
  readonly hashToken: string;
  readonly venceEn: Date;
}

export interface TokenAccionRepositorio {
  insertar(entrada: NuevoTokenAccion): Promise<TokenAccionRegistro>;
  obtenerPorHashParaActualizar(hashToken: string): Promise<TokenAccionRegistro | null>;
  marcarUsado(id: string, usadoEn: Date): Promise<void>;
}

export interface PacientePublicoRegistro {
  readonly id: string;
  readonly nombre: string;
  readonly apellido: string;
  readonly dni: string;
  readonly telefono: string;
  readonly email: string | null;
  readonly obraSocial: string | null;
}

export interface NuevoPacientePublico {
  readonly nombre: string;
  readonly apellido: string;
  readonly dni: string;
  readonly telefono: string;
  readonly email: string;
  readonly obraSocial: string | null;
}

export interface PacientePublicoRepositorio {
  buscarPorDni(dni: string): Promise<PacientePublicoRegistro | null>;
  crearConManejoDeDuplicado(
    datos: NuevoPacientePublico,
  ): Promise<{ readonly paciente: PacientePublicoRegistro; readonly creado: boolean }>;
  completarEmailSiNulo(pacienteId: string, email: string): Promise<PacientePublicoRegistro | null>;
}

export interface Po09Repositorio {
  bloquearIdentidad(clinicaId: string, dni: string, email: string): Promise<void>;
  contarReservasPublicasActivas(dni: string, email: string, ahora: Date): Promise<number>;
}

export interface TurnoReservaPublicaRepositorio {
  insertarConReintentoSillon(
    sillonesOrdenados: readonly SillonId[],
    construirTurno: (sillonId: SillonId) => NuevoTurnoValidado,
  ): Promise<Turno>;
}

export interface TurnoAccionRepositorio {
  obtenerPorIdParaActualizar(turnoId: TurnoId): Promise<Turno | null>;
  actualizarEstado(turno: Turno, estadoEsperado: EstadoTurno): Promise<Turno>;
}

export interface ContextoSolicitudCodigo {
  readonly nombreClinica: string;
  readonly codigos: CodigoVerificacionRepositorio;
  readonly notificaciones: NotificacionRepositorio;
}

export interface EjecutorSolicitudCodigo {
  iniciarEmision<T>(
    clinicaId: string,
    fn: (ctx: ContextoSolicitudCodigo) => Promise<T>,
  ): Promise<T>;
  finalizarNotificacion<T>(
    clinicaId: string,
    fn: (notificaciones: NotificacionRepositorio) => Promise<T>,
  ): Promise<T>;
}

export interface ContextoReservaPublica {
  readonly codigos: CodigoVerificacionRepositorio;
  readonly clinicaConfig: ConfiguracionClinicaPublica;
  readonly recursos: RecursosReader;
  readonly agenda: AgendaReader;
  readonly prestaciones: CatalogoPrestacionPublica;
  readonly pacientes: PacientePublicoRepositorio;
  readonly po09: Po09Repositorio;
  readonly turnos: TurnoReservaPublicaRepositorio;
  readonly auditoria: ServicioAuditoria;
}

export interface EjecutorReservaPublica {
  verificarOtp<T>(
    clinicaId: string,
    fn: (codigos: CodigoVerificacionRepositorio) => Promise<T>,
  ): Promise<T>;
  reservar<T>(clinicaId: string, fn: (ctx: ContextoReservaPublica) => Promise<T>): Promise<T>;
}

export interface ContextoProveedorEnlaces {
  readonly inicioTurno: Date | null;
  readonly tokens: TokenAccionRepositorio;
}

export interface EjecutorProveedorEnlaces {
  ejecutar<T>(
    clinicaId: string,
    turnoId: string,
    fn: (ctx: ContextoProveedorEnlaces) => Promise<T>,
  ): Promise<T>;
}

export type ResolvedorClinicaPorHashToken = (hashToken: string) => Promise<string | null>;

export interface ContextoAccionPublica {
  readonly clinicaConfig: ConfiguracionClinicaPublica;
  readonly tokens: TokenAccionRepositorio;
  readonly turnos: TurnoAccionRepositorio;
  readonly auditoria: ServicioAuditoria;
}

export interface EjecutorAccionPublica {
  ejecutar<T>(clinicaId: string, fn: (ctx: ContextoAccionPublica) => Promise<T>): Promise<T>;
}

export interface DependenciasSolicitudCodigo {
  readonly ejecutor: EjecutorSolicitudCodigo;
  readonly emailSender: EmailSender;
  readonly crypto: CryptoComunicacion;
  readonly reloj: RelojNotificaciones;
  readonly logger: LoggerNotificaciones;
  readonly generarId?: () => string;
}

export interface DependenciasReservaPublica {
  readonly ejecutor: EjecutorReservaPublica;
  readonly crypto: CryptoComunicacion;
  readonly reloj: RelojNotificaciones;
  readonly publicadorPorClinica?: (clinicaId: string) => TurnoEventPublisher;
  readonly logger: LoggerNotificaciones;
}

export interface DependenciasProveedorEnlaces {
  readonly ejecutor: EjecutorProveedorEnlaces;
  readonly publicBaseUrl: string;
  readonly crypto: CryptoComunicacion;
  readonly reloj: RelojNotificaciones;
  readonly generarId?: () => string;
}

export interface DependenciasAccionPublica {
  readonly resolverClinicaPorHashToken: ResolvedorClinicaPorHashToken;
  readonly ejecutor: EjecutorAccionPublica;
  readonly crypto: CryptoComunicacion;
  readonly reloj: RelojNotificaciones;
  readonly publicadorPorClinica?: (clinicaId: string) => TurnoEventPublisher;
  readonly logger: LoggerNotificaciones;
}
