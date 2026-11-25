import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { abrirEntorno, type EntornoE2E } from '../soporte/entorno.js';
import { sumarDias } from '../soporte/fechas.js';
import { afirmarSinDatosPersonales, valoresSensibles } from '../soporte/privacidad.js';
import { ponerEnMarchaUnaClinica, type ClinicaConfigurada } from '../soporte/puesta-en-marcha.js';
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
 * Flujo 6 de 07_flujos_principales.md: bloqueo de una franja de la agenda (RN-AG-08).
 *
 * La parte pública (la franja bloqueada no se ofrece) se verifica con un bloqueo por fixture y SÍ
 * corre normal. Las partes que usan `POST /bloqueos` y `POST /turnos` se marcan `it.fails` por los
 * defectos de C-12: F6 (sin autenticación, confirmado), F7 (`requireRole` exacto de odontólogo: la
 * recepción recibe 403, confirmado por ejecución con la autenticación aplicada fuera del repo) y F12
 * (un bloqueo sobre un turno activo responde 201 en lugar de 409 con la lista de turnos en conflicto).
 */
interface Disponibilidad {
  readonly huecos: readonly { readonly inicio: string; readonly fin: string }[];
}

describe('Flujo 6: bloqueo de franja', () => {
  let entorno: EntornoE2E;
  let lista: ClinicaConfigurada;
  let recepcion: Sesion;
  let recepcionId: string;
  let segundo: { profesionalId: string; sillonId: string };

  beforeAll(async () => {
    entorno = await abrirEntorno();
    lista = await ponerEnMarchaUnaClinica(entorno, 'bloqueo-de-franja');
    const r = await sesionDeRecepcion(entorno, lista);
    recepcion = r.sesion;
    recepcionId = r.usuario.id;
    segundo = await recursosAdicionales(entorno, lista);
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  async function huecosPublicos(profesionalId: string): Promise<number[]> {
    const consulta = new URLSearchParams({
      profesionalId,
      prestacionId: lista.prestacionId,
      desde: lista.diaConHuecos,
      hasta: sumarDias(lista.diaConHuecos, 1),
    }).toString();
    const respuesta = await entorno.inject({
      method: 'GET',
      url: `/api/v1/publico/${lista.clinica.slug}/disponibilidad?${consulta}`,
    });
    expect(respuesta.statusCode).toBe(200);
    return (respuesta.json() as Disponibilidad).huecos.map((h) => Date.parse(h.inicio));
  }

  it('la disponibilidad pública no ofrece la franja bloqueada y sí la del otro profesional', async () => {
    const inicioBloqueo = instanteLocal(lista.diaConHuecos, '10:00');
    const finBloqueo = instanteLocal(lista.diaConHuecos, '11:00');
    const antes = await huecosPublicos(lista.profesionalId);
    expect(antes).toContain(Date.parse(inicioBloqueo));

    await insertarBloqueoPorFixture(
      lista.clinica.id,
      lista.profesionalId,
      recepcionId,
      inicioBloqueo,
      finBloqueo,
    );

    const bloqueado = await huecosPublicos(lista.profesionalId);
    const enLaFranja = bloqueado.filter(
      (t) => t >= Date.parse(inicioBloqueo) && t < Date.parse(finBloqueo),
    );
    expect(enLaFranja).toEqual([]);
    expect(bloqueado).toContain(Date.parse(instanteLocal(lista.diaConHuecos, '09:00')));
    expect(bloqueado).toContain(Date.parse(finBloqueo));

    // Control: el bloqueo es del profesional, no de la clínica; el otro conserva su hueco de las 10:00.
    expect(await huecosPublicos(segundo.profesionalId)).toContain(Date.parse(inicioBloqueo));
  });

  it('DEFECTO F6 (C-12): con sesión válida, bloqueos responde 401', async () => {
    await afirmarDefectoF6(entorno, recepcion);
    const respuesta = await entorno.inject({
      method: 'POST',
      url: '/api/v1/bloqueos',
      headers: recepcion.encabezados,
      payload: {
        profesionalId: lista.profesionalId,
        inicio: instanteLocal(lista.diaConHuecos, '12:00'),
        fin: instanteLocal(lista.diaConHuecos, '13:00'),
      },
    });
    expect(respuesta.statusCode).toBe(401);
  });

  it.fails(
    'F6+F7: la recepción bloquea una franja libre (201) y puede quitarla (DELETE)',
    async () => {
      const crear = await entorno.inject({
        method: 'POST',
        url: '/api/v1/bloqueos',
        headers: recepcion.encabezados,
        payload: {
          profesionalId: segundo.profesionalId,
          inicio: instanteLocal(lista.diaConHuecos, '11:00'),
          fin: instanteLocal(lista.diaConHuecos, '12:00'),
          motivo: 'Bloqueo sintético',
        },
      });
      expect(crear.statusCode).toBe(201);
      const { id } = crear.json() as { id: string };
      expect(await huecosPublicos(segundo.profesionalId)).not.toContain(
        Date.parse(instanteLocal(lista.diaConHuecos, '11:00')),
      );

      const quitar = await entorno.inject({
        method: 'DELETE',
        url: `/api/v1/bloqueos/${id}`,
        headers: recepcion.encabezados,
      });
      expect(quitar.statusCode).toBe(200);
      expect(await huecosPublicos(segundo.profesionalId)).toContain(
        Date.parse(instanteLocal(lista.diaConHuecos, '11:00')),
      );
    },
  );

  it.fails(
    'F6+F7+F12: un bloqueo sobre un turno activo → 409 con la lista de turnos en conflicto',
    async () => {
      const turno = await entorno.inject({
        method: 'POST',
        url: '/api/v1/turnos',
        headers: recepcion.encabezados,
        payload: cuerpoDeTurno(lista, instanteLocal(lista.diaConHuecos, '12:00')),
      });
      expect(turno.statusCode).toBe(201);
      const { id: turnoId } = turno.json() as { id: string };

      const bloqueo = await entorno.inject({
        method: 'POST',
        url: '/api/v1/bloqueos',
        headers: recepcion.encabezados,
        payload: {
          profesionalId: lista.profesionalId,
          inicio: instanteLocal(lista.diaConHuecos, '12:00'),
          fin: instanteLocal(lista.diaConHuecos, '13:00'),
        },
      });
      expect(bloqueo.statusCode).toBe(409);
      expect(bloqueo.body).toContain(turnoId);
    },
  );

  it('los logs del flujo no contienen datos personales del paciente (Ley 25.326)', () => {
    afirmarSinDatosPersonales(entorno.logs, valoresSensibles(lista.paciente));
  });
});
