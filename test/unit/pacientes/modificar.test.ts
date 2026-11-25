import { describe, expect, it } from 'vitest';

import { modificarPaciente } from '../../../src/application/pacientes/index.js';
import { codigoDeError, crearDobles, ctxConRol, ID_OTRO, ID_PACIENTE } from './dobles.js';

describe('modificarPaciente', () => {
  it('cuerpo vacío: CAMBIOS_VACIOS sin tocar puertos', async () => {
    const d = crearDobles();
    expect(
      await codigoDeError(
        modificarPaciente(d.deps, ctxConRol('recepcionista'), ID_PACIENTE, {}, null),
      ),
    ).toBe('CAMBIOS_VACIOS');
    expect(d.llamadas).toEqual([]);
  });

  it('el odontólogo recibe 403 sin tocar puertos, aunque el paciente sea suyo', async () => {
    const d = crearDobles();
    d.delProfesional.add(ID_PACIENTE);
    expect(
      await codigoDeError(
        modificarPaciente(d.deps, ctxConRol('odontologo'), ID_PACIENTE, { nombre: 'X' }, null),
      ),
    ).toBe('ACCESO_PROHIBIDO');
    expect(d.llamadas).toEqual([]);
  });

  it('id ausente: 404 sin auditar ni actualizar', async () => {
    const d = crearDobles();
    expect(
      await codigoDeError(
        modificarPaciente(d.deps, ctxConRol('administrador'), ID_OTRO, { nombre: 'X' }, null),
      ),
    ).toBe('RECURSO_NO_ENCONTRADO');
    expect(d.eventos).toEqual([]);
    expect(d.llamadas.some((l) => l.metodo === 'actualizar')).toBe(false);
  });

  it('normaliza igual que el alta y solo envía los campos informados', async () => {
    const d = crearDobles();
    const dto = await modificarPaciente(
      d.deps,
      ctxConRol('recepcionista'),
      ID_PACIENTE,
      {
        telefono: '011 15 5555-9999',
        dni: '30.111.999',
        email: ' NUEVO@Ejemplo.invalid ',
        apellido: ' Nueva ',
      },
      null,
    );
    expect(d.llamadas.find((l) => l.metodo === 'actualizar')?.args[1]).toEqual({
      telefono: '+5491155559999',
      dni: '30111999',
      email: 'nuevo@ejemplo.invalid',
      apellido: 'Nueva',
    });
    expect(dto).toMatchObject({ telefono: '+5491155559999', dni: '30111999', apellido: 'Nueva' });
  });

  it('null borra email y obraSocial', async () => {
    const d = crearDobles();
    const dto = await modificarPaciente(
      d.deps,
      ctxConRol('recepcionista'),
      ID_PACIENTE,
      { obraSocial: null, email: null },
      null,
    );
    expect(dto.obraSocial).toBeNull();
    expect(dto.email).toBeNull();
    expect(d.eventos[0]?.despues).toEqual({ camposModificados: ['email', 'obraSocial'] });
  });

  it('camposModificados refleja solo cambios reales contra la ficha leída antes', async () => {
    const d = crearDobles();
    await modificarPaciente(
      d.deps,
      ctxConRol('recepcionista'),
      ID_PACIENTE,
      { nombre: 'Lucía', telefono: '011 15 5555-9999' },
      '203.0.113.7',
    );
    expect(d.eventos).toHaveLength(1);
    expect(d.eventos[0]).toMatchObject({
      accion: 'modificacion',
      entidad: 'paciente',
      entidadId: ID_PACIENTE,
      antes: null,
      ip: '203.0.113.7',
      despues: { camposModificados: ['telefono'] },
    });
  });

  it('sin cambio efectivo se audita igual con lista vacía', async () => {
    const d = crearDobles();
    await modificarPaciente(
      d.deps,
      ctxConRol('administrador'),
      ID_PACIENTE,
      { nombre: 'Lucía' },
      null,
    );
    expect(d.eventos[0]?.despues).toEqual({ camposModificados: [] });
  });

  it('el payload de auditoría no contiene valores personales', async () => {
    const d = crearDobles();
    await modificarPaciente(
      d.deps,
      ctxConRol('recepcionista'),
      ID_PACIENTE,
      {
        nombre: 'Nombre Nuevo',
        dni: '31999888',
        email: 'otro@ejemplo.invalid',
        telefono: '011 15 5555-9999',
      },
      null,
    );
    const serializado = JSON.stringify(d.eventos);
    for (const valor of [
      'Nombre Nuevo',
      '31999888',
      'otro@ejemplo',
      '5491155559999',
      'Lucía',
      '30111222',
    ]) {
      expect(serializado).not.toContain(valor);
    }
  });

  it('si la auditoría falla, el error se propaga', async () => {
    const d = crearDobles();
    d.falloDeAuditoria.activo = true;
    await expect(
      modificarPaciente(d.deps, ctxConRol('administrador'), ID_PACIENTE, { nombre: 'Otro' }, null),
    ).rejects.toThrow('fallo de auditoría simulado');
  });
});
