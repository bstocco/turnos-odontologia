import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sumarDias } from '../soporte/fechas.js';
import { abrirEntorno, type EntornoE2E } from '../soporte/entorno.js';
import { afirmarSinDatosPersonales, valoresSensibles } from '../soporte/privacidad.js';
import {
  pedirComo,
  ponerEnMarchaUnaClinica,
  type ClinicaConfigurada,
} from '../soporte/puesta-en-marcha.js';
import type { Sesion } from '../soporte/sesion.js';
import {
  afirmarDefectoF6,
  cuerpoDeTurno,
  insertarBloqueoPorFixture,
  instanteLocal,
  recursosAdicionales,
  sesionDeRecepcion,
} from '../soporte/turnos.js';

/*
 * Flujo 2 de 07_flujos_principales.md: agendar un turno desde la recepción.
 *
 * DEFECTO F6 (C-12): `POST /turnos`, `GET /turnos/{id}` y `GET /agenda` no registran la
 * autenticación y responden 401 incluso con sesión válida. Los escenarios se escriben con el
 * comportamiento ESPERADO y se ejecutan como `it.fails` (nunca se altera lo esperado); la guarda
 * normal de abajo avisa el día que C-12 lo corrija.
 */
interface TurnoCreado {
  readonly id: string;
  readonly estado: string;
  readonly inicio: string;
}

describe('Flujo 2: agendar desde la recepción', () => {
  let entorno: EntornoE2E;
  let lista: ClinicaConfigurada;
  let recepcion: Sesion;
  let recepcionId: string;
  let segundo: { profesionalId: string; sillonId: string };

  beforeAll(async () => {
    entorno = await abrirEntorno();
    lista = await ponerEnMarchaUnaClinica(entorno, 'agendar-recepcion');
    const r = await sesionDeRecepcion(entorno, lista);
    recepcion = r.sesion;
    recepcionId = r.usuario.id;
    segundo = await recursosAdicionales(entorno, lista);
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  function agendar(cuerpo: unknown) {
    return entorno.inject({
      method: 'POST',
      url: '/api/v1/turnos',
      headers: recepcion.encabezados,
      payload: cuerpo,
    });
  }

  it('DEFECTO F6 (C-12): con sesión válida, turnos responde 401', async () => {
    await afirmarDefectoF6(entorno, recepcion);
  });

  it.fails('F6: la recepcionista agenda un turno (201) y lo ve en la agenda', async () => {
    const inicio = instanteLocal(lista.diaConHuecos, '09:00');
    const respuesta = await agendar(cuerpoDeTurno(lista, inicio));
    expect(respuesta.statusCode).toBe(201);
    const turno = respuesta.json() as TurnoCreado;
    expect(turno.id).toEqual(expect.any(String));

    const detalle = await pedirComo<TurnoCreado>(
      entorno,
      recepcion,
      'GET',
      `/api/v1/turnos/${turno.id}`,
      200,
    );
    expect(detalle.id).toBe(turno.id);

    const agenda = await pedirComo<{ turnos: { id: string }[] }>(
      entorno,
      recepcion,
      'GET',
      `/api/v1/agenda?desde=${lista.diaConHuecos}&hasta=${sumarDias(lista.diaConHuecos, 1)}&profesionalId=${lista.profesionalId}`,
      200,
    );
    expect(agenda.turnos.map((t) => t.id)).toContain(turno.id);
    afirmarSinDatosPersonales(entorno.logs, valoresSensibles(lista.paciente));
  });

  it.fails(
    'F6+F11: mismo profesional en otro sillón → 409 TURNO_SOLAPADO_PROFESIONAL',
    async () => {
      const inicio = instanteLocal(lista.diaConHuecos, '10:00');
      expect((await agendar(cuerpoDeTurno(lista, inicio))).statusCode).toBe(201);
      const solapado = await agendar(cuerpoDeTurno(lista, inicio, { sillonId: segundo.sillonId }));
      expect(solapado.statusCode).toBe(409);
      expect((solapado.json() as { codigo: string }).codigo).toBe('TURNO_SOLAPADO_PROFESIONAL');
    },
  );

  it.fails('F6+F11: mismo sillón con otro profesional → 409 TURNO_SOLAPADO_SILLON', async () => {
    const inicio = instanteLocal(lista.diaConHuecos, '11:00');
    expect((await agendar(cuerpoDeTurno(lista, inicio))).statusCode).toBe(201);
    const solapado = await agendar(
      cuerpoDeTurno(lista, inicio, { profesionalId: segundo.profesionalId }),
    );
    expect(solapado.statusCode).toBe(409);
    expect((solapado.json() as { codigo: string }).codigo).toBe('TURNO_SOLAPADO_SILLON');
  });

  it.fails('F6: fuera del horario de atención → 422 TURNO_FUERA_DE_HORARIO', async () => {
    const respuesta = await agendar(
      cuerpoDeTurno(lista, instanteLocal(lista.diaConHuecos, '20:00')),
    );
    expect(respuesta.statusCode).toBe(422);
    expect((respuesta.json() as { codigo: string }).codigo).toBe('TURNO_FUERA_DE_HORARIO');
  });

  it.fails('F6: en un feriado de la clínica → 422 TURNO_EN_FERIADO', async () => {
    const respuesta = await agendar(cuerpoDeTurno(lista, instanteLocal(lista.diaFeriado, '09:00')));
    expect(respuesta.statusCode).toBe(422);
    expect((respuesta.json() as { codigo: string }).codigo).toBe('TURNO_EN_FERIADO');
  });

  it.fails('F6: dentro de un bloqueo del profesional → 422 TURNO_EN_BLOQUEO', async () => {
    await insertarBloqueoPorFixture(
      lista.clinica.id,
      lista.profesionalId,
      recepcionId,
      instanteLocal(lista.diaConHuecos, '12:00'),
      instanteLocal(lista.diaConHuecos, '13:00'),
    );
    const respuesta = await agendar(
      cuerpoDeTurno(lista, instanteLocal(lista.diaConHuecos, '12:00')),
    );
    expect(respuesta.statusCode).toBe(422);
    expect((respuesta.json() as { codigo: string }).codigo).toBe('TURNO_EN_BLOQUEO');
  });
});
