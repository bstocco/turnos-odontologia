-- Change C-11 `cola-y-email-base`: tabla de notificaciones multi-tenant con RLS (DD-01, DD-09, RN-NO-03).
-- Nota (Convención 4, CHANGES.md): C-09 (`turno`) aún no está fusionado en main, por lo que `turno_id`
-- es uuid nullable sin clave foránea; C-14 agregará la FK `notificacion.turno_id -> turno(id)`.

CREATE TABLE notificacion (
  id                 uuid PRIMARY KEY,
  clinica_id         uuid NOT NULL REFERENCES clinica (id),
  turno_id           uuid,
  canal              text NOT NULL DEFAULT 'email',
  tipo               text NOT NULL,
  estado             text NOT NULL DEFAULT 'pendiente',
  clave_idempotencia text NOT NULL,
  intentos           integer NOT NULL DEFAULT 0,
  programada_para    timestamptz NOT NULL DEFAULT now(),
  enviada_en         timestamptz,
  error              text,
  creada_en          timestamptz NOT NULL DEFAULT now(),
  actualizada_en     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notificacion_canal_check
    CHECK (canal = 'email'),
  CONSTRAINT notificacion_tipo_check
    CHECK (tipo IN ('creacion', 'confirmacion', 'recordatorio', 'cancelacion', 'reprogramacion', 'codigo')),
  CONSTRAINT notificacion_estado_check
    CHECK (estado IN ('pendiente', 'enviada', 'fallida')),
  CONSTRAINT notificacion_clave_idempotencia_check
    CHECK (length(btrim(clave_idempotencia)) > 0),
  CONSTRAINT notificacion_intentos_check
    CHECK (intentos >= 0),
  CONSTRAINT notificacion_turno_codigo_check
    CHECK ((tipo = 'codigo' AND turno_id IS NULL) OR (tipo <> 'codigo')),
  CONSTRAINT notificacion_enviada_en_check
    CHECK (
      (estado = 'enviada' AND enviada_en IS NOT NULL)
      OR (estado <> 'enviada' AND enviada_en IS NULL)
    ),
  CONSTRAINT notificacion_error_check
    CHECK (error IS NULL OR length(btrim(error)) > 0),
  CONSTRAINT notificacion_clinica_idempotencia_unique
    UNIQUE (clinica_id, clave_idempotencia)
);

CREATE INDEX notificacion_clinica_estado_programada_idx
  ON notificacion (clinica_id, estado, programada_para);

CREATE INDEX notificacion_clinica_turno_idx
  ON notificacion (clinica_id, turno_id)
  WHERE turno_id IS NOT NULL;

-- Privilegios mínimos para el rol `app`: sin DELETE ni TRUNCATE.
REVOKE ALL ON TABLE notificacion FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE notificacion TO app;

-- Aislamiento multi-tenant por Row-Level Security (C-03).
SELECT aplicar_rls('notificacion');
