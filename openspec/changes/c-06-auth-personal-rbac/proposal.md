# Proposal

## Why

El change C-06 `auth-personal-rbac` establece la autenticación JWT del personal y el control de acceso por roles (RBAC): sin ellos no existe forma de autenticar al usuario, asignar rol y proteger los recursos por clínica; todo el entorno de RLS del change C-03 queda sin consumidor y ningún endpoint del personal se puede implementar. Depende de C-03 (`RequestContext` y `withTenant`). Es `CRITICO` (Gobernanza: los changes CRITICO no se programan sin propuesta de diseño aprobada por el líder) y abre la autorización para los changes posteriores.

## What Changes

- Migración `C06_001`: tabla `usuario` (email único por clínica, `hash_contrasena` argon2id, `rol`, `profesional_id` sin FK, `activo`, `ultimo_acceso`) y tabla de refresh tokens (hash, rotación, revocación), con `aplicar_rls`.
- Endpoints `POST /auth/login`, `POST /auth/refresh` (rotativo), `POST /auth/logout`; token de acceso corto; mensajes genéricos; límite de tasa por IP y email.
- Plugin de autenticación: valida el JWT, construye `RequestContext` y abre `withTenant` por pedido (Flujo 1).
- Matriz RBAC en código (`requireRole`, `requirePermission`) según `03 §RBAC`; un recurso de otra clínica responde "no encontrado".
- CRUD de usuarios del personal (solo administrador), con rol y profesional asociado.
- Tests: login correcto e incorrecto, usuario inactivo, rotación y reuso detectado del refresh, expiración, rate limit, permisos por rol.

## Capabilities

### New Capabilities

- `auth-personal-rbac`: JWT del personal (login/refresh/logout) y RBAC en código según el modelo de autenticación.

### Modified Capabilities

- (none)

## Impact

- Código: `migrations/C06_*`, `src/infrastructure/auth/**`, `src/interfaces/http/modules/auth/**`, `src/interfaces/http/modules/usuarios/**`.
- Contratos: `RequestContext` (C-03) se consume; el acceso a datos sigue a RLS vía `withTenant`.
