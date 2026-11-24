-- Change C-06 (corrección) `privilegios-app`: privilegios del rol `app` sobre `usuario` y
-- `token_refresco`.
--
-- Bug: C06_001 creó ambas tablas y les aplicó `aplicar_rls`, pero no otorgó ningún privilegio al
-- rol `app` (propiedad de `migra`, sin BYPASSRLS). En una base recién migrada el login, el
-- refresh, el logout, el CRUD de usuarios y el alta de clínicas (C-17) fallaban con
-- "permission denied for table usuario" (42501). C06_001 ya está fusionada y no se edita
-- (regla 6): la corrección va en esta migración nueva.
--
-- Mínimo privilegio, derivado del SQL real de src/infrastructure/auth/repositorio-de-usuarios.ts
-- y src/infrastructure/aprovisionamiento/repositorio-de-clinicas.ts. Sin grants a PUBLIC.
-- RLS sigue aplicando sobre cada operación: estos privilegios no la eluden.

-- usuario ----------------------------------------------------------------------------------
-- Lectura (login por email, por id, listado); el WHERE de UPDATE/DELETE también lee clinica_id.
GRANT SELECT ON TABLE usuario TO app;
-- Alta: alta de personal (crearUsuarioDePersonal) y administrador inicial (C-17). `activo` toma
-- su DEFAULT y `ultimo_acceso` queda nulo: ningún código los inserta.
GRANT INSERT (id, clinica_id, email, hash_contrasena, rol, profesional_id) ON TABLE usuario TO app;
-- Modificación: solo rol, profesional_id y activo (actualizarUsuarioDePersonal). Nunca email,
-- hash de contraseña ni clinica_id (el usuario no migra de clínica). `ultimo_acceso` no se
-- actualiza en ningún camino de código hoy: se otorga cuando exista ese código.
GRANT UPDATE (rol, profesional_id, activo) ON TABLE usuario TO app;
-- Baja física: ruta DELETE de usuarios (eliminarUsuarioDePersonal).
GRANT DELETE ON TABLE usuario TO app;

-- token_refresco ---------------------------------------------------------------------------
-- Lectura por hash en refresh y logout (buscarTokenDeRefrescoPorHash).
GRANT SELECT ON TABLE token_refresco TO app;
-- Alta en login y en la rotación del refresh (crearTokenDeRefrescoEnTabla).
GRANT INSERT (id, clinica_id, usuario_id, hash_token, vence_en) ON TABLE token_refresco TO app;
-- Revocación: único campo mutable (revocarTokenDeRefresco). Sin DELETE: los tokens se revocan,
-- no se borran, para detectar reutilización.
GRANT UPDATE (revoked_en) ON TABLE token_refresco TO app;
