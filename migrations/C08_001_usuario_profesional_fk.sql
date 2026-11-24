-- Change C-08 `api-configuracion-clinica`: integridad de `usuario.profesional_id`.
--
-- C06_001 creó la columna sin FK (profesional todavía no existía). Con `profesional` (C-05) se
-- agrega una FK COMPUESTA (clinica_id, profesional_id) -> profesional (clinica_id, id): las FK no
-- pasan por RLS, y una FK simple a profesional(id) permitiría vincular un usuario a un
-- profesional de otra clínica (regla dura 3, aislamiento multi-tenant).
--
-- * MATCH SIMPLE (por defecto): con profesional_id NULL la FK no se evalúa (administradores y
--   recepcionistas no tienen profesional).
-- * ON DELETE NO ACTION: el rol `app` no tiene DELETE sobre `profesional`.
-- * Se agrega validada: si hubiera usuarios huérfanos la migración falla de forma atómica y se
--   corrige el dato antes de reintentar (no se anulan vínculos en silencio).
-- * `profesional_clinica_id_id_key` (C05_001) provee la clave única referenciada.

ALTER TABLE usuario
  ADD CONSTRAINT usuario_profesional_fk FOREIGN KEY (clinica_id, profesional_id)
  REFERENCES profesional (clinica_id, id);
