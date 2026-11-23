# Design

## Context

Punto de partida (`specs/auth-personal-rbac/spec.md`, `CHANGES.md` §C-06, KB de "Leer antes"):

- C-03 archivado: `RequestContext` (`src/application/shared/request-context.ts`) y `withTenant` (`src/infrastructure/db/tenant/with-tenant.ts`) existen; `aplicar_rls` aplicada en `migrations/C03_001_tenant_rls.sql`.
- KB: `03_actors_y_roles.md` (personal: JWT; roles: administrativo / recepcionista / odontólogo; matriz RBAC); `05_reglas_de_negocio.md` §RN-MT; `07_flujos_principales.md` §Flujo 1 (login → JWT corto + refresh rotativo; en cada pedido la API valida el JWT y fija `SET LOCAL app.clinica_id`); `08_arquitectura_propuesta.md` §Seguridad (Autenticación); `09_decisiones_y_supuestos.md` DD-03.
- Restricciones del proyecto: MD rule 10 (tokens en claro, SHA-256/argon2id), MD rule 12 (recursos de otra clínica → "no encontrado"), RN-MT-01/02 (RLS, rol `app` sin BYPASSRLS), hexagonal (reglas 7/8), sin datos reales (RN-DA-01/02).
- Zona del change (`CHANGES.md`): `migrations/C06_*`, `src/infrastructure/auth/**`, `src/interfaces/http/modules/auth/**`, `src/interfaces/http/modules/usuarios/**`.

## Goals / Non-Goals

**Goals:** cumplir los escenarios de `specs/auth-personal-rbac/spec.md`: login correcto e incorrecto, usuario inactivo, rotación y reuso detectado del refresh, expiración, rate limit, permisos por rol y CRUD de usuarios solo para el rol administrativo.

**Non-Goals:**

- Autenticación de pacientes (DD-03: JWT solo para el personal).
- Gestión de clínicas ni config de `clinica_config` (C-08).
- Endpoints de turnos ni agenda (C-09).
- Herramientas de administración (UI) - out of scope.

## Decisions

1. **Migración `C06_001`**: tablas `usuario` y `token_refresco` (nombre de la hoja "tabla de refresh tokens", conectada a clínica por `clinica_id`), cada una con `aplicar_rls`. La FK `usuario.profesional_id → profesional` se agrega en C-08, así que C06_001 crea `profesional_id` sin FK. `hash_contrasena` argon2id (MD rule 10).
2. **JWT del personal (HS256)**:
   - Token de acceso corto: firmado con `JWT_ACCESS_SECRET` (perfil `app`; `variables.ts` marca "obligatoria desde C-06"). Contenido: `clinica_id` (UUID), `actor: { id, rol }`.
   - Token de refresco: entropía de 256 bits aleatoria; el servidor guarda solo el hash SHA-256 (`token_refresco.hash_token`).
3. **Plugin de autenticación (`src/infrastructure/auth/`)**: Fastify plugin global que valida la firma y expiración del JWT de acceso, construye `RequestContext { clinicaId, actor: { tipo: 'usuario', id, rol } }` y abre `withTenant(clinicaId, ...)` para la petición (Flujo 1).
4. **RBAC en código (`src/application/autorizacion/`)**: `requireRole(rol: Rol)` devuelve un guard que lanza `403` si el rol del `RequestContext` no coincide con la matriz de `03_actors_y_roles.md`; los recursos de otra clínica responden "no encontrado" (RLS, MD rule 12).
5. **CRUD de usuarios del personal (`src/application/usuarios/`)**: use case CRUD sobre `usuario` dentro de `withTenant`; solo accesible por el rol `administrador` (`requireRole`).
6. **Rate limit por IP y email** (`@fastify/rate-limit`): sobre `/auth/*`, clave por IP y email, límite configurable (default 10 intentos por IP+email por minuto).
7. **Config**: `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` se vuelven obligatorias en el perfil `app` (`variables.ts`).

## Risks / Trade-offs

- **Dependencia de `jose`** (dep ya en `package.json`) para JWT.
- El rate limit por email requiere leer el email del cuerpo antes del handler (keyGenerator).
- JWT con `clinica_id` dentro: una clínica que cambie de slug sigue válida hasta expiración - mitigación: logout + vigencias cortas.
- Mensajes genéricos de 401 según Flujo 1: evitan enumerar usuarios.

## Migration Plan

1. Escribir `migrations/C06_001_auth_personal.sql`.
2. Aplicar con `npm run db:migrate` (rol `migra`).
3. Verificar con pruebas (tasks 5.1).
