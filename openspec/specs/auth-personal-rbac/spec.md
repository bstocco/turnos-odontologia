# auth-personal-rbac Specification

## Purpose

Autenticación del personal con JWT y control de acceso por roles sobre los recursos de la clínica.

## Requirements

### Requirement: Autenticación del personal con JWT
The system SHALL authenticate personal users with short-lived JWT access tokens: `POST /auth/login` with email and password SHALL verify the user and the argon2id password, return a generic error when the credentials are invalid or the user is inactive, and return a short-lived access token plus a rotating refresh token on success.

#### Scenario: Successful login
- **WHEN** the client sends a correct email and password to `POST /auth/login`
- **THEN** the API returns a short-lived access token and a rotating refresh token

#### Scenario: Invalid credentials
- **WHEN** the email does not match or the argon2id check fails
- **THEN** the API returns 401 with a generic message

#### Scenario: Inactive user
- **WHEN** the user exists but is inactive
- **THEN** the API returns 401

### Requirement: Refresco de token
The system SHALL support `POST /auth/refresh` with the rotating refresh token and `POST /auth/logout` to revoke it; reuse of a rotated refresh token SHALL be rejected.

#### Scenario: Refresh
- **WHEN** the client sends a valid refresh token to `POST /auth/refresh`
- **THEN** the API returns a new short-lived access token and rotates the refresh token

#### Scenario: Reuse of a rotated token
- **WHEN** a refresh token already used is sent again
- **THEN** the API rejects it

### Requirement: Rate limit por IP y email
The system SHALL limit login attempts by IP and by email.

#### Scenario: Excessive attempts
- **WHEN** too many attempts come from an IP or for an email
- **THEN** the API temporarily rejects the requests

### Requirement: Matriz RBAC y aislamiento por clínica
The system SHALL enforce access control by role (`requireRole`, `requirePermission`) and SHALL answer "not found" for resources of another clinic.

#### Scenario: Authorized access
- **WHEN** a user with the role invokes an allowed resource
- **THEN** the API returns the resource

#### Scenario: Resource of another clinic
- **WHEN** a user invokes a resource of another clinic
- **THEN** the API responds "not found" without revealing that the resource exists

### Requirement: CRUD de usuarios del personal
The system SHALL provide CRUD of personal users for administrators, including role and associated professional.

#### Scenario: Administrator manages users
- **WHEN** the administrator creates, updates or deletes a personal user
- **THEN** the change is persisted with the given role and professional association
