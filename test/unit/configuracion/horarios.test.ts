import { describe, expect, it } from 'vitest';

import {
  obtenerHorarios,
  reemplazarHorarios,
  type ProfesionalDto,
} from '../../../src/application/configuracion/index.js';
import {
  CTX_ADMIN,
  CTX_RECEPCION,
  ID_INEXISTENTE,
  auditoriaEspia,
  catalogoEnMemoria,
  ctxConRol,
  horariosEnMemoria,
  vinculoEnMemoria,
} from './dobles.js';

const ID_PROF = '10000000-0000-4000-8000-000000000001';
const ID_OTRO = '10000000-0000-4000-8000-000000000002';
const ID_USUARIO_ODONTOLOGO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const PROF: ProfesionalDto = {
  id: ID_PROF,
  nombre: 'Ana',
  apellido: 'S',
  matricula: null,
  activo: true,
};
const OTRO: ProfesionalDto = {
  id: ID_OTRO,
  nombre: 'Beto',
  apellido: 'F',
  matricula: null,
  activo: true,
};

function profesionales() {
  return catalogoEnMemoria<ProfesionalDto, never, never>({
    crearDe: () => {
      throw new Error('no se usa');
    },
    aplicar: (a) => a,
    semilla: [PROF, OTRO],
  });
}

const LUNES_MANANA = { diaSemana: 1, desdeMinutos: 540, hastaMinutos: 780 };

function deps(
  opciones: {
    franjas?: Record<string, (typeof LUNES_MANANA)[]>;
    vinculos?: Record<string, string | null>;
    falla?: boolean;
  } = {},
) {
  return {
    profesionales: profesionales(),
    horarios: horariosEnMemoria(opciones.franjas),
    vinculo: vinculoEnMemoria(opciones.vinculos ?? {}),
    auditoria: auditoriaEspia({ fallar: opciones.falla === true }),
  };
}

const CTX_ODONTOLOGO = ctxConRol('odontologo', ID_USUARIO_ODONTOLOGO);

describe('obtenerHorarios', () => {
  it('administrador y recepcionista leen las franjas en formato HH:MM', async () => {
    const d = deps({
      franjas: {
        [ID_PROF]: [LUNES_MANANA, { diaSemana: 1, desdeMinutos: 1200, hastaMinutos: 1440 }],
      },
    });
    for (const ctx of [CTX_ADMIN, CTX_RECEPCION]) {
      expect(await obtenerHorarios(d, ctx, ID_PROF)).toEqual({
        profesionalId: ID_PROF,
        franjas: [
          { diaSemana: 1, horaDesde: '09:00', horaHasta: '13:00' },
          { diaSemana: 1, horaDesde: '20:00', horaHasta: '24:00' },
        ],
      });
    }
  });

  it('un profesional sin franjas devuelve lista vacía', async () => {
    expect(await obtenerHorarios(deps(), CTX_ADMIN, ID_PROF)).toEqual({
      profesionalId: ID_PROF,
      franjas: [],
    });
  });

  it('el odontólogo vinculado lee lo propio', async () => {
    const d = deps({
      franjas: { [ID_PROF]: [LUNES_MANANA] },
      vinculos: { [ID_USUARIO_ODONTOLOGO]: ID_PROF },
    });
    const resultado = await obtenerHorarios(d, CTX_ODONTOLOGO, ID_PROF);
    expect(resultado.franjas).toHaveLength(1);
  });

  it('el odontólogo no puede leer los horarios de otro profesional (403)', async () => {
    const d = deps({ vinculos: { [ID_USUARIO_ODONTOLOGO]: ID_PROF } });
    await expect(obtenerHorarios(d, CTX_ODONTOLOGO, ID_OTRO)).rejects.toMatchObject({
      codigo: 'ACCESO_PROHIBIDO',
    });
    expect(d.horarios.llamadas).toEqual([]);
  });

  it('el odontólogo sin vínculo (o inactivo) recibe 403', async () => {
    const d = deps({ vinculos: { [ID_USUARIO_ODONTOLOGO]: null } });
    await expect(obtenerHorarios(d, CTX_ODONTOLOGO, ID_PROF)).rejects.toMatchObject({
      codigo: 'ACCESO_PROHIBIDO',
    });
  });

  it('404 si el profesional no existe, también para el odontólogo (antes del chequeo de vínculo)', async () => {
    const d = deps({ vinculos: { [ID_USUARIO_ODONTOLOGO]: ID_PROF } });
    for (const ctx of [CTX_ADMIN, CTX_RECEPCION, CTX_ODONTOLOGO]) {
      await expect(obtenerHorarios(d, ctx, ID_INEXISTENTE)).rejects.toMatchObject({
        codigo: 'RECURSO_NO_ENCONTRADO',
      });
    }
    expect(d.vinculo.llamadas).toEqual([]);
  });

  it('un rol desconocido recibe 403 sin tocar puertos', async () => {
    const d = deps();
    await expect(obtenerHorarios(d, ctxConRol('x'), ID_PROF)).rejects.toMatchObject({
      codigo: 'ACCESO_PROHIBIDO',
    });
    expect(d.horarios.llamadas).toEqual([]);
  });
});

describe('reemplazarHorarios', () => {
  const FRANJAS = [
    { diaSemana: 3, horaDesde: '14:00', horaHasta: '18:00' },
    { diaSemana: 1, horaDesde: '09:00', horaHasta: '13:00' },
  ];

  it('reemplaza y audita modificacion/horario_atencion con antes y después', async () => {
    const d = deps({ franjas: { [ID_PROF]: [LUNES_MANANA] } });
    const resultado = await reemplazarHorarios(
      d,
      CTX_ADMIN,
      ID_PROF,
      { franjas: FRANJAS },
      '203.0.113.3',
    );
    expect(resultado).toEqual({
      profesionalId: ID_PROF,
      franjas: [
        { diaSemana: 1, horaDesde: '09:00', horaHasta: '13:00' },
        { diaSemana: 3, horaDesde: '14:00', horaHasta: '18:00' },
      ],
    });
    expect(d.horarios.franjas.get(ID_PROF)).toHaveLength(2);
    expect(d.auditoria.eventos).toHaveLength(1);
    expect(d.auditoria.eventos[0]?.entrada).toEqual({
      accion: 'modificacion',
      entidad: 'horario_atencion',
      entidadId: ID_PROF,
      antes: { franjas: [{ diaSemana: 1, horaDesde: '09:00', horaHasta: '13:00' }] },
      despues: { franjas: resultado.franjas },
      ip: '203.0.113.3',
    });
  });

  it('una lista vacía borra todas las franjas', async () => {
    const d = deps({ franjas: { [ID_PROF]: [LUNES_MANANA] } });
    const resultado = await reemplazarHorarios(d, CTX_ADMIN, ID_PROF, { franjas: [] });
    expect(resultado.franjas).toEqual([]);
    expect(d.horarios.franjas.get(ID_PROF)).toEqual([]);
  });

  it('FRANJA_INVALIDA y FRANJA_SOLAPADA se rechazan antes de llamar a reemplazarFranjas', async () => {
    const d = deps();
    await expect(
      reemplazarHorarios(d, CTX_ADMIN, ID_PROF, {
        franjas: [{ diaSemana: 1, horaDesde: '13:00', horaHasta: '09:00' }],
      }),
    ).rejects.toMatchObject({ codigo: 'FRANJA_INVALIDA' });
    await expect(
      reemplazarHorarios(d, CTX_ADMIN, ID_PROF, {
        franjas: [
          { diaSemana: 1, horaDesde: '09:00', horaHasta: '13:00' },
          { diaSemana: 1, horaDesde: '12:00', horaHasta: '14:00' },
        ],
      }),
    ).rejects.toMatchObject({ codigo: 'FRANJA_SOLAPADA' });
    expect(d.horarios.llamadas).not.toContain('reemplazarFranjas');
    expect(d.auditoria.eventos).toEqual([]);
  });

  it('acepta franjas contiguas', async () => {
    const d = deps();
    await expect(
      reemplazarHorarios(d, CTX_ADMIN, ID_PROF, {
        franjas: [
          { diaSemana: 1, horaDesde: '09:00', horaHasta: '13:00' },
          { diaSemana: 1, horaDesde: '13:00', horaHasta: '17:00' },
        ],
      }),
    ).resolves.toBeDefined();
  });

  it('404 si el profesional no existe, sin auditar', async () => {
    const d = deps();
    await expect(
      reemplazarHorarios(d, CTX_ADMIN, ID_INEXISTENTE, { franjas: FRANJAS }),
    ).rejects.toMatchObject({
      codigo: 'RECURSO_NO_ENCONTRADO',
    });
    expect(d.auditoria.eventos).toEqual([]);
    expect(d.horarios.llamadas).not.toContain('reemplazarFranjas');
  });

  it.each([
    ['recepcionista', CTX_RECEPCION],
    ['odontologo', CTX_ODONTOLOGO],
  ])('el rol %s recibe 403 sin tocar puertos', async (_r, ctx) => {
    const d = deps({ vinculos: { [ID_USUARIO_ODONTOLOGO]: ID_PROF } });
    await expect(reemplazarHorarios(d, ctx, ID_PROF, { franjas: FRANJAS })).rejects.toMatchObject({
      codigo: 'ACCESO_PROHIBIDO',
    });
    expect(d.horarios.llamadas).toEqual([]);
  });

  it('propaga el error de la auditoría', async () => {
    const d = deps({ falla: true });
    await expect(reemplazarHorarios(d, CTX_ADMIN, ID_PROF, { franjas: FRANJAS })).rejects.toThrow(
      'fallo de auditoría simulado',
    );
  });
});
