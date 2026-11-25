# verificacion-seguridad-y-privacidad Specification

## Purpose

Define la verificación automatizada integral de aislamiento cross-tenant, privacidad de logs, postura de seguridad en PostgreSQL, guardas anti-producción en seeds y el checklist documentado de cumplimiento de la Ley 25.326 antes del lanzamiento.

## Requirements

### Requirement: Prueba cross-tenant completa derivada del contrato registrado
La suite de seguridad SHALL verificar el aislamiento entre clínica A y clínica B sobre cada operación registrada en la aplicación (derivada automáticamente del contrato OpenAPI): respuestas `404` ante recursos ajenos por ID, cero filtración en colecciones, rechazo de referencias cruzadas en cuerpo o consulta, aislamiento en rutas públicas y de autenticación, y seguimiento explícito de defectos previos conocidos.

#### Scenario: Completitud de cobertura cross-tenant
- **WHEN** la aplicación registra sus rutas reales y se compara la lista con la suite cross-tenant
- **THEN** cada operación registrada posee un caso declarado y cualquier endpoint nuevo sin cobertura hace fallar la verificación

#### Scenario: Recursos por ID y exportaciones de otra clínica no filtran datos
- **WHEN** un usuario autenticado de la clínica B solicita, modifica o elimina por identificador un recurso perteneciente a la clínica A, o invoca `GET /api/v1/exportaciones/{id}` con un identificador emitido para la clínica A
- **THEN** todo recurso persistido por ID responde `404` sin revelar su existencia ni sus datos, y la exportación responde `404` o `200` estrictamente acotada a la clínica B sin incluir ningún registro de la clínica A

#### Scenario: Colecciones e inyección de referencias cruzadas no filtran datos
- **WHEN** la clínica B consulta colecciones o intenta crear/asociar un recurso enviando en el cuerpo o consulta un identificador perteneciente a la clínica A
- **THEN** las colecciones devuelven cero registros de la clínica A y las escrituras con referencias ajenas son rechazadas con `404` o `422` sin persistir vínculos cruzados

### Requirement: Verificación automatizada de ausencia de PII y secretos en logs HTTP
La suite de seguridad SHALL ejecutar flujos reales de la API capturando toda la salida del logger y SHALL comprobar cero apariciones de datos personales sintéticos de pacientes (DNI, teléfono, email, nombre, apellido, obra social) y cero apariciones de secretos de configuración, contraseñas, tokens o códigos OTP.

#### Scenario: Flujos completos sin filtración de PII ni secretos en logs
- **WHEN** se ejecutan flujos de login, alta y consulta de pacientes, solicitud OTP, reserva pública, exportación y errores controlados/inesperados
- **THEN** ningún registro emitido por el logger ni por el resumen de configuración contiene datos personales en claro, contraseñas, JWT, claves internas, códigos OTP ni URLs de base con credenciales

### Requirement: Verificación automatizada de postura de PostgreSQL y RLS
El sistema SHALL proveer una verificación automatizada contra PostgreSQL real que confirme: el rol `app` no es superusuario ni tiene `BYPASSRLS`, `CREATEDB` ni `CREATEROLE`; el rol `app` no es propietario de ninguna tabla en `public`; toda tabla con `clinica_id` tiene RLS habilitada, forzada y con política; `auditoria` no otorga `UPDATE`/`DELETE`/`TRUNCATE` a `app`; y toda función `SECURITY DEFINER` fija `search_path` y revoca `EXECUTE` de `PUBLIC`.

#### Scenario: Catálogo PostgreSQL cumple postura de mínimo privilegio y RLS
- **WHEN** se ejecuta la verificación de postura sobre la base migrada con el esquema actual
- **THEN** todas las comprobaciones de rol, propiedad de tablas, RLS forzada en tablas multi-tenant, privilegios append-only de `auditoria` y funciones `SECURITY DEFINER` pasan sin hallazgos

#### Scenario: Detección de falla ante tabla multi-tenant sin RLS forzada
- **WHEN** existe en el esquema una tabla con columna `clinica_id` sin `FORCE ROW LEVEL SECURITY` o sin política configurada
- **THEN** la verificación reporta explícitamente la tabla incumplidora y falla

### Requirement: Verificación automatizada de ALLOW_SEED=false y guardas en seeds
La suite de seguridad SHALL verificar que `.env.example` y la configuración por defecto fijan `ALLOW_SEED=false`, y que todos los puntos de entrada de seeds (`seeds/run.ts`, `seeds/demo-clinica.ts`, `seeds/primera-clinica.ts`) ejecutan `assertNoProduction()` y rechazan ejecutarse en `production`, sin `ALLOW_SEED=true` o contra hosts no permitidos sin abrir conexión a la base.

#### Scenario: Seeds deshabilitados por defecto y bloqueados en producción
- **WHEN** se evalúa la configuración por defecto y se invocan las guardas con `NODE_ENV=production` o con host externo
- **THEN** `ALLOW_SEED` es `false` por defecto y toda ejecución de seed es rechazada antes de conectarse a PostgreSQL

### Requirement: Checklist formal de cumplimiento Ley 25.326
El repositorio SHALL incluir un checklist versionado en `docs/seguridad/checklist-ley-25326.md` con estado, responsables, evidencia técnica y criterios de cierre previo a producción, cubriendo explícitamente el registro de base ante la AAIP (`PO-14`), la transferencia internacional de datos hacia la región `sa-east-1` (`PO-03`), la política de retención (`PO-10`), el aislamiento multi-tenant (`R-03`) y los bloqueantes de lanzamiento detectados.

#### Scenario: Trazabilidad completa de obligaciones Ley 25.326
- **WHEN** se inspecciona `docs/seguridad/checklist-ley-25326.md`
- **THEN** cada ítem técnico y legal (`PO-03`, `PO-14`, `PO-10`, `R-03`, `RN-MT-*`, `RN-AU-*`, `RN-DA-*`) figura con su estado verificable, responsable asignado y referencia al control técnico o paso legal requerido antes de producción
