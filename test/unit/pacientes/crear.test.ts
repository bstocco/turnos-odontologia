import { describe, expect, it } from 'vitest';

import { crearPaciente } from '../../../src/application/pacientes/index.js';
import { ErrorDeDominio } from '../../../src/domain/shared/errores.js';
import { codigoDeError, crearDobles, ctxConRol, ID_OTRO } from './dobles.js';

const ENTRADA = {
  nombre: '  Mateo ',
  apellido: ' Ficticio  ',
  dni: '28.555.666',
  telefono: '011 15 5555-1234',
  email: '  Mateo.Ficticio@Ejemplo.INVALID ',
  obraSocial: ' Prepaga Sintética ',
};

describe('crearPaciente', () => {
  it('normaliza y recorta antes de llamar al puerto y devuelve el DTO', async () => {
    const d = crearDobles();
    const dto = await crearPaciente(d.deps, ctxConRol('recepcionista'), ENTRADA, '203.0.113.5');

    expect(d.llamadas.find((l) => l.metodo === 'crear')?.args[0]).toEqual({
      nombre: 'Mateo',
      apellido: 'Ficticio',
      dni: '28555666',
      telefono: '+5491155551234',
      email: 'mateo.ficticio@ejemplo.invalid',
      obraSocial: 'Prepaga Sintética',
    });
    expect(dto).toEqual({
      id: ID_OTRO,
      nombre: 'Mateo',
      apellido: 'Ficticio',
      dni: '28555666',
      telefono: '+5491155551234',
      email: 'mateo.ficticio@ejemplo.invalid',
      obraSocial: 'Prepaga Sintética',
      creadoEn: '2026-01-02T03:04:05.000Z',
    });
  });

  it('email y obraSocial ausentes se guardan como null', async () => {
    const d = crearDobles();
    const dto = await crearPaciente(
      d.deps,
      ctxConRol('administrador'),
      { nombre: 'Ana', apellido: 'Prueba', dni: '30111223', telefono: '011 15 5555-1234' },
      null,
    );
    const datos = d.llamadas.find((l) => l.metodo === 'crear')?.args[0];
    expect(datos).toMatchObject({ email: null, obraSocial: null });
    expect(dto.email).toBeNull();
    expect(dto.obraSocial).toBeNull();
    expect(d.eventos[0]?.despues).toEqual({
      camposInformados: ['nombre', 'apellido', 'dni', 'telefono'],
    });
  });

  it('el odontólogo recibe 403 sin tocar ningún puerto', async () => {
    const d = crearDobles();
    expect(await codigoDeError(crearPaciente(d.deps, ctxConRol('odontologo'), ENTRADA, null))).toBe(
      'ACCESO_PROHIBIDO',
    );
    expect(d.llamadas).toEqual([]);
  });

  it('DNI o teléfono inválidos fallan antes de tocar los puertos', async () => {
    const d = crearDobles();
    const ctx = ctxConRol('recepcionista');
    expect(await codigoDeError(crearPaciente(d.deps, ctx, { ...ENTRADA, dni: '12' }, null))).toBe(
      'DNI_INVALIDO',
    );
    expect(
      await codigoDeError(crearPaciente(d.deps, ctx, { ...ENTRADA, telefono: '123' }, null)),
    ).toBe('TELEFONO_INVALIDO');
    expect(d.llamadas).toEqual([]);
  });

  it('audita creacion/paciente/id con solo nombres de campo, sin ningún valor personal', async () => {
    const d = crearDobles();
    await crearPaciente(d.deps, ctxConRol('recepcionista'), ENTRADA, '203.0.113.5');

    expect(d.eventos).toHaveLength(1);
    const evento = d.eventos[0];
    expect(evento).toMatchObject({
      accion: 'creacion',
      entidad: 'paciente',
      entidadId: ID_OTRO,
      antes: null,
      ip: '203.0.113.5',
      despues: {
        camposInformados: ['nombre', 'apellido', 'dni', 'telefono', 'email', 'obraSocial'],
      },
    });
    const serializado = JSON.stringify(evento);
    for (const valor of [
      'Mateo',
      'Ficticio',
      '28555666',
      '28.555.666',
      '5491155551234',
      'ejemplo.invalid',
      'Prepaga',
    ]) {
      expect(serializado).not.toContain(valor);
    }
  });

  it('el error del puerto (DNI duplicado) se propaga sin auditar', async () => {
    const d = crearDobles();
    d.errorAlCrear.error = new ErrorDeDominio('PACIENTE_DNI_DUPLICADO', 'conflicto', 'duplicado');
    expect(
      await codigoDeError(crearPaciente(d.deps, ctxConRol('recepcionista'), ENTRADA, null)),
    ).toBe('PACIENTE_DNI_DUPLICADO');
    expect(d.eventos).toEqual([]);
  });

  it('si la auditoría falla, el error se propaga', async () => {
    const d = crearDobles();
    d.falloDeAuditoria.activo = true;
    await expect(crearPaciente(d.deps, ctxConRol('recepcionista'), ENTRADA, null)).rejects.toThrow(
      'fallo de auditoría simulado',
    );
  });
});
