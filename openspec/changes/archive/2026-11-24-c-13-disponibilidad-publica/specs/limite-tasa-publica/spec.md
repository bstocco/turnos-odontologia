# Spec Delta

## Purpose

Límite de tasa por dirección IP de las rutas públicas sin sesión, para acotar el abuso, el raspado del catálogo y la enumeración de slugs (RN-RE-05, R-02, `08 §Seguridad`).

## ADDED Requirements

### Requirement: Límite por IP configurable
Las rutas públicas de consulta SHALL compartir un límite de pedidos por IP de origen definido por `RATE_LIMIT_PUBLIC` (`<n>/<s|min|h>`, por defecto `30/min`), contado en una ventana fija por instancia del servicio.

#### Scenario: Pedido dentro del límite
- **WHEN** una IP hace 30 pedidos en un minuto con el límite por defecto
- **THEN** los 30 pedidos se atienden normalmente

#### Scenario: Pedido que excede el límite
- **WHEN** la misma IP hace el pedido 31 dentro del mismo minuto
- **THEN** la API responde `429` con código `DEMASIADOS_PEDIDOS` y el encabezado `retry-after`

#### Scenario: IPs independientes
- **WHEN** una IP agotó su límite y otra IP consulta
- **THEN** la segunda IP recibe `200`

### Requirement: Límite previo a cualquier acceso a datos
El límite SHALL evaluarse antes de validar la forma del pedido y antes de resolver el slug, y su respuesta `429` MUST ser idéntica para slugs existentes, inexistentes o de clínicas inactivas, de modo que no sirva como oráculo de enumeración.

#### Scenario: Slugs distintos comparten el cupo
- **WHEN** una IP alterna pedidos entre un slug existente y slugs inexistentes
- **THEN** todos consumen el mismo cupo y, al agotarse, todos reciben el mismo `429`

#### Scenario: Sin consultas a la base al exceder
- **WHEN** una IP excede el límite
- **THEN** el pedido rechazado no ejecuta ninguna consulta a la base

### Requirement: Memoria acotada del contador
El registro de contadores por IP MUST tener un tamaño máximo acotado, de modo que un volumen arbitrario de IPs distintas no haga crecer la memoria sin límite.

#### Scenario: Muchas IPs distintas
- **WHEN** llegan pedidos de más IPs distintas que la capacidad del registro
- **THEN** el servicio sigue respondiendo y la memoria del registro no supera su capacidad

### Requirement: Rutas no públicas fuera del límite público
El límite público MUST NOT aplicarse a `GET /salud` ni a las rutas autenticadas del personal.

#### Scenario: Salud sin límite público
- **WHEN** una IP agotó el límite público y consulta `GET /salud`
- **THEN** la API responde `200`
