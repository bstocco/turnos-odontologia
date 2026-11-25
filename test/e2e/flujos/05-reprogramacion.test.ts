import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { abrirEntorno, type EntornoE2E } from '../soporte/entorno.js';
import { ponerEnMarchaUnaClinica, type ClinicaConfigurada } from '../soporte/puesta-en-marcha.js';
import type { Sesion } from '../soporte/sesion.js';
import {
  afirmarDefectoF6,
  cuerpoDeTurno,
  instanteLocal,
  sesionDeRecepcion,
} from '../soporte/turnos.js';

/*
 * Flujo 5 de 07_flujos_principales.md: reprogramación (RN-TU-02): el turno nuevo apunta al original
 * (`reprogramadoDe`) y el original pasa a `reprogramado`; si el nuevo hueco está ocupado todo se
 * revierte y el original queda intacto.
 *
 * DEFECTOS (C-12): F6 (turnos sin autenticación, confirmado por ejecución) y, por lectura del
 * código y no verificables hasta corregir F6: F7 (las acciones usan `requireRole(ctx, 'odontologo')`,
 * que rechaza a la recepción) y F10 (`POST /turnos/{id}/reprogramar` no declara cuerpo y reprograma a
 * `new Date()` por 30 minutos: no se puede indicar el nuevo horario). Se ejecutan como `it.fails`
 * con lo ESPERADO; la guarda normal avisa cuando C-12 corrija F6.
 */
interface TurnoApi {
  readonly id: string;
  readonly estado: string;
  readonly inicio: string;
  readonly reprogramadoDe?: string | null;
}

describe('Flujo 5: reprogramación', () => {
  let entorno: EntornoE2E;
  let lista: ClinicaConfigurada;
  let recepcion: Sesion;

  beforeAll(async () => {
    entorno = await abrirEntorno();
    lista = await ponerEnMarchaUnaClinica(entorno, 'reprogramacion');
    recepcion = (await sesionDeRecepcion(entorno, lista)).sesion;
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  async function enviar(metodo: 'GET' | 'POST', url: string, payload?: unknown) {
    return entorno.inject({
      method: metodo,
      url,
      headers: recepcion.encabezados,
      ...(payload === undefined ? {} : { payload }),
    });
  }

  async function agendarYConfirmar(hora: string): Promise<TurnoApi> {
    const creado = await enviar(
      'POST',
      '/api/v1/turnos',
      cuerpoDeTurno(lista, instanteLocal(lista.diaConHuecos, hora)),
    );
    expect(creado.statusCode).toBe(201);
    const turno = creado.json() as TurnoApi;
    const confirmado = await enviar('POST', `/api/v1/turnos/${turno.id}/confirmar`);
    expect(confirmado.statusCode).toBe(200);
    return turno;
  }

  it('DEFECTO F6 (C-12): con sesión válida, turnos responde 401', async () => {
    await afirmarDefectoF6(entorno, recepcion);
  });

  it.fails(
    'F6+F7+F10: reprogramar a un hueco libre crea el turno nuevo y deja el original en reprogramado',
    async () => {
      const original = await agendarYConfirmar('09:00');
      const nuevoInicio = instanteLocal(lista.diaConHuecos, '11:00');

      const respuesta = await enviar('POST', `/api/v1/turnos/${original.id}/reprogramar`, {
        inicio: nuevoInicio,
      });
      expect(respuesta.statusCode).toBe(200);
      const nuevo = respuesta.json() as TurnoApi;
      expect(nuevo.id).not.toBe(original.id);
      expect(nuevo.inicio).toBe(nuevoInicio);
      expect(nuevo.reprogramadoDe).toBe(original.id);

      const viejo = (await enviar('GET', `/api/v1/turnos/${original.id}`)).json() as TurnoApi;
      expect(viejo.estado).toBe('reprogramado');
    },
  );

  it.fails(
    'F6+F7+F10+F11: reprogramar sobre un hueco ocupado → 409 y el original queda intacto',
    async () => {
      const ocupado = await agendarYConfirmar('10:00');
      const original = await agendarYConfirmar('12:00');

      const respuesta = await enviar('POST', `/api/v1/turnos/${original.id}/reprogramar`, {
        inicio: ocupado.inicio,
      });
      expect(respuesta.statusCode).toBe(409);

      const intacto = (await enviar('GET', `/api/v1/turnos/${original.id}`)).json() as TurnoApi;
      expect(intacto.estado).toBe('confirmado');
      expect(intacto.inicio).toBe(original.inicio);
    },
  );
});
