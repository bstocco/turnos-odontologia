-- Inicialización de PostgreSQL para desarrollo local y CI (diseño D7).
--
-- Crea los roles y las bases del proyecto. Debe ejecutarla un superusuario con psql 15 o
-- superior (usa \getenv). Es idempotente: si el rol o la base ya existen, no los toca
-- (tampoco cambia contraseñas ya definidas).
--
--   * Docker: la imagen oficial la ejecuta sola al crear el volumen (docker-entrypoint-initdb.d).
--   * CI o PostgreSQL nativo: psql -h localhost -U postgres -f docker/postgres/init/01-roles.sql
--
-- Variables de entorno obligatorias: MIGRA_PASSWORD y APP_PASSWORD. Si falta alguna, el script
-- falla antes de crear nada (la variable queda sin definir y la sentencia no compila).
--
-- Roles:
--   migra  propietario de las bases y del esquema; ejecuta las migraciones.
--   app    rol de la aplicación: sin superusuario, sin BYPASSRLS y sin ser propietario de
--          nada, de modo que Row-Level Security siempre le aplica (RN-MT-02).
-- Los privilegios sobre cada tabla los otorga la migración que la crea (C-03 en adelante);
-- acá no hay privilegios por defecto sobre tablas a propósito (p. ej. auditoria es solo INSERT).
--
-- En el PaaS elegido el aprovisionamiento equivalente se documenta en C-20.

\set ON_ERROR_STOP on
\getenv migra_password MIGRA_PASSWORD
\getenv app_password APP_PASSWORD

SELECT format('CREATE ROLE migra LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS', :'migra_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migra')
\gexec

SELECT format('CREATE ROLE app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app')
\gexec

SELECT 'CREATE DATABASE turnos OWNER migra'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'turnos')
\gexec

SELECT 'CREATE DATABASE turnos_test OWNER migra'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'turnos_test')
\gexec

\connect turnos
REVOKE ALL ON DATABASE turnos FROM PUBLIC;
GRANT CONNECT ON DATABASE turnos TO app;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO migra;
GRANT USAGE ON SCHEMA public TO app;

\connect turnos_test
REVOKE ALL ON DATABASE turnos_test FROM PUBLIC;
GRANT CONNECT ON DATABASE turnos_test TO app;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO migra;
GRANT USAGE ON SCHEMA public TO app;
