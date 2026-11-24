import { describe, expect, it } from 'vitest';

import {
  PLANTILLAS_FERIADOS_NACIONALES,
  copiarPlantilla,
  crearFeriado,
  eliminarFeriado,
  listarFeriados,
  obtenerPlantilla,
} from '../../../src/application/configuracion/index.js';
import {
  CTX_ADMIN,
  CTX_ODONTOLOGO,
  CTX_RECEPCION,
  ID_INEXISTENTE,
  auditoriaEspia,
  ctxConRol,
  feriadosEnMemoria,
} from './dobles.js';

const F1 = {
  id: 'f0000000-0000-4000-8000-0000000000a1',
  fecha: '2026-05-01',
  descripcion: 'Trabajador',
};
const F2 = {
  id: 'f0000000-0000-4000-8000-0000000000a2',
  fecha: '2027-01-01',
  descripcion: 'Año Nuevo',
};

describe('listarFeriados', () => {
  it('los tres roles leen y se puede filtrar por año', async () => {
    const feriados = feriadosEnMemoria([F1, F2]);
    for (const ctx of [CTX_ADMIN, CTX_RECEPCION, CTX_ODONTOLOGO]) {
      expect(await listarFeriados({ feriados }, ctx, {})).toHaveLength(2);
    }
    expect(
      (await listarFeriados({ feriados }, CTX_ADMIN, { anio: 2026 })).map((f) => f.id),
    ).toEqual([F1.id]);
    expect(
      (await listarFeriados({ feriados }, CTX_ADMIN, { anio: 2027 })).map((f) => f.id),
    ).toEqual([F2.id]);
    expect(await listarFeriados({ feriados }, CTX_ADMIN, { anio: 2030 })).toEqual([]);
  });

  it('un rol desconocido recibe 403', async () => {
    await expect(
      listarFeriados({ feriados: feriadosEnMemoria() }, ctxConRol('x'), {}),
    ).rejects.toMatchObject({ codigo: 'ACCESO_PROHIBIDO' });
  });
});

describe('crearFeriado', () => {
  it('crea, recorta la descripción y audita creacion/feriado con origen manual', async () => {
    const feriados = feriadosEnMemoria();
    const auditoria = auditoriaEspia();
    const creado = await crearFeriado(
      { feriados, auditoria },
      CTX_ADMIN,
      { fecha: '2026-09-21', descripcion: '  Día local  ' },
      '203.0.113.4',
    );
    expect(creado).toMatchObject({ fecha: '2026-09-21', descripcion: 'Día local' });
    expect(auditoria.eventos[0]?.entrada).toEqual({
      accion: 'creacion',
      entidad: 'feriado',
      entidadId: creado.id,
      antes: null,
      despues: { fecha: '2026-09-21', descripcion: 'Día local', origen: 'manual' },
      ip: '203.0.113.4',
    });
  });

  it.each(['2026-02-30', '2026-13-01', '2026-4-1', 'no-es-fecha'])(
    'rechaza la fecha %s con 400 sin tocar puertos',
    async (fecha) => {
      const feriados = feriadosEnMemoria();
      const auditoria = auditoriaEspia();
      await expect(
        crearFeriado({ feriados, auditoria }, CTX_ADMIN, { fecha, descripcion: 'X' }),
      ).rejects.toMatchObject({
        codigo: 'FECHA_HORA_LOCAL_INVALIDA',
        tipo: 'solicitud_invalida',
      });
      expect(feriados.llamadas).toEqual([]);
      expect(auditoria.eventos).toEqual([]);
    },
  );

  it.each([CTX_RECEPCION, CTX_ODONTOLOGO])(
    'el rol %# recibe 403 sin tocar puertos',
    async (ctx) => {
      const feriados = feriadosEnMemoria();
      await expect(
        crearFeriado({ feriados, auditoria: auditoriaEspia() }, ctx, {
          fecha: '2026-09-21',
          descripcion: 'X',
        }),
      ).rejects.toMatchObject({ codigo: 'ACCESO_PROHIBIDO' });
      expect(feriados.llamadas).toEqual([]);
    },
  );

  it('propaga el error de la auditoría', async () => {
    await expect(
      crearFeriado(
        { feriados: feriadosEnMemoria(), auditoria: auditoriaEspia({ fallar: true }) },
        CTX_ADMIN,
        { fecha: '2026-09-21', descripcion: 'X' },
      ),
    ).rejects.toThrow('fallo de auditoría simulado');
  });
});

describe('eliminarFeriado', () => {
  it('elimina y audita eliminacion con datos_antes', async () => {
    const feriados = feriadosEnMemoria([F1, F2]);
    const auditoria = auditoriaEspia();
    await eliminarFeriado({ feriados, auditoria }, CTX_ADMIN, F1.id, '203.0.113.5');
    expect(feriados.items.map((i) => i.id)).toEqual([F2.id]);
    expect(auditoria.eventos[0]?.entrada).toEqual({
      accion: 'eliminacion',
      entidad: 'feriado',
      entidadId: F1.id,
      antes: { fecha: F1.fecha, descripcion: F1.descripcion },
      despues: null,
      ip: '203.0.113.5',
    });
  });

  it('un id ausente da 404 sin eliminar ni auditar', async () => {
    const feriados = feriadosEnMemoria([F1]);
    const auditoria = auditoriaEspia();
    await expect(
      eliminarFeriado({ feriados, auditoria }, CTX_ADMIN, ID_INEXISTENTE),
    ).rejects.toMatchObject({ codigo: 'RECURSO_NO_ENCONTRADO' });
    expect(feriados.llamadas).not.toContain('eliminar');
    expect(auditoria.eventos).toEqual([]);
  });

  it.each([CTX_RECEPCION, CTX_ODONTOLOGO])('el rol %# recibe 403', async (ctx) => {
    const feriados = feriadosEnMemoria([F1]);
    await expect(
      eliminarFeriado({ feriados, auditoria: auditoriaEspia() }, ctx, F1.id),
    ).rejects.toMatchObject({ codigo: 'ACCESO_PROHIBIDO' });
    expect(feriados.items).toHaveLength(1);
  });
});

describe('obtenerPlantilla', () => {
  it('devuelve la plantilla del año a los tres roles', () => {
    for (const ctx of [CTX_ADMIN, CTX_RECEPCION, CTX_ODONTOLOGO]) {
      const p = obtenerPlantilla(ctx, 2026);
      expect(p.anio).toBe(2026);
      expect(p.feriados).toEqual(PLANTILLAS_FERIADOS_NACIONALES[2026]);
    }
  });

  it('un año sin plantilla da 422 PLANTILLA_FERIADOS_NO_DISPONIBLE', () => {
    expect(() => obtenerPlantilla(CTX_ADMIN, 2031)).toThrowError(
      expect.objectContaining({
        codigo: 'PLANTILLA_FERIADOS_NO_DISPONIBLE',
        tipo: 'regla_de_negocio',
      }) as Error,
    );
  });
});

describe('copiarPlantilla', () => {
  const total2026 = (PLANTILLAS_FERIADOS_NACIONALES[2026] ?? []).length;

  it('crea todos los feriados y audita uno por feriado con origen plantilla_nacional', async () => {
    const feriados = feriadosEnMemoria();
    const auditoria = auditoriaEspia();
    const r = await copiarPlantilla({ feriados, auditoria }, CTX_ADMIN, 2026, '203.0.113.6');
    expect(r.anio).toBe(2026);
    expect(r.creados).toHaveLength(total2026);
    expect(r.omitidas).toEqual([]);
    expect(auditoria.eventos).toHaveLength(total2026);
    expect(auditoria.eventos[0]?.entrada).toMatchObject({
      accion: 'creacion',
      entidad: 'feriado',
      entidadId: r.creados[0]?.id,
      antes: null,
      despues: { fecha: r.creados[0]?.fecha, origen: 'plantilla_nacional' },
      ip: '203.0.113.6',
    });
  });

  it('crea solo las fechas ausentes y no toca la descripción propia', async () => {
    const propio = {
      id: 'f0000000-0000-4000-8000-0000000000b1',
      fecha: '2026-05-01',
      descripcion: 'Descripción propia',
    };
    const feriados = feriadosEnMemoria([propio]);
    const auditoria = auditoriaEspia();
    const r = await copiarPlantilla({ feriados, auditoria }, CTX_ADMIN, 2026);
    expect(r.omitidas).toEqual(['2026-05-01']);
    expect(r.creados).toHaveLength(total2026 - 1);
    expect(feriados.items.find((i) => i.fecha === '2026-05-01')?.descripcion).toBe(
      'Descripción propia',
    );
    expect(auditoria.eventos).toHaveLength(total2026 - 1);
  });

  it('una segunda copia crea 0 y no audita', async () => {
    const feriados = feriadosEnMemoria();
    const auditoria = auditoriaEspia();
    await copiarPlantilla({ feriados, auditoria }, CTX_ADMIN, 2027);
    const eventos = auditoria.eventos.length;
    const segunda = await copiarPlantilla({ feriados, auditoria }, CTX_ADMIN, 2027);
    expect(segunda.creados).toEqual([]);
    expect(segunda.omitidas).toHaveLength((PLANTILLAS_FERIADOS_NACIONALES[2027] ?? []).length);
    expect(auditoria.eventos).toHaveLength(eventos);
  });

  it('año sin plantilla: 422 sin tocar puertos', async () => {
    const feriados = feriadosEnMemoria();
    await expect(
      copiarPlantilla({ feriados, auditoria: auditoriaEspia() }, CTX_ADMIN, 2031),
    ).rejects.toMatchObject({ codigo: 'PLANTILLA_FERIADOS_NO_DISPONIBLE' });
    expect(feriados.llamadas).toEqual([]);
  });

  it.each([CTX_RECEPCION, CTX_ODONTOLOGO])('el rol %# recibe 403', async (ctx) => {
    const feriados = feriadosEnMemoria();
    await expect(
      copiarPlantilla({ feriados, auditoria: auditoriaEspia() }, ctx, 2026),
    ).rejects.toMatchObject({ codigo: 'ACCESO_PROHIBIDO' });
    expect(feriados.llamadas).toEqual([]);
  });

  it('si la auditoría falla se propaga el error', async () => {
    await expect(
      copiarPlantilla(
        { feriados: feriadosEnMemoria(), auditoria: auditoriaEspia({ fallar: true }) },
        CTX_ADMIN,
        2026,
      ),
    ).rejects.toThrow('fallo de auditoría simulado');
  });
});
