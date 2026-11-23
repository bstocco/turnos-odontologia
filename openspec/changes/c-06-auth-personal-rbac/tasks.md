# Tasks

## 1. Base de datos: migration C06_001

- [x] 1.1 Escribir `migrations/C06_001_auth_personal.sql`: tablas `usuario` (email único por clínica, `hash_contrasena` argon2id, `rol`, `profesional_id` sin FK, `activo`, `ultimo_acceso`) y `token_refresco` (hash, rotación, revocación), con `aplicar_rls` sobre ambas. Verificar: el archivo existe y su nombre respeta el patrón `C{NN}_{seq}_{nombre}.sql` (regla 6 del database-migrations).
- [x] 1.2 Aplicar C06_001 con el runner de C-01 (rol `migra`; `npm run db:migrate`). Verificar: tablas `usuario` y `token_refresco` existen, son propiedad de `migra` y tienen RLS habilitada y forzada (`pg_policies`).

## 2. JWT del personal

- [ ] 2.1 Implementar `src/infrastructure/auth/jwt.ts`: firmar/verificar el JWT de acceso (HS256, secretos `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`) y generar tokens de refresco aleatorios (256 bits). Verificar: `npm run typecheck` pasa.
- [ ] 2.2 Implementar `src/application/auth/autenticar.ts`: use cases login, refresh y logout (verificación de hash argon2id, rotación y revocación de refresh tokens). Verificar: `npm run typecheck` pasa.

## 3. Plugin de autenticación

- [ ] 3.1 Implementar `src/infrastructure/auth/plugin.ts`: Fastify plugin que valida el JWT de acceso, construye `RequestContext` y abre `withTenant` por pedido. Verificar: `npm run typecheck` pasa.

## 4. RBAC y CRUD de usuarios

- [ ] 4.1 Implementar `src/application/autorizacion/requireRole.ts`: guard RBAC que responde `403` según el rol del `RequestContext`. Verificar: `npm run typecheck` pasa.
- [ ] 4.2 Implementar `src/application/usuarios/crudUsuarios.ts`: CRUD de usuarios del personal, solo accesible por `administrador`. Verificar: `npm run typecheck` pasa.

## 5. Endpoints HTTP

- [ ] 5.1 Implementar `src/interfaces/http/modules/auth/`: `POST /auth/login`, `POST /auth/refresh` (rotativo), `POST /auth/logout`, rate limit por IP y email, mensajes genéricos. Verificar: `npm run typecheck` pasa.
- [ ] 5.2 Implementar `src/interfaces/http/modules/usuarios/`: CRUD de usuarios del personal (admin). Verificar: `npm run typecheck` pasa.

## 6. Pruebas

- [ ] 6.1 Tests: login correcto e incorrecto, usuario inactivo, rotación y reuso detectado del refresh, expiración, rate limit, permisos por rol. Verificar: `npm run test:integration` (o `npm run test:api`) en verde.

## 7. Integración final

- [ ] 7.1 Re-ejecutar `openspec status --change c-06-auth-personal-rbc`? - c-06-auth-personal-rbac. Verificar: proposal, specs, design y tasks en `done`.


