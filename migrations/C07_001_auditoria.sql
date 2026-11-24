-- Change C-07 `auditoria-append-only`: registro de auditoría inmutable y aislado por clínica.
-- Diseño: openspec/changes/c-07-auditoria-append-only/design.md (D1-D4).
-- Reglas que materializa:
--   RN-AU-01 / DD-05  auditoria append-only en doble barrera (privilegios mínimos + trigger).
--   RN-MT-01 / DD-01  clinica_id obligatorio con RLS forzada (aplicar_rls, C03_001).
--   RN-DA-03          ocurrio_en en timestamptz UTC.
--   C-17 compat       actor_id nullable para actor_tipo = 'sistema'; entidad_id uuid nullable.

CREATE TABLE auditoria (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clinica_id    uuid NOT NULL REFERENCES clinica (id),
  ocurrio_en    timestamptz NOT NULL DEFAULT now(),
  actor_tipo    text NOT NULL,
  actor_id      text,
  accion        text NOT NULL,
  entidad       text NOT NULL,
  entidad_id    uuid,
  datos_antes   jsonb,
  datos_despues jsonb,
  ip            inet,
  CONSTRAINT auditoria_actor_tipo_check
    CHECK (actor_tipo IN ('usuario', 'paciente_enlace', 'sistema')),
  CONSTRAINT auditoria_actor_id_check CHECK (
    (actor_tipo = 'sistema'
      AND (actor_id IS NULL OR length(btrim(actor_id)) > 0))
    OR
    (actor_tipo <> 'sistema'
      AND actor_id IS NOT NULL
      AND length(btrim(actor_id)) > 0)
  ),
  CONSTRAINT auditoria_accion_formato_check CHECK (accion ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT auditoria_entidad_formato_check CHECK (entidad ~ '^[a-z][a-z0-9_]*$')
);

-- Índices previstos para consulta de auditoría por clínica, rango temporal, entidad y actor (C-16).
CREATE INDEX auditoria_clinica_ocurrio_idx
  ON auditoria (clinica_id, ocurrio_en DESC, id DESC);

CREATE INDEX auditoria_clinica_entidad_idx
  ON auditoria (clinica_id, entidad, ocurrio_en DESC);

CREATE INDEX auditoria_clinica_actor_idx
  ON auditoria (clinica_id, actor_tipo, actor_id, ocurrio_en DESC);

CREATE INDEX auditoria_clinica_entidad_id_idx
  ON auditoria (clinica_id, entidad, entidad_id)
  WHERE entidad_id IS NOT NULL;

-- Barrera 2 de inmutabilidad (RN-AU-01): FOR EACH STATEMENT bloquea incluso UPDATE/DELETE sin filas
-- y TRUNCATE ejecutados por el rol propietario `migra`.
CREATE FUNCTION impedir_mutacion_auditoria() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla auditoria es append-only: % no está permitido.', TG_OP
    USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER auditoria_inmutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON auditoria
  FOR EACH STATEMENT
  EXECUTE FUNCTION impedir_mutacion_auditoria();

-- Barrera 1 de inmutabilidad: privilegios mínimos para el rol `app` (solo SELECT e INSERT).
REVOKE ALL ON TABLE auditoria FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE auditoria TO app;

-- Aislamiento multi-tenant por Row-Level Security (C-03).
SELECT aplicar_rls('auditoria');
