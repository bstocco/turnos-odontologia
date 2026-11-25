export type CanalNotificacion = 'email';

export type TipoNotificacion =
  'creacion' | 'confirmacion' | 'recordatorio' | 'cancelacion' | 'reprogramacion' | 'codigo';

export type EstadoNotificacion = 'pendiente' | 'enviada' | 'fallida';

/** Carga útil estricta en la cola: exclusivamente identificadores, nunca datos personales. */
export interface PayloadColaEmail {
  readonly clinicaId: string;
  readonly notificacionId: string;
}

export interface NotificacionRegistrada {
  readonly id: string;
  readonly clinicaId: string;
  readonly turnoId: string | null;
  readonly canal: CanalNotificacion;
  readonly tipo: TipoNotificacion;
  readonly estado: EstadoNotificacion;
  readonly claveIdempotencia: string;
  readonly intentos: number;
  readonly programadaPara: Date;
  readonly enviadaEn: Date | null;
  readonly error: string | null;
  readonly creadaEn: Date;
  readonly actualizadaEn: Date;
}

export interface MensajeEmail {
  readonly para: string;
  readonly asunto: string;
  readonly texto: string;
  readonly html?: string;
}

export interface ResultadoEnvioEmail {
  readonly idProveedor: string;
}

/** Puerto hexagonal de envío de correos electrónicos (sin conocimiento del proveedor SMTP/HTTP). */
export interface EmailSender {
  enviar(mensaje: MensajeEmail): Promise<ResultadoEnvioEmail>;
}

export type ResultadoResolucionEmail =
  | { readonly estado: 'listo'; readonly mensaje: MensajeEmail }
  | { readonly estado: 'descartar'; readonly codigo: string };

/**
 * Resuelve destinatario y contenido al momento del envío, permitiendo que la cola y la tabla
 * `notificacion` no almacenen direcciones de correo, nombres ni códigos en claro (Ley 25.326).
 */
export interface ResolvedorContenidoEmail {
  resolver(ctx: {
    readonly clinicaId: string;
    readonly notificacion: NotificacionRegistrada;
  }): Promise<ResultadoResolucionEmail>;
}

export interface EntradaCrearNotificacion {
  readonly id: string;
  readonly clinicaId: string;
  readonly turnoId: string | null;
  readonly canal: CanalNotificacion;
  readonly tipo: TipoNotificacion;
  readonly claveIdempotencia: string;
  readonly programadaPara: Date;
}

export interface ResultadoCrearNotificacion {
  readonly creada: boolean;
  readonly notificacion: NotificacionRegistrada;
}

export interface NotificacionRepositorio {
  crearOEncontrarIdempotente(
    entrada: EntradaCrearNotificacion,
  ): Promise<ResultadoCrearNotificacion>;
  buscarPorId(notificacionId: string): Promise<NotificacionRegistrada | null>;
  marcarEnviada(notificacionId: string, enviadaEn: Date): Promise<NotificacionRegistrada>;
  registrarFalloIntento(
    notificacionId: string,
    opciones: { readonly definitivo: boolean; readonly errorSeguro: string },
  ): Promise<NotificacionRegistrada>;
}

export interface OpcionesEncoladoCola {
  readonly singletonKey?: string;
  readonly startAfter?: Date;
}

export interface ColaNotificaciones {
  encolar(payload: PayloadColaEmail, opciones?: OpcionesEncoladoCola): Promise<string | null>;
}

export interface EjecutorTenant {
  ejecutar<T>(clinicaId: string, fn: (repo: NotificacionRepositorio) => Promise<T>): Promise<T>;
}

export interface RelojNotificaciones {
  ahora(): Date;
}

export interface LoggerNotificaciones {
  info(datos: Record<string, unknown>, mensaje: string): void;
  warn(datos: Record<string, unknown>, mensaje: string): void;
  error(datos: Record<string, unknown>, mensaje: string): void;
}
