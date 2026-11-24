# Proposal

## Why

El paciente todavía no tiene forma de ver qué prestaciones ofrece una clínica ni qué horarios están libres sin llamar o escribir por WhatsApp (US-030, Flujo 3 paso 1). C-02 dejó el cálculo puro de huecos (`calcularDisponibilidad`), C-05 los recursos y el calendario, y C-09 la lectura de turnos activos (`AgendaReader` completo), pero ninguna ruta pública los expone. C-13 es el primer endpoint **sin autenticación** del sistema y está en el camino crítico: C-15 (reserva pública) consume su contrato para reservar exactamente lo que se ofreció. Gobernanza **ALTO**: el diseño se aprueba antes del código.

## What Changes

- **Rutas públicas sin sesión** (módulo `src/interfaces/http/modules/publico-disponibilidad/`, prefijo `/api/v1`):
  - `GET /api/v1/publico/{slug}/prestaciones`: prestaciones **activas** con `id`, `nombre` y `duracionMinutos`.
  - `GET /api/v1/publico/{slug}/profesionales`: profesionales **activos** con `id`, `nombre` y `apellido` (**ampliación del scope de `CHANGES.md`**, sujeta a aprobación del Líder: sin ella el paciente no puede elegir profesional; ver `design.md` D4 y Q2).
  - `GET /api/v1/publico/{slug}/disponibilidad?profesionalId&prestacionId&desde&hasta`: huecos libres `[inicio, fin)` en instantes UTC, calculados con `calcularDisponibilidad` de C-02 sobre los readers de C-05 y C-09 (franjas, feriados, bloqueos, turnos activos del profesional y de los sillones, buffer). Rango de fechas locales `[desde, hasta)` acotado (máximo 14 días, horizonte de 90 días).
- **Respuestas por lista blanca**: nunca datos de pacientes, ni ids o nombres de sillones, ni cantidad de sillones libres, ni matrícula, ni motivos de bloqueos. El esquema de respuesta de Fastify descarta cualquier campo no declarado (defensa en profundidad).
- **`404` genérico y uniforme** (`RECURSO_NO_ENCONTRADO`): slug inexistente, mal formado o de una clínica inactiva, y profesional o prestación inexistente, inactivo, mal formado o de otra clínica, responden con el mismo estado, código y mensaje (regla 12).
- **Límite de tasa por IP** con `@fastify/rate-limit` (ya instalado; sin dependencias nuevas), configurado con `RATE_LIMIT_PUBLIC` (por defecto `30/min`), aplicado en `onRequest` **antes** de resolver el slug, con `429 DEMASIADOS_PEDIDOS` del contrato de errores uniforme y memoria acotada (LRU).
- **Resolución de la clínica por slug** con la función `SECURITY DEFINER` `resolver_clinica_por_slug`, que el spec `db-tenant-rls` exige pero **no existe en `main`** (hallazgo: `C03_001` no la crea). Se propone crearla en la migración nueva `migrations/C13_001_resolver_clinica_por_slug.sql` (devuelve solo el `id`, solo de clínicas activas, `search_path` fijo, `EXECUTE` solo para `app`). Requiere aprobación del Líder (Q1, **bloquea el apply**).
- **Contexto de tenant**: tras resolver el slug, toda lectura corre dentro de `withTenant(clinicaId)` (RLS) en una transacción `READ ONLY`. Sin `RequestContext` ni actor: no hay caso de uso que audite ni que dependa del rol.
- **Caso de uso en `src/application/disponibilidad/**`** (sin I/O, puertos propios, reloj inyectado) que C-15 reutiliza como **contrato congelado**: `consultarDisponibilidad` y `huecoOfrecido` (verifica que un inicio concreto sigue ofrecido y devuelve sus sillones asignables para la asignación automática de RN-RE-03).
- **Sin auditoría de lecturas públicas** (RN-AU-02/03 no aplican: no hay mutación ni ficha de paciente) y **sin datos personales en logs**.
- **Pruebas** (Strict TDD): unitarias del caso de uso con dobles; integración con PostgreSQL real e `inject` para coincidencia con las reglas de agenda (incluida una propiedad "todo hueco ofrecido es reservable"), aislamiento entre clínicas, ausencia de datos ajenos, `404` indistinguibles, límite de tasa y la función `resolver_clinica_por_slug`.

## Capabilities

### New Capabilities
- `api-publica-disponibilidad`: consulta pública, sin cuenta, del catálogo (prestaciones y profesionales activos) y de los horarios libres de una clínica identificada por slug, con respuestas por lista blanca, `404` uniforme y el contrato de aplicación que reutiliza la reserva pública.
- `limite-tasa-publica`: límite de tasa por IP de las rutas públicas, configurable, previo a cualquier acceso a la base y con respuesta `429` uniforme.

### Modified Capabilities
- `db-tenant-rls`: el requisito "Función resolver_clinica_por_slug" se precisa: solo clínicas activas, devuelve únicamente el identificador, `search_path` fijo, `EXECUTE` revocado a `PUBLIC` y otorgado solo a `app`, y prueba de integración que lo verifica.

## Impact

- **Zona de C-13**: `src/interfaces/http/modules/publico-disponibilidad/**`, `src/application/disponibilidad/**`, `test/unit/disponibilidad/**`, `test/integration/disponibilidad/**`.
- **Fuera de la zona declarada (archivos nuevos, sin editar nada existente; requieren visto bueno del Líder)**:
  - `migrations/C13_001_resolver_clinica_por_slug.sql` (Q1).
  - `src/infrastructure/db/repositories/clinica-publica/index.ts`: adaptador que invoca la función (mismo criterio que D4 de C-08).
- **Reutiliza sin modificar**: `calcularDisponibilidad`, `validarTurnoPrevio`, `crearFechaLocal`, `instanteALocal`, `sumarDias` (C-02); `crearRecursosReader`, `crearPrestacionRepository`, `crearProfesionalRepository` (C-05); `crearAgendaReader` (C-09); `withTenant` y `poolDeLaAplicacion` (C-03); `registrarManejoDeErrores` y el registrador de módulos (C-01); `rateLimitPublic` de la configuración (C-01).
- **Contratos congelados**: sin cambios en `RequestContext`, en los puertos de C-02 ni en `TurnoEventPublisher`. **Nuevo contrato congelado** al fusionar: la API pública de `src/application/disponibilidad/index.ts` (consumida por C-15) y `resolverClinicaPorSlug`.
- **Sin dependencias npm nuevas** (`@fastify/rate-limit@^11` ya está en `package.json` y no se usaba).
- **Dependencia de plataforma (C-20/C-19)**: detrás del proxy del PaaS, `request.ip` es la IP del proxy mientras `trustProxy` no se configure en `src/interfaces/http/app.ts` (zona de C-01); el límite por IP quedaría compartido por todos los clientes. Se reporta (Q4).
- **Fuera de alcance**: reserva, código por email y tope de reservas activas (C-15, DD-12, PO-09); "cualquier profesional" en una sola consulta (Q3); tipos de sillón por prestación (PO-11); sobreturnos (PO-07); paginación; caché compartida.
