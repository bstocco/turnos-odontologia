import { describe, expect, it, vi } from 'vitest';

import { ErrorDeEnvioEmail } from '../../../src/application/notificaciones/errores.js';
import type {
  ColaNotificaciones,
  EjecutorTenant,
  EmailSender,
  LoggerNotificaciones,
  NotificacionRegistrada,
  NotificacionRepositorio,
  ResolvedorContenidoEmail,
} from '../../../src/application/notificaciones/puertos.js';
import { crearNotificacionService } from '../../../src/application/notificaciones/servicio.js';

const CLINICA_ID = '11111111-1111-4111-8111-111111111111';
const NOTIFICACION_ID = '22222222-2222-4222-8222-222222222222';
const TURNO_ID = '33333333-3333-4333-8333-333333333333';
const AHORA = new Date('2026-11-24T12:00:00.000Z');

function notificacionBase(overrides: Partial<NotificacionRegistrada> = {}): NotificacionRegistrada {
  return {
    id: NOTIFICACION_ID,
    clinicaId: CLINICA_ID,
    turnoId: TURNO_ID,
    canal: 'email',
    tipo: 'creacion',
    estado: 'pendiente',
    claveIdempotencia: 'clave-1',
    intentos: 0,
    programadaPara: AHORA,
    enviadaEn: null,
    error: null,
    creadaEn: AHORA,
    actualizadaEn: AHORA,
    ...overrides,
  };
}

function crearEscenario(inicial: NotificacionRegistrada | null) {
  let registro = inicial;
  const eventos: string[] = [];

  const repo: NotificacionRepositorio = {
    async crearOEncontrarIdempotente() {
      throw new Error('No esperado');
    },
    async buscarPorId() {
      return registro;
    },
    async marcarEnviada(_id, enviadaEn) {
      if (registro === null) throw new Error('Ausente');
      registro = {
        ...registro,
        estado: 'enviada',
        intentos: registro.intentos + 1,
        enviadaEn,
        error: null,
        actualizadaEn: enviadaEn,
      };
      return registro;
    },
    async registrarFalloIntento(_id, opciones) {
      if (registro === null) throw new Error('Ausente');
      registro = {
        ...registro,
        estado: opciones.definitivo ? 'fallida' : 'pendiente',
        intentos: registro.intentos + 1,
        error: opciones.errorSeguro,
        actualizadaEn: AHORA,
      };
      return registro;
    },
  };

  const ejecutorTenant: EjecutorTenant = {
    async ejecutar(_clinicaId, fn) {
      eventos.push('tx:inicio');
      const r = await fn(repo);
      eventos.push('tx:fin');
      return r;
    },
  };

  const cola: ColaNotificaciones = { encolar: vi.fn(async () => 'job-1') };
  const emailSender: EmailSender = {
    enviar: vi.fn(async () => {
      eventos.push('email:enviar');
      return { idProveedor: 'msg-123' };
    }),
  };
  const resolvedor: ResolvedorContenidoEmail = {
    resolver: vi.fn(async () => ({
      estado: 'listo' as const,
      mensaje: { para: 'paciente@ejemplo.com', asunto: 'Turno', texto: 'Confirmado' },
    })),
  };
  const logger: LoggerNotificaciones = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const servicio = crearNotificacionService({
    ejecutorTenant,
    cola,
    emailSender,
    resolvedor,
    reloj: { ahora: () => AHORA },
    logger,
  });

  return {
    servicio,
    emailSender,
    resolvedor,
    eventos,
    obtenerRegistro: () => registro,
  };
}

describe('NotificacionService.procesarTrabajo', () => {
  it('envía fuera de la transacción de DB y marca la notificación como enviada', async () => {
    const esc = crearEscenario(notificacionBase());

    const res = await esc.servicio.procesarTrabajo(
      { clinicaId: CLINICA_ID, notificacionId: NOTIFICACION_ID },
      { intentoActual: 1, maxIntentos: 5 },
    );

    expect(res).toEqual({ accion: 'enviada', idProveedor: 'msg-123' });
    expect(esc.obtenerRegistro()?.estado).toBe('enviada');
    expect(esc.obtenerRegistro()?.intentos).toBe(1);
    expect(esc.obtenerRegistro()?.enviadaEn).toEqual(AHORA);
    expect(esc.obtenerRegistro()?.error).toBeNull();
    // La transacción de lectura debe cerrarse antes de la llamada de red a EmailSender
    expect(esc.eventos).toEqual(['tx:inicio', 'tx:fin', 'email:enviar', 'tx:inicio', 'tx:fin']);
  });

  it('cortocircuita de forma idempotente si la notificación ya está enviada', async () => {
    const esc = crearEscenario(
      notificacionBase({ estado: 'enviada', intentos: 1, enviadaEn: AHORA }),
    );

    const res = await esc.servicio.procesarTrabajo(
      { clinicaId: CLINICA_ID, notificacionId: NOTIFICACION_ID },
      { intentoActual: 2, maxIntentos: 5 },
    );

    expect(res).toEqual({ accion: 'omitida', motivo: 'ya_enviada' });
    expect(esc.emailSender.enviar).not.toHaveBeenCalled();
    expect(esc.resolvedor.resolver).not.toHaveBeenCalled();
    expect(esc.obtenerRegistro()?.intentos).toBe(1);
  });

  it('mantiene estado pendiente y pide reintento ante error transitorio con intentos disponibles', async () => {
    const esc = crearEscenario(notificacionBase());
    esc.emailSender.enviar = vi.fn(async () => {
      throw new ErrorDeEnvioEmail('EMAIL_TIMEOUT', true, 'Timeout SMTP');
    });

    const res = await esc.servicio.procesarTrabajo(
      { clinicaId: CLINICA_ID, notificacionId: NOTIFICACION_ID },
      { intentoActual: 1, maxIntentos: 5 },
    );

    expect(res).toEqual({ accion: 'reintentar', codigo: 'EMAIL_TIMEOUT' });
    expect(esc.obtenerRegistro()?.estado).toBe('pendiente');
    expect(esc.obtenerRegistro()?.intentos).toBe(1);
    expect(esc.obtenerRegistro()?.error).toBe('EMAIL_TIMEOUT');
  });

  it('marca fallida cuando se agotan los reintentos de un error transitorio', async () => {
    const esc = crearEscenario(notificacionBase({ intentos: 4 }));
    esc.emailSender.enviar = vi.fn(async () => {
      throw new ErrorDeEnvioEmail('EMAIL_RED', true, 'Error de red');
    });

    const res = await esc.servicio.procesarTrabajo(
      { clinicaId: CLINICA_ID, notificacionId: NOTIFICACION_ID },
      { intentoActual: 5, maxIntentos: 5 },
    );

    expect(res).toEqual({ accion: 'fallida_definitiva', codigo: 'EMAIL_RED' });
    expect(esc.obtenerRegistro()?.estado).toBe('fallida');
    expect(esc.obtenerRegistro()?.intentos).toBe(5);
    expect(esc.obtenerRegistro()?.error).toBe('EMAIL_RED');
  });

  it('marca fallida de inmediato ante error permanente sin agotar reintentos', async () => {
    const esc = crearEscenario(notificacionBase());
    esc.emailSender.enviar = vi.fn(async () => {
      throw new ErrorDeEnvioEmail('EMAIL_DESTINATARIO_RECHAZADO', false, 'Destinatario inválido');
    });

    const res = await esc.servicio.procesarTrabajo(
      { clinicaId: CLINICA_ID, notificacionId: NOTIFICACION_ID },
      { intentoActual: 1, maxIntentos: 5 },
    );

    expect(res).toEqual({
      accion: 'fallida_definitiva',
      codigo: 'EMAIL_DESTINATARIO_RECHAZADO',
    });
    expect(esc.obtenerRegistro()?.estado).toBe('fallida');
    expect(esc.obtenerRegistro()?.intentos).toBe(1);
  });

  it('marca fallida si el resolvedor descarta el envío y no llama a EmailSender', async () => {
    const esc = crearEscenario(notificacionBase());
    esc.resolvedor.resolver = vi.fn(async () => ({
      estado: 'descartar' as const,
      codigo: 'TURNO_YA_CANCELADO',
    }));

    const res = await esc.servicio.procesarTrabajo(
      { clinicaId: CLINICA_ID, notificacionId: NOTIFICACION_ID },
      { intentoActual: 1, maxIntentos: 5 },
    );

    expect(res).toEqual({ accion: 'fallida_definitiva', codigo: 'TURNO_YA_CANCELADO' });
    expect(esc.emailSender.enviar).not.toHaveBeenCalled();
    expect(esc.obtenerRegistro()?.estado).toBe('fallida');
    expect(esc.obtenerRegistro()?.error).toBe('TURNO_YA_CANCELADO');
  });

  it('sanea errores inesperados sin exponer PII en notificacion.error ni rechaza payloads inválidos', async () => {
    const esc = crearEscenario(notificacionBase());
    esc.emailSender.enviar = vi.fn(async () => {
      throw new Error('Crash con secreto@dominio.com y DNI 35111222');
    });

    const res = await esc.servicio.procesarTrabajo(
      { clinicaId: CLINICA_ID, notificacionId: NOTIFICACION_ID },
      { intentoActual: 1, maxIntentos: 3 },
    );

    expect(res).toEqual({ accion: 'reintentar', codigo: 'ERROR_PROVEEDOR_EMAIL' });
    expect(esc.obtenerRegistro()?.error).toBe('ERROR_PROVEEDOR_EMAIL');

    const invalido = await esc.servicio.procesarTrabajo(
      { clinicaId: CLINICA_ID, notificacionId: NOTIFICACION_ID, email: 'leak@test.com' },
      { intentoActual: 1, maxIntentos: 3 },
    );
    expect(invalido).toEqual({
      accion: 'fallida_definitiva',
      codigo: 'PAYLOAD_NOTIFICACION_INVALIDO',
    });
  });
});
