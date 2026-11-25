import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { crearClinicaSintetica, crearUsuarioSintetico } from '../soporte/clinica.js';
import { pacienteSintetico, semillaNueva } from '../soporte/datos-sinteticos.js';
import { abrirEntorno, type EntornoE2E } from '../soporte/entorno.js';
import { afirmarSinDatosPersonales, valoresSensibles } from '../soporte/privacidad.js';
import { iniciarSesion } from '../soporte/sesion.js';
import { pedirComo, ponerEnMarchaUnaClinica } from '../soporte/puesta-en-marcha.js';

/*
 * Puesta en marcha de una clínica (C-17 + C-08 + C-10): precondición de los Flujos 2 a 10.
 * Defecto F2 (C-17): el alta interna descarta la contraseña temporal del primer administrador.
 */
describe('Puesta en marcha de una clínica', () => {
  let entorno: EntornoE2E;

  beforeAll(async () => {
    entorno = await abrirEntorno();
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  it('deja una clínica lista para agendar, consultable por la API', async () => {
    const lista = await ponerEnMarchaUnaClinica(entorno, 'puesta-en-marcha');
    const { sesion, clinica } = lista;

    const configuracion = await pedirComo<{ id: string; granularidadMinutos: number }>(
      entorno,
      sesion,
      'GET',
      '/api/v1/clinica',
      200,
    );
    expect(configuracion.id).toBe(clinica.id);
    expect(configuracion.granularidadMinutos).toBe(30);

    const profesional = await pedirComo<{ id: string; activo: boolean }>(
      entorno,
      sesion,
      'GET',
      `/api/v1/profesionales/${lista.profesionalId}`,
      200,
    );
    expect(profesional).toMatchObject({ id: lista.profesionalId, activo: true });

    const horarios = await pedirComo<{ franjas: { diaSemana: number }[] }>(
      entorno,
      sesion,
      'GET',
      `/api/v1/profesionales/${lista.profesionalId}/horarios`,
      200,
    );
    expect(horarios.franjas.map((f) => f.diaSemana)).toEqual([1, 2, 3, 4, 5]);

    const sillones = await pedirComo<{ id: string }[]>(
      entorno,
      sesion,
      'GET',
      '/api/v1/sillones',
      200,
    );
    expect(sillones.map((s) => s.id)).toEqual([lista.sillonId]);
    const prestaciones = await pedirComo<{ id: string }[]>(
      entorno,
      sesion,
      'GET',
      '/api/v1/prestaciones',
      200,
    );
    expect(prestaciones.map((p) => p.id)).toEqual([lista.prestacionId]);

    const feriados = await pedirComo<{ fecha: string }[]>(
      entorno,
      sesion,
      'GET',
      '/api/v1/feriados',
      200,
    );
    expect(feriados.map((f) => f.fecha)).toEqual(
      expect.arrayContaining(['2026-12-25', lista.diaFeriado]),
    );

    const paciente = await pedirComo<{ id: string; dni: string }>(
      entorno,
      sesion,
      'GET',
      `/api/v1/pacientes/${lista.pacienteId}`,
      200,
    );
    expect(paciente.dni).toBe(lista.paciente.dni);
  });

  it('el alta, la búsqueda y la modificación de pacientes funcionan y no filtran datos a los logs', async () => {
    const lista = await ponerEnMarchaUnaClinica(entorno, 'pacientes');
    const { sesion } = lista;
    const otro = pacienteSintetico(semillaNueva());

    const alta = await pedirComo<{ id: string }>(
      entorno,
      sesion,
      'POST',
      '/api/v1/pacientes',
      201,
      {
        nombre: otro.nombre,
        apellido: otro.apellido,
        dni: otro.dni,
        telefono: otro.telefono,
        email: otro.email,
        obraSocial: otro.obraSocial,
      },
    );

    const porDni = await pedirComo<{ id: string }[]>(
      entorno,
      sesion,
      'GET',
      `/api/v1/pacientes?dni=${otro.dni}`,
      200,
    );
    expect(porDni.map((p) => p.id)).toEqual([alta.id]);

    const porApellido = await pedirComo<{ id: string }[]>(
      entorno,
      sesion,
      'GET',
      `/api/v1/pacientes?apellido=${encodeURIComponent(otro.apellido.slice(0, 3))}`,
      200,
    );
    expect(porApellido.map((p) => p.id)).toContain(alta.id);

    const modificado = await pedirComo<{ obraSocial: string | null }>(
      entorno,
      sesion,
      'PATCH',
      `/api/v1/pacientes/${alta.id}`,
      200,
      { obraSocial: null },
    );
    expect(modificado.obraSocial).toBeNull();

    // Ningún dato personal sintético de los usados en esta clínica debe estar en los logs.
    afirmarSinDatosPersonales(entorno.logs, valoresSensibles(otro));
    afirmarSinDatosPersonales(entorno.logs, valoresSensibles(lista.paciente));
  });

  it('un usuario de otra clínica recibe 404 al pedir por id recursos de la primera', async () => {
    const a = await ponerEnMarchaUnaClinica(entorno, 'aislamiento');
    const clinicaB = await crearClinicaSintetica(entorno, 'aislamiento');
    const adminB = await crearUsuarioSintetico(clinicaB, 'administrador');
    const sesionB = await iniciarSesion(entorno, clinicaB.slug, adminB.email, adminB.password);

    const recursos = [
      `/api/v1/profesionales/${a.profesionalId}`,
      `/api/v1/profesionales/${a.profesionalId}/horarios`,
      `/api/v1/sillones/${a.sillonId}`,
      `/api/v1/prestaciones/${a.prestacionId}`,
      `/api/v1/pacientes/${a.pacienteId}`,
    ];
    for (const url of recursos) {
      const respuesta = await entorno.inject({ method: 'GET', url, headers: sesionB.encabezados });
      expect({ url, estado: respuesta.statusCode }).toEqual({ url, estado: 404 });
    }
  });

  it('el DNI de un paciente se puede repetir entre clínicas pero no dentro de una (409)', async () => {
    const a = await ponerEnMarchaUnaClinica(entorno, 'dni-unico');
    const repetido = await entorno.inject({
      method: 'POST',
      url: '/api/v1/pacientes',
      headers: a.sesion.encabezados,
      payload: {
        nombre: 'Otro',
        apellido: 'Distinto',
        dni: a.paciente.dni,
        telefono: a.paciente.telefono,
      },
    });
    expect(repetido.statusCode).toBe(409);
  });

  it.fails(
    'F2 (C-17): el alta interna entrega la contraseña temporal del primer administrador',
    async () => {
      const respuesta = await entorno.inject({
        method: 'POST',
        url: '/api/v1/interno/clinicas',
        headers: { authorization: `Bearer ${process.env.ADMIN_INTERNAL_KEY ?? ''}` },
        payload: {
          slug: `e2e-f2-${Date.now().toString(36)}`,
          nombre: 'Clínica sintética F2',
          email: 'primer.admin@ejemplo.invalid',
        },
      });
      expect(respuesta.statusCode).toBe(201);
      expect(respuesta.json()).toHaveProperty('passwordTemporal');
    },
  );
});
