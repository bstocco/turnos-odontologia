-- Change C-13 `disponibilidad-publica`: resolución de la clínica por slug para las rutas públicas.
-- Materializa: spec db-tenant-rls ("Función resolver_clinica_por_slug"), 04 §clinica, 08 §Seguridad.
-- Reglas: solo devuelve el id de una clínica ACTIVA (inactiva = inexistente, regla 12), con
-- `search_path` fijo (SECURITY DEFINER), sin EXECUTE para PUBLIC y solo para el rol `app`.
-- Rollback: migración nueva C13_002 con DROP FUNCTION (nunca editar esta, regla 6).

CREATE FUNCTION resolver_clinica_por_slug(p_slug text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$ SELECT id FROM public.clinica WHERE slug = p_slug AND activa $$;

REVOKE ALL ON FUNCTION resolver_clinica_por_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolver_clinica_por_slug(text) TO app;
