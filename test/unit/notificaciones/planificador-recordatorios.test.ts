import { describe, expect, it, vi } from 'vitest';

import type {
  LoggerNotificaciones,
  ServicioNotificaciones,
} from '../../../src/application/notificaciones/index.js';
import { crearPlanificadorRecordatorios } from '../../../src/application/notificaciones/turnos/planificador-recordatorios.js';
import type {
  BuscadorTurnosRecordatorio,
  CatalogoClinicasActivas,
} from '../../../src/application/notificaciones/turnos/puertos.js';

const CLINICA_A = '11111111-1111-4111-8111-111111111111';
const CLINICA_B = '22222222-2222-4222-8222-222222222222';
const TURNO_A1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const TURNO_B1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';

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

describe('crearPlanificadorRecordatorios', () => {
  it('recorre clínicas activas calculando la ventana en su zona IANA y encola recordatorios idempotentes', async () => {
    const ahora = new Date('2026-03-07T15:00:00.000Z');
    const catalogo: CatalogoClinicasActivas = {
      listarActivas: vi.fn().mockResolvedValue([
        { id: CLINICA_A, zonaHoraria: 'America/Argentina/Buenos_Aires' },
        { id: CLINICA_B, zonaHoraria: 'America/New_York' },
      ]),
    };

    const buscarElegiblesEnVentana = vi
      .fn<BuscadorTurnosRecordatorio['buscarElegiblesEnVentana']>()
      .mockResolvedValueOnce([TURNO_A1])
      .mockResolvedValueOnce([TURNO_B1]);

    const encolar = vi
      .fn<ServicioNotificaciones['encolar']>()
      .mockResolvedValueOnce({
        estado: 'encolada',
        notificacionId: '10000000-0000-4000-8000-000000000001',
        notificacion: {} as never,
      })
      .mockResolvedValueOnce({
        estado: 'duplicada',
        notificacionId: '10000000-0000-4000-8000-000000000002',
        notificacion: {} as never,
      });

    const { logger } = crearLoggerEspia();
    const planificador = crearPlanificadorRecordatorios({
      catalogoClinicas: catalogo,
      buscadorTurnos: { buscarElegiblesEnVentana },
      servicio: { encolar },
      reloj: { ahora: () => ahora },
      logger,
    });

    const resultado = await planificador.ejecutarCiclo();

    expect(resultado).toEqual({
      clinicasProcesadas: 2,
      clinicasConError: 0,
      recordatoriosEncolados: 1,
      duplicados: 1,
      fallosEncolado: 0,
    });

    // Ventanas específicas por zona horaria IANA (24h normal en BA vs 23h DST en NY)
    expect(buscarElegiblesEnVentana).toHaveBeenNthCalledWith(1, CLINICA_A, {
      desdeExclusivo: ahora,
      hastaInclusivo: new Date('2026-03-08T15:00:00.000Z'),
    });
    expect(buscarElegiblesEnVentana).toHaveBeenNthCalledWith(2, CLINICA_B, {
      desdeExclusivo: ahora,
      hastaInclusivo: new Date('2026-03-08T14:00:00.000Z'),
    });

    expect(encolar).toHaveBeenNthCalledWith(1, {
      clinicaId: CLINICA_A,
      turnoId: TURNO_A1,
      tipo: 'recordatorio',
      claveIdempotencia: `turno:${TURNO_A1}:recordatorio`,
    });
    expect(encolar).toHaveBeenNthCalledWith(2, {
      clinicaId: CLINICA_B,
      turnoId: TURNO_B1,
      tipo: 'recordatorio',
      claveIdempotencia: `turno:${TURNO_B1}:recordatorio`,
    });
  });

  it('aísla fallos de una clínica sin detener el ciclo de las demás ni registrar PII', async () => {
    const ahora = new Date('2026-11-24T12:00:00.000Z');
    const catalogo: CatalogoClinicasActivas = {
      listarActivas: vi.fn().mockResolvedValue([
        { id: CLINICA_A, zonaHoraria: 'America/Argentina/Buenos_Aires' },
        { id: CLINICA_B, zonaHoraria: 'America/Argentina/Buenos_Aires' },
      ]),
    };

    const buscarElegiblesEnVentana = vi
      .fn<BuscadorTurnosRecordatorio['buscarElegiblesEnVentana']>()
      .mockRejectedValueOnce(new Error('DB timeout con paciente@ejemplo.com'))
      .mockResolvedValueOnce([TURNO_B1]);

    const encolar = vi.fn<ServicioNotificaciones['encolar']>().mockResolvedValue({
      estado: 'no_encolada',
      codigoError: 'ERROR_TRANSPORTE_COLA',
    });

    const { logger, registros } = crearLoggerEspia();
    const planificador = crearPlanificadorRecordatorios({
      catalogoClinicas: catalogo,
      buscadorTurnos: { buscarElegiblesEnVentana },
      servicio: { encolar },
      reloj: { ahora: () => ahora },
      logger,
      anticipacionHoras: 12,
    });

    const resultado = await planificador.ejecutarCiclo();

    expect(resultado).toEqual({
      clinicasProcesadas: 1,
      clinicasConError: 1,
      recordatoriosEncolados: 0,
      duplicados: 0,
      fallosEncolado: 1,
    });

    const errores = registros.filter((r) => r.nivel === 'error');
    expect(errores).toHaveLength(1);
    expect(errores[0]?.datos).toEqual({
      clinicaId: CLINICA_A,
      codigo: 'ERROR_CICLO_RECORDATORIOS',
    });
    expect(JSON.stringify(registros)).not.toContain('paciente@ejemplo.com');
  });

  it('maneja catálogo vacío sin invocar buscador ni encolado', async () => {
    const catalogo: CatalogoClinicasActivas = {
      listarActivas: vi.fn().mockResolvedValue([]),
    };
    const buscarElegiblesEnVentana = vi.fn();
    const encolar = vi.fn();
    const { logger } = crearLoggerEspia();

    const planificador = crearPlanificadorRecordatorios({
      catalogoClinicas: catalogo,
      buscadorTurnos: { buscarElegiblesEnVentana },
      servicio: { encolar },
      reloj: { ahora: () => new Date('2026-11-24T12:00:00.000Z') },
      logger,
    });

    expect(await planificador.ejecutarCiclo()).toEqual({
      clinicasProcesadas: 0,
      clinicasConError: 0,
      recordatoriosEncolados: 0,
      duplicados: 0,
      fallosEncolado: 0,
    });
    expect(buscarElegiblesEnVentana).not.toHaveBeenCalled();
    expect(encolar).not.toHaveBeenCalled();
  });
});
