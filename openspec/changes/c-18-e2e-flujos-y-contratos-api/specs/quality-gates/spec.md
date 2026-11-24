# Spec Delta

## ADDED Requirements

### Requirement: Pruebas e2e y contrato en cada rama
Cada push a una rama y cada pedido de fusión hacia `main` SHALL ejecutar además las pruebas e2e, la matriz de permisos y la verificación del contrato OpenAPI, con el mismo comando documentado que se usa en local. El resultado SHALL ser un fallo si cualquiera de ellas falla.

#### Scenario: Contrato desactualizado
- **WHEN** se sube una rama que cambia una ruta sin regenerar el contrato
- **THEN** el resultado global es un fallo

#### Scenario: Ejecución local de e2e
- **WHEN** una persona ejecuta el comando documentado de pruebas e2e con la base de pruebas levantada
- **THEN** corren las mismas pruebas e2e que ejecuta la integración continua

### Requirement: Pruebas e2e sin interferir con integración
Las pruebas e2e SHALL ejecutarse después de las de integración cuando comparten la base de pruebas, y MUST NOT correr en paralelo con ellas sobre la misma base.

#### Scenario: Todas las pruebas juntas
- **WHEN** se ejecutan todas las pruebas con un único comando
- **THEN** las de integración terminan antes de que empiecen las e2e y ambas pasan
