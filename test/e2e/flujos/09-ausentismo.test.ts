import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { abrirEntorno, type EntornoE2E } from '../soporte/entorno.js';
import { afirmarSinDatosPersonales, valoresSensibles } from '../soporte/privacidad.js';
import { ponerEnMarchaUnaClinica, type ClinicaConfigurada } from '../soporte/puesta-en-marcha.js';
import type { Sesion } from '../soporte/sesion.js';
import {
  afirmarDefectoF6,
  insertarTurnoPorFixture,
  recursosAdicionales,
  sesionDeRecepcion,
} from '../soporte/turnos.js';

/*
 * Flujo 9 de 07_flujos_principales.md: registro de ausentismo (RN-TU-04, RN-AB-01/02).
 *
 * La consulta del registro (`GET /ausentismo`, C-16) SÍ corre normal con turnos `ausente` por
 * fixture. La acción `POST /turnos/{id}/ausente` (C-12) se marca `it.fails` por: F6 (sin
 * autenticación, confirmado), F7 (`requireRole` exacto de odontólogo: la recepción recibe 403),
 * F13 (no deja registro de auditoría) y F14 (turno futuro responde 422 `TURNO_AUN_NO_INICIADO`; el
 * flujo 9 de la KB dice 409). F7, F13 y F14 se confirmaron por ejecución con la autenticación aplicada
 * fuera del repo (módulos envueltos en un directorio de verificación descartable).
 */
interface Ausentismo {
  readonly total: number;
  readonly ausentes: readonly { readonly id: string; readonly profesionalId: string | null }[];
}

describe('Flujo 9: ausentismo', () => {
  let entorno: EntornoE2E;
  let lista: ClinicaConfigurada;
  let otra: ClinicaConfigurada;
  let recepcion: Sesion;
  let segundo: { profesionalId: string; sillonId: string };

  beforeAll(async () => {
    entorno = await abrirEntorno();
    lista = await ponerEnMarchaUnaClinica(entorno, 'ausentismo');
    otra = await ponerEnMarchaUnaClinica(entorno, 'ausentismo-otra');
    recepcion = (await sesionDeRecepcion(entorno, lista)).sesion;
    segundo = await recursosAdicionales(entorno, lista);
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  const haceHoras = (horas: number): Date => new Date(Date.now() - horas * 3_600_000);

  it('el administrador consulta el registro: solo ausentes de SU clínica y con filtro por profesional', async () => {
    const propio = await insertarTurnoPorFixture(lista.clinica.id, lista, {
      inicio: haceHoras(5),
      estado: 'ausente',
    });
    const ajeno = await insertarTurnoPorFixture(otra.clinica.id, otra, {
      inicio: haceHoras(5),
      estado: 'ausente',
    });
    await insertarTurnoPorFixture(lista.clinica.id, lista, {
      inicio: haceHoras(8),
      estado: 'atendido',
    });

    const respuesta = await entorno.inject({
      method: 'GET',
      url: '/api/v1/ausentismo',
      headers: lista.sesion.encabezados,
    });
    expect(respuesta.statusCode).toBe(200);
    const registro = respuesta.json() as Ausentismo;
    expect(registro.total).toBe(1);
    expect(registro.ausentes.map((a) => a.id)).toEqual([propio]);
    expect(registro.ausentes.map((a) => a.id)).not.toContain(ajeno);

    const otroProfesional = await entorno.inject({
      method: 'GET',
      url: `/api/v1/ausentismo?profesionalId=${segundo.profesionalId}`,
      headers: lista.sesion.encabezados,
    });
    expect((otroProfesional.json() as Ausentismo).total).toBe(0);
  });

  it('DEFECTO F6 (C-12): con sesión válida, la acción sobre un turno responde 401', async () => {
    await afirmarDefectoF6(entorno, recepcion);
  });

  it.fails(
    'F6+F7+F13: la recepción marca ausente un turno confirmado ya comenzado, con auditoría',
    async () => {
      const turnoId = await insertarTurnoPorFixture(lista.clinica.id, lista, {
        inicio: haceHoras(2),
        estado: 'confirmado',
      });
      const respuesta = await entorno.inject({
        method: 'POST',
        url: `/api/v1/turnos/${turnoId}/ausente`,
        headers: recepcion.encabezados,
      });
      expect(respuesta.statusCode).toBe(200);
      expect((respuesta.json() as { estado: string }).estado).toBe('ausente');

      const auditoria = await entorno.inject({
        method: 'GET',
        url: '/api/v1/auditoria?entidad=turno',
        headers: lista.sesion.encabezados,
      });
      const registros = auditoria.json() as { entidadId: string | null }[];
      expect(registros.some((r) => r.entidadId === turnoId)).toBe(true);
    },
  );

  it.fails('F6+F7+F14: un turno futuro o en otro estado → 409', async () => {
    const futuro = await insertarTurnoPorFixture(lista.clinica.id, lista, {
      inicio: new Date(Date.now() + 30 * 86_400_000),
      estado: 'confirmado',
    });
    const atendido = await insertarTurnoPorFixture(lista.clinica.id, lista, {
      inicio: haceHoras(3),
      estado: 'atendido',
    });
    for (const id of [futuro, atendido]) {
      const respuesta = await entorno.inject({
        method: 'POST',
        url: `/api/v1/turnos/${id}/ausente`,
        headers: recepcion.encabezados,
      });
      expect(respuesta.statusCode).toBe(409);
    }
  });

  it('los logs del flujo no contienen datos personales del paciente (Ley 25.326)', () => {
    afirmarSinDatosPersonales(entorno.logs, valoresSensibles(lista.paciente));
  });
});
