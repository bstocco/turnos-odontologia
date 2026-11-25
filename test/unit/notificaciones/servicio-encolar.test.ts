import { describe, expect, it, vi } from 'vitest';

import type {
  ColaNotificaciones,
  EjecutorTenant,
  EmailSender,
  EntradaCrearNotificacion,
  LoggerNotificaciones,
  NotificacionRegistrada,
  NotificacionRepositorio,
  ResolvedorContenidoEmail,
} from '../../../src/application/notificaciones/puertos.js';
import { crearNotificacionService } from '../../../src/application/notificaciones/servicio.js';
import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';

const CLINICA_ID = '11111111-1111-4111-8111-111111111111';
const TURNO_ID = '33333333-3333-4333-8333-333333333333';
const AHORA = new Date('2026-11-24T12:00:00.000Z');

function crearRepoEnMemoria(): NotificacionRepositorio {
  const filas = new Map<string, NotificacionRegistrada>();
  return {
    async crearOEncontrarIdempotente(entrada: EntradaCrearNotificacion) {
      for (const existente of filas.values()) {
        if (
          existente.clinicaId === entrada.clinicaId &&
          existente.claveIdempotencia === entrada.claveIdempotencia
        ) {
          return { creada: false, notificacion: existente };
        }
      }
      const nueva: NotificacionRegistrada = {
        id: entrada.id,
        clinicaId: entrada.clinicaId,
        turnoId: entrada.turnoId,
        canal: entrada.canal,
        tipo: entrada.tipo,
        estado: 'pendiente',
        claveIdempotencia: entrada.claveIdempotencia,
        intentos: 0,
        programadaPara: entrada.programadaPara,
        enviadaEn: null,
        error: null,
        creadaEn: AHORA,
        actualizadaEn: AHORA,
      };
      filas.set(nueva.id, nueva);
      return { creada: true, notificacion: nueva };
    },
    async buscarPorId(id) {
      return filas.get(id) ?? null;
    },
    async marcarEnviada() {
      throw new Error('No esperado en encolar');
    },
    async registrarFalloIntento() {
      throw new Error('No esperado en encolar');
    },
  };
}

function crearDependencias() {
  const repo = crearRepoEnMemoria();
  const ejecutorTenant: EjecutorTenant = {
    ejecutar: async (_clinicaId, fn) => fn(repo),
  };
  const cola: ColaNotificaciones = {
    encolar: vi.fn(async () => 'job-1'),
  };
  const emailSender: EmailSender = {
    enviar: vi.fn(async () => ({ idProveedor: 'prov-1' })),
  };
  const resolvedor: ResolvedorContenidoEmail = {
    resolver: vi.fn(async () => ({
      estado: 'listo' as const,
      mensaje: { para: 'paciente@ejemplo.com', asunto: 'Asunto', texto: 'Texto' },
    })),
  };
  const logger: LoggerNotificaciones = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return {
    repo,
    ejecutorTenant,
    cola,
    emailSender,
    resolvedor,
    logger,
    servicio: crearNotificacionService({
      ejecutorTenant,
      cola,
      emailSender,
      resolvedor,
      reloj: { ahora: () => AHORA },
      logger,
    }),
  };
}

describe('NotificacionService.encolar', () => {
  it('persiste notificación pendiente, encola payload solo-IDs sin invocar EmailSender', async () => {
    const { servicio, cola, emailSender, resolvedor } = crearDependencias();

    const resultado = await servicio.encolar({
      clinicaId: CLINICA_ID,
      turnoId: TURNO_ID,
      tipo: 'creacion',
      claveIdempotencia: 'turno-333-creacion',
    });

    expect(resultado.estado).toBe('encolada');
    if (resultado.estado !== 'encolada') expect.unreachable();
    expect(resultado.notificacion.estado).toBe('pendiente');
    expect(cola.encolar).toHaveBeenCalledTimes(1);
    expect(cola.encolar).toHaveBeenCalledWith(
      { clinicaId: CLINICA_ID, notificacionId: resultado.notificacionId },
      { singletonKey: `${CLINICA_ID}:turno-333-creacion` },
    );
    expect(emailSender.enviar).not.toHaveBeenCalled();
    expect(resolvedor.resolver).not.toHaveBeenCalled();
  });

  it('deduplica por claveIdempotencia dentro de la clínica y evita reencolar', async () => {
    const { servicio, cola } = crearDependencias();

    const primera = await servicio.encolar({
      clinicaId: CLINICA_ID,
      turnoId: TURNO_ID,
      tipo: 'confirmacion',
      claveIdempotencia: 'clave-unica',
    });
    const segunda = await servicio.encolar({
      clinicaId: CLINICA_ID,
      turnoId: TURNO_ID,
      tipo: 'confirmacion',
      claveIdempotencia: 'clave-unica',
    });

    expect(primera.estado).toBe('encolada');
    expect(segunda.estado).toBe('duplicada');
    expect(segunda.notificacionId).toBe(primera.notificacionId);
    expect(cola.encolar).toHaveBeenCalledTimes(1);
  });

  it('pasa startAfter a la cola cuando se especifica programadaPara', async () => {
    const { servicio, cola } = crearDependencias();
    const programada = new Date('2026-11-25T15:00:00.000Z');

    const resultado = await servicio.encolar({
      clinicaId: CLINICA_ID,
      turnoId: TURNO_ID,
      tipo: 'recordatorio',
      claveIdempotencia: 'rec-1',
      programadaPara: programada,
    });

    expect(resultado.estado).toBe('encolada');
    expect(cola.encolar).toHaveBeenCalledWith(
      { clinicaId: CLINICA_ID, notificacionId: resultado.notificacionId },
      { singletonKey: `${CLINICA_ID}:rec-1`, startAfter: programada },
    );
  });

  it('aísla fallos de cola o persistencia (RN-NO-03) sin lanzar excepción ni filtrar PII en logs', async () => {
    const deps = crearDependencias();
    deps.cola.encolar = vi.fn(async () => {
      throw new Error('Fallo PG para paciente@privado.com DNI 30123456');
    });

    const resultado = await deps.servicio.encolar({
      clinicaId: CLINICA_ID,
      turnoId: TURNO_ID,
      tipo: 'cancelacion',
      claveIdempotencia: 'canc-1',
    });

    expect(resultado.estado).toBe('no_encolada');
    if (resultado.estado !== 'no_encolada') expect.unreachable();
    expect(resultado.codigoError).toBe('ERROR_TRANSPORTE_COLA');
    expect(deps.logger.error).toHaveBeenCalledTimes(1);
    const llamada = JSON.stringify((deps.logger.error as ReturnType<typeof vi.fn>).mock.calls[0]);
    expect(llamada).not.toContain('paciente@privado.com');
    expect(llamada).not.toContain('30123456');
  });

  it('rechaza entradas estructuralmente inválidas antes de tocar repositorio o cola', async () => {
    const { servicio, cola } = crearDependencias();

    await expect(
      servicio.encolar({
        clinicaId: 'no-uuid',
        tipo: 'creacion',
        claveIdempotencia: 'k1',
      }),
    ).rejects.toThrowError(ErrorDeDominio);
    expect(cola.encolar).not.toHaveBeenCalled();
  });
});
