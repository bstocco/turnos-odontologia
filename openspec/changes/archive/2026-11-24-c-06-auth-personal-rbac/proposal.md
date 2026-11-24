# Proposal

## Why

C-06 `auth-personal-rbac` es el primer changes del camino crítico (`C-01 → C-03 → C-06 → C-09 → C-13 → C-15 → C-18 → C-20`) y es la base de la superficie HTTP: sin JWT del personal ni RBAC, los endpoints de la FASE 1 no tienen dueño ni acceso definido. Es `CRITICO` y depende de C-03 (`db-tenant-rls`): `withTenant` y `RequestContext` son su base.

## What Changes

- Migración `C06_001`: tabla `usuario` (`email` único por clínica, `hash_contrasena` argon2id, `rol`, `profesional_id` sin FK, `activo`, `ultimo_acceso`, `clinica_id`) y tabla de refresh tokens (hash, rotación, revocación), con `aplicar_rls`.
- Endpoints HTTP: `POST /auth/login`, `POST /auth/refresh` (rotativo), `POST /auth/logout`; token de acceso corto; mensajes genéricos; límite de tasa por IP y email.
- Plugin de autenticación: valida el JWT, construye `RequestContext` y abre `withTenant` por pedido.
- Matriz RBAC en código (`requireRole`, `requirePermission`) según `03 §RBAC`; un recurso de otra clínica responde "no encontrado" (RN-MT-01/02).
- CRUD de usuarios del personal (solo administrador), con rol y profesional asociado.

## Capabilities

### New Capabilities

- `auth-personal-rbac`: autenticación JWT del personal (login/refresh/logout, acceso corto), construcción del `RequestContext` compartido y matriz RBAC que limita el acceso a los recursos de la clínica.

### Modified Capabilities

- (none)

## Impact

- Código: `migrations/C06_*`, `src/infrastructure/auth/**`, `src/interfaces/http/modules/auth/**`, `src/interfaces/http/modules/usuarios/**`, matriz RBAC.
- Sistemas: JWT (`jose`), rate limit por IP y email (`@fastify/rate-limit`).
- Reglas aplicables: secrets solo en env (regla 13), hashing argon2id de contraseñas (regla 10), sin `any` (regla 5).
