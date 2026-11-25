# Spec Delta — despliegue-contenedor-y-entornos

## Purpose

Define cómo se empaqueta, configura y despliega el servicio (API y worker) en el PaaS elegido, con entornos de pruebas y producción separados, secretos fuera del repositorio y migraciones aplicadas con el rol propio antes de que la nueva versión reciba tráfico.

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

### Requirement: Migraciones antes de la nueva versión
El despliegue SHALL aplicar las migraciones pendientes con el rol de migraciones antes de que la nueva versión de la API reciba tráfico. Si una migración falla, el despliegue MUST detenerse y la versión anterior SHALL seguir sirviendo.

#### Scenario: Migración exitosa
- **WHEN** se despliega una versión con migraciones pendientes
- **THEN** las migraciones se aplican con `DATABASE_MIGRATION_URL` y luego la nueva versión pasa a recibir tráfico

#### Scenario: Migración fallida
- **WHEN** una migración falla durante el despliegue
- **THEN** el despliegue se cancela, la versión anterior sigue activa y el error indica el archivo de migración

#### Scenario: Rol de la aplicación sin privilegios de esquema
- **WHEN** la API se ejecuta en el PaaS
- **THEN** usa `DATABASE_URL` con el rol `app`, que no es propietario de las tablas ni tiene `BYPASSRLS`

### Requirement: Entornos separados
Los entornos `pruebas` y `produccion` SHALL tener bases de datos, secretos y claves de servicio distintos. Ninguna credencial de un entorno MUST ser válida en el otro.

#### Scenario: Secretos distintos
- **WHEN** se comparan los secretos de `pruebas` y de `produccion`
- **THEN** ninguno de los valores sensibles coincide

#### Scenario: Datos reales fuera de producción
- **WHEN** se carga cualquier dato en el entorno `pruebas`
- **THEN** son datos sintéticos, y los seeds siguen negándose a ejecutarse contra producción

### Requirement: Secretos solo como variables del PaaS
Los secretos (`DATABASE_URL`, `DATABASE_MIGRATION_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `EMAIL_API_KEY`, `ADMIN_INTERNAL_KEY`) SHALL definirse únicamente como secretos del PaaS o de GitHub Actions. Los archivos del repositorio y los logs de construcción y despliegue MUST NOT contener sus valores.

#### Scenario: Revisión del repositorio
- **WHEN** se revisa el contenido versionado y los logs de un despliegue
- **THEN** no aparece ningún valor de secreto

#### Scenario: Despliegue sin pasar las puertas de calidad
- **WHEN** el lint, el formato, los tipos o las pruebas fallan sobre el commit a desplegar
- **THEN** el despliegue no se ejecuta
