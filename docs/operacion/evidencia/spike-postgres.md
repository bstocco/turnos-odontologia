# Spike de PostgreSQL gestionado (Fly.io) — evidencia

> Change `c-20-despliegue-paas-y-operacion`, grupo 1. Entorno: `pruebas` (solo datos sintéticos).
> Sin credenciales ni URLs de conexión en este documento.

## 1.1 Cluster de `pruebas`

Fuente: lo que muestra el panel de Fly.io, transcripto por la Líder. Fecha del registro: 2026-11-25.

| Dato | Valor observado |
|---|---|
| Nombre del cluster | `turnos-pruebas-db` |
| Región | `gru` (São Paulo) |
| Versión de PostgreSQL | 17 |
| Plan | Developer |
| Precio | USD 4 por mes, con almacenamiento incluido (10 GB) |
| Red | Private |
| Pooling | Deshabilitado |

### Backups (`Q2`)

| Dato | Valor observado |
|---|---|
| Backup automático inicial | Sí: el panel hizo un backup **Full** al crear el cluster (32 MB) |
| Backups manuales | Disponibles desde el panel |
| Point-in-time restore | **No disponible** en el plan Developer |
| Frecuencia de los backups automáticos | **Sin verificar**: el panel no la muestra |
| Retención de los backups | **Sin verificar**: el panel no la muestra |

**Estado de `Q2`: abierta.** La ventana de recuperación efectiva no está confirmada. Sin PITR, el punto de recuperación es el último backup completo. Hay que confirmar frecuencia y retención con la documentación oficial o con el soporte de Fly antes de la tarea 4.1 y de operar con datos reales.

### Precio (`Q6`)

El plan Developer cuesta USD 4/mes según el panel. El plan definitivo de `produccion` (Developer u otro, dado que no ofrece PITR) queda por decidir y confirmar con el calculador de Fly.

## 1.2 y 1.3: resultado en Fly — falla en las migraciones

Fecha: 2026-11-25. Preparación hecha desde el panel de Fly: extensión `btree_gist` habilitada en la base `fly-db`, usuarios `migra` (rol `Schema Admin`) y `app` (rol `Writer`) creados. Acceso por túnel `fly mpg proxy`.

`npm run db:migrate` con el rol `migra` falló en `migrations/C03_001_tenant_rls.sql` y la transacción se revirtió completa:

```
MPG system roles cannot be modified
```

Para aislar la sentencia se ejecutó cada una de las 7 sentencias de `C03_001` con `SAVEPOINT` dentro de una transacción que siempre termina en `ROLLBACK` (sin modificar la base). El error proviene de la función `fly_mpg_utils_process_utility` (hook de DDL del Managed Postgres de Fly).

| # | Sentencia | Resultado |
|---|---|---|
| 1 | `CREATE EXTENSION IF NOT EXISTS btree_gist;` | OK |
| 2 | `CREATE OR REPLACE FUNCTION aplicar_rls(tabla text) ...` | OK |
| 3 | `CREATE TABLE clinica (...)` | OK |
| 4 | `CREATE TABLE clinica_config (...)` | OK |
| **5** | **`GRANT USAGE ON SCHEMA public TO app;`** | **FALLA: "MPG system roles cannot be modified"** |
| **6** | **`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE clinica, clinica_config TO app;`** | **FALLA: "MPG system roles cannot be modified"** |
| 7 | `SELECT aplicar_rls('clinica_config');` (incluye `CREATE POLICY ... TO app`) | OK |

**Conclusión**: Fly trata a los roles creados desde el panel (`app`) como roles de sistema y rechaza todo `GRANT` hacia ellos. Las migraciones otorgan privilegios a `app` en `C03_001` y siguientes (p. ej. `C06_002`), no pueden editarse (regla 6) y esos privilegios son parte del aislamiento (mínimo privilegio). Por eso el gate `Q1(c)` de `design.md` **no se supera**.

**Decisión de la Líder (2026-11-25)**: activar el Plan B del diseño: base en **Neon `aws-sa-east-1`**, aplicación en Fly `gru`. Registrada en `design.md` (D1, D5, Q1).

Sin resolver sobre Fly (no se investigó, ya no bloquea): si existe otra vía para crear `app` sin que figure como rol de sistema.

## Pendiente

- 1.1: hecha, queda como evidencia del intento en Fly. El cluster `turnos-pruebas-db` de Fly queda sin uso; su baja la decide la Líder tras verificar Neon.
- 1.2 a 1.4: se rehacen sobre Neon (roles por SQL, `turnos` y `turnos_test`, migraciones, pruebas, worker con conexión directa). La evidencia de Neon se agrega abajo.
- `Q2` (retención de backups) y `Q6` (precio): se reabren para el plan de Neon.
- 1.5: decisión tomada (Plan B).

## Neon (Plan B)

### Proyecto de `pruebas`

Fuente: lo que muestra el panel de Neon, transcripto por la Líder. Fecha del registro: 2026-11-25.

| Dato | Valor observado |
|---|---|
| Plan | Free |
| Precio | USD 0 por mes |
| Región | `aws-sa-east-1` (São Paulo) |

### Backups (`Q2`)

| Dato | Valor observado |
|---|---|
| Restauración desde historial | Ventana de **6 horas** |
| Snapshots manuales | Disponibles |
| Snapshots programados | **Requieren un plan pago** |

**Estado de `Q2` para Neon: respondida para el plan Free, y no alcanza.**
- Con el plan Free, la recuperación automática cubre solo las últimas 6 horas, y cualquier punto más viejo depende de snapshots manuales que alguien tiene que acordarse de tomar.
- La política de retención propuesta en D7 de `design.md` (copias con ventana objetivo de hasta 30 días, y datos de clínicas dadas de baja eliminados a los 90 días más la ventana de copias) **no se puede cumplir con el plan Free**. Hace falta un plan pago con snapshots programados o con una ventana de historial mayor, o mantener snapshots manuales con un procedimiento y un responsable.
- Para `pruebas`, con datos sintéticos, el plan Free es suficiente. Para `produccion` hay que elegir el plan antes de cargar datos reales y confirmar su precio (`Q6`) y su ventana en el panel o en la documentación de Neon, citando fecha y fuente en `docs/operacion/respaldo.md` (tarea 4.1).
- La ventana exacta de un plan pago no está verificada: no se asume ningún valor.

### 1.2 Roles y bases — verificada (2026-11-25)

Resultado informado por la Líder tras correr el aprovisionamiento y `verificar-roles.mjs` (sin credenciales):
- Roles `migra` y `app` creados por SQL: sin superusuario y sin `BYPASSRLS`.
- Esquema `public` de `turnos` propiedad de `migra`; `app` con `USAGE` y sin `CREATE`.
- `npm run db:migrate` aplicó las 13 migraciones sobre `turnos` (incluidas `C03_001` y las que otorgan privilegios a `app`, que en Fly fallaban).

### 1.3 Resultado parcial: una prueba de integración falla en Neon (2026-11-25)

- `npm run db:migrate` aplicó las 13 migraciones sobre `turnos`.
- `npm run test:integration` contra `turnos_test` en Neon: **516 pruebas en 52 archivos, 515 pasan y 1 falla** (51 de 52 archivos pasan). Las pruebas de exclusión por solapamiento, de aislamiento (RLS) y de `auditoria` append-only no figuran entre las fallidas (según lo informado por la Líder).
- Prueba fallida: `test/integration/pacientes/busqueda-api.test.ts`, "GET /pacientes por apellido sin tildes ni mayúsculas".
  - Esperado (DNI): `['34000001', '34000003', '34000002']`, es decir `Gómez` < `Gomez Ajeno` < `Gomez Propio`.
  - Recibido: `['34000003', '34000002', '34000001']`, es decir `Gomez Ajeno` < `Gomez Propio` < `Gómez`.

**Análisis (sin modificar tests ni código):**
- El filtro de la búsqueda no depende de la colación: normaliza con `translate(lower(...), 'áéíóúü', 'aeiouu')` (`src/infrastructure/db/repositories/paciente/index.ts`). Lo que cambia es el **orden**, que viene de `ORDER BY apellido, nombre, id` con la colación de la base.
- El orden recibido es el orden por bytes (`'ó'` va después de los caracteres ASCII, incluido el espacio): corresponde a una colación tipo `C`/`C.UTF-8`. El esperado es el de una colación de idioma (`en_US.utf8` en la imagen `postgres:17` de `docker-compose.yml` y de CI). Ni `docker/postgres/init/01-roles.sql` ni las migraciones fijan colación: las bases `turnos` y `turnos_test` heredan la de `template1` del servidor.
- **Hipótesis (sin confirmar hasta correr `comparar-collation.mjs`)**: las bases creadas en Neon heredan una colación distinta de la local. Si se confirma, es una **diferencia de entorno** con **impacto de producto**: el código no es incorrecto, pero en `produccion` los listados ordenados por texto (pacientes, profesionales, sillones, prestaciones) saldrían en orden por bytes, con mayúsculas antes que minúsculas y acentuadas después de la `Z`. No afecta al aislamiento, a la integridad ni a la exclusión de solapamientos.
- Otras consultas con `ORDER BY` sobre texto comparten el riesgo: `paciente`, `profesional`, `sillon`, `prestacion` y un listado de nombres en `src/`.

**Causa confirmada (2026-11-25, informado por la Líder tras correr `comparar-collation.mjs`):** las bases `turnos` y `turnos_test` creadas en Neon usan colación **`C.UTF-8` con proveedor `builtin`** (orden por bytes), distinta de la local (`en_US.utf8`). Es una **diferencia de entorno** y no un defecto de la lógica; su efecto es el orden de los listados por texto. Neon ofrece la colación ICU `es-AR-x-icu`.

**Decisión de la Líder: opción A.** Recrear `turnos` y `turnos_test` con `TEMPLATE template0`, `LOCALE_PROVIDER icu` e `ICU_LOCALE 'es-AR'`, propiedad de `migra` (eran solo datos sintéticos). La colación no se puede cambiar después de crear la base, por eso se recrean. Queda dentro de la zona de C-20 (solo aprovisionamiento).
- **Forma parte del aprovisionamiento de `produccion` (tarea 6.3):** esa base se crea desde el principio con la misma colación; no hay nada que eliminar.
- Sentencia de creación: `CREATE DATABASE "<base>" OWNER migra TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'es-AR'`.
- El script de aprovisionamiento solo elimina una base existente si su colación no es ICU `es-AR` y se confirma con `CONFIRMAR_BORRADO=SI`; si ya es correcta, la conserva.

**Mejora propuesta para el change correctivo aparte (opción B, no se hace en C-20):** fijar la colación en el código de las consultas con `ORDER BY` sobre texto (por ejemplo `ORDER BY apellido COLLATE "es-AR-x-icu"` en pacientes, profesionales, sillones y prestaciones), para que el orden no dependa de la colación con que se creó la base. Implica tocar código de otros changes y verificar que la colación exista en cada servidor.

Estado de la tarea 1.3: **pendiente** hasta repetir `db:migrate` y `test:integration` sobre las bases recreadas.

### Pendiente en Neon

- 1.3: pruebas de integración y aislamiento sobre `turnos_test` en curso (367 pasadas y 0 fallidas al momento del aviso); falta el resumen final.
- 1.3 (original): migraciones sobre `turnos` y pruebas de integración y aislamiento sobre `turnos_test`.
- 1.4: worker con conexión directa (host sin `-pooler`).
- `Q6`: precio del plan de `produccion`.
