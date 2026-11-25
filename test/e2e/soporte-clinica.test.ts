import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { crearClinicaSintetica, crearUsuarioSintetico } from './soporte/clinica.js';
import { abrirEntorno, type EntornoE2E } from './soporte/entorno.js';
import { iniciarSesion } from './soporte/sesion.js';

describe('soporte e2e: clínicas sintéticas y sesiones por login real', () => {
  let entorno: EntornoE2E;

  beforeAll(async () => {
    entorno = await abrirEntorno();
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  it('dos clínicas creadas en la misma ejecución tienen slugs e ids únicos', async () => {
    const a = await crearClinicaSintetica(entorno, 'soporte');
    const b = await crearClinicaSintetica(entorno, 'soporte');
    expect(a.slug).not.toBe(b.slug);
    expect(a.id).not.toBe(b.id);
    expect(a.slug).toMatch(/^e2e-soporte-[a-z0-9]{8}$/);
  });

  it('obtiene una sesión por cada rol con el login real y el token sirve para su clínica', async () => {
    const clinica = await crearClinicaSintetica(entorno, 'soporte');
    for (const rol of ['administrador', 'recepcionista', 'odontologo'] as const) {
      const usuario = await crearUsuarioSintetico(clinica, rol);
      const sesion = await iniciarSesion(entorno, clinica.slug, usuario.email, usuario.password);
      expect(sesion.token.split('.')).toHaveLength(3);
      const respuesta = await entorno.inject({
        method: 'GET',
        url: '/api/v1/clinica',
        headers: sesion.encabezados,
      });
      expect(respuesta.statusCode).toBe(200);
      expect((respuesta.json() as { slug: string }).slug).toBe(clinica.slug);
    }
  });

  it('una contraseña incorrecta no inicia sesión', async () => {
    const clinica = await crearClinicaSintetica(entorno, 'soporte');
    const usuario = await crearUsuarioSintetico(clinica, 'administrador');
    await expect(
      iniciarSesion(entorno, clinica.slug, usuario.email, `${usuario.password}-mala`),
    ).rejects.toThrow(/401/);
  });
});
