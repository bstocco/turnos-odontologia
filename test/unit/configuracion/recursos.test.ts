import { describe, expect, it } from 'vitest';

import {
  crearPrestacion,
  crearProfesional,
  crearSillon,
  listarPrestaciones,
  listarProfesionales,
  listarSillones,
  modificarPrestacion,
  modificarProfesional,
  modificarSillon,
  obtenerPrestacion,
  obtenerProfesional,
  obtenerSillon,
  type PrestacionDto,
  type ProfesionalDto,
  type SillonDto,
} from '../../../src/application/configuracion/index.js';
import {
  CTX_ADMIN,
  CTX_ODONTOLOGO,
  CTX_RECEPCION,
  ID_INEXISTENTE,
  auditoriaEspia,
  catalogoEnMemoria,
} from './dobles.js';

const ID_P1 = '10000000-0000-4000-8000-000000000001';
const ID_P2 = '10000000-0000-4000-8000-000000000002';

function profesionales(semilla: ProfesionalDto[] = []) {
  return catalogoEnMemoria<
    ProfesionalDto,
    { nombre: string; apellido: string; matricula?: string | null },
    Partial<Omit<ProfesionalDto, 'id'>>
  >({
    crearDe: (d, id) => ({
      id,
      nombre: d.nombre,
      apellido: d.apellido,
      matricula: d.matricula ?? null,
      activo: true,
    }),
    aplicar: (a, c) => ({ ...a, ...c }),
    semilla,
  });
}

function sillones(semilla: SillonDto[] = []) {
  return catalogoEnMemoria<
    SillonDto,
    { nombre: string; bufferMinutos?: number },
    Partial<Omit<SillonDto, 'id'>>
  >({
    crearDe: (d, id) => ({
      id,
      nombre: d.nombre,
      bufferMinutos: d.bufferMinutos ?? 0,
      activo: true,
    }),
    aplicar: (a, c) => ({ ...a, ...c }),
    semilla,
  });
}

function prestaciones(semilla: PrestacionDto[] = []) {
  return catalogoEnMemoria<
    PrestacionDto,
    { nombre: string; duracionMinutos: number },
    Partial<Omit<PrestacionDto, 'id'>>
  >({
    crearDe: (d, id) => ({
      id,
      nombre: d.nombre,
      duracionMinutos: d.duracionMinutos,
      activa: true,
    }),
    aplicar: (a, c) => ({ ...a, ...c }),
    semilla,
  });
}

const PROF_1: ProfesionalDto = {
  id: ID_P1,
  nombre: 'Ana',
  apellido: 'Sintética',
  matricula: 'MP-1',
  activo: true,
};
const PROF_2: ProfesionalDto = {
  id: ID_P2,
  nombre: 'Beto',
  apellido: 'Ficticio',
  matricula: null,
  activo: false,
};
const SILLON_1: SillonDto = { id: ID_P1, nombre: 'Sillón 1', bufferMinutos: 5, activo: true };
const SILLON_2: SillonDto = { id: ID_P2, nombre: 'Sillón 2', bufferMinutos: 0, activo: false };
const PREST_1: PrestacionDto = { id: ID_P1, nombre: 'Limpieza', duracionMinutos: 30, activa: true };
const PREST_2: PrestacionDto = {
  id: ID_P2,
  nombre: 'Ortodoncia',
  duracionMinutos: 45,
  activa: false,
};

describe('profesionales', () => {
  describe('lectura', () => {
    it.each([
      ['administrador', CTX_ADMIN],
      ['recepcionista', CTX_RECEPCION],
      ['odontologo', CTX_ODONTOLOGO],
    ])('el rol %s lista y obtiene', async (_r, ctx) => {
      const puerto = profesionales([PROF_1, PROF_2]);
      expect(await listarProfesionales({ profesionales: puerto }, ctx, {})).toHaveLength(2);
      expect(await obtenerProfesional({ profesionales: puerto }, ctx, ID_P1)).toEqual(PROF_1);
    });

    it('filtra por activo=true y activo=false', async () => {
      const puerto = profesionales([PROF_1, PROF_2]);
      expect(
        await listarProfesionales({ profesionales: puerto }, CTX_ADMIN, { activo: true }),
      ).toEqual([PROF_1]);
      expect(
        await listarProfesionales({ profesionales: puerto }, CTX_ADMIN, { activo: false }),
      ).toEqual([PROF_2]);
    });

    it('obtener inexistente lanza RECURSO_NO_ENCONTRADO', async () => {
      await expect(
        obtenerProfesional({ profesionales: profesionales([PROF_1]) }, CTX_ADMIN, ID_INEXISTENTE),
      ).rejects.toMatchObject({ codigo: 'RECURSO_NO_ENCONTRADO', tipo: 'no_encontrado' });
    });

    it('un rol desconocido no puede leer', async () => {
      await expect(
        listarProfesionales(
          { profesionales: profesionales() },
          { ...CTX_ADMIN, actor: { ...CTX_ADMIN.actor, rol: 'x' } },
          {},
        ),
      ).rejects.toMatchObject({ codigo: 'ACCESO_PROHIBIDO' });
    });
  });

  describe('crear', () => {
    it('recorta espacios, devuelve el DTO y audita creacion/profesional', async () => {
      const puerto = profesionales();
      const auditoria = auditoriaEspia();
      const creado = await crearProfesional(
        { profesionales: puerto, auditoria },
        CTX_ADMIN,
        { nombre: '  Ana ', apellido: ' Sintética  ', matricula: ' MP-9 ' },
        '203.0.113.1',
      );
      expect(creado).toMatchObject({
        nombre: 'Ana',
        apellido: 'Sintética',
        matricula: 'MP-9',
        activo: true,
      });
      expect(auditoria.eventos).toHaveLength(1);
      expect(auditoria.eventos[0]?.entrada).toEqual({
        accion: 'creacion',
        entidad: 'profesional',
        entidadId: creado.id,
        antes: null,
        despues: creado,
        ip: '203.0.113.1',
      });
    });

    it('matrícula ausente queda en null', async () => {
      const creado = await crearProfesional(
        { profesionales: profesionales(), auditoria: auditoriaEspia() },
        CTX_ADMIN,
        { nombre: 'Ana', apellido: 'Sintética' },
      );
      expect(creado.matricula).toBeNull();
    });

    it.each([
      ['recepcionista', CTX_RECEPCION],
      ['odontologo', CTX_ODONTOLOGO],
    ])('el rol %s recibe 403 sin tocar puertos ni auditar', async (_r, ctx) => {
      const puerto = profesionales();
      const auditoria = auditoriaEspia();
      await expect(
        crearProfesional({ profesionales: puerto, auditoria }, ctx, {
          nombre: 'Ana',
          apellido: 'S',
        }),
      ).rejects.toMatchObject({ codigo: 'ACCESO_PROHIBIDO' });
      expect(puerto.llamadas).toEqual([]);
      expect(auditoria.eventos).toEqual([]);
    });

    it('propaga el error de la auditoría', async () => {
      await expect(
        crearProfesional(
          { profesionales: profesionales(), auditoria: auditoriaEspia({ fallar: true }) },
          CTX_ADMIN,
          { nombre: 'Ana', apellido: 'S' },
        ),
      ).rejects.toThrow('fallo de auditoría simulado');
    });
  });

  describe('modificar', () => {
    it('modifica parcialmente y audita antes y después', async () => {
      const puerto = profesionales([PROF_1]);
      const auditoria = auditoriaEspia();
      const resultado = await modificarProfesional(
        { profesionales: puerto, auditoria },
        CTX_ADMIN,
        ID_P1,
        { apellido: ' Nuevo ' },
        '203.0.113.2',
      );
      expect(resultado).toEqual({ ...PROF_1, apellido: 'Nuevo' });
      expect(auditoria.eventos[0]?.entrada).toEqual({
        accion: 'modificacion',
        entidad: 'profesional',
        entidadId: ID_P1,
        antes: PROF_1,
        despues: { ...PROF_1, apellido: 'Nuevo' },
        ip: '203.0.113.2',
      });
    });

    it('desactivar y reactivar se audita como modificacion', async () => {
      const puerto = profesionales([PROF_1]);
      const auditoria = auditoriaEspia();
      const deps = { profesionales: puerto, auditoria };
      const inactivo = await modificarProfesional(deps, CTX_ADMIN, ID_P1, { activo: false });
      expect(inactivo.activo).toBe(false);
      const activo = await modificarProfesional(deps, CTX_ADMIN, ID_P1, { activo: true });
      expect(activo.activo).toBe(true);
      expect(auditoria.eventos.map((e) => e.entrada.accion)).toEqual([
        'modificacion',
        'modificacion',
      ]);
    });

    it('matricula null borra la matrícula', async () => {
      const resultado = await modificarProfesional(
        { profesionales: profesionales([PROF_1]), auditoria: auditoriaEspia() },
        CTX_ADMIN,
        ID_P1,
        { matricula: null },
      );
      expect(resultado.matricula).toBeNull();
    });

    it('404 si no existe, sin auditar', async () => {
      const auditoria = auditoriaEspia();
      await expect(
        modificarProfesional(
          { profesionales: profesionales(), auditoria },
          CTX_ADMIN,
          ID_INEXISTENTE,
          { nombre: 'X' },
        ),
      ).rejects.toMatchObject({ codigo: 'RECURSO_NO_ENCONTRADO' });
      expect(auditoria.eventos).toEqual([]);
    });

    it('CAMBIOS_VACIOS sin tocar puertos ni auditar', async () => {
      const puerto = profesionales([PROF_1]);
      const auditoria = auditoriaEspia();
      await expect(
        modificarProfesional({ profesionales: puerto, auditoria }, CTX_ADMIN, ID_P1, {}),
      ).rejects.toMatchObject({ codigo: 'CAMBIOS_VACIOS' });
      expect(puerto.llamadas).toEqual([]);
      expect(auditoria.eventos).toEqual([]);
    });

    it.each([
      ['recepcionista', CTX_RECEPCION],
      ['odontologo', CTX_ODONTOLOGO],
    ])('el rol %s recibe 403', async (_r, ctx) => {
      const puerto = profesionales([PROF_1]);
      await expect(
        modificarProfesional({ profesionales: puerto, auditoria: auditoriaEspia() }, ctx, ID_P1, {
          nombre: 'X',
        }),
      ).rejects.toMatchObject({ codigo: 'ACCESO_PROHIBIDO' });
      expect(puerto.llamadas).toEqual([]);
    });
  });
});

describe('sillones', () => {
  it('lista con filtro activo y obtiene por id (los tres roles leen)', async () => {
    const puerto = sillones([SILLON_1, SILLON_2]);
    expect(await listarSillones({ sillones: puerto }, CTX_ODONTOLOGO, { activo: false })).toEqual([
      SILLON_2,
    ]);
    expect(await listarSillones({ sillones: puerto }, CTX_RECEPCION, {})).toHaveLength(2);
    expect(await obtenerSillon({ sillones: puerto }, CTX_ADMIN, ID_P1)).toEqual(SILLON_1);
    await expect(
      obtenerSillon({ sillones: puerto }, CTX_ADMIN, ID_INEXISTENTE),
    ).rejects.toMatchObject({
      codigo: 'RECURSO_NO_ENCONTRADO',
    });
  });

  it('crear aplica buffer por defecto 0, recorta el nombre y audita creacion/sillon', async () => {
    const auditoria = auditoriaEspia();
    const creado = await crearSillon({ sillones: sillones(), auditoria }, CTX_ADMIN, {
      nombre: '  Sillón 3 ',
    });
    expect(creado).toMatchObject({ nombre: 'Sillón 3', bufferMinutos: 0, activo: true });
    expect(auditoria.eventos[0]?.entrada).toMatchObject({
      accion: 'creacion',
      entidad: 'sillon',
      entidadId: creado.id,
      antes: null,
      despues: creado,
    });
  });

  it('crear con buffer explícito lo conserva', async () => {
    const creado = await crearSillon(
      { sillones: sillones(), auditoria: auditoriaEspia() },
      CTX_ADMIN,
      { nombre: 'S', bufferMinutos: 10 },
    );
    expect(creado.bufferMinutos).toBe(10);
  });

  it('modificar audita antes y después; buffer 0 cuenta como cambio', async () => {
    const auditoria = auditoriaEspia();
    const resultado = await modificarSillon(
      { sillones: sillones([SILLON_1]), auditoria },
      CTX_ADMIN,
      ID_P1,
      { bufferMinutos: 0 },
    );
    expect(resultado.bufferMinutos).toBe(0);
    expect(auditoria.eventos[0]?.entrada).toMatchObject({
      accion: 'modificacion',
      entidad: 'sillon',
      antes: SILLON_1,
      despues: { ...SILLON_1, bufferMinutos: 0 },
    });
  });

  it('404, 403 y CAMBIOS_VACIOS', async () => {
    const deps = { sillones: sillones([SILLON_1]), auditoria: auditoriaEspia() };
    await expect(
      modificarSillon(deps, CTX_ADMIN, ID_INEXISTENTE, { activo: false }),
    ).rejects.toMatchObject({ codigo: 'RECURSO_NO_ENCONTRADO' });
    await expect(
      modificarSillon(deps, CTX_RECEPCION, ID_P1, { activo: false }),
    ).rejects.toMatchObject({ codigo: 'ACCESO_PROHIBIDO' });
    await expect(crearSillon(deps, CTX_ODONTOLOGO, { nombre: 'S' })).rejects.toMatchObject({
      codigo: 'ACCESO_PROHIBIDO',
    });
    await expect(modificarSillon(deps, CTX_ADMIN, ID_P1, {})).rejects.toMatchObject({
      codigo: 'CAMBIOS_VACIOS',
    });
    expect(deps.auditoria.eventos).toEqual([]);
  });
});

describe('prestaciones', () => {
  it('el filtro activo mapea al campo activa', async () => {
    const puerto = prestaciones([PREST_1, PREST_2]);
    expect(await listarPrestaciones({ prestaciones: puerto }, CTX_ADMIN, { activo: true })).toEqual(
      [PREST_1],
    );
    expect(
      await listarPrestaciones({ prestaciones: puerto }, CTX_ADMIN, { activo: false }),
    ).toEqual([PREST_2]);
    expect(await obtenerPrestacion({ prestaciones: puerto }, CTX_RECEPCION, ID_P2)).toEqual(
      PREST_2,
    );
    await expect(
      obtenerPrestacion({ prestaciones: puerto }, CTX_ADMIN, ID_INEXISTENTE),
    ).rejects.toMatchObject({ codigo: 'RECURSO_NO_ENCONTRADO' });
  });

  it('crear recorta el nombre y audita creacion/prestacion', async () => {
    const auditoria = auditoriaEspia();
    const creada = await crearPrestacion({ prestaciones: prestaciones(), auditoria }, CTX_ADMIN, {
      nombre: ' Extracción ',
      duracionMinutos: 60,
    });
    expect(creada).toMatchObject({ nombre: 'Extracción', duracionMinutos: 60, activa: true });
    expect(auditoria.eventos[0]?.entrada).toMatchObject({
      accion: 'creacion',
      entidad: 'prestacion',
      entidadId: creada.id,
    });
  });

  it('modificar activa/duración audita antes y después', async () => {
    const auditoria = auditoriaEspia();
    const deps = { prestaciones: prestaciones([PREST_1]), auditoria };
    const desactivada = await modificarPrestacion(deps, CTX_ADMIN, ID_P1, { activa: false });
    expect(desactivada.activa).toBe(false);
    const nueva = await modificarPrestacion(deps, CTX_ADMIN, ID_P1, { duracionMinutos: 90 });
    expect(nueva.duracionMinutos).toBe(90);
    expect(auditoria.eventos[1]?.entrada).toMatchObject({
      entidad: 'prestacion',
      antes: { ...PREST_1, activa: false },
      despues: { ...PREST_1, activa: false, duracionMinutos: 90 },
    });
  });

  it('404, 403 y CAMBIOS_VACIOS', async () => {
    const deps = { prestaciones: prestaciones([PREST_1]), auditoria: auditoriaEspia() };
    await expect(
      modificarPrestacion(deps, CTX_ADMIN, ID_INEXISTENTE, { activa: false }),
    ).rejects.toMatchObject({ codigo: 'RECURSO_NO_ENCONTRADO' });
    await expect(
      modificarPrestacion(deps, CTX_ODONTOLOGO, ID_P1, { activa: false }),
    ).rejects.toMatchObject({ codigo: 'ACCESO_PROHIBIDO' });
    await expect(
      crearPrestacion(deps, CTX_RECEPCION, { nombre: 'X', duracionMinutos: 10 }),
    ).rejects.toMatchObject({ codigo: 'ACCESO_PROHIBIDO' });
    await expect(modificarPrestacion(deps, CTX_ADMIN, ID_P1, {})).rejects.toMatchObject({
      codigo: 'CAMBIOS_VACIOS',
    });
    expect(deps.auditoria.eventos).toEqual([]);
  });
});
