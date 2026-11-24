import { describe, expect, it } from 'vitest';

import { obtenerPaciente } from '../../../src/application/pacientes/index.js';
import { codigoDeError, crearDobles, ctxConRol, ID_OTRO, ID_PACIENTE } from './dobles.js';

describe('obtenerPaciente', () => {
  it.each(['administrador', 'recepcionista'])('%s lee la ficha y queda auditada', async (rol) => {
    const d = crearDobles();
    const dto = await obtenerPaciente(d.deps, ctxConRol(rol), ID_PACIENTE, '203.0.113.9');

    expect(dto).toMatchObject({
      id: ID_PACIENTE,
      dni: '30111222',
      creadoEn: '2026-01-02T03:04:05.000Z',
    });
    expect(d.eventos).toEqual([
      {
        accion: 'lectura_ficha',
        entidad: 'paciente',
        entidadId: ID_PACIENTE,
        antes: null,
        despues: null,
        ip: '203.0.113.9',
      },
    ]);
    // Sin vínculo ni alcance: solo el odontólogo los consulta.
    expect(d.llamadas.some((l) => l.puerto === 'vinculo' || l.puerto === 'acceso')).toBe(false);
  });

  it('id ausente: 404 y sin auditar', async () => {
    const d = crearDobles();
    expect(
      await codigoDeError(obtenerPaciente(d.deps, ctxConRol('recepcionista'), ID_OTRO, null)),
    ).toBe('RECURSO_NO_ENCONTRADO');
    expect(d.eventos).toEqual([]);
  });

  it('dos lecturas generan dos eventos', async () => {
    const d = crearDobles();
    await obtenerPaciente(d.deps, ctxConRol('administrador'), ID_PACIENTE, null);
    await obtenerPaciente(d.deps, ctxConRol('administrador'), ID_PACIENTE, null);
    expect(d.eventos).toHaveLength(2);
  });

  it('odontólogo con vínculo y paciente en su alcance: ficha auditada', async () => {
    const d = crearDobles();
    d.delProfesional.add(ID_PACIENTE);
    const dto = await obtenerPaciente(d.deps, ctxConRol('odontologo'), ID_PACIENTE, null);
    expect(dto.id).toBe(ID_PACIENTE);
    expect(d.eventos.map((e) => e.accion)).toEqual(['lectura_ficha']);
  });

  it('odontólogo con paciente fuera de su alcance: 404 sin auditar ni leer la ficha', async () => {
    const d = crearDobles();
    expect(
      await codigoDeError(obtenerPaciente(d.deps, ctxConRol('odontologo'), ID_PACIENTE, null)),
    ).toBe('RECURSO_NO_ENCONTRADO');
    expect(d.eventos).toEqual([]);
    expect(d.llamadas.some((l) => l.metodo === 'obtenerPorId')).toBe(false);
  });

  it('odontólogo sin profesional vinculado: 403', async () => {
    const d = crearDobles();
    d.vinculo.profesionalId = null;
    d.delProfesional.add(ID_PACIENTE);
    expect(
      await codigoDeError(obtenerPaciente(d.deps, ctxConRol('odontologo'), ID_PACIENTE, null)),
    ).toBe('ACCESO_PROHIBIDO');
    expect(d.eventos).toEqual([]);
  });

  it('rol desconocido: 403 sin tocar puertos', async () => {
    const d = crearDobles();
    expect(
      await codigoDeError(obtenerPaciente(d.deps, ctxConRol('paciente'), ID_PACIENTE, null)),
    ).toBe('ACCESO_PROHIBIDO');
    expect(d.llamadas).toEqual([]);
  });

  it('si la auditoría falla, la ficha no se devuelve', async () => {
    const d = crearDobles();
    d.falloDeAuditoria.activo = true;
    await expect(
      obtenerPaciente(d.deps, ctxConRol('recepcionista'), ID_PACIENTE, null),
    ).rejects.toThrow('fallo de auditoría simulado');
  });
});
