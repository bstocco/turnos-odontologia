import { describe, expect, it } from 'vitest';

import {
  modificarConfiguracionClinica,
  obtenerConfiguracionClinica,
} from '../../../src/application/configuracion/index.js';
import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';
import {
  CLINICA_ID,
  CTX_ADMIN,
  CTX_ODONTOLOGO,
  CTX_RECEPCION,
  auditoriaEspia,
  configuracionEnMemoria,
} from './dobles.js';

describe('obtenerConfiguracionClinica', () => {
  it.each([
    ['administrador', CTX_ADMIN],
    ['recepcionista', CTX_RECEPCION],
    ['odontologo', CTX_ODONTOLOGO],
  ])('lo puede leer el rol %s', async (_rol, ctx) => {
    const configuracion = configuracionEnMemoria();
    const resultado = await obtenerConfiguracionClinica({ configuracion }, ctx);
    expect(resultado.id).toBe(CLINICA_ID);
    expect(resultado.granularidadMinutos).toBe(15);
  });
});

describe('modificarConfiguracionClinica', () => {
  it('aplica el cambio y audita modificacion/clinica_config con antes y después', async () => {
    const configuracion = configuracionEnMemoria();
    const auditoria = auditoriaEspia();
    const resultado = await modificarConfiguracionClinica(
      { configuracion, auditoria },
      CTX_ADMIN,
      { granularidadMinutos: 30, reservaRequiereConfirmacion: true },
      '203.0.113.7',
    );
    expect(resultado).toMatchObject({ granularidadMinutos: 30, reservaRequiereConfirmacion: true });
    expect(auditoria.eventos).toHaveLength(1);
    expect(auditoria.eventos[0]?.entrada).toEqual({
      accion: 'modificacion',
      entidad: 'clinica_config',
      entidadId: CLINICA_ID,
      antes: {
        reservaRequiereConfirmacion: false,
        cancelacionAnticipacionHoras: 24,
        granularidadMinutos: 15,
      },
      despues: {
        reservaRequiereConfirmacion: true,
        cancelacionAnticipacionHoras: 24,
        granularidadMinutos: 30,
      },
      ip: '203.0.113.7',
    });
    expect(auditoria.eventos[0]?.ctx).toBe(CTX_ADMIN);
  });

  it('lee el antes con bloqueo para auditar un valor exacto', async () => {
    const configuracion = configuracionEnMemoria();
    await modificarConfiguracionClinica({ configuracion, auditoria: auditoriaEspia() }, CTX_ADMIN, {
      cancelacionAnticipacionHoras: 48,
    });
    expect(configuracion.llamadas).toEqual(['obtener:bloquear', 'actualizar']);
  });

  it.each([
    ['recepcionista', CTX_RECEPCION],
    ['odontologo', CTX_ODONTOLOGO],
  ])('rechaza con 403 al rol %s sin tocar puertos', async (_rol, ctx) => {
    const configuracion = configuracionEnMemoria();
    const auditoria = auditoriaEspia();
    await expect(
      modificarConfiguracionClinica({ configuracion, auditoria }, ctx, { granularidadMinutos: 30 }),
    ).rejects.toMatchObject({ codigo: 'ACCESO_PROHIBIDO', tipo: 'prohibido' });
    expect(configuracion.llamadas).toEqual([]);
    expect(auditoria.eventos).toEqual([]);
  });

  it('CAMBIOS_VACIOS cuando no hay campos modificables, sin auditar', async () => {
    const configuracion = configuracionEnMemoria();
    const auditoria = auditoriaEspia();
    await expect(
      modificarConfiguracionClinica({ configuracion, auditoria }, CTX_ADMIN, {}),
    ).rejects.toMatchObject({ codigo: 'CAMBIOS_VACIOS' });
    expect(configuracion.llamadas).toEqual([]);
    expect(auditoria.eventos).toEqual([]);
  });

  it.each([7, 0, 1441, 2.5])('GRANULARIDAD_INVALIDA para %s, sin auditar', async (granularidad) => {
    const configuracion = configuracionEnMemoria();
    const auditoria = auditoriaEspia();
    const error: unknown = await modificarConfiguracionClinica(
      { configuracion, auditoria },
      CTX_ADMIN,
      { granularidadMinutos: granularidad },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorDeDominio);
    expect(error).toMatchObject({ codigo: 'GRANULARIDAD_INVALIDA', tipo: 'regla_de_negocio' });
    expect(auditoria.eventos).toEqual([]);
    expect(configuracion.actual.granularidadMinutos).toBe(15);
  });

  it.each([5, 20, 60, 240])('acepta la granularidad %i', async (granularidad) => {
    const configuracion = configuracionEnMemoria();
    const resultado = await modificarConfiguracionClinica(
      { configuracion, auditoria: auditoriaEspia() },
      CTX_ADMIN,
      { granularidadMinutos: granularidad },
    );
    expect(resultado.granularidadMinutos).toBe(granularidad);
  });

  it('propaga el error de la auditoría (fail-closed)', async () => {
    const configuracion = configuracionEnMemoria();
    await expect(
      modificarConfiguracionClinica(
        { configuracion, auditoria: auditoriaEspia({ fallar: true }) },
        CTX_ADMIN,
        { cancelacionAnticipacionHoras: 12 },
      ),
    ).rejects.toThrow('fallo de auditoría simulado');
  });

  it('ip ausente se audita como null', async () => {
    const auditoria = auditoriaEspia();
    await modificarConfiguracionClinica(
      { configuracion: configuracionEnMemoria(), auditoria },
      CTX_ADMIN,
      { cancelacionAnticipacionHoras: 12 },
    );
    expect(auditoria.eventos[0]?.entrada.ip).toBeNull();
  });
});
