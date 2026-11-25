# Spec Delta — quality-gates

## ADDED Requirements

### Requirement: Suite de seguridad y auditoría de dependencias en integración continua
La integración continua SHALL ejecutar la suite de seguridad (`npm run test:security`) de forma secuencial después de `integration` y `e2e` sobre la base de pruebas sin interferir con ellas, y SHALL ejecutar `npm audit` fallando ante vulnerabilidades de severidad `high` o `critical`.

#### Scenario: Suite de seguridad ejecutada con un único comando documentado
- **WHEN** se ejecuta `npm run test:security` en local o en CI con la base de pruebas disponible
- **THEN** corren todas las pruebas de `test/seguridad/**` y el resultado global falla si alguna comprobación de seguridad falla

#### Scenario: Auditoría de dependencias detecta vulnerabilidades altas o críticas
- **WHEN** el árbol de dependencias declaradas contiene una vulnerabilidad de severidad `high` o `critical`
- **THEN** la verificación de auditoría de dependencias en CI termina con código distinto de cero
