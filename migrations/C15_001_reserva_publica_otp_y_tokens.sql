-- Change C-15 `reserva-publica-otp-y-tokens`:
-- Tablas multi-tenant `codigo_verificacion` y `token_accion` con RLS forzada (`aplicar_rls`),
-- FK compuesta hacia `turno (clinica_id, id)` (`C14_001`), solo hashes SHA-256 y función
-- `resolver_clinica_por_hash_token` de mínimo alcance (`SECURITY DEFINER`, patrón `C13_001`).

CREATE TABLE codigo_verificacion (
  id           uuid PRIMARY KEY,
  clinica_id   uuid NOT NULL REFERENCES clinica (id),
  email        text NOT NULL,
  hash_codigo  text NOT NULL,
  vence_en     timestamptz NOT NULL,
  intentos     integer NOT NULL DEFAULT 0,
  consumido_en timestamptz,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT codigo_verificacion_email_check
    CHECK (length(btrim(email)) > 0),
  CONSTRAINT codigo_verificacion_hash_sha256_check
    CHECK (hash_codigo ~ '^[0-9a-f]{64}$'),
  CONSTRAINT codigo_verificacion_intentos_check
    CHECK (intentos >= 0)
);

CREATE INDEX codigo_verificacion_clinica_email_creado_idx
  ON codigo_verificacion (clinica_id, email, creado_en DESC);

REVOKE ALL ON TABLE codigo_verificacion FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE codigo_verificacion TO app;

SELECT aplicar_rls('codigo_verificacion');

CREATE TABLE token_accion (
  id         uuid PRIMARY KEY,
  clinica_id uuid NOT NULL REFERENCES clinica (id),
  turno_id   uuid NOT NULL,
  proposito  text NOT NULL,
  hash_token text NOT NULL,
  vence_en   timestamptz NOT NULL,
  usado_en   timestamptz,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT token_accion_proposito_check
    CHECK (proposito IN ('confirmar', 'cancelar')),
  CONSTRAINT token_accion_hash_sha256_check
    CHECK (hash_token ~ '^[0-9a-f]{64}$'),
  CONSTRAINT token_accion_hash_unico
    UNIQUE (hash_token),
  CONSTRAINT token_accion_turno_fk
    FOREIGN KEY (clinica_id, turno_id)
    REFERENCES turno (clinica_id, id)
);

CREATE INDEX token_accion_clinica_turno_idx
  ON token_accion (clinica_id, turno_id);

REVOKE ALL ON TABLE token_accion FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE token_accion TO app;

SELECT aplicar_rls('token_accion');

-- Permite exclusivamente que la función `SECURITY DEFINER` (propietario `migra`) resuelva
-- `clinica_id` por `hash_token` sin contexto de sesión; el rol `app` continúa sujeto a RLS.
CREATE POLICY token_accion_resolver_migra ON token_accion
  AS PERMISSIVE FOR SELECT TO migra
  USING (true);

CREATE FUNCTION resolver_clinica_por_hash_token(p_hash_token text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT ta.clinica_id
  FROM public.token_accion ta
  JOIN public.clinica c ON c.id = ta.clinica_id
  WHERE ta.hash_token = p_hash_token
    AND c.activa
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION resolver_clinica_por_hash_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolver_clinica_por_hash_token(text) TO app;
