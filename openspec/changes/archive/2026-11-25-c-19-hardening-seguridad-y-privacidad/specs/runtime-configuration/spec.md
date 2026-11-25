# Spec Delta — runtime-configuration

## ADDED Requirements

### Requirement: Variables de hardening HTTP validadas y documentadas
El catálogo y la validación de entorno SHALL incorporar `CORS_ALLOWED_ORIGINS` (lista separada por comas de orígenes `http(s)://` sin comodín `*`, vacía por defecto), `HTTP_BODY_LIMIT_BYTES` (entero entre `1024` y `1048576`, por defecto `102400`) y `RATE_LIMIT_GLOBAL` (formato `<n>/<s|min|h>`, por defecto `120/min`), todas reflejadas en `.env.example` y en el resumen seguro de configuración.

#### Scenario: Valores por defecto de hardening HTTP
- **WHEN** se carga la configuración del perfil `app` sin definir `CORS_ALLOWED_ORIGINS`, `HTTP_BODY_LIMIT_BYTES` ni `RATE_LIMIT_GLOBAL`
- **THEN** `corsAllowedOrigins` resulta vacía (`[]`), `httpBodyLimitBytes` es `102400` y `rateLimitGlobal` es `120/min`

#### Scenario: Rechazo de comodín o formato inválido en variables de hardening
- **WHEN** `CORS_ALLOWED_ORIGINS` contiene `*` o una URL inválida, o `HTTP_BODY_LIMIT_BYTES` o `RATE_LIMIT_GLOBAL` tienen valores fuera de rango o formato
- **THEN** `loadConfig` falla al arrancar con `ConfigError` nombrando la variable afectada sin imprimir valores sensibles
