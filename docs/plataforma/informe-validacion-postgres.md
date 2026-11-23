# Informe de validación de PostgreSQL (spike R-04 y R-05)

**Change:** `c-01-foundation-setup` · **Fecha:** 2026-11-22
**Pruebas:** `test/integration/platform/postgres.test.ts` (18 pruebas) · **Comando:** `npm run test:integration`

Este informe dice **qué se verificó, en qué entorno y qué no se verificó**. Un entorno que no se probó figura como "no verificado" y no se extrapola a partir de otro.

## Entornos

| Entorno | Estado | Detalle |
|---|---|---|
| **Local (esta máquina)** | **Verificado** el 2026-11-22 | PostgreSQL **17.12** (`x86_64-windows`, compilación MSVC) embebido, ejecutado fuera del repositorio. Roles `migra` y `app` creados con `docker/postgres/init/01-roles.sql`. Resultado: **32 de 32** pruebas de integración en verde (18 del spike y 14 del runner de migraciones). |
| **Integración continua (GitHub Actions)** | **No verificado** | El flujo `.github/workflows/ci.yml` está escrito y su YAML es válido, pero no se ejecutó: el repositorio no tiene remoto configurado. |
| **Imagen `postgres:17` de Docker** | **No verificado** | No hay Docker en la máquina del Líder. Se espera el mismo comportamiento que el local (misma versión mayor), pero no se comprobó. |
| **`sa-east-1` (PaaS gestionado)** | **No verificado** | No se crearon cuentas ni recursos en la nube; requiere aprobación explícita del Líder. Ver "Pendientes". |

> El PostgreSQL local es una compilación embebida para pruebas. No equivale a un servicio gestionado: los permisos de la extensión, la versión y los parámetros pueden diferir.

## Resultados

### R-05: extensión `btree_gist`
- **Resultado:** el rol de migraciones (`migra`, **sin** superusuario) crea la extensión con `CREATE EXTENSION btree_gist`. Es una extensión "de confianza": un propietario de la base puede crearla.
- **Alcance:** verificado solo en el entorno local. En un PaaS gestionado hay que repetir la comprobación, porque algunos proveedores restringen las extensiones.

### Restricciones de exclusión (RN-AG-01, RN-AG-02, RN-AG-03, RN-AG-05)
| Caso | Resultado |
|---|---|
| Solape del mismo profesional (otro sillón) | Rechazado: error `23P01`, restricción `turno_sin_solape_profesional` |
| Solape del mismo sillón (otro profesional) | Rechazado: error `23P01`, restricción `turno_sin_solape_sillon` |
| Rangos contiguos (termina a las 10:00, el siguiente empieza a las 10:00) | Aceptado, con intervalos `[inicio, fin)` |
| Buffer de limpieza: otro profesional en el mismo sillón durante el buffer | Rechazado por la restricción del sillón |
| Buffer de limpieza: el mismo profesional en otro sillón durante el buffer | **Aceptado**: el buffer no bloquea al profesional |
| Sillón libre justo al terminar el buffer (10:45) | Aceptado |
| Turno `cancelado` o `reprogramado` | Libera el horario |
| Dos clínicas con los mismos ids de profesional y sillón | No chocan (la clave incluye `clinica_id`) |
| Dos inserciones concurrentes sobre el mismo hueco | Gana una sola; la otra recibe `23P01` **o `40P01`** (deadlock, tras `deadlock_timeout`, 1 s por defecto). Lo observó CI el 2026-11-22; en local salió `23P01` |

**Hallazgo útil para C-09:** las columnas de rango pueden ser **generadas** (`tstzrange(inicio, fin, '[)')` es inmutable y PostgreSQL las acepta). Solo `fin_sillon` no puede serlo (ver abajo).

### R-04: `fin_sillon`
- **`timestamptz + interval` es `STABLE`** (`provolatile = 's'` en `timestamptz_pl_interval`), no `IMMUTABLE`.
- **PostgreSQL rechaza** una columna generada con `fin + make_interval(mins => buffer_minutos)`: error **`42P17`** (`invalid_object_definition`, expresión de generación no inmutable).
- **Decisión:** `fin_sillon` es una **columna común** que calcula la aplicación, con un `CHECK (fin_sillon = fin + make_interval(mins => buffer_minutos))`. Un `CHECK` sí admite expresiones estables. La prueba confirma que acepta un valor coherente y rechaza uno incoherente (error `23514`, restricción `fin_sillon_coherente`).
- **Para C-09:** el `CHECK` verifica la coherencia entre `fin`, `buffer_minutos` y `fin_sillon`, pero no la calcula. La aplicación debe escribirlos juntos.

### R-05: Row-Level Security forzada
| Caso | Resultado |
|---|---|
| El rol `app` | Sin superusuario, sin `BYPASSRLS` y no propietario de la tabla |
| Con contexto de la clínica A | Inserta y ve solo sus filas (B ve las suyas) |
| **Sin contexto** | **No ve ninguna fila** (falla cerrada) |
| Contexto de una transacción anterior en la misma conexión | No se filtra: la consulta siguiente ve 0 filas y no da error |
| La clínica A inserta una fila de la clínica B | Rechazado: `42501` (viola la política) |
| El propietario (`migra`) sin contexto, con `FORCE ROW LEVEL SECURITY` | **También ve 0 filas** |

## Hallazgos que afectan a otros changes

1. **Forma de la política (C-03).** Usar `current_setting('app.clinica_id', true)` con `NULLIF(..., '')`:
   ```sql
   USING (clinica_id = NULLIF(current_setting('app.clinica_id', true), '')::uuid)
   ```
   Sin `missing_ok = true`, una consulta sin contexto falla con error en vez de devolver cero filas. Sin `NULLIF`, una conexión que ya ejecutó un `SET LOCAL` queda con el parámetro vacío y la conversión a `uuid` falla.
2. **Fijar el contexto (C-03).** `SELECT set_config('app.clinica_id', $1, true)` acepta parámetros y su efecto termina con la transacción (el tercer argumento `true` equivale a `SET LOCAL`).
3. **`FORCE ROW LEVEL SECURITY` también alcanza al propietario (C-03, C-05, C-17).** Una migración que cargue o transforme datos de tablas de clínica con el rol `migra` verá cero filas si no fija el contexto. Los seeds y las migraciones de datos deben fijar `app.clinica_id` o planificarse de otra forma.
4. **Concurrencia (C-09).** Los errores `23P01` (violación de exclusión) y `40P01` (deadlock entre dos reservas concurrentes del mismo hueco, que PostgreSQL resuelve tras `deadlock_timeout`) son la señal de "hueco ocupado": el caso de uso debe tratar ambos igual y traducirlos a `TURNO_SOLAPADO_PROFESIONAL` o `TURNO_SOLAPADO_SILLON` (`409`) y, en la reserva pública, reintentar con el siguiente sillón libre.

## Pendientes

- Ejecutar el flujo de CI en un repositorio remoto y registrar acá el enlace de la ejecución.
- Verificar `btree_gist` y RLS en el PostgreSQL gestionado de la región elegida. **Requiere aprobación del Líder** para crear cuentas o recursos.
- Confirmar con asesoría legal la base de la transferencia de datos a `sa-east-1` (ver `knowledge-base/10_preguntas_abiertas.md`, PO-03).
