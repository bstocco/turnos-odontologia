import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withTenant } from '../../../src/infrastructure/db/tenant/with-tenant.js';
import { crearClinicaSintetica, crearUsuarioSintetico } from '../soporte/clinica.js';
import { abrirEntorno, ipNueva, type EntornoE2E } from '../soporte/entorno.js';
import { emitirRefrescoSintetico, iniciarSesion } from '../soporte/sesion.js';

/*
 * Flujo 1 de 07_flujos_principales.md: autenticación del personal, con pedidos HTTP reales.
 *
 * Defectos fuera de zona (se reportan, no se corrigen; design D10):
 *  - F3 (C-06): el inicio de sesión no se audita (paso 5 del flujo).
 *  - F5 (C-06): el login crea el token de refresco pero no lo entrega (paso 3 del flujo); por eso
 *    el tramo de refresco y cierre de sesión usa un token emitido por fixture con el código real.
 */
describe('Flujo 1: autenticación del personal', () => {
  let entorno: EntornoE2E;

  beforeAll(async () => {
    entorno = await abrirEntorno();
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  async function post(url: string, payload: unknown, ip: string = ipNueva()) {
    return entorno.inject({ method: 'POST', url, payload, ip });
  }

  describe('sesión completa', () => {
    it('login, consulta de su clínica, refresco rotativo, reuso rechazado y cierre de sesión', async () => {
      const clinica = await crearClinicaSintetica(entorno, 'auth');
      const usuario = await crearUsuarioSintetico(clinica, 'recepcionista');

      const sesion = await iniciarSesion(entorno, clinica.slug, usuario.email, usuario.password);
      const consulta = await entorno.inject({
        method: 'GET',
        url: '/api/v1/clinica',
        headers: sesion.encabezados,
      });
      expect(consulta.statusCode).toBe(200);
      expect((consulta.json() as { id: string }).id).toBe(clinica.id);

      const refresco1 = await emitirRefrescoSintetico(clinica.id, usuario.id);
      const rotado = await post('/api/v1/auth/refresh', { token: refresco1 });
      expect(rotado.statusCode).toBe(200);
      const refresco2 = (rotado.json() as { token: string }).token;
      expect(refresco2).not.toBe(refresco1);

      // El refresco usado deja de servir (rotación con revocación).
      const reuso = await post('/api/v1/auth/refresh', { token: refresco1 });
      expect(reuso.statusCode).toBe(401);
      expect((reuso.json() as { codigo: string }).codigo).toBe('TOKEN_DE_REFRESCO_INVALIDO');

      // Cierre de sesión: el refresco vigente queda revocado.
      const cierre = await post('/api/v1/auth/logout', { token: refresco2 });
      expect(cierre.statusCode).toBe(200);
      const trasCierre = await post('/api/v1/auth/refresh', { token: refresco2 });
      expect(trasCierre.statusCode).toBe(401);
    });

    it('un token de refresco que no existe se rechaza igual que uno revocado', async () => {
      const clinica = await crearClinicaSintetica(entorno, 'auth');
      const ajeno = await emitirRefrescoSintetico(
        clinica.id,
        (await crearUsuarioSintetico(clinica, 'administrador')).id,
      );
      const adulterado = `${ajeno.slice(0, -2)}xx`;
      const respuesta = await post('/api/v1/auth/refresh', { token: adulterado });
      expect(respuesta.statusCode).toBe(401);
    });

    it.fails(
      'F5 (C-06): el login entrega el token de refresco al cliente (07 Flujo 1 paso 3)',
      async () => {
        const clinica = await crearClinicaSintetica(entorno, 'auth');
        const usuario = await crearUsuarioSintetico(clinica, 'administrador');
        const respuesta = await post('/api/v1/auth/login', {
          slug: clinica.slug,
          email: usuario.email,
          password: usuario.password,
        });
        expect(respuesta.statusCode).toBe(200);
        const cuerpo = respuesta.json() as Record<string, unknown>;
        expect(cuerpo).toHaveProperty('refreshToken');
      },
    );

    it.fails('F3 (C-06): el inicio de sesión queda auditado (07 Flujo 1 paso 5)', async () => {
      const clinica = await crearClinicaSintetica(entorno, 'auth');
      const usuario = await crearUsuarioSintetico(clinica, 'administrador');
      await iniciarSesion(entorno, clinica.slug, usuario.email, usuario.password);
      const { rows } = await withTenant(clinica.id, (c) =>
        c.query<{ n: string }>('SELECT count(*)::text AS n FROM auditoria WHERE actor_id = $1', [
          usuario.id,
        ]),
      );
      expect(Number(rows[0]?.n)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('casos de error', () => {
    it('contraseña errónea y email inexistente dan el mismo 401 genérico', async () => {
      const clinica = await crearClinicaSintetica(entorno, 'auth');
      const usuario = await crearUsuarioSintetico(clinica, 'administrador');

      const mala = await post('/api/v1/auth/login', {
        slug: clinica.slug,
        email: usuario.email,
        password: `${usuario.password}-incorrecta`,
      });
      const inexistente = await post('/api/v1/auth/login', {
        slug: clinica.slug,
        email: 'no.existe@ejemplo.invalid',
        password: usuario.password,
      });

      expect(mala.statusCode).toBe(401);
      expect(inexistente.statusCode).toBe(401);
      expect(inexistente.json()).toEqual(mala.json());
      expect((mala.json() as { codigo: string }).codigo).toBe('CREDENCIALES_INVALIDAS');
    });

    it('un usuario desactivado no inicia sesión (401)', async () => {
      const clinica = await crearClinicaSintetica(entorno, 'auth');
      const usuario = await crearUsuarioSintetico(clinica, 'recepcionista', { activo: false });
      const respuesta = await post('/api/v1/auth/login', {
        slug: clinica.slug,
        email: usuario.email,
        password: usuario.password,
      });
      expect(respuesta.statusCode).toBe(401);
      expect((respuesta.json() as { codigo: string }).codigo).toBe('CREDENCIALES_INVALIDAS');
    });

    it('un usuario de otra clínica no inicia sesión con el slug ajeno (401)', async () => {
      const a = await crearClinicaSintetica(entorno, 'auth');
      const b = await crearClinicaSintetica(entorno, 'auth');
      const deB = await crearUsuarioSintetico(b, 'administrador');
      const respuesta = await post('/api/v1/auth/login', {
        slug: a.slug,
        email: deB.email,
        password: deB.password,
      });
      expect(respuesta.statusCode).toBe(401);
    });

    it('al superar los intentos permitidos por IP responde 429 con el código de dominio', async () => {
      const clinica = await crearClinicaSintetica(entorno, 'auth');
      const ip = ipNueva();
      const estados: number[] = [];
      for (let intento = 0; intento < 7; intento += 1) {
        const respuesta = await post(
          '/api/v1/auth/login',
          {
            slug: clinica.slug,
            email: `intento.${intento}@ejemplo.invalid`,
            password: 'contrasena-incorrecta-1',
          },
          ip,
        );
        estados.push(respuesta.statusCode);
      }
      expect(estados.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(estados.at(-1)).toBe(429);
    });

    it('al superar los intentos permitidos por email responde 429 aunque cambie la IP', async () => {
      const clinica = await crearClinicaSintetica(entorno, 'auth');
      const email = `objetivo.${clinica.slug}@ejemplo.invalid`;
      let ultimo = 0;
      for (let intento = 0; intento < 7; intento += 1) {
        const respuesta = await post('/api/v1/auth/login', {
          slug: clinica.slug,
          email,
          password: 'contrasena-incorrecta-1',
        });
        ultimo = respuesta.statusCode;
      }
      expect(ultimo).toBe(429);
    });
  });
});
