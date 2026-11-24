-- Change C-06 `auth-personal-rbac`: autenticación del personal con JWT y tabla de refresh tokens
-- (diseño DD-03). Aplica `aplicar_rls` (C-03).
--
-- El rol `app` no es propietario de las tablas (C-03): la migración se ejecuta con el rol `migra`.

CREATE TABLE IF NOT EXISTS usuario (
  id              uuid PRIMARY KEY,
  clinica_id      uuid NOT NULL REFERENCES clinica(id),
  email           text NOT NULL,
  hash_contrasena text NOT NULL,
  rol             text NOT NULL CHECK (rol IN ('administrador', 'recepcionista', 'odontologo')),
  profesional_id  uuid,
  activo          boolean NOT NULL DEFAULT TRUE,
  ultimo_acceso   timestamptz
);

ALTER TABLE usuario
  ADD CONSTRAINT usuario_email_unico_por_clinica UNIQUE (clinica_id, email);

CREATE TABLE IF NOT EXISTS token_refresco (
  id         uuid PRIMARY KEY,
  clinica_id uuid NOT NULL REFERENCES clinica(id),
  usuario_id uuid NOT NULL REFERENCES usuario(id),
  hash_token text NOT NULL,
  vence_en   timestamptz NOT NULL,
  revoked_en timestamptz
);

-- Aplicación de RLS (C-03).
SELECT aplicar_rls('usuario');
SELECT aplicar_rls('token_refresco');
