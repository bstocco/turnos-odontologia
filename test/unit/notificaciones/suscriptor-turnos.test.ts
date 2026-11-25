import { describe, expect, it, vi } from 'vitest';

import type {
  LoggerNotificaciones,
  ServicioNotificaciones,
} from '../../../src/application/notificaciones/index.js';
import {
  claveIdempotenciaTurno,
  crearPublicadorEventosTurno,
} from '../../../src/application/notificaciones/turnos/suscriptor-turnos.js';
import type { EventoDeTurno } from '../../../src/domain/turno/index.js';
import type { TurnoId } from '../../../src/domain/shared/index.js';

const CLINICA_ID = '11111111-1111-4111-8111-111111111111';
const TURNO_ID = '99999999-9999-4999-8999-999999999999' as TurnoId;

function crearLoggerEspia(): {
  readonly logger: LoggerNotificaciones;
  readonly registros: Array<{ nivel: string; datos: Record<string, unknown>; mensaje: string }>;
} {
  const registros: Array<{ nivel: string; datos: Record<string, unknown>; mensaje: string }> = [];
  return {
    registros,
    logger: {
      info: (datos, mensaje) => registros.push({ nivel: 'info', datos, mensaje }),
      warn: (datos, mensaje) => registros.push({ nivel: 'warn', datos, mensaje }),
      error: (datos, mensaje) => registros.push({ nivel: 'error', datos, mensaje }),
    },
  };
}

describe('crearPublicadorEventosTurno', () => {
  it.each([
    { evento: 'creado', esperado: 'creacion' },
    { evento: 'confirmado', esperado: 'confirmacion' },
    { evento: 'cancelado', esperado: 'cancelacion' },
    { evento: 'reprogramado', esperado: 'reprogramacion' },
  ] as const)(
    'mapea evento "$evento" a tipo "$esperado" con clave determinista',
    async ({ evento, esperado }) => {
      const encolar = vi.fn<ServicioNotificaciones['encolar']>().mockResolvedValue({
        estado: 'encolada',
        notificacionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        notificacion: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          clinicaId: CLINICA_ID,
          turnoId: TURNO_ID,
          canal: 'email',
          tipo: esperado,
          estado: 'pendiente',
          claveIdempotencia: claveIdempotenciaTurno(TURNO_ID, esperado),
          intentos: 0,
          programadaPara: new Date('2026-11-24T12:00:00.000Z'),
          enviadaEn: null,
          error: null,
          creadaEn: new Date('2026-11-24T12:00:00.000Z'),
          actualizadaEn: new Date('2026-11-24T12:00:00.000Z'),
        },
      });
      const { logger } = crearLoggerEspia();
      const publicador = crearPublicadorEventosTurno({
        clinicaId: CLINICA_ID,
        servicio: { encolar },
        logger,
      });

      const payloadEvento: EventoDeTurno = { tipo: evento, turnoId: TURNO_ID };
      await publicador.publicar(payloadEvento);

      expect(encolar).toHaveBeenCalledTimes(1);
      expect(encolar).toHaveBeenCalledWith({
        clinicaId: CLINICA_ID,
        turnoId: TURNO_ID,
        tipo: esperado,
        claveIdempotencia: `turno:${TURNO_ID}:${esperado}`,
      });
    },
  );

  it('envía la misma clave de idempotencia ante publicaciones repetidas del mismo evento', async () => {
    const encolar = vi
      .fn<ServicioNotificaciones['encolar']>()
      .mockResolvedValueOnce({
        estado: 'encolada',
        notificacionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        notificacion: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          clinicaId: CLINICA_ID,
          turnoId: TURNO_ID,
          canal: 'email',
          tipo: 'confirmacion',
          estado: 'pendiente',
          claveIdempotencia: `turno:${TURNO_ID}:confirmacion`,
          intentos: 0,
          programadaPara: new Date(),
          enviadaEn: null,
          error: null,
          creadaEn: new Date(),
          actualizadaEn: new Date(),
        },
      })
      .mockResolvedValueOnce({
        estado: 'duplicada',
        notificacionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        notificacion: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          clinicaId: CLINICA_ID,
          turnoId: TURNO_ID,
          canal: 'email',
          tipo: 'confirmacion',
          estado: 'pendiente',
          claveIdempotencia: `turno:${TURNO_ID}:confirmacion`,
          intentos: 0,
          programadaPara: new Date(),
          enviadaEn: null,
          error: null,
          creadaEn: new Date(),
          actualizadaEn: new Date(),
        },
      });
    const { logger } = crearLoggerEspia();
    const publicador = crearPublicadorEventosTurno({
      clinicaId: CLINICA_ID,
      servicio: { encolar },
      logger,
    });

    await publicador.publicar({ tipo: 'confirmado', turnoId: TURNO_ID });
    await publicador.publicar({ tipo: 'confirmado', turnoId: TURNO_ID });

    expect(encolar).toHaveBeenCalledTimes(2);
    expect(encolar.mock.calls[0]?.[0]).toEqual(encolar.mock.calls[1]?.[0]);
  });

  it('aísla fallos de cola o excepciones inesperadas sin lanzar ni registrar PII en logs (RN-NO-03)', async () => {
    const pii = 'paciente.real@ejemplo.com 30111222 Juan Perez';
    const encolar = vi
      .fn<ServicioNotificaciones['encolar']>()
      .mockResolvedValueOnce({
        estado: 'no_encolada',
        codigoError: 'ERROR_TRANSPORTE_COLA',
      })
      .mockRejectedValueOnce(new Error(`Fallo inesperado para ${pii}`));

    const { logger, registros } = crearLoggerEspia();
    const publicador = crearPublicadorEventosTurno({
      clinicaId: CLINICA_ID,
      servicio: { encolar },
      logger,
    });

    await expect(
      publicador.publicar({ tipo: 'creado', turnoId: TURNO_ID }),
    ).resolves.toBeUndefined();
    await expect(
      publicador.publicar({ tipo: 'cancelado', turnoId: TURNO_ID }),
    ).resolves.toBeUndefined();

    expect(registros).toHaveLength(2);
    expect(registros[0]?.nivel).toBe('warn');
    expect(registros[0]?.datos).toEqual({
      clinicaId: CLINICA_ID,
      turnoId: TURNO_ID,
      tipo: 'creacion',
      codigo: 'ERROR_TRANSPORTE_COLA',
    });
    expect(registros[1]?.nivel).toBe('error');
    expect(registros[1]?.datos).toEqual({
      clinicaId: CLINICA_ID,
      turnoId: TURNO_ID,
      tipo: 'cancelacion',
      codigo: 'ERROR_PUBLICAR_EVENTO_TURNO',
    });

    const serializado = JSON.stringify(registros);
    expect(serializado).not.toContain('paciente.real@ejemplo.com');
    expect(serializado).not.toContain('30111222');
    expect(serializado).not.toContain('Juan Perez');
  });
});
