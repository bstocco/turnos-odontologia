import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { aLocal, sumarDias } from '../soporte/fechas.js';
import { abrirEntorno, ipNueva, type EntornoE2E } from '../soporte/entorno.js';
import {
  pedirComo,
  ponerEnMarchaUnaClinica,
  type ClinicaConfigurada,
} from '../soporte/puesta-en-marcha.js';

/*
 * Flujo 3 de 07_flujos_principales.md, parte de CONSULTA (paso 1): sin sesión, por el `slug`.
 * El código por email, la reserva y los enlaces son de la Fase 2 (C-15).
 */
interface Disponibilidad {
  readonly zonaHoraria: string;
  readonly huecos: readonly { readonly inicio: string; readonly fin: string }[];
}

describe('Flujo 3: reserva pública — consulta', () => {
  let entorno: EntornoE2E;
  let lista: ClinicaConfigurada;

  beforeAll(async () => {
    entorno = await abrirEntorno();
    lista = await ponerEnMarchaUnaClinica(entorno, 'reserva-publica');
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  function consultaDeDisponibilidad(desde: string, hasta: string): string {
    const consulta = new URLSearchParams({
      profesionalId: lista.profesionalId,
      prestacionId: lista.prestacionId,
      desde,
      hasta,
    });
    return `/api/v1/publico/${lista.clinica.slug}/disponibilidad?${consulta.toString()}`;
  }

  it('ofrece las prestaciones y los profesionales activos de la clínica, sin sesión', async () => {
    const prestaciones = await entorno.inject({
      method: 'GET',
      url: `/api/v1/publico/${lista.clinica.slug}/prestaciones`,
    });
    expect(prestaciones.statusCode).toBe(200);
    expect(prestaciones.json()).toEqual({
      prestaciones: [{ id: lista.prestacionId, nombre: 'Consulta sintética', duracionMinutos: 30 }],
    });

    const profesionales = await entorno.inject({
      method: 'GET',
      url: `/api/v1/publico/${lista.clinica.slug}/profesionales`,
    });
    expect(profesionales.statusCode).toBe(200);
    expect(profesionales.json()).toEqual({
      profesionales: [{ id: lista.profesionalId, nombre: 'Profesional', apellido: 'Sintético' }],
    });
  });

  it('la disponibilidad refleja el horario configurado y no ofrece nada en el feriado cargado', async () => {
    const hasta = sumarDias(lista.diaFeriado, 1);
    const respuesta = await entorno.inject({
      method: 'GET',
      url: consultaDeDisponibilidad(lista.diaConHuecos, hasta),
    });
    expect(respuesta.statusCode).toBe(200);
    const { zonaHoraria, huecos } = respuesta.json() as Disponibilidad;
    expect(zonaHoraria).toBe('America/Argentina/Buenos_Aires');

    const locales = huecos.map((h) => ({ inicio: aLocal(h.inicio), fin: aLocal(h.fin) }));
    expect(locales.length).toBeGreaterThan(0);
    // El día configurado ofrece huecos, todos dentro del horario 09:00-13:00 de lunes a viernes.
    expect(locales.some((h) => h.inicio.fecha === lista.diaConHuecos)).toBe(true);
    for (const hueco of locales) {
      expect(hueco.inicio.hora >= '09:00').toBe(true);
      expect(hueco.fin.hora <= '13:00' && hueco.fin.hora > hueco.inicio.hora).toBe(true);
    }
    // Ningún hueco en el feriado ni en fin de semana.
    expect(locales.filter((h) => h.inicio.fecha === lista.diaFeriado)).toEqual([]);
    for (const hueco of locales) {
      const dia = new Date(`${hueco.inicio.fecha}T00:00:00Z`).getUTCDay();
      expect([0, 6]).not.toContain(dia);
    }
  });

  it('al quitar el feriado, ese día vuelve a tener huecos (el feriado era la causa)', async () => {
    const otra = await ponerEnMarchaUnaClinica(entorno, 'reserva-publica');
    const feriados = await pedirComo<{ id: string; fecha: string }[]>(
      entorno,
      otra.sesion,
      'GET',
      '/api/v1/feriados',
      200,
    );
    const feriado = feriados.find((f) => f.fecha === otra.diaFeriado);
    expect(feriado).toBeDefined();
    const consulta = new URLSearchParams({
      profesionalId: otra.profesionalId,
      prestacionId: otra.prestacionId,
      desde: otra.diaFeriado,
      hasta: sumarDias(otra.diaFeriado, 1),
    }).toString();
    const url = `/api/v1/publico/${otra.clinica.slug}/disponibilidad?${consulta}`;

    const antes = await entorno.inject({ method: 'GET', url });
    expect((antes.json() as Disponibilidad).huecos).toEqual([]);

    await pedirComo(entorno, otra.sesion, 'DELETE', `/api/v1/feriados/${feriado?.id ?? ''}`, 204);
    const despues = await entorno.inject({ method: 'GET', url });
    expect((despues.json() as Disponibilidad).huecos.length).toBeGreaterThan(0);
  });

  it('la misma consulta con y sin token da exactamente la misma respuesta', async () => {
    const url = consultaDeDisponibilidad(lista.diaConHuecos, sumarDias(lista.diaConHuecos, 1));
    const sinToken = await entorno.inject({ method: 'GET', url });
    const conToken = await entorno.inject({
      method: 'GET',
      url,
      headers: lista.sesion.encabezados,
    });
    expect(conToken.statusCode).toBe(sinToken.statusCode);
    expect(conToken.json()).toEqual(sinToken.json());
  });

  it('un slug inexistente responde 404 sin revelar información de otras clínicas', async () => {
    const inexistente = await entorno.inject({
      method: 'GET',
      url: '/api/v1/publico/e2e-no-existe-0000/prestaciones',
    });
    expect(inexistente.statusCode).toBe(404);
    const cuerpo = inexistente.body;
    expect(cuerpo).not.toContain(lista.clinica.slug);
    expect(cuerpo).not.toContain(lista.clinica.id);

    // Un profesional de otra clínica tampoco se distingue de uno inexistente.
    const otra = await ponerEnMarchaUnaClinica(entorno, 'reserva-publica');
    const cruzada = await entorno.inject({
      method: 'GET',
      url: `/api/v1/publico/${otra.clinica.slug}/disponibilidad?${new URLSearchParams({
        profesionalId: lista.profesionalId,
        prestacionId: otra.prestacionId,
        desde: otra.diaConHuecos,
        hasta: sumarDias(otra.diaConHuecos, 1),
      }).toString()}`,
    });
    expect(cruzada.statusCode).toBe(404);
    expect(cruzada.body).not.toContain(lista.profesionalId);
  });

  it('un rango de fechas inválido responde 400 con su código de dominio', async () => {
    const respuesta = await entorno.inject({
      method: 'GET',
      url: consultaDeDisponibilidad(lista.diaConHuecos, lista.diaConHuecos),
    });
    expect(respuesta.statusCode).toBe(400);
    expect((respuesta.json() as { codigo: string }).codigo).toBe('RANGO_FECHAS_INVALIDO');
  });

  it('supera el cupo por IP y responde 429 sin tocar a las demás IP', async () => {
    const ip = ipNueva();
    const estados: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      const respuesta = await entorno.inject({
        method: 'GET',
        url: `/api/v1/publico/${lista.clinica.slug}/prestaciones`,
        ip,
      });
      estados.push(respuesta.statusCode);
    }
    expect(estados[0]).toBe(200);
    expect(estados).toContain(429);

    const otraIp = await entorno.inject({
      method: 'GET',
      url: `/api/v1/publico/${lista.clinica.slug}/prestaciones`,
    });
    expect(otraIp.statusCode).toBe(200);
  });
});
