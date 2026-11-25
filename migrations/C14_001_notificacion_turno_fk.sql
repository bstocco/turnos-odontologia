-- Change C-14 `recordatorios-y-notificaciones-turno`: clave foránea compuesta multi-tenant
-- notificacion.(clinica_id, turno_id) -> turno.(clinica_id, id) (diferida por C-11 Q1).
-- MATCH SIMPLE (por defecto) preserva turno_id IS NULL para notificaciones tipo = 'codigo'.

ALTER TABLE turno
  ADD CONSTRAINT turno_clinica_id_id_key UNIQUE (clinica_id, id);

ALTER TABLE notificacion
  ADD CONSTRAINT notificacion_turno_fk
  FOREIGN KEY (clinica_id, turno_id)
  REFERENCES turno (clinica_id, id);
