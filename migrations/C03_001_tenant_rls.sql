-- Change C-03 `db-tenant-rls`: aislamiento multi-tenant por Row-Level Security (diseño DD-01).
-- Cada migración aplica `aplicar_rls('tabla')` (regla 6): las tablas con `clinica_id` tienen RLS
-- habilitado y forzado. La tabla `clinica` no tiene RLS por diseño: es el directorio de
-- clínicas, consultado por slug (knowledge-base/04_modelo_de_datos.md §clinica).

-- La extensión es "de confianza": el propietario (rol migra) puede crearla sin ser superusuario
-- (ver docs/plataforma/informe-validacion-postgres.md, spike R-05).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Helper SQL reutilizable por las migraciones de C-05+: habilita y fuerza RLS con una política
-- de aislamiento por `clinica_id`. Forma validada en el informe de validación de PostgreSQL:
-- `clinica_id = NULLIF(current_setting('app.clinica_id', true), '')::uuid`
--   - con `missing_ok` (segunda opción `true`), una consulta sin contexto devuelve 0 filas;
--   - sin `NULLIF`, una conexión con el parámetro vacío queda sin contexto y falla la conversión.
CREATE OR REPLACE FUNCTION aplicar_rls(tabla text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabla);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tabla);
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = tabla AND policyname = format('%s_clinica_id', tabla)
  ) THEN
    -- String doble-dólar ($pol$...$pol$): no hay que escapar comillas en la expresión.
    EXECUTE format(
      $pol$CREATE POLICY %s_clinica_id ON %I AS PERMISSIVE FOR ALL TO app
                              USING (clinica_id = NULLIF(current_setting('app.clinica_id', true), '')::uuid)$pol$,
      tabla,
      tabla
    );
  END IF;
END;
$$;

-- Datos del Tenant y de la configuración por clínica (knowledge-base/04_modelo_de_datos.md §clinica §clinica_config).
CREATE TABLE clinica (
  id           uuid PRIMARY KEY,
  nombre       text NOT NULL,
  slug         text NOT NULL UNIQUE,
  zona_horaria text NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  activa       boolean NOT NULL DEFAULT TRUE,
  creada_en    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clinica_config (
  clinica_id                     uuid PRIMARY KEY REFERENCES clinica(id),
  reserva_requiere_confirmacion boolean NOT NULL DEFAULT FALSE,
  cancelacion_anticipacion_horas integer NOT NULL DEFAULT 24,
  granularidad_minutos           integer NOT NULL DEFAULT 15
);

-- privilegios del rol app sobre las tablas (los roles app y migra existen desde C-01,
-- docker/postgres/init/01-roles.sql): app es el rol de la aplicación, sin BYPASSRLS ni propiedad.
GRANT USAGE ON SCHEMA public TO app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE clinica, clinica_config TO app;

-- Aplicación de RLS a la tabla que tiene `clinica_id` (regla 6: "Cada migración aplica aplicar_rls('tabla')").
SELECT aplicar_rls('clinica_config');
