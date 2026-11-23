# quality-gates Specification

## Purpose

Establece las verificaciones automáticas obligatorias para cada rama, de modo que tres implementadores en paralelo detecten temprano errores de estilo, de tipos y de comportamiento, incluido el de PostgreSQL real.

## Requirements

### Requirement: Verificaciones obligatorias en cada rama
Cada push a una rama y cada pedido de fusión hacia `main` SHALL ejecutar automáticamente lint y formato, verificación de tipos, pruebas unitarias y pruebas de integración. El resultado SHALL ser un fallo si cualquiera de ellas falla.

#### Scenario: Error de tipos
- **WHEN** se sube una rama con un error de tipos
- **THEN** la verificación de tipos falla y el resultado global es un fallo

#### Scenario: Todo en orden
- **WHEN** se sube una rama que cumple las cuatro verificaciones
- **THEN** el resultado global es exitoso

### Requirement: Integración con PostgreSQL real
Las pruebas de integración SHALL ejecutarse contra una instancia real de PostgreSQL y MUST NOT sustituirla por simulaciones.

#### Scenario: Prueba que usa la base
- **WHEN** corren las pruebas de integración
- **THEN** se conectan a una instancia real de PostgreSQL con las migraciones aplicadas

### Requirement: Instalación reproducible
Las verificaciones SHALL instalar las dependencias exactamente como indica el archivo de bloqueo versionado y fallar si ese archivo no coincide con el manifiesto.

#### Scenario: Archivo de bloqueo desactualizado
- **WHEN** el manifiesto de dependencias cambia sin actualizar el archivo de bloqueo
- **THEN** la instalación de las verificaciones falla

### Requirement: Mismos comandos en local y en la integración continua
Cada verificación SHALL poder ejecutarse en una máquina local con un único comando documentado, el mismo que usa la integración continua.

#### Scenario: Ejecución local
- **WHEN** una persona ejecuta el comando documentado de pruebas unitarias
- **THEN** corren las mismas pruebas que ejecuta la integración continua

### Requirement: Sin datos reales ni secretos en la integración continua
Las verificaciones SHALL usar únicamente datos sintéticos y credenciales descartables, sin acceder a secretos del proyecto ni a bases reales.

#### Scenario: Base de las pruebas
- **WHEN** corren las pruebas de integración
- **THEN** la base es efímera y sus credenciales no coinciden con las de ningún entorno real
