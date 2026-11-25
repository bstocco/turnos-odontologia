# Spec Delta — despliegue-contenedor-y-entornos

## Purpose

Define cómo se empaqueta y configura el servicio (API y worker) para el PaaS elegido, con secretos fuera del repositorio y migraciones declaradas como paso previo con el rol propio. Los escenarios que requieren un entorno desplegado (entornos separados con secretos distintos, migración fallida en vivo y puerta de calidad del despliegue) quedan como trabajo posterior (ver `design.md`, "Trabajo posterior").

## ADDED Requirements

### Requirement: Imagen reproducible y mínima
El proyecto SHALL producir una imagen de contenedor construida solo con lo versionado en el repositorio, sin dependencias de desarrollo, sin secretos y ejecutada por un usuario sin privilegios de administrador.

#### Scenario: Construcción desde un checkout limpio
- **WHEN** se construye la imagen desde un clon limpio del repositorio
- **THEN** la construcción termina sin acceso a variables de entorno de producción
- **AND** la imagen contiene el código compilado y las migraciones, y no contiene `node_modules` de desarrollo ni archivos `.env`

#### Scenario: Usuario de ejecución
- **WHEN** el contenedor arranca
- **THEN** el proceso corre con un usuario distinto de `root`

### Requirement: Procesos separados sobre la misma imagen
La misma imagen SHALL poder arrancar como API, como worker de tareas o como ejecución de migraciones, sin recompilar. El worker MUST ejecutarse como proceso independiente de la API.

#### Scenario: Arranque como API
- **WHEN** el contenedor arranca en modo API con la configuración completa
- **THEN** `GET /salud` responde `200` con `{"estado":"ok"}`

#### Scenario: Arranque como worker
- **WHEN** el contenedor arranca en modo worker con la configuración completa
- **THEN** el worker de notificaciones y el job de recordatorios quedan activos sin abrir un puerto HTTP público

#### Scenario: Configuración incompleta
- **WHEN** un proceso arranca sin una variable obligatoria
- **THEN** termina con un error que nombra la variable faltante, sin mostrar valores, y no queda escuchando

### Requirement: Migraciones previas con el rol de migraciones
La configuración de despliegue SHALL ejecutar las migraciones con el rol de migraciones (`release_command`) como paso previo, y la API SHALL conectarse con el rol de la aplicación.

#### Scenario: Migración exitosa
- **WHEN** se ejecuta el comando de migraciones con `DATABASE_MIGRATION_URL` sobre una base vacía
- **THEN** se aplican todas las migraciones pendientes

#### Scenario: Configuración declarada
- **WHEN** se revisan `fly.pruebas.toml` y `fly.produccion.toml`
- **THEN** ambos declaran como `release_command` el comando de migraciones y `fly config validate` los acepta

#### Scenario: Rol de la aplicación sin privilegios de esquema
- **WHEN** la API se conecta a la base gestionada
- **THEN** usa `DATABASE_URL` con el rol `app`, que no es propietario de las tablas ni tiene `BYPASSRLS`

### Requirement: Secretos solo como variables del PaaS
Los secretos (`DATABASE_URL`, `DATABASE_MIGRATION_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `EMAIL_API_KEY`, `ADMIN_INTERNAL_KEY`) SHALL definirse únicamente como secretos del PaaS o de GitHub Actions. Los archivos versionados del repositorio MUST NOT contener sus valores.

#### Scenario: Revisión del repositorio
- **WHEN** se revisa el contenido versionado
- **THEN** no aparece ningún valor de secreto, salvo valores descartables y claramente falsos de CI
