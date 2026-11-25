import { describe, expect, it, vi } from 'vitest';

import type { NotificacionRegistrada } from '../../../src/application/notificaciones/index.js';
import type {
  DatosNotificacionTurno,
  LectorDatosNotificacionTurno,
  ProveedorEnlacesTurno,
} from '../../../src/application/notificaciones/turnos/puertos.js';
import { crearResolvedorContenidoTurno } from '../../../src/application/notificaciones/turnos/resolvedor-turno.js';

const CLINICA_ID = '11111111-1111-4111-8111-111111111111';
const TURNO_ID = '99999999-9999-4999-8999-999999999999';

function crearDatosTurno(overrides: Partial<DatosNotificacionTurno> = {}): DatosNotificacionTurno {
  return {
    turnoId: TURNO_ID,
    clinicaId: CLINICA_ID,
    clinicaNombre: 'Odonto Centro',
    clinicaZonaHoraria: 'America/Argentina/Buenos_Aires',
    estadoTurno: 'pendiente_confirmacion',
    inicio: new Date('2026-12-10T14:30:00.000Z'), // 11:30 en America/Argentina/Buenos_Aires (-03:00)
    inicioAnterior: null,
    pacienteNombre: 'Lucía',
    pacienteApellido: 'Gómez',
    pacienteEmail: 'lucia.sintetica@ejemplo.test',
    profesionalNombre: 'Martín',
    profesionalApellido: 'Acosta',
    prestacionNombre: 'Limpieza dental',
    ...overrides,
  };
}

function crearNotificacion(
  overrides: Partial<NotificacionRegistrada> = {},
): NotificacionRegistrada {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    clinicaId: CLINICA_ID,
    turnoId: TURNO_ID,
    canal: 'email',
    tipo: 'creacion',
    estado: 'pendiente',
    claveIdempotencia: `turno:${TURNO_ID}:creacion`,
    intentos: 0,
    programadaPara: new Date('2026-12-09T12:00:00.000Z'),
    enviadaEn: null,
    error: null,
    creadaEn: new Date('2026-12-09T12:00:00.000Z'),
    actualizadaEn: new Date('2026-12-09T12:00:00.000Z'),
    ...overrides,
  };
}

describe('crearResolvedorContenidoTurno', () => {
  it('resuelve plantillas de creacion, confirmacion, cancelacion, reprogramacion y recordatorio en la zona IANA de la clínica', async () => {
    const datos = crearDatosTurno({
      estadoTurno: 'confirmado',
      inicioAnterior: new Date('2026-12-08T13:00:00.000Z'), // 10:00 ART
    });
    const lector: LectorDatosNotificacionTurno = {
      obtenerPorTurnoId: vi.fn().mockResolvedValue(datos),
    };
    const proveedorEnlaces: ProveedorEnlacesTurno = {
      obtenerEnlaces: vi.fn().mockResolvedValue({
        enlaceConfirmar: 'https://clinica.example/confirmar/tok1',
        enlaceCancelar: 'https://clinica.example/cancelar/tok2',
      }),
    };

    const resolvedor = crearResolvedorContenidoTurno({
      lector,
      reloj: { ahora: () => new Date('2026-12-09T12:00:00.000Z') },
      proveedorEnlaces,
    });

    const resCreacion = await resolvedor.resolver({
      clinicaId: CLINICA_ID,
      notificacion: crearNotificacion({ tipo: 'creacion' }),
    });
    expect(resCreacion.estado).toBe('listo');
    if (resCreacion.estado !== 'listo') expect.unreachable();
    expect(resCreacion.mensaje.para).toBe('lucia.sintetica@ejemplo.test');
    expect(resCreacion.mensaje.asunto).toContain('Odonto Centro');
    expect(resCreacion.mensaje.asunto).toContain('10/12/2026 a las 11:30');
    expect(resCreacion.mensaje.texto).toContain('Hola Lucía Gómez');
    expect(resCreacion.mensaje.texto).toContain('Martín Acosta');
    expect(resCreacion.mensaje.texto).toContain('Limpieza dental');
    expect(resCreacion.mensaje.texto).toContain('https://clinica.example/confirmar/tok1');
    expect(resCreacion.mensaje.texto).toContain('https://clinica.example/cancelar/tok2');

    const resConfirmacion = await resolvedor.resolver({
      clinicaId: CLINICA_ID,
      notificacion: crearNotificacion({ tipo: 'confirmacion' }),
    });
    expect(resConfirmacion.estado).toBe('listo');
    if (resConfirmacion.estado !== 'listo') expect.unreachable();
    expect(resConfirmacion.mensaje.asunto).toContain('Turno confirmado');
    expect(resConfirmacion.mensaje.texto).toContain('https://clinica.example/cancelar/tok2');

    const resReprogramacion = await resolvedor.resolver({
      clinicaId: CLINICA_ID,
      notificacion: crearNotificacion({ tipo: 'reprogramacion' }),
    });
    expect(resReprogramacion.estado).toBe('listo');
    if (resReprogramacion.estado !== 'listo') expect.unreachable();
    expect(resReprogramacion.mensaje.asunto).toContain('Turno reprogramado');
    expect(resReprogramacion.mensaje.texto).toContain('Horario anterior: 08/12/2026 a las 10:00');
    expect(resReprogramacion.mensaje.texto).toContain('Nuevo horario: 10/12/2026 a las 11:30');

    const resRecordatorio = await resolvedor.resolver({
      clinicaId: CLINICA_ID,
      notificacion: crearNotificacion({ tipo: 'recordatorio' }),
    });
    expect(resRecordatorio.estado).toBe('listo');
    if (resRecordatorio.estado !== 'listo') expect.unreachable();
    expect(resRecordatorio.mensaje.asunto).toContain('Recordatorio de turno');
    expect(resRecordatorio.mensaje.texto).toContain('10/12/2026 a las 11:30');

    // Cancelación también funciona si el turno ya figura cancelado en BD
    const lectorCancelado: LectorDatosNotificacionTurno = {
      obtenerPorTurnoId: vi.fn().mockResolvedValue(crearDatosTurno({ estadoTurno: 'cancelado' })),
    };
    const resolvedorCancelado = crearResolvedorContenidoTurno({
      lector: lectorCancelado,
      reloj: { ahora: () => new Date('2026-12-09T12:00:00.000Z') },
    });
    const resCancelacion = await resolvedorCancelado.resolver({
      clinicaId: CLINICA_ID,
      notificacion: crearNotificacion({ tipo: 'cancelacion' }),
    });
    expect(resCancelacion.estado).toBe('listo');
    if (resCancelacion.estado !== 'listo') expect.unreachable();
    expect(resCancelacion.mensaje.asunto).toContain('Turno cancelado');
  });

  it('descarta defensivamente sin invocar ProveedorEnlacesTurno ante turno no elegible, faltante o paciente sin email', async () => {
    const obtenerEnlaces = vi.fn();
    const ahora = new Date('2026-12-10T14:30:00.000Z');

    // 1. tipo = 'codigo'
    const rCodigo = crearResolvedorContenidoTurno({
      lector: { obtenerPorTurnoId: vi.fn() },
      reloj: { ahora: () => ahora },
      proveedorEnlaces: { obtenerEnlaces },
    });
    expect(
      await rCodigo.resolver({
        clinicaId: CLINICA_ID,
        notificacion: crearNotificacion({ tipo: 'codigo', turnoId: null }),
      }),
    ).toEqual({ estado: 'descartar', codigo: 'TIPO_NO_SOPORTADO_EN_TURNO' });

    // 2. turnoId nulo o inexistente
    const rInexistente = crearResolvedorContenidoTurno({
      lector: { obtenerPorTurnoId: vi.fn().mockResolvedValue(null) },
      reloj: { ahora: () => ahora },
      proveedorEnlaces: { obtenerEnlaces },
    });
    expect(
      await rInexistente.resolver({
        clinicaId: CLINICA_ID,
        notificacion: crearNotificacion({ turnoId: null }),
      }),
    ).toEqual({ estado: 'descartar', codigo: 'TURNO_NO_ENCONTRADO' });
    expect(
      await rInexistente.resolver({
        clinicaId: CLINICA_ID,
        notificacion: crearNotificacion({ tipo: 'creacion' }),
      }),
    ).toEqual({ estado: 'descartar', codigo: 'TURNO_NO_ENCONTRADO' });

    // 3. paciente sin email
    const rSinEmail = crearResolvedorContenidoTurno({
      lector: {
        obtenerPorTurnoId: vi.fn().mockResolvedValue(crearDatosTurno({ pacienteEmail: '   ' })),
      },
      reloj: { ahora: () => ahora },
      proveedorEnlaces: { obtenerEnlaces },
    });
    expect(
      await rSinEmail.resolver({
        clinicaId: CLINICA_ID,
        notificacion: crearNotificacion({ tipo: 'creacion' }),
      }),
    ).toEqual({ estado: 'descartar', codigo: 'PACIENTE_SIN_EMAIL' });

    // 4. creacion/confirmacion con turno ya cancelado o reprogramado
    const rYaInactivo = crearResolvedorContenidoTurno({
      lector: {
        obtenerPorTurnoId: vi
          .fn()
          .mockResolvedValue(crearDatosTurno({ estadoTurno: 'reprogramado' })),
      },
      reloj: { ahora: () => ahora },
      proveedorEnlaces: { obtenerEnlaces },
    });
    expect(
      await rYaInactivo.resolver({
        clinicaId: CLINICA_ID,
        notificacion: crearNotificacion({ tipo: 'confirmacion' }),
      }),
    ).toEqual({ estado: 'descartar', codigo: 'TURNO_YA_NO_ACTIVO' });

    // 5. recordatorio con turno cancelado o ya iniciado
    const rRecCancelado = crearResolvedorContenidoTurno({
      lector: {
        obtenerPorTurnoId: vi.fn().mockResolvedValue(
          crearDatosTurno({
            estadoTurno: 'cancelado',
            inicio: new Date('2026-12-10T16:00:00.000Z'),
          }),
        ),
      },
      reloj: { ahora: () => ahora },
      proveedorEnlaces: { obtenerEnlaces },
    });
    expect(
      await rRecCancelado.resolver({
        clinicaId: CLINICA_ID,
        notificacion: crearNotificacion({ tipo: 'recordatorio' }),
      }),
    ).toEqual({ estado: 'descartar', codigo: 'TURNO_NO_ELEGIBLE_RECORDATORIO' });

    const rRecPasado = crearResolvedorContenidoTurno({
      lector: {
        obtenerPorTurnoId: vi.fn().mockResolvedValue(
          crearDatosTurno({
            estadoTurno: 'confirmado',
            inicio: ahora, // inicio <= ahora
          }),
        ),
      },
      reloj: { ahora: () => ahora },
      proveedorEnlaces: { obtenerEnlaces },
    });
    expect(
      await rRecPasado.resolver({
        clinicaId: CLINICA_ID,
        notificacion: crearNotificacion({ tipo: 'recordatorio' }),
      }),
    ).toEqual({ estado: 'descartar', codigo: 'TURNO_NO_ELEGIBLE_RECORDATORIO' });

    // 6. reprogramacion sin inicioAnterior
    const rReprogSinOrigen = crearResolvedorContenidoTurno({
      lector: {
        obtenerPorTurnoId: vi
          .fn()
          .mockResolvedValue(crearDatosTurno({ estadoTurno: 'confirmado', inicioAnterior: null })),
      },
      reloj: { ahora: () => ahora },
      proveedorEnlaces: { obtenerEnlaces },
    });
    expect(
      await rReprogSinOrigen.resolver({
        clinicaId: CLINICA_ID,
        notificacion: crearNotificacion({ tipo: 'reprogramacion' }),
      }),
    ).toEqual({ estado: 'descartar', codigo: 'TURNO_ORIGEN_REPROGRAMACION_NO_ENCONTRADO' });

    expect(obtenerEnlaces).not.toHaveBeenCalled();
  });
});
