# platform-validation Specification

## Purpose

Exige una verificación reproducible y documentada de las capacidades de PostgreSQL de las que depende el modelo de datos, y un registro honesto de dónde se verificó y con qué base legal se eligió la región.

## Requirements

### Requirement: Verificación automatizada de las capacidades de PostgreSQL
El proyecto SHALL incluir pruebas de integración reproducibles que demuestren: la creación de la extensión `btree_gist`, el rechazo de rangos solapados por profesional y por sillón, la aceptación de rangos contiguos (fin igual al inicio siguiente) y que la política de seguridad por fila falla cerrada para un rol sin contexto de clínica.

#### Scenario: Rangos solapados
- **WHEN** se insertan dos turnos del mismo sillón con rangos que se intersectan
- **THEN** la segunda inserción es rechazada por la restricción de exclusión

#### Scenario: Rangos contiguos
- **WHEN** un turno termina a la misma hora en que empieza otro del mismo sillón, sin tiempo de limpieza
- **THEN** ambas inserciones son aceptadas

#### Scenario: Seguridad por fila sin contexto
- **WHEN** un rol de aplicación, sin privilegios especiales, consulta una tabla con seguridad por fila y sin contexto de clínica
- **THEN** no ve ninguna fila

### Requirement: Decisión documentada sobre el fin de ocupación del sillón
La verificación SHALL demostrar que una columna generada basada en `timestamptz` más un intervalo es rechazada por PostgreSQL y que una columna común con una restricción de coherencia contra el tiempo de limpieza funciona, y SHALL dejar documentada la decisión resultante.

#### Scenario: Columna generada con intervalo
- **WHEN** se intenta crear una columna generada que suma un intervalo a un `timestamptz`
- **THEN** PostgreSQL rechaza la definición y la prueba registra ese resultado

#### Scenario: Columna común con restricción
- **WHEN** se inserta un turno cuyo fin de ocupación del sillón no coincide con su fin más el tiempo de limpieza
- **THEN** la restricción de coherencia rechaza la inserción

### Requirement: Informe de verificación con entornos explícitos
El proyecto SHALL mantener un informe que indique la versión de PostgreSQL y los entornos efectivamente verificados (local, integración continua y región elegida). Un entorno sin verificar MUST figurar como "no verificado".

#### Scenario: Región aún sin verificar
- **WHEN** no se probó la capacidad en la región elegida
- **THEN** el informe la marca como "no verificado" y no la presenta como confirmada

### Requirement: Base legal registrada junto con la región
La documentación SHALL registrar la región de despliegue elegida junto con su base legal para la transferencia de datos y MUST NOT afirmar nivel adecuado de protección para una jurisdicción que no figure en la lista oficial de la AAIP.

#### Scenario: Región fuera de la lista de nivel adecuado
- **WHEN** la región elegida está en un país que no figura en la lista de la AAIP
- **THEN** la documentación indica que se requieren cláusulas contractuales modelo o validación legal y deja esa verificación como pendiente

### Requirement: Verificación en la nube con aprobación previa
La verificación en un proveedor de nube SHALL realizarse solo con la aprobación explícita del Líder y MUST NOT crear cuentas ni generar costos sin ella.

#### Scenario: Sin aprobación
- **WHEN** no existe aprobación del Líder para usar un proveedor
- **THEN** la verificación se limita a los entornos local y de integración continua
