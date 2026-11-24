# CHANGES — Secuencia de Implementación

> Índice canónico de todos los changes del proyecto **Turnos Odontología**.
> Cada change es atómico: un agente puede implementarlo en una sesión (~4-6 horas).
> **Leer este archivo antes de empezar un item.**

---

## Cómo usar este documento

1. Identificar el item a implementar y verificar que sus dependencias figuran completas en este roadmap.
2. Leer los docs de la knowledge-base indicados en "Leer antes".
3. Acordar el alcance y los criterios de aceptación del item.
4. Implementar, verificar los criterios acordados y registrar la evidencia.
5. Marcar el checkbox `[x]` en este archivo al completar la verificación técnica.

Conservá los IDs de las fichas al editar o reordenar. Si el proyecto usa ClickUp,
este roadmap conserva el alcance y las dependencias. Consultá el responsable y el estado operativo
en ClickUp y el último dato confirmado en `.active-stack/roadmap-state.json`.

> **Gobernanza.** Los changes `CRITICO` (C-03, C-06, C-07, C-15, C-17) no se programan sin una propuesta de diseño aprobada por el líder. Los `ALTO` se proponen y se esperan revisión antes de escribir código. Los `MEDIO` se implementan con checkpoints. Los `BAJO` tienen plena autonomía si las pruebas pasan.
>
> **Equipo.** 4 personas: el **Líder** (fundación y configuración del repositorio) y **3 agentes** que implementan y prueban en ramas separadas: **A** (plataforma, seguridad y turnos), **B** (dominio, gestión y pruebas) y **C** (comunicación, reserva pública y trazabilidad).
>
> **Decisiones firmes que este roadmap asume** (ver `knowledge-base/09_decisiones_y_supuestos.md`): arquitectura hexagonal con Fastify, SQL explícito y Vitest (DD-08); cola sobre PostgreSQL con pg-boss, sin Redis (DD-09); validación del paciente por código de email; recordatorio automático 24 hs antes; asignación automática de sillón en la reserva pública; alta de clínicas por endpoint administrativo interno o seed inicial (PO-04 cerrado); lista de espera fuera del MVP.

---

## Árbol de dependencias

```
C-01 foundation-setup                                  [Líder]
  │
  ├── C-02 dominio-agenda-puro                         [B]
  ├── C-03 db-tenant-rls                               [A]  ← desbloquea datos, auth y auditoría
  └── C-04 utilidades-comunicacion-y-tokens            [C]

C-02 + C-03
  └── C-05 datos-clinica-y-pacientes                   [B]

C-03
  ├── C-06 auth-personal-rbac                          [A]
  ├── C-07 auditoria-append-only                       [C]
  └── C-17 alta-clinicas-interno                       [A]  (+ C-06)

C-03 + C-04
  └── C-11 cola-y-email-base                           [C]

C-02 + C-05 + C-07
  └── C-09 turnos-persistencia-y-casos-de-uso          [A]  ← núcleo del producto
        │
        ├── C-12 api-turnos-y-agenda                   [A]  (+ C-04, C-06)
        ├── C-13 disponibilidad-publica                [B]  (+ C-05)
        │     └── C-15 reserva-publica-otp-y-tokens    [C]  (+ C-04, C-09, C-11)
        ├── C-14 recordatorios-y-notificaciones-turno  [C]  (+ C-11)
        └── C-16 exportacion-auditoria-ausentismo      [A]  (+ C-06, C-07)

C-05 + C-06 + C-07
  ├── C-08 api-configuracion-clinica                   [B]
  └── C-10 api-pacientes                               [B]  (+ C-04, C-09)

C-08 + C-10 + C-12 + C-13 + C-14 + C-15 + C-16
  └── C-18 e2e-flujos-y-contratos-api                  [B]

C-08 + C-10 + C-12 + C-13 + C-15 + C-16
  └── C-19 hardening-seguridad-y-privacidad            [C]

C-17 + C-18 + C-19
  └── C-20 despliegue-paas-y-operacion                 [Líder + A]
```

### Paralelismo por fase

> Cada "gate" es un punto de sincronización. Los changes dentro de un grupo pueden ejecutarse en paralelo.

```
GATE 0: ninguna
  → C-01 foundation-setup                      [Líder]

GATE 1: C-01 ✓                                 ← PRIMER FORK (3 paralelos)
  → C-03 db-tenant-rls                         [Agente A]
  → C-02 dominio-agenda-puro                   [Agente B]
  → C-04 utilidades-comunicacion-y-tokens      [Agente C]

GATE 2: C-02 + C-03 + C-04 ✓                   ← FORK (3 paralelos)
  → C-06 auth-personal-rbac                    [Agente A]
  → C-05 datos-clinica-y-pacientes             [Agente B — requiere C-02 ✓ y C-03 ✓]
  → C-07 auditoria-append-only                 [Agente C]

GATE 3: C-05 + C-06 + C-07 ✓                   ← FORK (3 paralelos)
  → C-09 turnos-persistencia-y-casos-de-uso    [Agente A]
  → C-08 api-configuracion-clinica             [Agente B]
  → C-11 cola-y-email-base                     [Agente C — solo necesita C-03 + C-04; puede arrancar en GATE 2 si C queda libre]

GATE 4: C-09 ✓ (+ C-11 para C-14)              ← FORK (3 paralelos)
  → C-12 api-turnos-y-agenda                   [Agente A]
  → C-13 disponibilidad-publica                [Agente B]
  → C-14 recordatorios-y-notificaciones-turno  [Agente C — si C-11 ✓]

GATE 5: C-13 + C-11 ✓                          ← FORK (3 paralelos)
  → C-16 exportacion-auditoria-ausentismo      [Agente A — solo necesita C-06 + C-07 + C-09]
  → C-10 api-pacientes                         [Agente B — necesita C-04 + C-05 + C-06 + C-07 + C-09]
  → C-15 reserva-publica-otp-y-tokens          [Agente C — necesita C-13 + C-11]

GATE 6: C-08 + C-10 + C-12 + C-13 + C-14 + C-15 + C-16 ✓   ← FORK (3 paralelos)
  → C-17 alta-clinicas-interno                 [Agente A — solo necesita C-03 + C-06; puede adelantarse]
  → C-18 e2e-flujos-y-contratos-api            [Agente B]
  → C-19 hardening-seguridad-y-privacidad      [Agente C]

GATE 7: C-17 + C-18 + C-19 ✓
  → C-20 despliegue-paas-y-operacion           [Líder + Agente A]
```

### Camino crítico (8 changes — mínimo irreducible)

```
C-01 → C-03 → C-05 → C-09 → C-13 → C-15 → C-18* → C-20
```

`*` C-18 y C-19 pueden ser el último paso antes de C-20 (se ejecutan en paralelo; C-20 espera a ambos).

### Plan óptimo con 3 agentes

```
Paso │ Líder           │ Agente A                    │ Agente B                     │ Agente C
     │                 │ (Plataforma/seguridad/turnos)│ (Dominio/gestión/pruebas)    │ (Comunicación/pública/trazab.)
─────┼─────────────────┼─────────────────────────────┼──────────────────────────────┼───────────────────────────────
  1  │ C-01 foundation │            —                │            —                 │            —
  2  │       —         │ C-03 db-tenant-rls          │ C-02 dominio-agenda-puro     │ C-04 utilidades-comunic.-tokens
  3  │       —         │ C-06 auth-personal-rbac     │ C-05 datos-clinica-pacientes │ C-07 auditoria-append-only
  4  │       —         │ C-09 turnos-persistencia    │ C-08 api-configuracion-clin. │ C-11 cola-y-email-base
  5  │       —         │ C-12 api-turnos-y-agenda    │ C-13 disponibilidad-publica  │ C-14 recordatorios-notific.
  6  │       —         │ C-16 export.-audit.-ausent. │ C-10 api-pacientes           │ C-15 reserva-publica-otp-tokens
  7  │       —         │ C-17 alta-clinicas-interno  │ C-18 e2e-flujos-contratos    │ C-19 hardening-seg.-privacidad
  8  │ C-20 despliegue │ C-20 despliegue (apoyo)     │            —                 │            —
```

Con 4 a 6 horas por change, son 8 pasos de trabajo efectivo. Sobra margen dentro de las 8 a 12 semanas del plazo para revisión de PR, correcciones y las decisiones abiertas.

### Convenciones para ramas paralelas (sin pisarse)

1. **Una rama por change:** `change/C-NN-nombre`, PR a `main`. Sin commits directos a `main`. Dentro de un gate, se fusiona en el orden en que terminan y los demás hacen *rebase*.
2. **Zonas disjuntas:** cada change declara su **Zona** (carpetas que toca). No se editan archivos de otra zona; si es inevitable, se avisa al dueño de esa zona y al líder.
3. **Rutas sin archivo compartido:** C-01 define que cada módulo HTTP vive en `src/interfaces/http/modules/<nombre>/` y exporta un plugin de Fastify. Un registrador los carga por escaneo del directorio, así que ningún change edita un archivo común para sumar rutas.
4. **Migraciones:** `migrations/C{NN}_{seq}_{nombre}.sql`. El orden de ejecución es el de los IDs, y los IDs respetan las dependencias. Cada migración aplica `aplicar_rls('tabla')` (C-03). Una clave foránea solo apunta a tablas de changes ya fusionados. Las claves cruzadas se agregan en el change que depende de ambas (C-08 para `usuario.profesional_id`, C-12 para `bloqueo.creado_por`).
5. **Dependencias de npm:** C-01 instala todas las previstas. Si un change necesita otra, se pide al líder para no generar conflictos en `package.json` ni en el lockfile.
6. **Contratos congelados:** `RequestContext` (C-03), los puertos de dominio (C-02) y `TurnoEventPublisher` (C-09) se congelan al fusionarse. Cambiarlos exige PR del dueño y aviso a los demás.
7. **Gobernanza:** para `CRITICO` y `ALTO`, primero una propuesta breve de diseño que el líder aprueba. Después, el código.
8. **Datos:** solo sintéticos, en desarrollo, pruebas y CI (RN-DA-01). Nada de volcados reales.
9. **Este archivo:** el checkbox `[x]` lo marca quien fusiona el PR (el líder) para evitar conflictos de edición.
10. **Pruebas de aislamiento:** todo change que cree tablas con `clinica_id` reutiliza el arnés de C-03 para probar que la clínica A no ve datos de la B.

---

## FASE 0 — Cimientos

### [C-01] `foundation-setup`
- **Estado**: `[x]` completado (archivado el 2026-11-22). CI en verde en GitHub Actions ([run en main](https://github.com/bstocco/turnos-odontologia/actions/runs/45096148192), commit 6d7312e). Seguimiento: cerradas 5.1, 6.2, 7.1 y 9.2; pendientes la 6.3 (rama descartable con error de tipos y lockfile desalineado) y la tabla escenario→prueba de la 9.2. Ver `openspec/changes/archive/2026-11-22-c-01-foundation-setup/tasks.md`, sección "Seguimiento pendiente al archivar"
- **Scope**: Esqueleto del repositorio, convenciones compartidas y verificación de la plataforma. Lo ejecuta el líder.
  - Proyecto TypeScript/Node.js: `tsconfig` estricto, ESLint y Prettier, estructura hexagonal `src/{domain,application,infrastructure,interfaces/http}`, `migrations/`, `seeds/`, `test/{unit,integration,api}`
  - App Fastify mínima con `GET /salud`, manejo central de errores con códigos de dominio estables y logger estructurado con redacción de datos personales
  - Registrador de módulos HTTP por escaneo de `src/interfaces/http/modules/*` (convención 3)
  - Runner de migraciones SQL con tabla de control y nombres `C{NN}_{seq}_{nombre}.sql`
  - Configuración tipada de entorno y `.env.example` según `08 §Variables de entorno`, sin valores sensibles por defecto
  - Vitest con proyectos `unit`, `integration` y `api`; fast-check instalado; `docker-compose.yml` con PostgreSQL para desarrollo y pruebas
  - Instalación de **todas** las dependencias previstas (Fastify, `pg`, argon2, librería JWT, pg-boss, validación de esquemas, cliente de email, fast-check)
  - GitHub Actions: lint, typecheck, pruebas unitarias e integración con PostgreSQL de servicio
  - Guardas de datos: `ALLOW_SEED=false` por defecto y utilidad `assertNoProduction()` para seeds (RN-DA-02)
  - Verificación en el PaaS candidato (tier gratuito): `CREATE EXTENSION btree_gist`, Row-Level Security y columna `fin_sillon` común con `CHECK` (R-04, R-05). Registrar el proveedor elegido en DD-04
  - README de desarrollo: cómo levantar el entorno, convenciones de ramas y de migraciones
  - Zona: raíz del repo, `src/interfaces/http/` (esqueleto), `.github/`, `docker-compose.yml`
  - Decisiones del Líder: el `.gitignore` NO ignora `.atl/skill-registry.md`, `openspec/` ni `.active-orchestrator-state.json` (artefactos evaluables). Región de despliegue `sa-east-1` (São Paulo): Brasil no figura en la lista de nivel adecuado de la AAIP, así que la transferencia requiere cláusulas contractuales modelo o validación legal (PO-03, pendiente; bloquea C-20). Los roles `app` y `migra` los crea `docker/postgres/init/01-roles.sql`. Detalle en `openspec/changes/c-01-foundation-setup/` y `docs/plataforma/informe-validacion-postgres.md`
- **Dependencias**: ninguna
- **Governance**: BAJO
- **Leer antes**:
  - `knowledge-base/02_descripcion_general.md` §Stack tecnológico, §Arquitectura general
  - `knowledge-base/08_arquitectura_propuesta.md` §Estructura de directorios, §Variables de entorno, §Integración continua
  - `knowledge-base/09_decisiones_y_supuestos.md` DD-04, DD-08, DD-09
  - `knowledge-base/10_preguntas_abiertas.md` R-04, R-05

---

## FASE 1 — Núcleo de dominio y plataforma multi-tenant

> Los changes C-02, C-03 y C-04 son independientes entre sí y se ejecutan en paralelo (GATE 1).

### [C-02] `dominio-agenda-puro`
- **Estado**: `[x]` pendiente
- **Scope**: Lógica de agenda en TypeScript puro, sin I/O ni base de datos
  - `Intervalo` semiabierto `[inicio, fin)` con `seSolapa`, `contiene` y adyacencia (fin = inicio no solapa; RN-AG-03)
  - Ocupación: rango del profesional `[inicio, fin)` y rango del sillón `[inicio, fin + buffer)` (RN-AG-02, RN-AG-05)
  - Entidad `Turno`, estados y transiciones (RN-TU-01, RN-TU-04)
  - Cálculo de disponibilidad: horarios de atención, feriados, bloqueos, turnos existentes, sillones con buffer y duración de la prestación → huecos libres alineados a la granularidad, con sillón asignable (RN-AG-06, RN-AG-07, RN-AG-11)
  - Utilidades de zona horaria IANA: franja local → instantes UTC, sin desplazamientos fijos (RN-DA-03)
  - Validaciones previas a persistir como funciones puras con errores tipados (RN-AG-06, 07, 10, 11)
  - Puertos (solo interfaces): `TurnoRepository`, `AgendaReader`, `RecursosReader`
  - Tests: casos borde (fin = inicio, buffer 0 y > 0, cambio de día, feriado) y pruebas basadas en propiedades con fast-check ("ningún conjunto de turnos aceptados se solapa")
  - Zona: `src/domain/**`, `test/unit/domain/**`
- **Dependencias**: C-01
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/05_reglas_de_negocio.md` §Agenda (RN-AG), §Turnos y estados (RN-TU)
  - `knowledge-base/04_modelo_de_datos.md` §turno, §horario_atencion, §bloqueo
  - `knowledge-base/07_flujos_principales.md` §Flujo 2
  - `knowledge-base/08_arquitectura_propuesta.md` §Patrones aplicados, §Estrategia de pruebas

---

### [C-03] `db-tenant-rls`
- **Estado**: `[x]` pendiente
- **Scope**: Plataforma de datos multi-tenant con aislamiento por Row-Level Security
  - Pool de PostgreSQL y `withTenant(clinicaId, fn)`: transacción con `SET LOCAL app.clinica_id`, nunca por conexión
  - `RequestContext { clinicaId, actor: { tipo, id, rol } }` en `src/application/shared/`: contrato compartido por auth, auditoría y casos de uso
  - Migración `C03_001`: extensión `btree_gist`; tablas `clinica` y `clinica_config`; privilegios del rol `app` sobre ellas. Los roles `app` (sin superusuario, sin `BYPASSRLS`, sin ser propietario) y `migra` ya existen: los crea el script de inicialización de C-01 (`docker/postgres/init/01-roles.sql`), porque una migración no puede crear el rol con el que se ejecuta
  - Helper SQL `aplicar_rls(tabla)`: `ENABLE` + `FORCE ROW LEVEL SECURITY` y política `clinica_id = current_setting('app.clinica_id')::uuid`
  - Función `SECURITY DEFINER` `resolver_clinica_por_slug(slug)` de alcance mínimo para rutas públicas
  - Arnés de pruebas de integración multi-tenant (`test/support/aislamiento.ts`): dos clínicas sintéticas, la A no lee ni escribe datos de la B
  - Tests: sin contexto no se ve ninguna fila (falla cerrada), `SET LOCAL` no se filtra entre transacciones, el rol de la app no tiene `BYPASSRLS`
  - Zona: `src/infrastructure/db/{pool,tenant}/**`, `src/application/shared/**`, `migrations/C03_*`, `test/support/**`
- **Dependencias**: C-01
- **Governance**: CRITICO
- **Leer antes**:
  - `knowledge-base/04_modelo_de_datos.md` §clinica, §clinica_config
  - `knowledge-base/08_arquitectura_propuesta.md` §Seguridad (Autorización, aislamiento multi-tenant)
  - `knowledge-base/09_decisiones_y_supuestos.md` DD-01
  - `knowledge-base/05_reglas_de_negocio.md` §Multi-tenant y seguridad (RN-MT)
  - `knowledge-base/10_preguntas_abiertas.md` R-03

---

### [C-04] `utilidades-comunicacion-y-tokens`
- **Estado**: `[x]` pendiente
- **Scope**: Utilidades puras de comunicación y seguridad, sin I/O
  - `normalizarTelefonoAr` a formato internacional `549` + área + número, sin el `15`; validación de teléfonos inválidos (RN-NO-04, RN-PA-03)
  - `construirEnlaceWhatsapp(telefono, mensaje)` → `https://wa.me/<número>?text=<mensaje codificado>`
  - Plantillas de mensaje en español como funciones puras: recordatorio, confirmación, cancelación y código de verificación
  - Tokens de acción: 256 bits aleatorios, hash SHA-256, comparación en tiempo constante, vencimiento y propósito `confirmar` | `cancelar` (RN-RE-06)
  - Código de verificación por email: generación numérica, hash, vencimiento y límite de intentos (lógica pura)
  - Tests: teléfonos con y sin `15`, con `0` inicial y con `+54`; tiempo constante; expiración e intentos
  - Zona: `src/domain/comunicacion/**`, `src/infrastructure/crypto/**`, `test/unit/comunicacion/**`
- **Dependencias**: C-01
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/05_reglas_de_negocio.md` §Notificaciones (RN-NO), §Reserva pública (RN-RE)
  - `knowledge-base/03_actores_y_roles.md` §Modelo de autenticación
  - `knowledge-base/02_descripcion_general.md` §Integraciones externas (gotcha `wa.me`)
  - `knowledge-base/07_flujos_principales.md` §Flujo 3, §Flujo 8

---

## FASE 2 — Datos, seguridad y trazabilidad

> Los changes C-05, C-06 y C-07 pueden proponerse en paralelo una vez cerrada la FASE 1.

### [C-05] `datos-clinica-y-pacientes`
- **Estado**: `[x]` pendiente
- **Scope**: Persistencia de los recursos de la clínica y de los pacientes, sin HTTP
  - Migración `C05_001`: tablas `profesional`, `horario_atencion`, `sillon` (con `buffer_minutos`), `prestacion`, `feriado`, `paciente` y `bloqueo`, cada una con `clinica_id` y `aplicar_rls`
  - Constraints: `hora_desde < hora_hasta`, DNI único por clínica, feriado único por fecha, bloqueos sin solape por profesional (exclusión)
  - `bloqueo.creado_por` sin clave foránea; la FK a `usuario` la agrega C-12
  - Repositorios en SQL explícito que implementan los puertos de C-02, siempre dentro de `withTenant`
  - Seed sintético de una clínica de demostración (faker es-AR), protegido por `assertNoProduction()`
  - Tests de integración: constraints y aislamiento por tabla con el arnés de C-03
  - Zona: `migrations/C05_*`, `src/infrastructure/db/repositories/{profesional,horario,sillon,prestacion,feriado,paciente,bloqueo}/**`, `seeds/**`
- **Dependencias**: C-02, C-03
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/04_modelo_de_datos.md` §profesional, §horario_atencion, §sillon, §prestacion, §feriado, §paciente, §bloqueo, §Seed data inicial
  - `knowledge-base/05_reglas_de_negocio.md` §Pacientes (RN-PA), RN-AG-06, RN-AG-07
  - `knowledge-base/08_arquitectura_propuesta.md` §Seguridad
  - `knowledge-base/09_decisiones_y_supuestos.md` DD-01

---

### [C-06] `auth-personal-rbac`
- **Estado**: `[x]` pendiente
- **Scope**: Autenticación JWT del personal y control de acceso por roles
  - Migración `C06_001`: `usuario` (email único por clínica, `hash_contrasena` argon2id, `rol`, `profesional_id` sin FK, `activo`, `ultimo_acceso`) y tabla de refresh tokens (hash, rotación, revocación), con `aplicar_rls`
  - `POST /auth/login`, `POST /auth/refresh` (rotativo), `POST /auth/logout`; token de acceso corto; mensajes genéricos; límite de tasa por IP y email
  - Plugin de autenticación: valida el JWT, construye `RequestContext` y abre `withTenant` por pedido
  - Matriz RBAC en código (`requireRole`, `requirePermission`) según `03 §RBAC`; un recurso de otra clínica responde "no encontrado"
  - CRUD de usuarios del personal (solo administrador), con rol y profesional asociado
  - Tests: login correcto e incorrecto, usuario inactivo, rotación y reuso detectado del refresh, expiración, rate limit, permisos por rol
  - Zona: `migrations/C06_*`, `src/infrastructure/auth/**`, `src/interfaces/http/modules/auth/**`, `src/interfaces/http/modules/usuarios/**`
- **Dependencias**: C-03
- **Governance**: CRITICO
- **Leer antes**:
  - `knowledge-base/03_actores_y_roles.md` (completo)
  - `knowledge-base/05_reglas_de_negocio.md` §Multi-tenant y seguridad (RN-MT)
  - `knowledge-base/07_flujos_principales.md` §Flujo 1
  - `knowledge-base/08_arquitectura_propuesta.md` §Seguridad (Autenticación)
  - `knowledge-base/09_decisiones_y_supuestos.md` DD-03

---

### [C-07] `auditoria-append-only`
- **Estado**: `[ ]` pendiente
- **Scope**: Registro de auditoría inmutable
  - Migración `C07_001`: tabla `auditoria` con `aplicar_rls`; el rol de la app solo tiene `INSERT` y `SELECT`; trigger `BEFORE UPDATE OR DELETE` que lanza error (RN-AU-01)
  - `AuditoriaService.registrar(ctx, { accion, entidad, entidadId, antes, despues })` con el actor tomado del `RequestContext`; los campos sensibles se enmascaran en `datos_antes` y `datos_despues`
  - Hook reutilizable para casos de uso: cambios, **lectura de la ficha de un paciente** y exportaciones (RN-AU-02, RN-AU-03)
  - Actores soportados: `usuario`, `paciente_enlace`, `sistema`
  - Tests: `UPDATE` y `DELETE` rechazados incluso con el rol de la app, aislamiento por clínica, registro por tipo de actor
  - Zona: `migrations/C07_*`, `src/infrastructure/audit/**`, `src/application/auditoria/**`
- **Dependencias**: C-03
- **Governance**: CRITICO
- **Leer antes**:
  - `knowledge-base/04_modelo_de_datos.md` §auditoria
  - `knowledge-base/05_reglas_de_negocio.md` §Auditoría y datos (RN-AU, RN-DA)
  - `knowledge-base/09_decisiones_y_supuestos.md` DD-05
  - `knowledge-base/08_arquitectura_propuesta.md` §Seguridad (Datos personales)

---

## FASE 3 — Gestión de la clínica y turnos del personal

> C-08, C-09 y C-11 se ejecutan en paralelo (GATE 3). C-09 es el núcleo del producto: el líder revisa su PR con especial atención.

### [C-08] `api-configuracion-clinica`
- **Estado**: `[ ]` pendiente
- **Scope**: API de configuración de la clínica para el administrador (lectura para recepción)
  - Migración `C08_001`: clave foránea `usuario.profesional_id → profesional`
  - Endpoints: `/clinica` (`GET`, `PATCH` de `reserva_requiere_confirmacion`, anticipación de cancelación y granularidad), `/profesionales`, `/profesionales/{id}/horarios`, `/sillones`, `/prestaciones`, `/feriados` (con plantilla de feriados nacionales)
  - Validaciones: franjas sin solape, `buffer_minutos ≥ 0`, `duracion_minutos > 0`; desactivar en lugar de borrar cuando hay turnos asociados
  - Permisos por rol (C-06) y auditoría de cada cambio (C-07)
  - Tests API: permisos por rol, aislamiento entre clínicas, validaciones
  - Zona: `migrations/C08_*`, `src/interfaces/http/modules/{clinica,profesionales,sillones,prestaciones,feriados}/**`, `src/application/configuracion/**`
- **Dependencias**: C-05, C-06, C-07
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` Épica 1 (US-001 a US-005)
  - `knowledge-base/03_actores_y_roles.md` §RBAC — Matriz de permisos
  - `knowledge-base/04_modelo_de_datos.md` §clinica_config, §usuario
  - `knowledge-base/05_reglas_de_negocio.md` RN-AG-05, RN-AG-06

---

### [C-09] `turnos-persistencia-y-casos-de-uso`
- **Estado**: `[ ]` pendiente
- **Scope**: Persistencia de turnos y casos de uso de agenda, sin HTTP
  - Migración `C09_001`: tabla `turno` con `fin_sillon` como columna común más `CHECK` de coherencia con `buffer_minutos`, `rango_profesional` y `rango_sillon`, **constraints de exclusión** por profesional y por sillón (`WHERE estado NOT IN ('cancelado','reprogramado')`), índices y `aplicar_rls`
  - Repositorio y `AgendaReader` (consultas de ocupación) que implementan los puertos de C-02
  - Casos de uso: `agendarTurno`, `reprogramarTurno` (una transacción, RN-TU-02), `cancelarTurno`, `confirmarTurno`, `marcarAtendido`, `marcarAusente`; validan con el dominio y traducen los errores `23P01` y `40P01` (deadlock entre reservas concurrentes del mismo hueco) a `TURNO_SOLAPADO_PROFESIONAL` o `TURNO_SOLAPADO_SILLON` (409)
  - Asignación automática de sillón libre con reintento ante concurrencia (RN-RE-03)
  - Puerto `TurnoEventPublisher` con eventos de dominio (creado, confirmado, cancelado, reprogramado); implementación nula por defecto, que consume C-14
  - Auditoría en cada caso de uso (C-07)
  - Tests de integración: dos reservas concurrentes sobre el mismo hueco (gana una), borde fin = inicio, buffer, reprogramación atómica (el original no cambia si falla), aislamiento
  - Zona: `migrations/C09_*`, `src/infrastructure/db/repositories/turno/**`, `src/application/turnos/**`
- **Dependencias**: C-02, C-05, C-07
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/04_modelo_de_datos.md` §turno (incluye el gotcha de `fin_sillon`)
  - `knowledge-base/05_reglas_de_negocio.md` §Agenda (RN-AG), §Turnos y estados (RN-TU)
  - `knowledge-base/07_flujos_principales.md` §Flujo 2, §Flujo 5
  - `knowledge-base/08_arquitectura_propuesta.md` §Seguridad (No solapamiento)
  - `knowledge-base/09_decisiones_y_supuestos.md` DD-02, SU-03

---

### [C-10] `api-pacientes`
- **Estado**: `[ ]` pendiente
- **Scope**: API de la ficha básica del paciente
  - `POST /pacientes`, `GET /pacientes/{id}`, `PATCH /pacientes/{id}`, `GET /pacientes?dni=&apellido=`
  - Normalización del teléfono con C-04 al guardar; DNI único por clínica
  - El odontólogo solo consulta pacientes de sus propios turnos (usa C-09); la recepción y el administrador acceden a todos de su clínica
  - Cada lectura del detalle de una ficha se audita (RN-AU-03)
  - Tests API: permisos por rol, DNI duplicado, búsqueda limitada a la clínica, auditoría de lecturas, aislamiento
  - Zona: `src/interfaces/http/modules/pacientes/**`, `src/application/pacientes/**`
- **Dependencias**: C-04, C-05, C-06, C-07, C-09
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` Épica 5 (US-040)
  - `knowledge-base/05_reglas_de_negocio.md` §Pacientes (RN-PA), §Auditoría (RN-AU-03)
  - `knowledge-base/03_actores_y_roles.md` §RBAC — Matriz de permisos
  - `knowledge-base/04_modelo_de_datos.md` §paciente

---

## FASE 4 — Turnos operativos y comunicación

> C-11, C-12, C-13 y C-14 se reparten entre los tres agentes. C-11 puede empezar en cuanto C-03 y C-04 estén fusionados.

### [C-11] `cola-y-email-base`
- **Estado**: `[ ]` pendiente
- **Scope**: Infraestructura de cola y envío de email, sin reglas de negocio
  - Migración `C11_001`: tabla `notificacion` con `aplicar_rls`
  - Integración con pg-boss (cola sobre PostgreSQL, sin Redis); *worker* arrancable en el mismo proceso o por separado. Los payloads de la cola llevan solo identificadores, sin datos personales
  - Puerto `EmailSender` y adaptador Resend o Brevo detrás de la interfaz; adaptador falso para pruebas
  - `NotificacionService.encolar(...)`: persiste la notificación y reintenta con espera creciente; estados `pendiente`, `enviada`, `fallida` (RN-NO-03)
  - Tests: reintentos, un fallo del proveedor no rompe el flujo que encola, idempotencia del envío, aislamiento
  - Zona: `migrations/C11_*`, `src/infrastructure/queue/**`, `src/infrastructure/email/**`, `src/application/notificaciones/**`
- **Dependencias**: C-03, C-04
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/02_descripcion_general.md` §Integraciones externas
  - `knowledge-base/04_modelo_de_datos.md` §notificacion
  - `knowledge-base/05_reglas_de_negocio.md` §Notificaciones (RN-NO)
  - `knowledge-base/07_flujos_principales.md` §Flujo 7
  - `knowledge-base/09_decisiones_y_supuestos.md` DD-09

---

### [C-12] `api-turnos-y-agenda`
- **Estado**: `[ ]` pendiente
- **Scope**: API de turnos, agenda y bloqueos para el personal
  - Endpoints: `POST /turnos`, `GET /turnos/{id}`, `POST /turnos/{id}/{cancelar|reprogramar|confirmar|atendido|ausente}`, `GET /turnos/{id}/enlace-whatsapp` (con C-04)
  - `GET /agenda?desde&hasta&profesionalId&sillonId`: vista diaria y semanal con turnos, bloqueos y feriados; el odontólogo ve solo la propia
  - `/bloqueos` (alta y baja) con rechazo `409` y lista de turnos en conflicto (RN-AG-08)
  - Migración `C12_001`: clave foránea `bloqueo.creado_por → usuario`
  - Permisos por rol, auditoría, esquemas de validación y OpenAPI
  - Tests API: flujos 2, 5, 6, 8 y 9; permisos; conflictos `409` y `422`
  - Zona: `migrations/C12_*`, `src/interfaces/http/modules/{turnos,agenda,bloqueos}/**`
- **Dependencias**: C-04, C-06, C-09
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` Épicas 2 y 3 (US-010 a US-015, US-020 a US-022)
  - `knowledge-base/07_flujos_principales.md` §Flujos 2, 5, 6, 8, 9
  - `knowledge-base/05_reglas_de_negocio.md` RN-AG-07, RN-AG-08, RN-TU, RN-AB
  - `knowledge-base/03_actores_y_roles.md` §RBAC — Matriz de permisos

---

### [C-13] `disponibilidad-publica`
- **Estado**: `[ ]` pendiente
- **Scope**: Consulta pública de prestaciones y horarios libres, sin cuenta
  - `GET /publico/{slug}/prestaciones` y `GET /publico/{slug}/disponibilidad` (profesional, prestación y rango de fechas)
  - La clínica se resuelve con `resolver_clinica_por_slug` y el cálculo de disponibilidad es el de C-02 (profesional, sillón, buffer, feriados y bloqueos)
  - Respuestas sin datos de pacientes; límite de tasa por IP; `404` genérico para un slug inexistente
  - Tests: coincide con las reglas de agenda, no expone datos ajenos, rate limit
  - Zona: `src/interfaces/http/modules/publico-disponibilidad/**`, `src/application/disponibilidad/**`
- **Dependencias**: C-05, C-09
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` Épica 4 (US-030)
  - `knowledge-base/07_flujos_principales.md` §Flujo 3
  - `knowledge-base/03_actores_y_roles.md` §Rutas públicas
  - `knowledge-base/05_reglas_de_negocio.md` RN-AG, RN-RE-05

---

### [C-14] `recordatorios-y-notificaciones-turno`
- **Estado**: `[ ]` pendiente
- **Scope**: Emails automáticos asociados a los turnos
  - Suscriptor de `TurnoEventPublisher` (C-09): emails de creación, confirmación, cancelación y reprogramación con las plantillas de C-04, enviados por C-11
  - Job periódico en pg-boss: busca turnos `pendiente_confirmacion` o `confirmado` a 24 horas del inicio (parametrizable) y encola **un solo** recordatorio por turno (idempotente)
  - La ventana de 24 horas se calcula en la zona horaria de la clínica
  - Tests: sin duplicados, turnos cancelados no reciben recordatorio, un fallo de email no afecta al turno
  - Zona: `src/application/notificaciones/turnos/**`, `src/infrastructure/queue/jobs/**`
- **Dependencias**: C-09, C-11
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/05_reglas_de_negocio.md` §Notificaciones (RN-NO-01, RN-NO-03)
  - `knowledge-base/06_funcionalidades.md` Épica 6 (US-050)
  - `knowledge-base/07_flujos_principales.md` §Flujo 7
  - `knowledge-base/09_decisiones_y_supuestos.md` SU-08

---

## FASE 5 — Reserva pública, administración y alta de clínicas

### [C-15] `reserva-publica-otp-y-tokens`
- **Estado**: `[ ]` pendiente
- **Scope**: Reserva del paciente sin cuenta, con validación por email y enlaces de un solo uso
  - Migración `C15_001`: `codigo_verificacion` y `token_accion` con `aplicar_rls`
  - `POST /publico/{slug}/codigo`: envía el código por email (C-04, C-11)
  - `POST /publico/{slug}/reservas`: valida el código, busca o crea al paciente por DNI sin exponer a los existentes, asigna sillón libre (C-09), estado según `reserva_requiere_confirmacion`; responde `201` o `409`
  - Email con enlaces de confirmación y cancelación (tokens de un solo uso)
  - `POST /publico/turnos/accion` (confirmar o cancelar): hash, un solo uso y vencimiento; la cancelación solo con 24 hs o más de anticipación, parametrizable (RN-RE-02)
  - Anti-abuso: límite de tasa por IP y por email, intentos limitados del código y tope de reservas activas por email o DNI. El valor del tope (PO-09) se acuerda con el equipo antes de implementar
  - Tests: flujos 3 y 4, código incorrecto o vencido, token reutilizado, cancelación con menos de 24 hs → `409`, reservas concurrentes, aislamiento
  - Zona: `migrations/C15_*`, `src/interfaces/http/modules/publico-reservas/**`, `src/application/reserva-publica/**`
- **Dependencias**: C-04, C-09, C-11, C-13
- **Governance**: CRITICO
- **Leer antes**:
  - `knowledge-base/03_actores_y_roles.md` §Modelo de autenticación, §Rutas públicas
  - `knowledge-base/05_reglas_de_negocio.md` §Reserva pública y cancelación (RN-RE)
  - `knowledge-base/07_flujos_principales.md` §Flujo 3, §Flujo 4
  - `knowledge-base/06_funcionalidades.md` US-031, US-032
  - `knowledge-base/10_preguntas_abiertas.md` R-02, PO-09

---

### [C-16] `exportacion-auditoria-ausentismo`
- **Estado**: `[ ]` pendiente
- **Scope**: Consulta de auditoría, exportación de datos y registro de ausentismo para el administrador
  - `GET /auditoria` con filtros por entidad, actor y rango de fechas
  - `POST /exportaciones` y `GET /exportaciones/{id}`: archivo con pacientes, turnos, profesionales, sillones, prestaciones y auditoría de **su** clínica, en un formato abierto (formato a definir, PO-16); la exportación queda auditada (RN-DA-04, RN-AU-03)
  - `GET /ausentismo` por período, paciente y profesional, con conteo (RN-AB-02)
  - Solo el administrador puede usar estos endpoints
  - Tests: permisos, la exportación no incluye datos de otra clínica, auditoría de la propia exportación
  - Zona: `src/interfaces/http/modules/{auditoria,exportaciones,ausentismo}/**`, `src/application/exportacion/**`
- **Dependencias**: C-06, C-07, C-09
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` Épica 7 (US-061, US-062, US-063)
  - `knowledge-base/05_reglas_de_negocio.md` §Auditoría y datos (RN-AU, RN-DA-04), RN-AB-02
  - `knowledge-base/07_flujos_principales.md` §Flujo 10
  - `knowledge-base/09_decisiones_y_supuestos.md` DD-05

---

### [C-17] `alta-clinicas-interno`
- **Estado**: `[x]` pendiente
- **Scope**: Aprovisionamiento de clínicas nuevas (PO-04 cerrado)
  - `POST /interno/clinicas` protegido por clave de servicio (`ADMIN_INTERNAL_KEY`, comparación en tiempo constante, desactivable por entorno) y fuera del RBAC de clínicas
  - Crea la clínica, su `clinica_config` por defecto y el primer usuario administrador con contraseña temporal
  - Script o seed inicial equivalente para la primera clínica; bloqueado en producción salvo una bandera explícita
  - `slug` único y validado; auditoría con actor `sistema`
  - Tests: sin clave → `401`, clave incorrecta, `slug` repetido, aislamiento de lo creado
  - Zona: `src/interfaces/http/modules/interno/**`, `src/application/aprovisionamiento/**`, `seeds/primera-clinica.*`
- **Dependencias**: C-03, C-06
- **Governance**: CRITICO
- **Leer antes**:
  - `knowledge-base/10_preguntas_abiertas.md` PO-04
  - `knowledge-base/03_actores_y_roles.md` §Actores del sistema
  - `knowledge-base/04_modelo_de_datos.md` §clinica, §clinica_config
  - `knowledge-base/08_arquitectura_propuesta.md` §Seguridad, §Variables de entorno

---

## FASE 6 — Endurecimiento y despliegue

### [C-18] `e2e-flujos-y-contratos-api`
- **Estado**: `[ ]` pendiente
- **Scope**: Verificación de extremo a extremo y contrato de la API
  - Pruebas de los 10 flujos de `07_flujos_principales.md` sobre la API real y PostgreSQL de prueba, con datos sintéticos
  - Contrato OpenAPI generado y verificado en CI (los cambios rompientes deben declararse)
  - Matriz de permisos automatizada: cada endpoint por cada rol, según `03 §RBAC`
  - Pruebas de concurrencia entre reserva del personal y reserva pública sobre el mismo hueco
  - Colección de ejemplos de uso de la API para el equipo
  - Zona: `test/e2e/**`, `docs/api/**`
- **Dependencias**: C-08, C-10, C-12, C-13, C-14, C-15, C-16
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/07_flujos_principales.md` (completo)
  - `knowledge-base/03_actores_y_roles.md` §RBAC — Matriz de permisos
  - `knowledge-base/08_arquitectura_propuesta.md` §Estrategia de pruebas

---

### [C-19] `hardening-seguridad-y-privacidad`
- **Estado**: `[ ]` pendiente
- **Scope**: Revisión de seguridad y privacidad antes del lanzamiento
  - Prueba cross-tenant automatizada que recorre todos los endpoints con credenciales de otra clínica (esperado: `404`)
  - Verificación de logs: sin datos de pacientes ni secretos (redacción comprobada con pruebas)
  - Cabeceras de seguridad, CORS restrictivo, límites de tamaño de cuerpo, límite de tasa global y auditoría de dependencias en CI
  - Verificación de que el rol de la app no tiene `BYPASSRLS` ni es propietario en el entorno desplegable, y de que `ALLOW_SEED=false` y `assertNoProduction()` están activos
  - Checklist de la Ley 25.326 con estado y responsables: registro ante la AAIP (PO-14) y transferencia internacional de datos (PO-03)
  - Zona: `test/seguridad/**`, `docs/seguridad/**`, configuración transversal de cabeceras
- **Dependencias**: C-08, C-10, C-12, C-13, C-15, C-16
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/08_arquitectura_propuesta.md` §Seguridad, §Observabilidad y operación
  - `knowledge-base/05_reglas_de_negocio.md` §Multi-tenant y seguridad (RN-MT), §Auditoría y datos (RN-DA)
  - `knowledge-base/10_preguntas_abiertas.md` PO-03, PO-14, R-03

---

### [C-20] `despliegue-paas-y-operacion`
- **Estado**: `[ ]` pendiente
- **Scope**: Puesta en producción y operación mínima
  - `Dockerfile` y configuración del PaaS elegido (DD-04); migraciones al desplegar con el rol `migra`; `GET /salud` como chequeo; variables de entorno como secretos
  - Copias de seguridad automáticas del PostgreSQL gestionado y prueba de restauración en un entorno sintético; política de retención (PO-10)
  - Entornos de pruebas y de producción separados; sin datos reales fuera de producción
  - *Worker* de pg-boss desplegado y monitoreado, con alertas básicas
  - Runbook: alta de la primera clínica (C-17), rotación de secretos y restauración
  - Zona: `Dockerfile`, configuración del PaaS, `docs/operacion/**`, `.github/` (despliegue)
- **Dependencias**: C-17, C-18, C-19
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/08_arquitectura_propuesta.md` §Variables de entorno, §Observabilidad y operación
  - `knowledge-base/09_decisiones_y_supuestos.md` DD-04
  - `knowledge-base/10_preguntas_abiertas.md` PO-03, PO-10, R-05
  - `knowledge-base/02_descripcion_general.md` §Modelo operativo
