# Design

## Context

Punto de partida (ver `specs/auth-personal-rbac/spec.md` para el contrato):

- C-03 (`db-tenant-rls`) ya fusionado: `withTenant(clinicaId, fn)` en `src/infrastructure/db/tenant/` y `RequestContext` en `src/application/shared/`. Sin ellos no hay aislamiento del personal por clínica (RN-MT).
- KB: DD-03 (JWT del personal), `03_actores_y_roles.md` (actores y `rol`), `05_reglas_de_negocio.md` §Multi-tenant y seguridad (RN-MT), `07_flujos_principales.md` §Flujo 1, `08_arquitectura_propuesta.md` §Seguridad (Autenticación).

## Goals

- Cumplir los escenarios de `specs/auth-personal-rls/spec.md`: login/refresh/logout con tokens cortos y rotativos; 401 genérico sin revelar credenciales; rate limit por IP y email; RBAC con "no encontrado" fuera de la clínica; CRUD de usuarios del personal.

## Non-Goals

- No implementar auth de pacientes ni rutas públicas: fuera del alcance de C-06.
- No modificar contratos congelados (regla 14): `RequestContext`, puertos de dominio y `TurnoEventPublisher` no cambian.
- No editar migration ya fusionada (regla 6).
- No poner secrets en el repo ni en los logs (regla 13).

## Decisions

1. **JWT con `jose`**: tokens de acceso cortos firmados con `JWT_ACCESS_SECRET`; refresh tokens rotativos.
2. **Plugin de autenticación** (`src/infrastructure/auth/`): valida el JWT, construye el `RequestContext` y abre `withTenant(clinicaId, fn)` por pedido. Es el punto donde el aislamiento del personal se activa.
3. **Migración `C06_001_auth_personal.sql`**: tabla `usuario` (`email` único por clínica, `hash_contrasena` argon2id, `rol`, `profesional_id` sin FK, `activo`, `ultimo_acceso`, `clinica_id`) y tabla de refresh tokens (hash SHA-256, rotación, revocación), con `aplicar_rls`.
4. **RBAC en código**: `requireRole` / `requirePermission` según `03 §RBAC`; el acceso a recursos de otra clínica responde "no encontrado" (RN-MT-01/02).
5. **Secrets por env**: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (ya presentes en `.env`).

## Risks / Trade-offs

- **Logout del JWT de acceso**: con tokens de acceso cortos, logout solo invalida el refresh rotativo; queda documentado en el spec.
- **Rate limit por IP y email**: sostiene la superposición de intentos fallidos sin bloquear el email al 100%.

## Migration Plan

1. Aplicar `C06_001_auth_personal.sql` con el runner de C-01 (rol `migra`; `npm run db:migrate`).
2. Ejecutar las pruebas de auth y RBAC; verificar login/refresh/logout, rate limit y aislamiento (verify del spec).
3. Rollback: `DROP TABLE token_refresco, usuario; DROP FUNCTION`
