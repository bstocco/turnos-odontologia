# Tasks

## 1. Base de datos: migration C06_001

- [ ] 1.1 Crear `migrations/C06_001_auth_personal.sql`: tabla `usuario` (`clinica_id` FK, `email` único por clínica, `hash_contrasena` argon2id, `rol`, `profesional_id` sin FK, `activo`, `ultimo_acceso`) y tabla de refresh tokens (`hash` SHA-256, rotación, revocación), con `aplicar_rls`. Verificar: nombre respeta el patrón `C{NN}_{seq}_{nombre}.sql` (regla 6 del database-migrations).
- [ ] 1.2 Aplicar C06_001 con el runner de C-01 (rol `migra`; `npm run db:migrate`). Verificar: tablas `usuario` y refresh tokens existen; `pg_policies` muestra la política de aislamiento sobre `usuario`; el rol `app` no es propietario de las tablas.

## 2. Plugin de autenticación

- [ ] 2.1 Implementar el plugin de autenticación: valida el JWT, construye `RequestContext` y abre `withTenant(clinicaId, fn)` por pedido. Verificar: el plugin entrega el contexto y el aislamiento del personal por clínica funciona.

## 3. Endpoints HTTP

- [ ] 3.1 Endpoint `POST /auth/login`: email + contraseña; verificar el hash argon2id y el usuario inactivo; devolver JWT de acceso corto y refresh rotativo; mensajes genéricos sin leaks.
- [ ] 3.2 Endpoint `POST /auth/refresh` (rotar el refresh) y `POST /auth/logout` (revocar). Verificar: rotación normal y reuso detectado del refresh.
- [ ] 3.3 Rate limit por IP y email en los intentos de login. Verificar: intentos excesivos son rechazados temporalmente.

## 4. Matriz RBAC y CRUD de usuarios

- [ ] 4.1 Implementar la matriz RBAC (`requireRole`, `requirePermission` según `03 §RBAC`); un recurso de otra clínica responde "no encontrado".
- [ ] 4.2 CRUD de usuarios del personal (solo administrador), con rol y profesional asociado.

## 5. Integración final

- [ ] 5.1 Re-ejecutar `openspec validate 2026-11-24-c-06-auth-personal-rbac` y `openspec status --change 2026-11-24-c-06-auth-personal-rbac --json`. Verificar: proposal, specs, design y tasks presentes; los artefactos del spec-driven validan.
