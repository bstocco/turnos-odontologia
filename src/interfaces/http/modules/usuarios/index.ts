import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import Type, { type Static } from 'typebox';

import { contextoDePedido, requireRole } from '../../../../infrastructure/auth/rbac.js';
import { hashContrasena } from '../../../../infrastructure/auth/contrasena.js';
import {
  actualizarUsuarioDePersonal,
  crearUsuarioDePersonal,
  eliminarUsuarioDePersonal,
  listarUsuariosDeClinica,
  type UsuarioDePersonal,
} from '../../../../infrastructure/auth/repositorio-de-usuarios.js';
import { withTenant } from '../../../../infrastructure/db/tenant/with-tenant.js';

const CrearBody = Type.Object({
  email: Type.String({ format: 'email', minLength: 1, maxLength: 254 }),
  password: Type.String({ minLength: 8, maxLength: 128 }),
  rol: Type.Union([Type.Literal('administrador'), Type.Literal('recepcionista'), Type.Literal('odontologo')]),
  profesionalId: Type.Optional(Type.String({ format: 'uuid' })),
  activo: Type.Optional(Type.Boolean()),
});
type CrearBody = Static<typeof CrearBody>;

const ActualizarBody = Type.Object({
  email: Type.Optional(Type.String({ format: 'email', minLength: 1, maxLength: 254 })),
  password: Type.Optional(Type.String({ minLength: 8, maxLength: 128 })),
  rol: Type.Optional(
    Type.Union([Type.Literal('administrador'), Type.Literal('recepcionista'), Type.Literal('odontologo')]),
  ),
  profesionalId: Type.Optional(Type.String({ format: 'uuid' })),
  activo: Type.Optional(Type.Boolean()),
});
type ActualizarBody = Static<typeof ActualizarBody>;

/**
 * CRUD de usuarios del personal (solo el rol `administrador`). Zona del change C-06
 * (`src/interfaces/http/modules/usuarios/**`).
 */
export default async function moduloUsuarios(app: FastifyInstance): Promise<void> {
  app.get('/usuarios', async (request) => {
    const contexto = contextoDePedido(request);
    requireRole(contexto, 'administrador');
    const usuarios = await withTenant(contexto.clinicaId, (cliente) =>
      listarUsuariosDeClinica(cliente, contexto.clinicaId),
    );
    return usuarios;
  });

  app.post('/usuarios', { schema: { body: CrearBody } }, async (request, reply) => {
    const contexto = contextoDePedido(request);
    requireRole(contexto, 'administrador');
    const body = request.body as CrearBody;
    const hash = await hashContrasena(body.password);
    const id = await withTenant(contexto.clinicaId, (cliente) =>
      crearUsuarioDePersonal(cliente, contexto.clinicaId, {
        email: body.email,
        hashContrasena: hash,
        rol: body.rol as UsuarioDePersonal['rol'],
        profesionalId: body.profesionalId,
      }),
    );
    return reply.code(201).send({ id });
  });

  app.put('/usuarios/:id', { schema: { body: ActualizarBody } }, async (request) => {
    const contexto = contextoDePedido(request);
    requireRole(contexto, 'administrador');
    const { id } = request.params as { id: string };
    const body = request.body as ActualizarBody;
    await withTenant(contexto.clinicaId, (cliente) =>
      actualizarUsuarioDePersonal(cliente, contexto.clinicaId, id, {
        rol: body.rol as UsuarioDePersonal['rol'] | undefined,
        profesionalId: body.profesionalId,
        activo: body.activo,
      }),
    );
    return { id };
  });

  app.delete('/usuarios/:id', async (request) => {
    const contexto = contextoDePedido(request);
    requireRole(contexto, 'administrador');
    const { id } = request.params as { id: string };
    await withTenant(contexto.clinicaId, (cliente) =>
      eliminarUsuarioDePersonal(cliente, contexto.clinicaId, id),
    );
    return { id };
  });
}
