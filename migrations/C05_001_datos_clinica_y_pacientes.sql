-- Change C-05 `datos-clinica-y-pacientes`: recursos de la clínica, pacientes y bloqueos.
-- Diseño: openspec/changes/c-05-datos-clinica-y-pacientes (D1-D6). Esta migración no se edita
-- una vez fusionada (regla 6): cualquier corrección va en C05_002.
--
-- Reglas que materializa:
--   RN-MT-01/DD-01  cada tabla lleva clinica_id y RLS forzada (aplicar_rls, C03_001).
--   RN-DA-03        instantes en timestamptz (UTC); horas de atención en time; feriados en date.
--   RN-AG-03        intervalos semiabiertos [inicio, fin).
--   RN-AG-05        sillon.buffer_minutos >= 0 (el buffer lo aplica el dominio solo al sillón).
--   RN-AG-06        las franjas de un profesional no se solapan (D5).
--   RN-PA-02        DNI único por clínica.
--
-- FK compuestas (D2): las comprobaciones de FK no pasan por RLS, así que toda referencia a un
-- recurso se hace por (clinica_id, id) para que una fila nunca apunte a otra clínica.

-- D5: minutos desde la medianoche de una hora local; 24:00 -> 1440. IMMUTABLE para poder usarse
-- en una expresión de índice (el EXCLUDE de franjas).
CREATE FUNCTION minutos_del_dia(t time) RETURNS integer
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$ SELECT (EXTRACT(EPOCH FROM t) / 60)::integer $$;

CREATE TABLE profesional (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES clinica (id),
  nombre     text NOT NULL,
  apellido   text NOT NULL,
  matricula  text,
  activo     boolean NOT NULL DEFAULT TRUE,
  CONSTRAINT profesional_clinica_id_id_key UNIQUE (clinica_id, id)
);

CREATE TABLE sillon (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id     uuid NOT NULL REFERENCES clinica (id),
  nombre         text NOT NULL,
  buffer_minutos integer NOT NULL DEFAULT 0,
  activo         boolean NOT NULL DEFAULT TRUE,
  CONSTRAINT sillon_clinica_id_id_key UNIQUE (clinica_id, id),
  CONSTRAINT sillon_buffer_minutos_check CHECK (buffer_minutos >= 0)
);

CREATE TABLE prestacion (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id       uuid NOT NULL REFERENCES clinica (id),
  nombre           text NOT NULL,
  duracion_minutos integer NOT NULL,
  activa           boolean NOT NULL DEFAULT TRUE,
  CONSTRAINT prestacion_clinica_id_id_key UNIQUE (clinica_id, id),
  CONSTRAINT prestacion_duracion_minutos_check CHECK (duracion_minutos > 0)
);

-- Dato de salud (Ley 25.326): nunca se loguea ni viaja en errores (regla 1).
CREATE TABLE paciente (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id  uuid NOT NULL REFERENCES clinica (id),
  nombre      text NOT NULL,
  apellido    text NOT NULL,
  dni         text NOT NULL,
  telefono    text NOT NULL,
  email       text,
  obra_social text,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paciente_clinica_id_id_key UNIQUE (clinica_id, id),
  CONSTRAINT paciente_dni_unico UNIQUE (clinica_id, dni),
  CONSTRAINT paciente_dni_formato_check CHECK (dni ~ '^[0-9]{7,8}$'),
  -- RN-PA-03: formato internacional (+ y 8 a 15 dígitos), ya normalizado por la aplicación (C-04).
  CONSTRAINT paciente_telefono_formato_check CHECK (telefono ~ '^\+[1-9][0-9]{7,14}$')
);
-- Búsqueda por prefijo de apellido sin distinguir mayúsculas ni tildes del español (el repositorio
-- usa exactamente esta expresión; `translate` y `lower` son IMMUTABLE). La ñ se conserva.
CREATE INDEX paciente_apellido_idx
  ON paciente (clinica_id, (translate(lower(apellido), 'áéíóúü', 'aeiouu')) text_pattern_ops);

CREATE TABLE feriado (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id  uuid NOT NULL REFERENCES clinica (id),
  fecha       date NOT NULL,
  descripcion text NOT NULL,
  CONSTRAINT feriado_fecha_unica UNIQUE (clinica_id, fecha)
);

CREATE TABLE horario_atencion (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id     uuid NOT NULL REFERENCES clinica (id),
  profesional_id uuid NOT NULL,
  dia_semana     smallint NOT NULL,
  hora_desde     time NOT NULL,
  hora_hasta     time NOT NULL,
  CONSTRAINT horario_profesional_fk FOREIGN KEY (clinica_id, profesional_id)
    REFERENCES profesional (clinica_id, id),
  CONSTRAINT horario_dia_semana_check CHECK (dia_semana BETWEEN 0 AND 6),
  CONSTRAINT horario_horas_check CHECK (hora_desde < hora_hasta),
  -- D5: franjas disjuntas por profesional y día, intervalos [desde, hasta).
  CONSTRAINT horario_sin_solape EXCLUDE USING gist (
    clinica_id WITH =, profesional_id WITH =, dia_semana WITH =,
    int4range(minutos_del_dia(hora_desde), minutos_del_dia(hora_hasta), '[)') WITH &&)
);

CREATE TABLE bloqueo (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id     uuid NOT NULL REFERENCES clinica (id),
  profesional_id uuid NOT NULL,
  inicio         timestamptz NOT NULL,
  fin            timestamptz NOT NULL,
  motivo         text,
  -- Sin FK a usuario: la agrega C-12 (D3). `motivo` es texto libre: se trata como dato sensible.
  creado_por     uuid NOT NULL,
  CONSTRAINT bloqueo_profesional_fk FOREIGN KEY (clinica_id, profesional_id)
    REFERENCES profesional (clinica_id, id),
  CONSTRAINT bloqueo_rango_check CHECK (inicio < fin),
  -- D4: dos bloqueos del mismo profesional no se intersectan ([inicio, fin) semiabierto).
  CONSTRAINT bloqueo_sin_solape EXCLUDE USING gist (
    clinica_id WITH =, profesional_id WITH =, tstzrange(inicio, fin, '[)') WITH &&)
);

-- D6: privilegios mínimos. Recursos y pacientes se desactivan, no se borran (DELETE solo donde
-- el reemplazo o la baja lo exigen).
GRANT SELECT, INSERT, UPDATE ON TABLE profesional, sillon, prestacion, paciente TO app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE feriado, horario_atencion, bloqueo TO app;

SELECT aplicar_rls('profesional');
SELECT aplicar_rls('sillon');
SELECT aplicar_rls('prestacion');
SELECT aplicar_rls('paciente');
SELECT aplicar_rls('feriado');
SELECT aplicar_rls('horario_atencion');
SELECT aplicar_rls('bloqueo');
