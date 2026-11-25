# Spec Delta — hardening-http

## Purpose

Establece los controles transversales de seguridad en la capa HTTP del servicio: cabeceras de endurecimiento, política CORS restrictiva sin comodín, límite explícito de tamaño de cuerpo y límite de tasa global por IP con exclusión del chequeo de salud.

## ADDED Requirements

### Requirement: Cabeceras de seguridad HTTP en toda respuesta
El servicio HTTP SHALL incluir en toda respuesta (exitosa o de error) cabeceras de endurecimiento para API REST: `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: no-referrer`, `content-security-policy` con `default-src 'none'` y `frame-ancestors 'none'`, `cross-origin-resource-policy: same-origin`, `cross-origin-opener-policy: same-origin` y `strict-transport-security`, y MUST NOT exponer `x-powered-by`, `server`, versiones ni rutas internas.

#### Scenario: Cabeceras presentes en chequeo de salud y errores
- **WHEN** un cliente consulta `GET /salud` o provoca una respuesta `404` o `400`
- **THEN** la respuesta incluye las cabeceras de seguridad configuradas y omite `x-powered-by`, `server`, versiones de dependencias y rutas del servidor

#### Scenario: Cabeceras presentes en rutas de la API
- **WHEN** un cliente consume un endpoint bajo `/api/v1/`
- **THEN** la respuesta incluye `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: no-referrer` y `content-security-policy` con `default-src 'none'`

### Requirement: Política CORS restrictiva sin comodín
El servicio HTTP SHALL aplicar una política CORS que deniegue por defecto cualquier origen cruzado cuando la lista de orígenes permitidos está vacía, y que habilite únicamente los orígenes exactos configurados, ocultando las rutas `OPTIONS` de preflight del contrato OpenAPI expuesto.

#### Scenario: Sin orígenes configurados se rechazan solicitudes cruzadas
- **WHEN** `CORS_ALLOWED_ORIGINS` está vacía y llega un pedido con cabecera `Origin: https://sitio-ajeno.example`
- **THEN** la respuesta omite `access-control-allow-origin` y un preflight `OPTIONS` no habilita el origen

#### Scenario: Origen incluido en lista blanca es habilitado
- **WHEN** `CORS_ALLOWED_ORIGINS` incluye `https://app.clinica.example` y llega un pedido con ese `Origin` exacto
- **THEN** la respuesta devuelve `access-control-allow-origin: https://app.clinica.example` sin usar `*`

#### Scenario: Origen no incluido en lista blanca es denegado
- **WHEN** `CORS_ALLOWED_ORIGINS` incluye `https://app.clinica.example` y llega un pedido con `Origin: https://otro.example`
- **THEN** la respuesta no devuelve `access-control-allow-origin`

#### Scenario: Contrato OpenAPI no se altera por rutas OPTIONS
- **WHEN** se genera el documento OpenAPI desde la aplicación en marcha
- **THEN** las rutas `OPTIONS` de CORS no aparecen agregadas en el esquema OpenAPI

### Requirement: Límite explícito de tamaño de cuerpo
El servicio HTTP SHALL limitar el tamaño máximo del cuerpo de las solicitudes entrantes al valor configurado en `HTTP_BODY_LIMIT_BYTES` (por defecto `102400` bytes) y SHALL rechazar cualquier solicitud que lo supere con estado `413` y código `CUERPO_DEMASIADO_GRANDE`.

#### Scenario: Cuerpo dentro del límite permitido
- **WHEN** un cliente envía una carga útil menor o igual al límite configurado
- **THEN** el servicio procesa el pedido normalmente sin rechazar por tamaño

#### Scenario: Cuerpo que excede el límite configurado
- **WHEN** un cliente envía una carga útil superior a `HTTP_BODY_LIMIT_BYTES`
- **THEN** el servicio responde `413` con código `CUERPO_DEMASIADO_GRANDE`

### Requirement: Límite de tasa global por IP con exclusión de salud
El servicio HTTP SHALL aplicar un límite de tasa global por IP configurado en `RATE_LIMIT_GLOBAL` (por defecto `120/min`) con almacenamiento acotado en memoria, devolviendo `429` con código `DEMASIADOS_PEDIDOS` y cabecera `retry-after` al excederse, excluyendo `GET /salud` y preservando los límites más estrictos de `/api/v1/publico/*`.

#### Scenario: Exceso del límite global en ruta autenticada
- **WHEN** una misma IP supera el cupo de `RATE_LIMIT_GLOBAL` dentro de la ventana configurada
- **THEN** el servicio responde `429` con código `DEMASIADOS_PEDIDOS` y encabezado `retry-after`

#### Scenario: Exclusión del chequeo de salud
- **WHEN** una IP agotó el cupo global y consulta `GET /salud`
- **THEN** el servicio responde `200` sin aplicar el límite de tasa

#### Scenario: Coexistencia con el límite público más estricto
- **WHEN** una IP realiza pedidos a `/api/v1/publico/{slug}/prestaciones` con `RATE_LIMIT_PUBLIC` menor que `RATE_LIMIT_GLOBAL`
- **THEN** el límite público se aplica al alcanzar el umbral de `RATE_LIMIT_PUBLIC` antes del umbral global
