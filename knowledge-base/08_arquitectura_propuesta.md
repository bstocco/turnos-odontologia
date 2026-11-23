# Arquitectura Propuesta

Prioridades de calidad (Q5): **1) seguridad de datos, 2) mantenibilidad**. Costo bajo es una restricción. La velocidad de entrega queda en tercer lugar, dentro del plazo de 8 a 12 semanas.

## Patrones aplicados

| Patrón | Dónde se usa | Por qué |
|---|---|---|
| Monolito modular, arquitectura hexagonal | Todo el backend | Un solo despliegue barato; dominio testeable sin infraestructura (DD-08, propuesto) |
| Dominio puro | `src/domain` | La regla de solapamiento se prueba sin base de datos ni red |
| Intervalos semiabiertos `[inicio, fin)` | Dominio y base | Elimina el caso borde "termina a las 10:00, empieza a las 10:00" |
| Constraint de exclusión (`btree_gist`) | `turno` | Garantía final contra reservas concurrentes (DD-02) |
| Row-Level Security | Todas las tablas con `clinica_id` | El aislamiento entre clínicas lo hace respetar la base (DD-01) |
| Auditoría append-only | `auditoria` | Trazabilidad y Ley 25.326 (DD-05) |
| Token de acción de un solo uso | Enlaces del paciente | Paciente sin cuenta, superficie pública mínima (DD-03) |
| Cola de tareas sobre PostgreSQL | Emails y recordatorios | Evita sumar Redis y su costo (DD-09, propuesto) |
| Puertos y adaptadores | Email, reloj, cola | Permite probar y cambiar proveedores |

## Estructura de directorios (propuesta)

```
turnos-odontologia/
├── src/
│   ├── domain/                  # TypeScript puro, sin I/O
│   │   ├── agenda/              # intervalo, disponibilidad, reglas de solapamiento
│   │   ├── turno/               # estados y transiciones
│   │   └── shared/              # errores de dominio, tipos
│   ├── application/             # casos de uso: agendar, cancelar, reprogramar, reservar...
│   ├── infrastructure/
│   │   ├── db/                  # acceso a PostgreSQL, transacciones, contexto de tenant
│   │   ├── email/               # adaptador del proveedor de email
│   │   ├── queue/               # cola y workers
│   │   └── auth/                # JWT, hash de contraseñas, tokens de acción
│   └── interfaces/
│       └── http/                # rutas, esquemas de validación, manejo de errores
├── migrations/                  # SQL versionado: tablas, exclusión, RLS, triggers
├── seeds/                       # SOLO datos sintéticos
├── test/
│   ├── unit/                    # dominio
│   ├── integration/             # PostgreSQL real: exclusión, RLS, auditoría
│   └── api/                     # contratos de la API
├── knowledge-base/
├── docs/
└── openspec/
```

## Seguridad

**Autenticación**
- Personal: JWT de acceso corto más refresco rotativo. Contraseñas con argon2id. **Suposición:** vigencias y rotación se definen en la change de autenticación.
- Paciente: sin cuenta; tokens aleatorios de 256 bits de un solo uso, atados a turno y propósito. Solo se guarda el SHA-256.
- Reserva pública: código por email (propuesto, PO-02) y límite de tasa por IP y por email.

**Autorización**
- RBAC según `03_actores_y_roles.md`, verificado en la capa de aplicación.
- **Aislamiento multi-tenant en la base (Q1 = a):** `clinica_id` en cada tabla, Row-Level Security activada y **forzada** (`FORCE ROW LEVEL SECURITY`) con la política `clinica_id = current_setting('app.clinica_id')::uuid`.
  - El contexto se fija por transacción con `SET LOCAL`, nunca por conexión, para evitar fugas entre pedidos cuando se reutilizan conexiones.
  - El rol de la aplicación **no** es propietario de las tablas, no es superusuario y no tiene `BYPASSRLS`. Las migraciones usan otro rol.
  - La tabla `clinica` se consulta por `slug` mediante una función `SECURITY DEFINER` de alcance mínimo, para las rutas públicas.

**No solapamiento (Q2 = a)**
- Validación en el dominio más constraints de exclusión de PostgreSQL por profesional y por sillón (ver `04_modelo_de_datos.md`).
- Un error `23P01` (violación de exclusión) o `40P01` (deadlock entre reservas concurrentes del mismo hueco) se traduce a `409` con código de dominio.
- Para la reserva pública, si el sillón elegido falla por concurrencia, se reintenta con el siguiente sillón libre antes de responder `409`.

**Validación de entrada:** esquemas explícitos en el borde HTTP; el dominio revalida invariantes. Consultas parametrizadas siempre.

**Secretos:** variables de entorno gestionadas por el PaaS; nunca en el repositorio ni en los logs.

**Datos personales (Ley 25.326)**
- No se registran datos de pacientes en logs de aplicación.
- La auditoría registra lecturas de fichas y exportaciones.
- Sin datos reales fuera de producción (RN-DA-01, RN-DA-02).
- Cifrado en tránsito (HTTPS) y copias de seguridad del PostgreSQL gestionado.
- **A validar con asesoría legal:** el alojamiento en un PaaS fuera de Argentina puede implicar una transferencia internacional de datos personales (ver PO-03).

**Tiempo:** instantes en `timestamptz` UTC. Horarios y feriados se interpretan en la zona IANA de la clínica con una biblioteca de zonas horarias; no se calculan con desplazamientos fijos.

## Estrategia de pruebas

| Nivel | Qué prueba | Herramienta |
|---|---|---|
| Unitarias de dominio | Solapamientos, borde `fin = inicio`, buffer, estados, disponibilidad | Vitest (propuesto) |
| Propiedades (propuesto) | Para cualquier conjunto de turnos aceptados, ninguno se solapa | Pruebas basadas en propiedades |
| Integración con PostgreSQL real | Constraints de exclusión, RLS (clínica A no ve la B), auditoría append-only, concurrencia | Base real en CI |
| API | Contratos, códigos de error, permisos por rol | Vitest sobre la aplicación HTTP |

Los datos de prueba son siempre sintéticos.

## Observabilidad y operación

- Logs estructurados sin datos de pacientes.
- Endpoint `GET /salud` para el chequeo del PaaS.
- Copias de seguridad automáticas del PostgreSQL gestionado; la política de retención queda abierta (PO-10).

## Variables de entorno

| Variable | Descripción | Ejemplo | Sensible |
|---|---|---|---|
| `NODE_ENV` | Entorno de ejecución | `production` | N |
| `PORT` | Puerto HTTP | `3000` | N |
| `DATABASE_URL` | Conexión del rol de la aplicación (sin `BYPASSRLS`) | `postgres://app:***@host/db` | **S** |
| `DATABASE_MIGRATION_URL` | Conexión del rol de migraciones | `postgres://migra:***@host/db` | **S** |
| `JWT_ACCESS_SECRET` | Firma del token de acceso | (aleatorio largo) | **S** |
| `JWT_REFRESH_SECRET` | Firma del token de refresco | (aleatorio largo) | **S** |
| `EMAIL_API_KEY` | Clave del proveedor de email | `re_***` | **S** |
| `EMAIL_FROM` | Remitente | `turnos@clinica.example` | N |
| `PUBLIC_BASE_URL` | Base de los enlaces de los emails | `https://api.example` | N |
| `DEFAULT_TIMEZONE` | Zona horaria por defecto de una clínica nueva | `America/Argentina/Buenos_Aires` | N |
| `RATE_LIMIT_PUBLIC` | Límite de pedidos de las rutas públicas | `30/min` | N |
| `ALLOW_SEED` | Habilita el seed (nunca en producción) | `false` | N |

## Integración continua y trabajo en equipo

- **Propuesto:** una canalización que ejecute pruebas unitarias, de integración (con un PostgreSQL de servicio) y chequeos de tipos y estilo en cada rama.
- Cuatro personas: una lidera la fundación y tres implementan en ramas separadas. Los *changes* siguen el flujo OpenSpec (`openspec/`).
- El *team-mode* de la fundación quedó omitido; se puede activar luego para generar `CODEOWNERS` y la plantilla de PR.
