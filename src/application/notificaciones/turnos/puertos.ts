import type { EstadoTurno } from '../../../domain/turno/index.js';
import type { TipoNotificacion } from '../puertos.js';

export interface DatosNotificacionTurno {
  readonly turnoId: string;
  readonly clinicaId: string;
  readonly clinicaNombre: string;
  readonly clinicaZonaHoraria: string;
  readonly estadoTurno: EstadoTurno;
  readonly inicio: Date;
  readonly inicioAnterior: Date | null;
  readonly pacienteNombre: string;
  readonly pacienteApellido: string;
  readonly pacienteEmail: string | null;
  readonly profesionalNombre: string;
  readonly profesionalApellido: string;
  readonly prestacionNombre: string;
}

/**
 * Lee al vuelo dentro de `withTenant(clinicaId)` la proyección necesaria para resolver el correo
 * de una notificación de turno sin persistir PII en la cola (Ley 25.326).
 */
export interface LectorDatosNotificacionTurno {
  obtenerPorTurnoId(clinicaId: string, turnoId: string): Promise<DatosNotificacionTurno | null>;
}

export interface EnlacesTurno {
  readonly enlaceConfirmar?: string;
  readonly enlaceCancelar?: string;
}

export interface ContextoEnlacesTurno {
  readonly clinicaId: string;
  readonly turnoId: string;
  readonly tipo: Exclude<TipoNotificacion, 'codigo'>;
  readonly estadoTurno: EstadoTurno;
}

/**
 * Puerto opcional preparado para `C-15`: provee enlaces públicos de confirmación o cancelación
 * al momento de renderizar la plantilla de correo.
 */
export interface ProveedorEnlacesTurno {
  obtenerEnlaces(ctx: ContextoEnlacesTurno): Promise<EnlacesTurno>;
}

export interface ClinicaActivaRecordatorio {
  readonly id: string;
  readonly zonaHoraria: string;
}

export interface CatalogoClinicasActivas {
  listarActivas(): Promise<readonly ClinicaActivaRecordatorio[]>;
}

export interface VentanaRecordatorio {
  readonly desdeExclusivo: Date;
  readonly hastaInclusivo: Date;
}

export interface BuscadorTurnosRecordatorio {
  buscarElegiblesEnVentana(
    clinicaId: string,
    ventana: VentanaRecordatorio,
  ): Promise<readonly string[]>;
}

export interface ResultadoCicloRecordatorios {
  readonly clinicasProcesadas: number;
  readonly clinicasConError: number;
  readonly recordatoriosEncolados: number;
  readonly duplicados: number;
  readonly fallosEncolado: number;
}
