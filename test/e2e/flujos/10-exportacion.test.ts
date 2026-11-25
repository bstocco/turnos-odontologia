import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { crearUsuarioSintetico } from '../soporte/clinica.js';
import { abrirEntorno, type EntornoE2E } from '../soporte/entorno.js';
import { afirmarSinDatosPersonales, valoresSensibles } from '../soporte/privacidad.js';
import { ponerEnMarchaUnaClinica, type ClinicaConfigurada } from '../soporte/puesta-en-marcha.js';
import { iniciarSesion, type Sesion } from '../soporte/sesion.js';

/*
 * Flujo 10 de 07_flujos_principales.md: exportación de datos de la clínica (C-16, RN-DA-04).
 * Cada escenario corre normal contra la API real, sin marcas de defecto.
 */
interface Exportacion {
  readonly formato: string;
  readonly pacientes: readonly { readonly id: string; readonly dni: string }[];
  readonly profesionales: readonly { readonly id: string }[];
  readonly auditoria: readonly { readonly accion: string }[];
}

describe('Flujo 10: exportación de datos', () => {
  let entorno: EntornoE2E;
  let lista: ClinicaConfigurada;
  let otra: ClinicaConfigurada;
  const sesiones = {} as Record<'recepcionista' | 'odontologo', Sesion>;

  beforeAll(async () => {
    entorno = await abrirEntorno();
    lista = await ponerEnMarchaUnaClinica(entorno, 'exportacion');
    otra = await ponerEnMarchaUnaClinica(entorno, 'exportacion-otra');
    for (const rol of ['recepcionista', 'odontologo'] as const) {
      const usuario = await crearUsuarioSintetico(lista.clinica, rol, {
        ...(rol === 'odontologo' ? { profesionalId: lista.profesionalId } : {}),
      });
      sesiones[rol] = await iniciarSesion(
        entorno,
        lista.clinica.slug,
        usuario.email,
        usuario.password,
      );
    }
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  it('el administrador exporta SOLO los datos de su clínica y la exportación queda auditada', async () => {
    const alta = await entorno.inject({
      method: 'POST',
      url: '/api/v1/exportaciones',
      headers: lista.sesion.encabezados,
    });
    expect(alta.statusCode).toBe(201);
    const { id } = alta.json() as { id: string };
    expect(id).toEqual(expect.any(String));

    const descarga = await entorno.inject({
      method: 'GET',
      url: `/api/v1/exportaciones/${id}`,
      headers: lista.sesion.encabezados,
    });
    expect(descarga.statusCode).toBe(200);
    expect(descarga.headers['content-type']).toContain('application/json');
    expect(descarga.headers['content-disposition']).toContain('attachment');
    const archivo = descarga.json() as Exportacion;
    expect(archivo.formato).toBe('json');

    // Solo los datos de la clínica propia (RLS); nada de la otra clínica.
    expect(archivo.pacientes.map((p) => p.id)).toEqual([lista.pacienteId]);
    expect(archivo.profesionales.map((p) => p.id)).toEqual([lista.profesionalId]);
    expect(descarga.body).not.toContain(otra.paciente.dni);
    expect(descarga.body).not.toContain(otra.pacienteId);
    expect(descarga.body).not.toContain(otra.clinica.id);

    // Auditoría: la exportación quedó registrada con el actor, visible para el administrador.
    const auditoria = await entorno.inject({
      method: 'GET',
      url: '/api/v1/auditoria?entidad=exportacion',
      headers: lista.sesion.encabezados,
    });
    expect(auditoria.statusCode).toBe(200);
    const registros = auditoria.json() as { accion: string; entidadId: string | null }[];
    expect(
      registros.filter((r) => r.accion === 'exportacion' && r.entidadId === id).length,
    ).toBeGreaterThanOrEqual(1);

    // Los logs no llevan datos personales aunque la exportación los contenga.
    afirmarSinDatosPersonales(entorno.logs, valoresSensibles(lista.paciente));
    afirmarSinDatosPersonales(entorno.logs, valoresSensibles(otra.paciente));
  });

  it('un usuario sin rol de administrador recibe 403 y no queda exportación ni dato filtrado', async () => {
    for (const rol of ['recepcionista', 'odontologo'] as const) {
      const alta = await entorno.inject({
        method: 'POST',
        url: '/api/v1/exportaciones',
        headers: sesiones[rol].encabezados,
      });
      expect(alta.statusCode).toBe(403);
      expect((alta.json() as { codigo: string }).codigo).toBe('ACCESO_PROHIBIDO');

      const descarga = await entorno.inject({
        method: 'GET',
        url: '/api/v1/exportaciones/00000000-0000-4000-8000-000000000000',
        headers: sesiones[rol].encabezados,
      });
      expect(descarga.statusCode).toBe(403);
      expect(descarga.body).not.toContain(lista.paciente.dni);
    }
  });

  it('el administrador de otra clínica no obtiene datos de la primera', async () => {
    const descarga = await entorno.inject({
      method: 'GET',
      url: '/api/v1/exportaciones/00000000-0000-4000-8000-000000000001',
      headers: otra.sesion.encabezados,
    });
    expect(descarga.statusCode).toBe(200);
    expect(descarga.body).not.toContain(lista.paciente.dni);
    expect(descarga.body).not.toContain(lista.pacienteId);
  });
});
