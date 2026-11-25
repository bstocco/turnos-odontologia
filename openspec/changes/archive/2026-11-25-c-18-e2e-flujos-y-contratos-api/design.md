# Design

## Context

Relevamiento del estado en `main` (rama `change/C-18-e2e-flujos-y-contratos-api`):

- **App**: `buildApp(config, opciones)` en `src/interfaces/http/app.ts` registra el manejo de errores, `GET /salud` y carga cada carpeta de `src/interfaces/http/modules/` con prefijo `/api/v1` (`registrarModulos`). Módulos presentes: `auth`, `clinica`, `feriados`, `interno`, `pacientes`, `prestaciones`, `profesionales`, `publico-disponibilidad`, `sillones`, `usuarios`.
- **Esquemas**: TypeBox 1.x (`typebox`) en `esquemas.ts` de cada módulo; C-08, C-10 y C-13 declaran `params`, `querystring`, `body` y `response`. `auth`, `usuarios` e `interno` declaran solo `body` (sin respuesta).
- **RBAC**: se verifica dentro de cada handler (`exigirRol(ctx, LECTURA|ESCRITURA|...)` o `requireRole`), no en la configuración de la ruta. Por eso la matriz no se puede *leer* de las rutas: se declara y se ejecuta.
- **`@fastify/swagger` 9.9.5** está instalada (C-01) pero **no registrada**. Como `buildApp` espera la carga de los módulos, cualquier `onRoute` debe registrarse antes, dentro de `buildApp`.
- **Pruebas**: proyectos Vitest `unit`, `integration` (con `globalSetup` que reinicia el esquema, `fileParallelism: false`) y `api` (sin base). Cada carpeta de `test/integration/*` tiene su `soporte.ts` con helpers casi iguales (`prepararBase…`, `insertarProfesional`, `insertarUsuario`, `autorizacion` con secreto propio). `test/support/` ofrece `appDePrueba`, `capturarLogs`, `configDeBaseDePrueba`, `asegurarBaseDePrueba`, `reiniciarEsquema`, `consultarComoMigra`, `CLINICA_A/B`.
- **Base**: roles `migra` (propietario) y `app` (sin `BYPASSRLS`), ambos `NOCREATEDB` (`docker/postgres/init/01-roles.sql`); bases `turnos` y `turnos_test`.
- **CI** (`.github/workflows/ci.yml`): job `pruebas` con `postgres:17`, corre `test:unit`, `test:integration`, `test:api` y la prueba de humo del build. `actions/checkout` con profundidad por defecto (1).
- **Límites de tasa**: `auth` usa contadores en memoria a nivel de módulo (5/min por IP y por email); `publico-disponibilidad` usa `@fastify/rate-limit` por IP (`RATE_LIMIT_PUBLIC`, 30/min por defecto).

## Goals / Non-Goals

**Goals:**
- Un proyecto `e2e` aislado, reproducible en local y en CI con un único comando, sobre PostgreSQL real.
- Flujos de `07` encadenados por HTTP sobre la app real, con login real.
- Contrato OpenAPI derivado de la app, versionado y con detección de cambios rompientes contra `main`.
- Matriz de permisos completa por construcción (falla ante endpoint nuevo sin fila).
- Ejemplos de uso para el equipo, sin dependencias nuevas, validados contra el contrato.
- Entrega en dos fases sobre la misma rama sin archivar hasta la Fase 2.

**Non-Goals:**
- Corregir defectos de otros changes (se reportan; ver "Defectos fuera de zona").
- Interfaz de documentación (Swagger UI) ni ruta pública del contrato: no se expone nada nuevo en la API.
- Pruebas de carga o rendimiento.
- Reemplazar las pruebas `integration` existentes ni migrarlas a los helpers nuevos (solo se reutilizan).

## Decisions

### D1. Proyecto Vitest `e2e` separado, después de `integration`

Proyecto `e2e` en `vitest.config.ts`: `include: ['test/e2e/**/*.test.ts']`, `globalSetup: ['test/e2e/soporte/global-setup.ts']`, `fileParallelism: false`, `testTimeout: 30_000`, `hookTimeout: 60_000` y `sequence.groupOrder: 1` (los demás proyectos quedan en el grupo 0 por defecto). Así `npm test` corre `integration` y `e2e` en orden y nunca en paralelo sobre `turnos_test`.

- *Alternativa descartada*: base propia `turnos_e2e_test`. Exige tocar `01-roles.sql` (el rol `migra` no tiene `CREATEDB`), recrear volúmenes locales y el job de CI. Queda como pregunta abierta no bloqueante (Q4) por si la suite crece.
- *Alternativa descartada*: meter los e2e en `integration`. Mezcla propósitos y comparte el `globalSetup`, que solo reinicia el esquema sin migrar.

### D2. Ciclo de vida de la base: una vez por ejecución, una clínica por flujo

`global-setup.ts` del proyecto e2e: `configDeBaseDePrueba()` → `asegurarBaseDePrueba()` (host permitido y nombre `_test`) → `reiniciarEsquema(urlMigra)` → `aplicarMigraciones` con las migraciones reales de `migrations/` como `migra`. No hay reinicio por archivo: cada flujo crea **su propia clínica** con `slug` único (`e2e-<flujo>-<uuid corto>`), lo que da aislamiento sin depender del orden y además ejercita RLS con varias clínicas vivas a la vez.

El proceso de pruebas fija en `process.env` (en un `setupFiles` del proyecto o en el soporte) valores **descartables** para `DATABASE_URL` (= `TEST_DATABASE_URL`, rol `app`), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` y `ADMIN_INTERNAL_KEY`, generados al azar por ejecución (`randomBytes`), nunca leídos de un secreto real. El pool se cierra en `afterAll`.

### D3. Soporte e2e: reutilizar, no duplicar

`test/e2e/soporte/`:
- `entorno.ts`: arma la app con `appDePrueba()` de `test/support` (logs capturados) y `app.ready()`; expone `inject` y los logs.
- `clinica.ts`: `crearClinicaSintetica()` usando la ruta real `POST /api/v1/interno/clinicas` con la clave descartable; y `crearUsuarioSintetico(clinicaId, rol, { profesionalId })` que inserta el usuario como `app` con `withTenant` y un hash real de `hashContrasena` sobre una contraseña sintética conocida (el alta interna no devuelve la contraseña temporal; ver defecto F2).
- `sesion.ts`: `iniciarSesion(slug, email, password)` por `POST /api/v1/auth/login` real; cada login usa un `remoteAddress` distinto en `inject` para no agotar el límite por IP de 5/min (contador de módulo compartido en el proceso). Las sesiones por rol se obtienen una vez por archivo y se reutilizan.
- `datos-sinteticos.ts`: generadores deterministas (semilla) con `@faker-js/faker` ya instalado: emails en `@ejemplo.invalid`, DNI en un rango ficticio, teléfonos ficticios.
- `privacidad.ts`: `afirmarSinDatosPersonales(logs, valores)` que verifica que ningún valor sintético sensible aparezca en los logs capturados (reutiliza `capturarLogs`).

Se importa de `test/support/*` y de `src/` (migraciones, `withTenant`, `hashContrasena`). No se importa de `test/integration/*/soporte.ts` para no acoplarse a soportes de otros changes.

### D4. Contrato: `@fastify/swagger` registrado en `buildApp` (fuera de zona)

Cambio mínimo en `src/interfaces/http/app.ts`: registrar `@fastify/swagger` (modo `openapi`, `info.title`, `info.version` fijo `0.0.0` como marcador) **antes** de `registrarModulos`. No se registra UI ni ruta: el documento solo se obtiene con `app.swagger()` en proceso. `GET /salud` queda incluido. Las rutas HEAD automáticas se excluyen.

- *Alternativa*: opción `OpcionesDeApp.antesDeLosModulos?: (app) => Promise<void>` para que solo las pruebas registren swagger. Menos alcance en producción, pero agrega una costura de prueba en `src`. Se deja como variante si el Líder prefiere no registrar swagger en producción (Q1).
- *Alternativa descartada*: reconstruir la app en la prueba llamando a `registrarModulos` sobre otro Fastify: el contrato dejaría de derivar de la app real.

### D5. Normalización, versión y registro de cambios

`test/e2e/contrato/generar.ts`: toma `app.swagger()`, ordena claves recursivamente, quita campos variables y fija `info.version` con la **última versión** declarada en `docs/api/CHANGELOG.md` (encabezados `## [X.Y.Z] - AAAA-MM-DD`). La versión del contrato es independiente de la de `package.json`. Primera versión: `1.0.0`.

Pruebas en `test/e2e/contrato/`:
1. **Determinismo**: dos generaciones idénticas.
2. **Al día**: generado == `docs/api/openapi.json`. Si difiere, falla con la lista de operaciones cambiadas y la instrucción para regenerar: `ACTUALIZAR_CONTRATO=1 npm run test:e2e -- contrato` (la variable hace que la prueba escriba el snapshot en vez de compararlo; sin scripts nuevos).
3. **Rompientes vs. `main`**: lee la base con `git show ${CONTRATO_BASE_REF:-origin/main}:docs/api/openapi.json` (`execFile`, sin shell). Un comparador puro (`comparar.ts`, probado con casos unitarios dentro del mismo proyecto) clasifica diferencias:
   - Rompientes: operación quitada; código de respuesta quitado; propiedad de respuesta quitada; campo de entrada que pasa a obligatorio o nuevo obligatorio; tipo cambiado; enumerado achicado; parámetro de ruta o consulta nuevo obligatorio.
   - No rompientes: operación nueva, propiedad opcional nueva, respuesta nueva, descripción.
   Si hay rompientes, exige `mayor(actual) > mayor(base)` y que la sección de esa versión en el registro contenga `**Rompiente**`. Si `main` no tiene el archivo → pasa. Si no se puede leer la base: con `CI=true` falla; en local se omite con aviso.
4. **Respuestas declaradas**: toda operación tiene esquema de respuesta 2xx, salvo las listadas en `docs/api/excepciones-de-respuesta.json` (`"METODO /ruta": "motivo y change responsable"`). Lista inicial: `auth/*`, `usuarios/*`, `POST /interno/clinicas`. Una entrada sobrante (ya tiene esquema) también falla, para que la lista solo se achique.

### D6. Matriz de permisos guiada por las rutas registradas

`test/e2e/permisos/matriz.ts` es una tabla tipada `Record<'METODO /api/v1/ruta', FilaDeMatriz>`:

```ts
type Esperado = 'permitido' | 'permitido_con_alcance' | 'prohibido';
interface FilaDeMatriz {
  readonly tipo: 'personal' | 'publica' | 'interna' | 'salud';
  readonly roles?: Record<'administrador' | 'recepcionista' | 'odontologo', Esperado>;
  readonly conId?: boolean;                // activa la verificación de otra clínica → 404
  readonly pedido: (f: Fixture) => PedidoDePrueba; // params, query y body válidos mínimos
  readonly defecto?: { readonly motivo: string; readonly change: string }; // D6.3
}
```

1. **Completitud**: el conjunto de operaciones sale de `app.swagger().paths` (la misma fuente que el contrato, sin HEAD/OPTIONS). Debe ser igual al de las claves de la matriz; la diferencia en cualquier sentido falla nombrando las operaciones.
2. **Ejecución**: un `describe.each` por fila y actor sobre una clínica de matriz con fixtures creados por la API (un recurso de cada tipo). Reglas: personal sin token → `401`; `prohibido` → `403` + `ACCESO_PROHIBIDO`; `permitido` → ni `401` ni `403` (la forma la verifican los flujos y el contrato); `permitido_con_alcance` → además una afirmación de alcance específica de la fila (p. ej. odontólogo sobre paciente sin turnos con él); pública → misma respuesta con y sin token; interna → `401` sin clave o con clave errónea. Las operaciones que eliminan o modifican usan un recurso nuevo por caso para no depender del orden.
3. **Otra clínica**: si `conId`, el administrador de la clínica B pide el recurso de A → `404`, nunca `403`.
4. **Defectos**: una celda que hoy difiere de `03 §RBAC` por un defecto reportado se marca con `defecto` y se ejecuta como `it.fails` con el motivo en el nombre, de modo que el día que se corrija la prueba avise (deja de fallar) y haya que quitar la marca. Nunca se cambia el valor esperado para que pase.

Los valores salen de `03 §RBAC`; las diferencias de grano fino que la KB marca "propios" (horarios, pacientes, agenda del odontólogo) son `permitido_con_alcance`.

### D7. Ejemplos de uso: archivos `.http` + índice Markdown

`docs/api/ejemplos/<modulo>.http` (formato de REST Client de VS Code y del HTTP Client de JetBrains: texto plano, sin dependencias) con `@baseUrl`, `@token`, `@slug` y `@claveInterna` como variables; `docs/api/README.md` explica cómo usarlos y da el equivalente `curl` de los principales. Datos solo sintéticos.

Prueba `test/e2e/contrato/ejemplos.test.ts`: parsea cada línea de pedido (`METODO {{baseUrl}}/api/v1/...`), normaliza los segmentos con valor a `{param}` y verifica que exista en el contrato; además falla si encuentra un literal con forma de JWT, `Bearer ` seguido de algo que no sea `{{...}}`, o un campo `password`/`clave` con valor literal distinto de un marcador sintético documentado.

### D8. Mapa de flujos por fase

| Flujo de `07` | Fase | Cobertura |
|---|---|---|
| 1. Autenticación del personal | **Fase 1** | Login, uso del token en un recurso de su clínica, refresh rotativo con reuso rechazado, logout, `401` genérico, desactivado `401`, `429`. El paso 5 (auditar el login) queda como defecto F3. |
| Puesta en marcha (complementario, C-17 + C-08 + C-10) | **Fase 1** | Alta interna → clínica → profesional + horarios → sillón → prestación → feriado/plantilla → paciente (alta, búsqueda, modificación) → `404` cruzado. |
| 3. Reserva pública | **Parcial** | Fase 1: pasos 1 (prestaciones, profesionales, disponibilidad coherente con la configuración y feriados, `404` de slug, `429`). Fase 2: pasos 2 a 6 (código por email, `POST /publico/{slug}/reservas`, sillón automático, estado inicial, enlaces), `409` por hueco ocupado o sin sillón, `422` de código. |
| 2. Agendar desde recepción | Fase 2 (C-12) | `201`, `409` profesional/sillón, `422` fuera de horario/feriado/bloqueo. |
| 4. Confirmación/cancelación por token | Fase 2 (C-15) | Confirmar, cancelar ≥24 h, `409` <24 h, `410`/`404` token usado o vencido. |
| 5. Reprogramación | Fase 2 (C-12) | Éxito y rollback con original intacto. |
| 6. Bloqueo de franja | Fase 2 (C-12) | Bloqueo, `409` con turnos activos, disponibilidad pública sin la franja. |
| 7. Recordatorio por email | Fase 2 (C-14) | Con reloj y email simulados: encolado, `enviada`/`fallida`. |
| 8. WhatsApp manual | Fase 2 (C-12 + C-04) | Enlace `wa.me` normalizado, teléfono inválido. |
| 9. Ausentismo | Fase 2 (C-12/C-16) | `ausente` con auditoría, `409` futuro u otro estado. |
| 10. Exportación | Fase 2 (C-16) | Exportación auditada, descarga, `403` no admin. |
| Concurrencia personal vs. público | Fase 2 (C-12 + C-15) | `Promise.all` de ambos pedidos sobre el mismo hueco: exactamente un éxito y un `409`; un solo turno activo en la base. |

### D9. Archivos fuera de zona (cambios mínimos, a aprobar por el Líder)

| Archivo | Cambio | Motivo |
|---|---|---|
| `src/interfaces/http/app.ts` | Registrar `@fastify/swagger` antes de los módulos (sin UI ni ruta) | D4: contrato y matriz derivados de la app real |
| `vitest.config.ts` | Agregar el proyecto `e2e` (D1); no tocar los demás | Aislamiento y orden |
| `package.json` | Solo el script `"test:e2e": "vitest run --project e2e"` | Comando único local = CI. Sin dependencias |
| `.github/workflows/ci.yml` | En el job `pruebas`: `git fetch --depth=1 origin main` y `- run: npm run test:e2e` después de `test:api` | Base del contrato y ejecución en CI |

Ninguna dependencia nueva. El parser de `.http` y el comparador de contratos son código propio pequeño.

### D10. Defectos fuera de zona detectados (se reportan, no se corrigen)

- **F1 — `usuarios` sin autenticación**: `src/interfaces/http/modules/usuarios/index.ts` no llama a `pluginDeAutenticacion` (el de `auth` se registra encapsulado con `app.register`). `request.userContext` nunca se completa y `contextoDePedido` responde `401` a todo, incluso al administrador. No hay pruebas que lo cubran. Responsable: C-06 (Agente A). Además `:id` no tiene esquema de parámetros.
- **F2 — contraseña temporal descartada**: `POST /interno/clinicas` responde `{ clinicaId, slug }` y descarta `passwordTemporal` que devuelve `aprovisionarClinica`; el primer administrador no puede iniciar sesión por la API. Responsable: C-17 (Agente A) / Líder (decisión de cómo se entrega).
- **F3 — login sin auditar**: el Flujo 1 paso 5 pide auditar el inicio de sesión; `auth` no escribe auditoría. Responsable: C-06.
- **F4 — respuestas sin esquema** en `auth`, `usuarios` e `interno` (riesgo de filtrar campos y contrato incompleto). Responsables: C-06 y C-17.

## Risks / Trade-offs

- **[Riesgo] Registrar swagger en producción** agrega un hook `onRoute` y memoria del documento → impacto despreciable y sin ruta expuesta; si no se acepta, variante de D4 (Q1).
- **[Riesgo] `git show origin/main` en CI** depende de la obtención de `main` → paso explícito en CI y falla ruidosa si falta (no se omite en CI).
- **[Riesgo] Límite de tasa de login compartido en el proceso** → `remoteAddress` distinto por login y sesiones reutilizadas; la prueba de `429` usa un email y una IP propios.
- **[Riesgo] Defectos F1 y F2 bloquean flujos reales** (usuarios por API, login del primer admin) → la matriz los marca con `it.fails` (D6.4) y la puesta en marcha crea el admin por fixture; se reportan al Líder.
- **[Trade-off] Misma base que `integration`** → orden forzado por `groupOrder` y duración total algo mayor; a cambio, cero cambios en roles y volúmenes.
- **[Trade-off] Matriz declarada a mano** (el RBAC vive en los handlers) → la completitud automática impide olvidos; el valor de cada celda lo revisa el PR contra `03 §RBAC`.
- **[Riesgo] Fase 2 depende de cuatro changes** → el contrato y la matriz fallan solos cuando lleguen sus rutas (completitud), lo que obliga a completarlos; el change no se archiva hasta entonces.

## Open Questions

- **Q1 (RESUELTA)**: la Líder aprobó (PR #18) registrar `@fastify/swagger` en `buildApp` (D4), sin interfaz ni ruta expuesta y sin pisar ninguna ruta existente. Aplicado en `src/interfaces/http/app.ts` (cambio mínimo y aditivo).
- **Q2 (RESUELTA)**: la Líder aprobó (PR #18) que C-18 edite `vitest.config.ts` (proyecto `e2e`), `package.json` (solo el script `test:e2e`, sin dependencias) y `.github/workflows/ci.yml`, con cambios mínimos y aditivos.
- **Q3 (no bloqueante, recomendación adoptada)**: la contraseña temporal del primer administrador (F2) se resuelve fuera de C-18; mientras tanto el e2e crea los usuarios por fixture y deja `it.fails` con F2.
- **Q4 (no bloqueante, recomendación adoptada)**: se mantiene la base compartida `turnos_test`; el orden se fuerza con `sequence.groupOrder` y el esquema se reprepara si `integration` lo dejó en otro estado. Base propia solo si la suite crece.
- **Q5 (no bloqueante, recomendación adoptada)**: versión inicial del contrato `1.0.0`.

## Defectos reportados (D10)

Verificados ejecutando las pruebas (`it.fails` con el motivo en el nombre): **F1** (usuarios sin autenticación: 14 celdas de la matriz), **F2** (alta interna descarta `passwordTemporal`), **F3** (login sin auditar), **F4** (respuestas sin esquema: `docs/api/excepciones-de-respuesta.json`) y **F5** nuevo: `POST /auth/login` crea el token de refresco pero no lo entrega (el refresco usa un token emitido por fixture). Además `POST /auth/refresh` devuelve solo el nuevo token de refresco, sin token de acceso.
