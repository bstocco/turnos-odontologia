# Design

## Context

Motivación y alcance: ver [proposal.md](proposal.md). Requisitos observables: `specs/esquema-auditoria-append-only/spec.md`, `specs/servicio-auditoria-y-enmascaramiento/spec.md` y `specs/hooks-auditoria-casos-de-uso/spec.md`.

Estado observado en el repositorio (`31a8081`) que condiciona el diseño:

- **C-03 archivado (`db-tenant-rls`)**:
  - `migrations/C03_001_tenant_rls.sql` define `aplicar_rls(tabla)` (`ENABLE` + `FORCE ROW LEVEL SECURITY` y política `FOR ALL TO app USING (clinica_id = NULLIF(current_setting('app.clinica_id', true), '')::uuid)`).
  - `src/application/shared/request-context.ts` define el **contrato congelado** (Regla 14 — no modificable):
    ```ts
    export type TipoActor = 'usuario' | 'paciente_enlace' | 'sistema';
    export interface Actor { readonly tipo: TipoActor; readonly id: string; readonly rol: string; }
    export interface RequestContext { readonly clinicaId: string; readonly actor: Actor; }
    ```
    `RequestContext` **no incluye `ip`**.
  - `src/infrastructure/db/tenant/with-tenant.ts` expone `withTenant(clinicaId, fn)` fijando `app.clinica_id` mediante `set_config(..., true)` dentro de una transacción y entregando un `pg.PoolClient`.
  - `src/infrastructure/db/repositories/compartido/ejecutor.ts` define `EjecutorSql { query(texto: string, valores?: unknown[]): Promise<ResultadoSql> }`, satisfecho por `pg.PoolClient`.
  - `test/support/aislamiento.ts` provee `CLINICA_A`, `CLINICA_B` e `insertarConfigDeClinica`; `test/support/base-de-datos.ts` provee `configDeBaseDePrueba`, `consultarComoMigra` y `reiniciarEsquema`.
- **Frontera hexagonal controlada por ESLint (`eslint.config.mjs`)**: `src/application/**/*.ts` tiene prohibido importar `pg`, `pg-boss`, `fastify`, `nodemailer`, `argon2`, `jose`, `@fastify/*`, `**/infrastructure/**` y `**/interfaces/**`. Por lo tanto, el puerto append-only, el servicio, el enmascarador puro y los hooks viven en `src/application/auditoria/**` sin importar `src/infrastructure/logging/redactor.ts` ni clientes de base de datos.
- **Compatibilidad preexistente con C-17 (`alta-clinicas-interno`)**: `src/infrastructure/aprovisionamiento/repositorio-de-clinicas.ts` ya ejecuta dentro de `withTenant(clinicaId, ...)`:
  ```sql
  INSERT INTO auditoria (clinica_id, ocurrio_en, actor_tipo, accion, entidad, entidad_id)
  VALUES ($1, now(), 'sistema', 'creacion', 'clinica', $1)
  ```
  El esquema de `C07_001` debe satisfacer esta sentencia literal sin modificar `C-17`.
- **Convención de redacción de logs (`C-01`, `src/infrastructure/logging/redactor.ts`)**: campos personales (`dni`, `telefono`, `email`, `nombre`, `apellido`, `obra_social`), credenciales por subcadena, marcadores `[REDACTADO]`, `[TRUNCADO]` (profundidad máxima 8) y `[CIRCULAR]`.
- **Errores de dominio (`src/domain/shared/errores.ts`)**: `ErrorDeDominio(codigo, tipo, mensaje)` con códigos `^[A-Z][A-Z0-9_]*$` y mensajes fijos sin datos personales.

## Goals / Non-Goals

**Goals:**
- Garantizar inmutabilidad `append-only` de `auditoria` directamente en PostgreSQL mediante doble barrera (privilegios mínimos de rol + trigger a nivel de sentencia), imposible de eludir incluso para el propietario de la tabla.
- Asegurar aislamiento estricto por `clinica_id` con `aplicar_rls('auditoria')` y rechazo ante cualquier desalineación entre `RequestContext.clinicaId` y `app.clinica_id`.
- Proveer una API de aplicación pura (`AuditoriaService` + hooks) fácil de componer dentro de `withTenant` en `C-08`, `C-09`, `C-10`, `C-12`, `C-15` y `C-16`, con enmascaramiento recursivo automático antes de persistir.
- Mantener compatibilidad binaria/SQL con el `INSERT` ya existente en `C-17` y respetar los contratos congelados y las reglas de arquitectura hexagonal.

**Non-Goals:**
- Implementar endpoints HTTP (`GET /auditoria`, `POST/GET /exportaciones` de `C-16`) ni consulta paginada/filtrada de registros.
- Cablear auditoría dentro de casos de uso futuros (`C-08`..`C-16`) ni modificar `src/infrastructure/aprovisionamiento/repositorio-de-clinicas.ts` (`C-17`).
- Alterar `RequestContext` (`src/application/shared/request-context.ts`) ni las utilidades de `test/support/**`.
- Definir política de retención, purga o archivado histórico (`PO-10` / `C-20`).

## Decisions

### D1. Migración única `migrations/C07_001_auditoria.sql` e identidad generada
Una sola migración atómica crea la tabla `auditoria`, sus constraints, sus cuatro índices, el trigger de inmutabilidad, los privilegios del rol `app` y la llamada a `aplicar_rls('auditoria')`.

- La clave primaria es `id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY` (`bigint` secuencial).
- **Por qué `GENERATED ALWAYS AS IDENTITY` sobre `bigserial`**: evita depender de `GRANT USAGE ON SEQUENCE` explícito para el rol `app` (PostgreSQL gestiona la identidad internamente) e impide inserciones manuales con `id` forzado salvo `OVERRIDING SYSTEM VALUE`, manteniendo el orden estricto de auditoría.
- **Índices previstos para `C-16`** (`GET /auditoria` por rango de fechas, entidad y actor):
  - `auditoria_clinica_ocurrio_idx ON auditoria (clinica_id, ocurrio_en DESC, id DESC)`
  - `auditoria_clinica_entidad_idx ON auditoria (clinica_id, entidad, ocurrio_en DESC)`
  - `auditoria_clinica_actor_idx ON auditoria (clinica_id, actor_tipo, actor_id, ocurrio_en DESC)`
  - `auditoria_clinica_entidad_id_idx ON auditoria (clinica_id, entidad, entidad_id) WHERE entidad_id IS NOT NULL`
- *Alternativa descartada*: `id uuid PRIMARY KEY`. Descartada porque `04_modelo_de_datos.md §auditoria` exige `id (secuencial)` para ordenar eventos cronológicamente ante empates de reloj.

### D2. Compatibilidad con C-17 y nulabilidad controlada de columnas
Columnas de `auditoria`:
- `clinica_id uuid NOT NULL REFERENCES clinica (id)`
- `ocurrio_en timestamptz NOT NULL DEFAULT now()`
- `actor_tipo text NOT NULL` (`CHECK (actor_tipo IN ('usuario', 'paciente_enlace', 'sistema'))`)
- `actor_id text` (nullable solo para `sistema`)
- `accion text NOT NULL` (`CHECK (accion ~ '^[a-z][a-z0-9_]*$')`)
- `entidad text NOT NULL` (`CHECK (entidad ~ '^[a-z][a-z0-9_]*$')`)
- `entidad_id uuid` (nullable; ajustado en `Q2` para compatibilidad literal con `C-17`)
- `datos_antes jsonb` (nullable)
- `datos_despues jsonb` (nullable)
- `ip inet` (nullable)

Constraint condicional para `actor_id` (`auditoria_actor_id_check`):
```sql
CHECK (
  (actor_tipo = 'sistema' AND (actor_id IS NULL OR length(btrim(actor_id)) > 0))
  OR
  (actor_tipo <> 'sistema' AND actor_id IS NOT NULL AND length(btrim(actor_id)) > 0)
)
```
El orden `actor_tipo = 'sistema'` vs `actor_tipo <> 'sistema'` garantiza que un `actor_tipo` inválido con `actor_id` no vacío supere `auditoria_actor_id_check` y dispare `auditoria_actor_tipo_check` al evaluarse los `CHECK` en orden alfabético.
- **Compatibilidad literal con C-17**: en `repositorio-de-clinicas.ts`, C-17 ejecuta `INSERT INTO auditoria (clinica_id, ocurrio_en, actor_tipo, accion, entidad, entidad_id) VALUES ($1, now(), 'sistema', 'creacion', 'clinica', $1)`. Al probar contra PostgreSQL 17 con `entidad_id text`, el motor rechazaba esa sentencia con `42P08` (`inconsistent types deduced for parameter $1`). Con `entidad_id uuid` (resolución ajustada de `Q2`), `$1` se deduce unívocamente como `uuid` en ambas columnas y la sentencia literal de `C-17` pasa sin tocar ningún archivo de `C-17`. `actor_id`, `datos_antes`, `datos_despues` e `ip` quedan en `NULL`.
- *Alternativa descartada*: `entidad_id text` (propuesta inicial de `Q2`) exigiría editar `C-17` (`$2` o `($1::uuid)::text`); `actor_id uuid NOT NULL` rompería `C-17` y bloquearía identificadores textuales de workers/enlaces.

### D3. Doble barrera de inmutabilidad (`RN-AU-01`)
1. **Barrera 1 (privilegios de rol)**:
   ```sql
   REVOKE ALL ON TABLE auditoria FROM PUBLIC;
   GRANT SELECT, INSERT ON TABLE auditoria TO app;
   ```
   Como `migra` es propietario de la tabla y `app` no tiene `UPDATE`, `DELETE` ni `TRUNCATE`, cualquier intento desde el pool de la aplicación falla de inmediato con SQLSTATE `42501`.
2. **Barrera 2 (trigger a nivel de sentencia)**:
   ```sql
   CREATE FUNCTION impedir_mutacion_auditoria() RETURNS trigger
   LANGUAGE plpgsql AS $$
   BEGIN
     RAISE EXCEPTION 'La tabla auditoria es append-only: % no está permitido.', TG_OP
       USING ERRCODE = 'P0001';
   END;
   $$;

   CREATE TRIGGER auditoria_inmutable
     BEFORE UPDATE OR DELETE OR TRUNCATE ON auditoria
     FOR EACH STATEMENT
     EXECUTE FUNCTION impedir_mutacion_auditoria();
   ```
- **Por qué `FOR EACH STATEMENT` en lugar de `FOR EACH ROW`**: en PostgreSQL un trigger `FOR EACH ROW` **no se dispara** cuando `UPDATE`/`DELETE` afecta 0 filas ni soporta `TRUNCATE`. Con `FOR EACH STATEMENT`, incluso un `DELETE FROM auditoria WHERE false` o `TRUNCATE TABLE auditoria` ejecutado por `migra` queda bloqueado en la base.
- *Alternativa descartada*: `RULE DO INSTEAD NOTHING` o `FOR EACH ROW`. `RULE` oculta silenciosamente el error en lugar de rechazarlo; `FOR EACH ROW` no cubre `TRUNCATE` ni sentencias vacías.

### D4. Aislamiento multi-tenant y verificación de `clinica_id` (`DD-01`, `DD-06`)
- La migración invoca `SELECT aplicar_rls('auditoria');`, heredando `ENABLE` + `FORCE ROW LEVEL SECURITY` y la política `FOR ALL TO app USING (clinica_id = NULLIF(current_setting('app.clinica_id', true), '')::uuid)`.
- En el adaptador PostgreSQL, el `INSERT` pasa **`ctx.clinicaId` como parámetro `$1`** para la columna `clinica_id` (en lugar de leer `CLINICA_DEL_CONTEXTO_SQL` directamente en el `VALUES`).
- **Por qué `$1 = ctx.clinicaId`**: si por un bug un caso de uso pasa un `RequestContext` de la clínica B dentro de una transacción `withTenant(clinicaA, ...)`, la cláusula `WITH CHECK` implícita de la política `FOR ALL` evalúa `ctx.clinicaId = app.clinica_id` y PostgreSQL **rechaza** el `INSERT` con `42501` en vez de grabar silenciosamente bajo la clínica equivocada (prioridad de seguridad DD-06).
- *Alternativa descartada*: usar `CLINICA_DEL_CONTEXTO_SQL` en el `VALUES`, que ocultaría discrepancias entre el `RequestContext` recibido y la transacción abierta.

### D5. Frontera hexagonal: aplicación pura + adaptador PostgreSQL transaccional
- `src/application/auditoria/` (sin imports de `infrastructure` ni `interfaces` según `eslint.config.mjs`):
  - `puertos.ts`: tipos `EntradaAuditoria`, `RegistroAuditoriaCreado`, `RegistroAuditoriaAInsertar` e interfaz `AuditoriaRepositorio` con un único método `insertar(registro: RegistroAuditoriaAInsertar): Promise<RegistroAuditoriaCreado>`.
  - `validaciones.ts`: validación pura de UUID `clinicaId`, `actor.tipo`, `actor.id`, `accion`/`entidad` (`^[a-z][a-z0-9_]*$`), `entidadId` opcional y formato de `ip` (IPv4/IPv6). Lanza `ErrorDeDominio` de tipo `solicitud_invalida` con mensajes fijos sin PII.
  - `enmascarar.ts`: sanitizador puro recursivo.
  - `servicio.ts`: `AuditoriaService` con `registrar(ctx: RequestContext, entrada: EntradaAuditoria)` (exportando interfaz `ServicioAuditoria` y fábrica `crearAuditoriaService(repositorio)`).
  - `hooks.ts`: helpers reutilizables *fail-closed* para casos de uso.
  - `index.ts`: barril público de aplicación.
- `src/infrastructure/audit/`:
  - `errores.ts`: `ErrorDeAuditoriaPersistencia` + traducción de errores de PostgreSQL sin copiar `detail` ni datos personales.
  - `repositorio-pg.ts`: `crearRepositorioAuditoriaPg(ejecutor: EjecutorSql): AuditoriaRepositorio` y helper de conveniencia `crearAuditoriaPg(ejecutor: EjecutorSql): ServicioAuditoria`.
  - `index.ts`: barril público de infraestructura.
- **Uso dentro de `withTenant`**: quien orquesta el caso de uso abre `withTenant(ctx.clinicaId, async (cliente) => { ... })`, instancia o inyecta el servicio de auditoría sobre ese mismo `cliente` (`EjecutorSql`) y así la operación de negocio y su registro en `auditoria` comparten la misma transacción ACID.
- **IP fuera de `RequestContext`**: `RequestContext` permanece congelado (`C-03`). Las rutas HTTP futuras que necesiten registrar IP cliente (ej. login, acciones públicas) la pasan en `entrada.ip`.

### D6. Enmascaramiento recursivo puro en `src/application/auditoria/enmascarar.ts`
Para cumplir `eslint.config.mjs` (sin importar `src/infrastructure/logging/redactor.ts`), `src/application/auditoria/enmascarar.ts` implementa el enmascaramiento puro en la capa de aplicación, alineado con `openspec/specs/log-redaction/spec.md` y ampliado para entidades de dominio:

- Normalización de claves: `NFD`, sin diacríticos, minúsculas, sin separadores no alfanuméricos.
- **Claves de datos personales (coincidencia exacta normalizada)**: `dni`, `telefono`, `email`, `nombre`, `apellido`, `obrasocial`, más variantes prefijadas/sufijadas de paciente (`nombrepaciente`, `apellidopaciente`, `dnipaciente`, `telefonopaciente`, `emailpaciente`, `obrasocialpaciente`, `pacientenombre`, `pacienteapellido`, `pacientedni`, `pacientetelefono`, `pacienteemail`).
- **Claves de credenciales/secretos (subcadena normalizada)**: `contrasena`, `password`, `passwd`, `token`, `codigoverificacion`, `codigodeverificacion`, `verificationcode`, `hashcodigo`, `authorization`, `cookie`, `secret`, `apikey`. Se preserva explícitamente `codigo` a secas (códigos de error de dominio como `TURNO_SOLAPADO_SILLON`).
- **Saneamiento de texto libre**: en claves de texto libre (`motivo`, `mensaje`, `message`, `msg`, `stack`, `observacion`, `observaciones`, `detalle`, `descripcion`) reemplaza emails, números de 7–8 dígitos (DNI), tokens `Bearer` y credenciales en URLs por `[REDACTADO]`.
- **Serialización y límites**: `Date` válida → `toISOString()` (UTC), `Date` inválida → `null`, `bigint` → `toString()`, profundidad ≥ `8` → `[TRUNCADO]`, referencia circular en la ruta actual → `[CIRCULAR]`, `undefined` en raíz o valor vacío → `null`, objetos inmutables (sin mutar la entrada del llamador).
- *Alternativa descartada*: mover `redactor.ts` de `src/infrastructure/logging/` a `src/domain/shared/` o `src/application/shared/`. Descartada para respetar la zona disjunta de C-07 (`CHANGES.md`) y no tocar archivos de C-01.

### D7. Hooks reutilizables *fail-closed* y mapa de consumidores
Firmas en `src/application/auditoria/hooks.ts`:

- `conAuditoriaDeCambio<T>(auditoria, ctx, opciones, ejecutar): Promise<T>`: ejecuta `ejecutar()`, extrae `{ resultado, entidadId, antes, despues }` mediante selectores o estructura retornada, llama a `auditoria.registrar(ctx, { accion, entidad, entidadId, antes, despues, ip })` y retorna `resultado`.
- `conAuditoriaDeLecturaPaciente<T>(auditoria, ctx, opciones: { pacienteId, ip? }, consultar): Promise<T | null | undefined>`: ejecuta `consultar()`. Si retorna `null` o `undefined`, no audita y retorna ese valor; si retorna la ficha, llama a `auditoria.registrar(ctx, { accion: 'lectura_ficha', entidad: 'paciente', entidadId: pacienteId, antes: null, despues: null, ip })` y recién entonces retorna la ficha.
- `conAuditoriaDeExportacion<T>(auditoria, ctx, opciones, exportar): Promise<T>`: ejecuta `exportar()`, registra `{ accion: 'exportacion', entidad: 'exportacion', entidadId, antes: null, despues: metadatos, ip }` y retorna el resultado.

Consumidores posteriores en el roadmap:

| Change | Hook / Uso | Qué audita |
|---|---|---|
| `C-08` | `conAuditoriaDeCambio` | Cambios de configuración, profesionales, horarios, sillones, prestaciones y feriados |
| `C-09` | `conAuditoriaDeCambio` | Creación, confirmación, cancelación, reprogramación, atención y ausentismo de turnos |
| `C-10` | `conAuditoriaDeCambio` + `conAuditoriaDeLecturaPaciente` | Alta/edición de pacientes y cada lectura de ficha (`RN-AU-03`) |
| `C-12` | `conAuditoriaDeCambio` | Alta y baja de bloqueos de agenda |
| `C-15` | `conAuditoriaDeCambio` | Reserva pública y confirmación/cancelación por enlace (`actor_tipo = 'paciente_enlace'`) |
| `C-16` | `conAuditoriaDeExportacion` + consulta SQL sobre índices de `C07_001` | Exportaciones (`RN-DA-04`) y listado filtrado en `GET /auditoria` |

- *Política fail-closed*: en cumplimiento de `RN-AU-02`, `RN-AU-03` y `DD-06`, si la auditoría falla después de la operación de dominio o lectura, el hook propaga el error para provocar `ROLLBACK` en `withTenant` y evitar confirmar cambios o entregar fichas/exportaciones sin rastro.

### D8. Serialización `jsonb`, lectura de `inet`/`bigint` y traducción segura de errores
- En el `INSERT` parametrizado:
  - `datos_antes` y `datos_despues`: si son `null` se pasa `null`; si no, `JSON.stringify(datosEnmascarados)` casteado con `$n::jsonb` (evita ambigüedades de `pg` al serializar arreglos o escalares JSON).
  - `RETURNING id::text AS id, clinica_id, ocurrio_en, actor_tipo, actor_id, accion, entidad, entidad_id, datos_antes, datos_despues, host(ip) AS ip` (`id::text` evita pérdida de precisión de `bigint`; `host(ip)` evita el sufijo `/32` de `inet::text`).
- En `src/infrastructure/audit/errores.ts`: si PostgreSQL rechaza el `INSERT`, se mapea por `code`/`constraint` (`42501` → `ErrorDeDominio('AUDITORIA_CONTEXTO_INVALIDO', 'prohibido', ...)`, `23514` → `ErrorDeDominio('DATOS_INVALIDOS', 'solicitud_invalida', ...)`, `23503` → `ErrorDeDominio('RECURSO_NO_ENCONTRADO', 'no_encontrado', ...)`), o `ErrorDeAuditoriaPersistencia(sqlstate, constraint)` con mensaje fijo, sin copiar `error.detail` ni `cause`.

### D9. Estrategia de pruebas unitarias y de integración
- **Unitarias (`test/unit/auditoria/**`)**: sin base de datos; cubren enmascaramiento (incluyendo `fast-check` sobre invariantes de no-filtración de PII/secretos y no-mutación), validaciones de entrada para los 3 actores y formatos IP, y comportamiento de los 3 hooks ante éxito, fallo del caso de uso, paciente inexistente y fallo de repositorio.
- **Integración (`test/integration/auditoria/**`)**: contra PostgreSQL real usando `test/support/base-de-datos.ts` y `test/support/aislamiento.ts`:
  - `beforeAll`: `reiniciarEsquema` + `aplicarMigraciones` sobre `migrations/` real + alta de `CLINICA_A` y `CLINICA_B`.
  - **Nota operativa**: a diferencia de `C-05`, las pruebas de integración de `auditoria` **no pueden usar `TRUNCATE auditoria`** en `beforeEach` porque el trigger `auditoria_inmutable` lo prohíbe incluso para `migra`. Cada prueba usa identificadores sintéticos únicos o transacciones independientes (y `reiniciarEsquema` solo en `beforeAll` si hace falta reiniciar el esquema entero).
  - Cubren: esquema/índices/propiedad (`migra` dueño, `app` con `SELECT, INSERT`), compatibilidad literal con el `INSERT` de `C-17`, doble barrera (`app` `42501` y `migra` `P0001` en `UPDATE`/`DELETE` con y sin filas/`TRUNCATE`), aislamiento multi-tenant (`CLINICA_A`, `CLINICA_B`, sin contexto), persistencia transaccional y rollback atómico junto con otra tabla, y no filtración de PII en errores.

## Risks / Trade-offs

- **[Enmascaramiento global de `nombre` sobre catálogos no personales]** → si en el futuro se audita un cambio sobre `sillon` o `prestacion` pasando `{ nombre: 'Sillón 1' }`, un matcher global por clave `nombre` lo redactará como `[REDACTADO]`. Mitigación: consultar en Q1 con el líder si se prefiere el criterio conservador alineado con `log-redaction` de C-01 (propuesto) o un enmascaramiento sensible a contexto para catálogos.
- **[Alto volumen de escrituras por auditoría de lecturas (`RN-AU-03`)]** → aceptado en `DD-05`; mitigado con índices específicos para `C-16` y particionado/retención evaluable en `C-20` (`PO-10`).
- **[Tests de integración imposibilitados de truncar `auditoria`]** → mitigado diseñando casos independientes por ID/entidad o reiniciando el esquema en `beforeAll`.
- **[Limitación de `entidad_id` a tipo `uuid` (`Q2`)]** → todas las entidades de negocio definidas en `04_modelo_de_datos.md` usan clave primaria `uuid`, por lo que `entidad_id uuid` cubre la operación actual y la compatibilidad literal con `C-17`. Si un cambio futuro necesitara auditar una entidad sin UUID (p. ej. un lote con ID compuesto), requerirá `C07_002` o pasar el detalle en `datos_despues`.
- **[Desalineación accidental entre `withTenant` y el repositorio de auditoría]** → si un caso de uso futuro instanciara auditoría con otro `EjecutorSql` fuera de su transacción, perdería atomicidad. Mitigación: `crearRepositorioAuditoriaPg` exige explícitamente el `EjecutorSql` transaccional y `C-07` prueba la reversión conjunta ante `ROLLBACK`.

## Migration Plan

1. Precondición verificada: `migrations/C03_001_tenant_rls.sql`, `C05_001` y `C06_001` ya están presentes; los roles `migra` y `app` están inicializados por `docker/postgres/init/01-roles.sql`.
2. Agregar `migrations/C07_001_auditoria.sql` y aplicarla con `npm run db:migrate` (ejecutado con `DATABASE_MIGRATION_URL` / rol `migra`).
3. Verificar con `npm run test:integration` contra PostgreSQL real (`_test`).
4. **Rollback** (solo en entornos de desarrollo/pruebas antes de fusionar a `main`): con el rol `migra`, ejecutar `DROP TRIGGER IF EXISTS auditoria_inmutable ON auditoria; DROP FUNCTION IF EXISTS impedir_mutacion_auditoria(); DROP TABLE IF EXISTS auditoria;` y eliminar la fila `'C07_001_auditoria.sql'` de `schema_migrations`. Una vez fusionada la migración, permanece inmutable (Regla 6).

## Open Questions

Por gobernanza **CRÍTICO** (`CHANGES.md`), el líder debe revisar y aprobar estas decisiones antes de iniciar `/opsx:apply`:

1. **Q1 — Alcance del enmascaramiento sobre `nombre` y `apellido`**: ¿mantenemos el enmascaramiento global de `nombre`/`apellido` en todo `datos_antes`/`datos_despues` (máxima seguridad, alineado con `openspec/specs/log-redaction/spec.md` de C-01), o se prefiere redactar `nombre`/`apellido` únicamente cuando `entidad` sea `paciente`/`usuario` o dentro de subobjetos de persona para conservar nombres de sillones/prestaciones en `GET /auditoria` (`C-16`)?
2. **Q2 — Tipo de `entidad_id`**: ¿se aprueba `text` nullable (compatible con UUIDs, la inserción de `C-17` y futuros IDs no-UUID o numéricos como `auditoria.id` en exportaciones) frente a `uuid` nullable?
3. **Q3 — `ip` opcional sin modificar el contrato congelado `RequestContext`**: ¿se aprueba recibir `ip` opcional en `EntradaAuditoria` (`ip inet` nullable en PostgreSQL) para mantener intacto `src/application/shared/request-context.ts`?
4. **Q4 — Bloqueo de `TRUNCATE` en el trigger**: ¿se aprueba incluir `TRUNCATE` además de `UPDATE` y `DELETE` en el trigger `BEFORE UPDATE OR DELETE OR TRUNCATE FOR EACH STATEMENT` (recordando que en tests de integración no podrá usarse `TRUNCATE auditoria`)?
5. **Q5 — Política *fail-closed* de los hooks**: ¿se confirma que todo fallo al insertar auditoría en `conAuditoriaDeCambio`, `conAuditoriaDeLecturaPaciente` y `conAuditoriaDeExportacion` propague el error (revirtiendo la transacción e impidiendo entregar ficha/exportación sin auditoría)?
6. **Q6 — Zona de pruebas en `test/{unit,integration}/auditoria/**`**: ¿se confirma crear las pruebas unitarias y de integración en esas carpetas de `C-07` sin modificar `test/support/**`?

## Resoluciones del apply

Aprobadas por la Líder en el review del PR #11 (2026-11-24):

- **Q1**: Aprobado el enmascaramiento global de `nombre`/`apellido` en todo `datos_antes`/`datos_despues` (alineado con `log-redaction` de `C-01` y máxima seguridad Ley 25.326).
- **Q2 (ajustado tras hallazgo en PG 17)**: La Líder aprobó revertir `entidad_id` de `text` nullable a **`uuid` nullable** para compatibilidad literal con la sentencia de `C-17` (`VALUES ($1, ..., $1)`) sin modificar archivos de `C-17`, y mantener el orden corregido de `auditoria_actor_id_check` (`actor_tipo = 'sistema' ... OR actor_tipo <> 'sistema' ...`).
- **Q3**: Aprobado `ip` (`inet` nullable) opcional en `EntradaAuditoria` sin modificar el contrato congelado `RequestContext`.
- **Q4**: Aprobado incluir `TRUNCATE` en el trigger `BEFORE UPDATE OR DELETE OR TRUNCATE FOR EACH STATEMENT`; en pruebas de integración se usa aislamiento por clínica nueva sintética en lugar de `TRUNCATE auditoria`.
- **Q5**: Confirmada la política *fail-closed* en los tres hooks (revertir la transacción y bloquear entregas ante fallo de auditoría).
- **Q6**: Confirmada la zona de pruebas en `test/{unit,integration}/auditoria/**` sin modificar `test/support/**`.
