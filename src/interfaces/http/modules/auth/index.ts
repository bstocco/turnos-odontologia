import type { FastifyInstance } from 'fastify';
import Type, { type Static } from 'typebox';

import { ErrorDeDominio } from '../../../../domain/shared/errores.js';
import { loadConfig } from '../../../../config/index.js';
import { verificarContrasena } from '../../../../infrastructure/auth/contrasena.js';
import {
  buscarClinicaPorSlug,
  buscarTokenDeRefrescoPorHash,
  buscarUsuarioPorEmail,
  crearTokenDeRefrescoEnTabla,
  revocarTokenDeRefresco,
} from '../../../../infrastructure/auth/repositorio-de-usuarios.js';
import {
  clinicaDeTokenDeRefresco,
  crearTokenDeRefresco,
} from '../../../../infrastructure/auth/refresco.js';
import { LimiteDeTasaPorClave } from '../../../../infrastructure/auth/rate-limit.js';
import { firmarTokenDeAcceso } from '../../../../infrastructure/auth/jwt.js';
import { poolDeLaAplicacion } from '../../../../infrastructure/db/pool/index.js';
import { withTenant } from '../../../../infrastructure/db/tenant/with-tenant.js';
import { hashSha256 } from '../../../../infrastructure/crypto/index.js';

import { pluginDeAutenticacion } from '../../../../infrastructure/auth/plugin.js';

const LoginBody = Type.Object({
  email: Type.String({ format: 'email', minLength: 1, maxLength: 254 }),
  password: Type.String({ minLength: 8, maxLength: 128 }),
  slug: Type.String({ minLength: 1, maxLength: 128 }),
});
type LoginBody = Static<typeof LoginBody>;

const RefreshBody = Type.Object({
  token: Type.String({ minLength: 1, maxLength: 512 }),
});
type RefreshBody = Static<typeof RefreshBody>;

const LimitePorIP = new LimiteDeTasaPorClave(5, 60_000);
const LimitePorEmail = new LimiteDeTasaPorClave(5, 60_000);

export default async function moduloAuth(app: FastifyInstance): Promise<void> {
  await app.register(pluginDeAutenticacion);

  app.post('/auth/login', { schema: { body: LoginBody } }, async (request, reply) => {
    const { email, password, slug } = request.body as LoginBody;
    const secretoDelAcceso = loadConfig('app').jwtAccessSecret;
    if (secretoDelAcceso === undefined) {
      throw new Error('Falta JWT_ACCESS_SECRET (perfil app).');
    }
    if (LimitePorIP.excedido(request.ip) || LimitePorEmail.excedido(email)) {
      return reply.code(429).send({
        codigo: 'DEMASIADOS_PEDIDOS',
        mensaje: 'Hay demasiados intentos. Intentá de nuevo más tarde.',
      });
    }

    const clinicaId = await buscarClinicaPorSlug(poolDeLaAplicacion(), slug);
    if (clinicaId === undefined) {
      throw new ErrorDeDominio('CLINICA_NO_ENCONTRADA', 'no_encontrado', 'La clínica no existe.');
    }

    const usuario = await withTenant(clinicaId, (cliente) =>
      buscarUsuarioPorEmail(cliente, clinicaId, email),
    );
    const contrasenaCorrecta =
      usuario === undefined ? false : await verificarContrasena(usuario.hashContrasena, password);
    if (usuario === undefined || !usuario.activo || !contrasenaCorrecta) {
      throw new ErrorDeDominio(
        'CREDENCIALES_INVALIDAS',
        'no_autenticado',
        'Credenciales inválidas.',
      );
    }

    await withTenant(clinicaId, async (cliente) => {
      const creado = crearTokenDeRefresco(clinicaId);
      await crearTokenDeRefrescoEnTabla(cliente, {
        clinicaId,
        usuarioId: usuario.id,
        hash: creado.hash,
        venceEn: creado.venceEn,
      });
      return creado.token;
    });

    const jwt = await firmarTokenDeAcceso(secretoDelAcceso, {
      clinicaId,
      usuarioId: usuario.id,
      rol: usuario.rol,
    });
    return { token: jwt };
  });

  app.post('/auth/refresh', { schema: { body: RefreshBody } }, async (request) => {
    const { token } = request.body as RefreshBody;
    const clinicaId = clinicaDeTokenDeRefresco(token);
    if (clinicaId === undefined) {
      throw new ErrorDeDominio(
        'TOKEN_DE_REFRESCO_INVALIDO',
        'no_autenticado',
        'El token de refresco no es válido.',
      );
    }

    const hash = hashSha256(token);
    const nuevoToken = await withTenant(clinicaId, async (cliente) => {
      const actual = await buscarTokenDeRefrescoPorHash(cliente, clinicaId, hash);
      if (actual === undefined || actual.revocadaEn !== undefined) {
        throw new ErrorDeDominio(
          'TOKEN_DE_REFRESCO_INVALIDO',
          'no_autenticado',
          'El token de refresco no es válido.',
        );
      }
      const creado = crearTokenDeRefresco(clinicaId);
      await revocarTokenDeRefresco(cliente, clinicaId, actual.id);
      await crearTokenDeRefrescoEnTabla(cliente, {
        clinicaId,
        usuarioId: actual.usuarioId,
        hash: creado.hash,
        venceEn: creado.venceEn,
      });
      return creado.token;
    });
    return { token: nuevoToken };
  });

  app.post('/auth/logout', { schema: { body: RefreshBody } }, async (request) => {
    const { token } = request.body as RefreshBody;
    const clinicaId = clinicaDeTokenDeRefresco(token);
    if (clinicaId !== undefined) {
      await withTenant(clinicaId, async (cliente) => {
        const actual = await buscarTokenDeRefrescoPorHash(cliente, clinicaId, hashSha256(token));
        if (actual !== undefined) {
          await revocarTokenDeRefresco(cliente, clinicaId, actual.id);
        }
      });
    }
    return { estado: 'cerrado' };
  });
}
