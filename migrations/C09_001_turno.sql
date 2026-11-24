-- Change C-09 `turnos-persistencia-y-casos-de-uso`: tabla `turno` con constraints de
-- exclusión (RN-AG-01, RN-AG-02) y `aplicar_rls` (C-03). Ver KB §turno
-- (`knowledge-base/04_modelo_de_datos.md` §turno).

CREATE TABLE IF NOT EXISTS turno (
  id                      uuid PRIMARY KEY,
  clinica_id              uuid NOT NULL REFERENCES clinica(id),
  paciente_id             uuid,
  profesional_id          uuid,
  sillon_id               uuid,
  prestacion_id           uuid,
  inicio                  timestamptz NOT NULL,
  fin                     timestamptz NOT NULL,
  buffer_minutos          integer NOT NULL DEFAULT 0,
  fin_sillon              timestamptz NOT NULL,
  estado                  text NOT NULL DEFAULT 'pendiente_confirmacion',
  origen                  text NOT NULL DEFAULT 'recepcion',
  reprogramado_de         uuid,
  duracion_real_minutos   integer,
  creado_en               timestamptz NOT NULL DEFAULT now(),
  actualizado_en          timestamptz NOT NULL DEFAULT now(),
  rango_profesional       tstzrange GENERATED ALWAYS AS (tstzrange(inicio, fin, '[)')) STORED,
  rango_sillon            tstzrange GENERATED ALWAYS AS (tstzrange(inicio, fin_sillon, '[)')) STORED
);

-- Coherencia de `fin_sillon` (hallazgo R-04 del informe: `timestamptz + interval` es
-- STABLE, no IMMUTABLE — por eso se persiste la columna común y el CHECK).
ALTER TABLE turno
  ADD CONSTRAINT turno_fin_sillon_coherente
  CHECK (fin_sillon = fin + make_interval(mins => buffer_minutos));

-- Restricciones de exclusión (garantía final de RN-AG-01 y RN-AG-02).
ALTER TABLE turno
  ADD CONSTRAINT turno_sin_solape_profesional
  EXCLUDE USING gist (clinica_id WITH =, profesional_id WITH =, rango_profesional WITH &&)
  WHERE (estado NOT IN ('cancelado', 'reprogramado'));

ALTER TABLE turno
  ADD CONSTRAINT turno_sin_solape_sillon
  EXCLUDE USING gist (clinica_id WITH =, sillon_id WITH =, rango_sillon WITH &&)
  WHERE (estado NOT IN ('cancelado', 'reprogramado'));

CREATE INDEX IF NOT EXISTS turno_clinica_profesional_inicio_idx ON turno (clinica_id, profesional_id, inicio);
CREATE INDEX IF NOT EXISTS turno_clinica_sillon_inicio_idx ON turno (clinica_id, sillon_id, inicio);
CREATE INDEX IF NOT EXISTS turno_clinica_paciente_idx ON turno (clinica_id, paciente_id);
CREATE INDEX IF NOT EXISTS turno_clinica_estado_inicio_idx ON turno (clinica_id, estado, inicio);

-- privilegios del rol `app` sobre la tabla (C-03: `app` no es propietario; `migra` lo es).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE turno TO app;

-- Aplicación de RLS (C-03).
SELECT aplicar_rls('turno');
