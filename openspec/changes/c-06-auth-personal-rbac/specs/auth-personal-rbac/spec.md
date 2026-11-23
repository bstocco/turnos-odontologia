# Spec Delta

## Purpose

JWT del personal: autenticación con token corto y refresh rotativo; control de acceso por roles; CRUD de usuarios del personal solo para administradores; acceso a datos del tenant mediante `RequestContext` y `withTenant`.

## ADDED Requirements

### Requirement: Autenticación JWT del personal
The system SHALL authenticate personal staff: `POST /auth/login` with email and password returns a short-lived access token plus a rotative refresh token, with generic error messages.

#### Scenario: Correct login
- **WHEN** a staff member calls `POST /auth/login` with email and password
- **THEN** the system issues an access token and a refresh token

#### Scenario: Incorrect credentials
- **WHEN** a staff member calls `POST /auth/login` with invalid credentials
- **THEN** the system responds `401` with a generic message

#### Scenario: Inactive user
- **WHEN** an inactive staff member calls `POST /auth/login`
- **THEN** the system responds `401` with a generic message

#### Scenario: Refresh rotation
- **WHEN** the app calls `POST /auth/refresh` with a refresh token
- **THEN** the system issues a new refresh token and revokes the previous one; reuse of a revoked token is rejected

#### Scenario: Logout
- **WHEN** a user calls `POST /auth/logout`
- **THEN** the refresh token is revoked

#### Scenario: Expired access token
- **WHEN** a request arrives with an expired or invalid access token
- **THEN** the system responds `401` with a generic message

#### Scenario: Rate limit
- **WHEN** requests to auth endpoints exceed the rate limit per IP or email
- **THEN** the system responds with a rate-limit rejection

### Requirement: Plugin de autenticación
The system SHALL provide a Fastify authentication plugin that validates the JWT, builds `RequestContext` and opens `withTenant` for the request.

#### Scenario: Request authentication
- **WHEN** an authenticated request arrives
- **THEN** the plugin validates the access token and opens a tenant context for the clinic of the user

### Requirement: Matriz RBAC en código
The system SHALL enforce role-based access per `03_actors_y_roles.md`: resources of another clinic respond "no encontrado".

#### Scenario: Authorized access
- **WHEN** an authenticated user with the required role requests a resource
- **THEN** the system allows the access

#### Scenario: Role authorization failure
- **WHEN** an authenticated user without the required role requests a resource
- **THEN** the system responds forbidden/not-allowed

#### Scenario: Resource of another clinic
- **WHEN** an authenticated user of clinic A requests a resource of clinic B
- **THEN** the system responds "no encontrado" without revealing that the resource exists

### Requirement: CRUD de usuarios del personal
The system SHALL provide CRUD of staff users (create, read, update, delete) with role and associated professional, accessible only to administrators.

#### Scenario: Administrator manages users
- **WHEN** an administrator creates, reads, updates or deletes a staff user
- **THEN** the change is allowed with the user's role and profesional association

#### Scenario: Non-administrator attempts CRUD
- **WHEN** a non-administrator attempts to manage staff users
- **THEN** the system responds as not authorized

### Requirement: Migration C06_001
Migration `C06_001` SHALL create the `usuario` table (email unique per clinic, `hash_contrasena` argon2id, `rol`, `profesional_id` without FK, `activo`, `ultimo_acceso`) and the refresh tokens table (hash, rotación, revocación), with `aplicar_rls`.

#### Scenario: Migration applies RLS
- **WHEN** C06_001 is applied
- **THEN** tables `usuario` and the refresh tokens table exist with RLS enabled and forced
