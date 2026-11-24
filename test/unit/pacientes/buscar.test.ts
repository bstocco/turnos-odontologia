import { describe, expect, it } from 'vitest';

import { buscarPacientes } from '../../../src/application/pacientes/index.js';
import {
  codigoDeError,
  crearDobles,
  ctxConRol,
  ficha,
  ID_OTRO,
  ID_PACIENTE,
  ID_PROFESIONAL,
} from './dobles.js';

describe('buscarPacientes', () => {
  it('por dni: normaliza, devuelve 0 o 1 resultado y solo el resumen', async () => {
    const d = crearDobles();
    const encontrado = await buscarPacientes(d.deps, ctxConRol('recepcionista'), {
      dni: '30.111.222',
    });
    expect(d.llamadas.find((l) => l.metodo === 'buscarPorDni')?.args).toEqual(['30111222']);
    expect(encontrado).toEqual([
      { id: ID_PACIENTE, nombre: 'Lucía', apellido: 'Sintética', dni: '30111222' },
    ]);
    expect(Object.keys(encontrado[0] ?? {}).sort()).toEqual(['apellido', 'dni', 'id', 'nombre']);

    expect(await buscarPacientes(d.deps, ctxConRol('recepcionista'), { dni: '99999999' })).toEqual(
      [],
    );
  });

  it('por apellido: prefijo recortado y límite por defecto 20', async () => {
    const d = crearDobles();
    await buscarPacientes(d.deps, ctxConRol('administrador'), { apellido: '  Sint ' });
    expect(d.llamadas.find((l) => l.metodo === 'buscarPorApellido')?.args).toEqual(['Sint', 20]);
  });

  it('respeta el límite pedido', async () => {
    const d = crearDobles();
    for (let i = 0; i < 9; i += 1) {
      const id = `00000000-0000-4000-8000-00000000000${i}`;
      d.almacen.set(id, ficha({ id, dni: `4000000${i}` }));
    }
    const lista = await buscarPacientes(d.deps, ctxConRol('recepcionista'), {
      apellido: 'Si',
      limite: 5,
    });
    expect(d.llamadas.find((l) => l.metodo === 'buscarPorApellido')?.args[1]).toBe(5);
    expect(lista).toHaveLength(5);
  });

  it.each([[{}], [{ dni: '30111222', apellido: 'Sint' }], [{ apellido: 'S' }]])(
    '%j: BUSQUEDA_INVALIDA sin tocar puertos',
    async (criterio) => {
      const d = crearDobles();
      expect(
        await codigoDeError(buscarPacientes(d.deps, ctxConRol('recepcionista'), criterio)),
      ).toBe('BUSQUEDA_INVALIDA');
      expect(d.llamadas).toEqual([]);
    },
  );

  it('odontólogo: usa las variantes filtradas con su profesional', async () => {
    const d = crearDobles();
    d.delProfesional.add(ID_PACIENTE);
    d.almacen.set(ID_OTRO, ficha({ id: ID_OTRO, dni: '40000001', apellido: 'Sintético' }));

    const porApellido = await buscarPacientes(d.deps, ctxConRol('odontologo'), {
      apellido: 'Sint',
      limite: 7,
    });
    expect(d.llamadas.find((l) => l.metodo === 'buscarPorApellidoDeProfesional')?.args).toEqual([
      'Sint',
      ID_PROFESIONAL,
      7,
    ]);
    expect(porApellido.map((p) => p.id)).toEqual([ID_PACIENTE]);

    const porDni = await buscarPacientes(d.deps, ctxConRol('odontologo'), { dni: '40.000.001' });
    expect(d.llamadas.find((l) => l.metodo === 'buscarPorDniDeProfesional')?.args).toEqual([
      '40000001',
      ID_PROFESIONAL,
    ]);
    expect(porDni).toEqual([]);
    // Nunca usa las variantes sin filtro.
    expect(
      d.llamadas.some((l) => l.metodo === 'buscarPorDni' || l.metodo === 'buscarPorApellido'),
    ).toBe(false);
  });

  it('odontólogo sin vínculo: 403', async () => {
    const d = crearDobles();
    d.vinculo.profesionalId = null;
    expect(
      await codigoDeError(buscarPacientes(d.deps, ctxConRol('odontologo'), { apellido: 'Sint' })),
    ).toBe('ACCESO_PROHIBIDO');
  });

  it('rol desconocido: 403 y no audita nunca', async () => {
    const d = crearDobles();
    expect(
      await codigoDeError(buscarPacientes(d.deps, ctxConRol('paciente'), { apellido: 'Sint' })),
    ).toBe('ACCESO_PROHIBIDO');
    await buscarPacientes(d.deps, ctxConRol('administrador'), { apellido: 'Sint' });
    expect(d.eventos).toEqual([]);
  });
});
