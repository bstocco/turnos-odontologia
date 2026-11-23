-- Migración de EJEMPLO, solo para pruebas del runner. No pertenece a migrations/.
-- C99 está reservado para fixtures: ningún change real usa ese número.
CREATE TABLE ejemplo_fixture (
  id     integer PRIMARY KEY,
  nombre text NOT NULL
);
