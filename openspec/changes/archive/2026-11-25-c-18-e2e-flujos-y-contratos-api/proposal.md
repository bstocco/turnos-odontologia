# Proposal

## Why

Cada change probó su porción de la API por separado (pruebas `api` sin base e `integration` por módulo con soportes duplicados), pero nadie verifica todavía los flujos de extremo a extremo de `07_flujos_principales.md` sobre la aplicación completa, ni existe un contrato de la API que avise cuando un cambio rompe a los clientes, ni una matriz de permisos que cubra **todos** los endpoints contra los roles de `03 §RBAC`. C-18 es la red de seguridad del MVP antes del despliegue (C-20) y está en el camino crítico.

Por decisión del Líder el change se entrega en **dos fases sobre la misma rama**: la Fase 1 arma la base y cubre lo que ya está en `main` (C-06, C-08, C-10, C-13, C-17 y usuarios); la Fase 2 completa turnos y agenda (C-12), notificaciones (C-14), reserva pública con OTP y tokens (C-15), exportación, auditoría y ausentismo (C-16) y la concurrencia entre reserva del personal y reserva pública. El change **no se archiva** hasta terminar la Fase 2.

## What Changes

- **Proyecto de pruebas `e2e`** (`test/e2e/**`): un proyecto de Vitest propio que construye la app real con `buildApp` y todos los módulos, sobre la base PostgreSQL de pruebas con las migraciones reales, roles `app`/`migra` y solo datos sintéticos (Ley 25.326). Reutiliza `test/support` y centraliza los helpers que hoy están duplicados en cada `test/integration/*/soporte.ts`.
- **Flujos de extremo a extremo**: una prueba por flujo de `07`, encadenando pedidos HTTP reales (login real incluido). Fase 1: Flujo 1 completo, Flujo 3 en su parte de consulta, y un flujo de puesta en marcha de clínica (alta interna → configuración → pacientes) que es precondición de los Flujos 2 a 10. Fase 2: el resto.
- **Contrato OpenAPI** (`docs/api/openapi.json`): generado desde las rutas y esquemas reales de la app (vía `@fastify/swagger`, ya presente en las dependencias), normalizado y versionado. CI falla si el contrato generado difiere del versionado, y falla ante un cambio **rompiente** respecto del contrato de `main` que no esté declarado en `docs/api/CHANGELOG.md` con subida de versión mayor.
- **Matriz de permisos automatizada**: una tabla declarativa endpoint × actor (anónimo, administrador, recepcionista, odontólogo, otra clínica, clave de servicio) derivada de `03 §RBAC`. La lista de endpoints se obtiene de las rutas registradas: un endpoint nuevo sin fila en la matriz, o una fila sin endpoint, hacen fallar la prueba.
- **Colección de ejemplos** (`docs/api/ejemplos/*.http` más un índice en Markdown con equivalentes `curl`): sin dependencias nuevas, con datos sintéticos y variables en lugar de secretos; una prueba verifica que cada ejemplo apunte a una operación existente del contrato.
- **Fase 2** (pendiente de C-12, C-14, C-15, C-16): Flujos 2, 4, 5, 6, 7, 8, 9 y 10, el resto del Flujo 3, la prueba de concurrencia personal vs. público sobre el mismo hueco, y la ampliación de la matriz, el contrato y los ejemplos a esos endpoints.
- Fuera de zona (mínimo, a aprobar por el Líder): registrar `@fastify/swagger` en `src/interfaces/http/app.ts`; sumar el proyecto `e2e` a `vitest.config.ts`; el script `test:e2e` en `package.json`; y el paso de e2e más la obtención de `main` en `.github/workflows/ci.yml`.

## Capabilities

### New Capabilities
- `pruebas-e2e-flujos`: verificación de extremo a extremo de los flujos principales sobre la API real y PostgreSQL de pruebas, aislamiento del entorno e2e, datos sintéticos y ausencia de datos personales en las salidas; incluye la prueba de concurrencia entre reserva del personal y pública (Fase 2).
- `contrato-openapi`: documento OpenAPI derivado de la app, versionado en `docs/api/`, verificado en CI, con detección de cambios rompientes y declaración obligatoria en el registro de cambios; incluye la colección de ejemplos de uso validada contra el contrato.
- `matriz-de-permisos-api`: matriz declarativa endpoint × actor según `03 §RBAC`, completa respecto de las rutas registradas y ejecutada contra la API real.

### Modified Capabilities
- `quality-gates`: las verificaciones obligatorias de cada rama suman las pruebas e2e, la verificación del contrato OpenAPI y la matriz de permisos.

## Impact

- **Código nuevo** (zona del change): `test/e2e/**`, `docs/api/**`.
- **Fuera de zona** (cambios mínimos, listados en el diseño): `src/interfaces/http/app.ts` (registro de `@fastify/swagger`, sin UI ni ruta expuesta), `vitest.config.ts` (proyecto `e2e`), `package.json` (solo el script `test:e2e`, sin dependencias), `.github/workflows/ci.yml` (paso `npm run test:e2e` y `git fetch` de `main`).
- **Dependencias**: ninguna nueva. `@fastify/swagger` ya está instalada. Cualquier necesidad adicional queda como pregunta abierta para el Líder.
- **Base de datos**: reutiliza `turnos_test` (el rol `migra` no tiene `CREATEDB`); el esquema se reinicia al iniciar el proyecto e2e, que corre después de `integration`.
- **Defectos fuera de zona detectados** al relevar (se reportan, no se corrigen acá): el módulo `usuarios` no registra `pluginDeAutenticacion`, por lo que todas sus rutas responderían `401`; `POST /interno/clinicas` descarta la contraseña temporal; el login no se audita (Flujo 1, paso 5); varias rutas (`auth`, `usuarios`, `interno`) no declaran esquema de respuesta.
- **Riesgo**: si C-12, C-14, C-15 o C-16 cambian contratos al fusionarse, la Fase 2 actualiza el snapshot y declara los cambios en el registro.
