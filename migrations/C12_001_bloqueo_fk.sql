-- Change C-12 `api-turnos-y-agenda`: FK `bloqueo.creado_por → usuario` (diseño C-12).
ALTER TABLE bloqueo ADD CONSTRAINT bloqueo_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES usuario(id);
