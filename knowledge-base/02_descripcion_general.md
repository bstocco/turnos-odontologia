# Descripción General

## Stack tecnológico

| Capa | Tecnología | Estado |
|---|---|---|
| Lenguaje y runtime | TypeScript sobre Node.js | **Definido** (restricción del proyecto) |
| API | REST sobre HTTP, con Fastify | **Decidido** (DD-08): Fastify |
| Base de datos | PostgreSQL con `btree_gist` y Row-Level Security | **Definido** (PostgreSQL); extensión y RLS por decisión de arquitectura (DD-01, DD-02) |
| Pruebas | Vitest o Jest | **Decidido** (DD-08): Vitest |
| Acceso a datos | SQL explícito con migraciones versionadas | **Decidido** (DD-08): los constraints de exclusión y las políticas RLS requieren SQL, no se expresan en un ORM típico |
| Cola de tareas | Cola sobre PostgreSQL (por ejemplo pg-boss) | **Decidido** (DD-09): pg-boss; evita sumar Redis y su costo |
| Email | Resend o Brevo | **Opción elegida (Q4=a)**; proveedor concreto a decidir |
| Hosting | PaaS económico (Railway, Render o Fly.io) con PostgreSQL gestionado | **Opción elegida (Q4=a)**; proveedor concreto a decidir |

La versión mínima de cada componente se fija al crear el proyecto (primer change de infraestructura).

## Arquitectura general

**Monolito modular con dominio puro (arquitectura hexagonal)**: un solo despliegue, bajo costo y límites claros entre capas. Decidido (DD-08); ver DD-08 y `08_arquitectura_propuesta.md`.

```
 Clientes (Postman / futuros frontends / enlaces en emails y WhatsApp)
                │  HTTPS
                ▼
 ┌─────────────────────────────────────────────────────────┐
 │  interfaces/http  (Fastify: rutas, validación, auth)     │
 ├─────────────────────────────────────────────────────────┤
 │  application      (casos de uso: agendar, cancelar, ...) │
 ├─────────────────────────────────────────────────────────┤
 │  domain           (TypeScript puro, sin I/O)             │
 │    intervalos, reglas de solapamiento, disponibilidad,   │
 │    estados del turno                                     │
 ├─────────────────────────────────────────────────────────┤
 │  infrastructure   (PostgreSQL, email, cola, reloj)       │
 └──────────────┬──────────────────────┬───────────────────┘
                ▼                      ▼
        PostgreSQL (RLS +       Proveedor de email
        exclusion constraints)  + cola de tareas
```

**Justificación de decisiones de alto nivel**

- **Dominio puro:** la regla central (no solapar) se prueba sin base de datos ni red, que es el foco de pruebas del equipo.
- **La base como última barrera:** el dominio valida primero. Los constraints de exclusión de PostgreSQL son la garantía final contra reservas concurrentes (DD-02).
- **Un solo esquema con aislamiento por fila:** `clinica_id` más Row-Level Security (DD-01). Es barato y la base misma hace respetar el aislamiento.

## Integraciones externas

| Servicio | Propósito | Tipo | Alcance |
|---|---|---|---|
| Proveedor de email (Resend o Brevo) | Confirmaciones, recordatorios y códigos de verificación | REST / SDK | MVP |
| WhatsApp click-to-chat | Recordatorio manual disparado por la recepción | Enlace `https://wa.me/...` generado por la API, sin API de WhatsApp | MVP |
| WhatsApp Business API | Recordatorios automáticos | REST oficial | Posterior |
| Google Calendar | Sincronizar agendas | REST | Posterior |
| Mercado Pago | Señas online | REST / webhook | Posterior |
| ARCA/AFIP | Facturación electrónica | Web service | Posterior |

> **Gotcha:** el enlace `wa.me` exige el teléfono en formato internacional sin `+`. Para celulares argentinos es `549` + código de área + número, sin el `15`. Hay que normalizar el teléfono al guardarlo (ver `05_reglas_de_negocio.md`, RN-NO-04).

## API REST (resumen)

Prefijo `/api/v1`. Detalle de contratos en las *changes* de implementación.

| Recurso | Endpoints principales | Acceso |
|---|---|---|
| Autenticación | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` | Público (credenciales) |
| Clínica (config) | `GET/PATCH /clinica` | Administrador |
| Usuarios | `/usuarios` | Administrador |
| Profesionales | `/profesionales`, `/profesionales/{id}/horarios` | Administrador (escritura); personal (lectura) |
| Sillones | `/sillones` | Administrador |
| Prestaciones | `/prestaciones` | Administrador |
| Feriados | `/feriados` | Administrador |
| Bloqueos | `/bloqueos` | Odontólogo (propios), recepción, administrador |
| Pacientes | `/pacientes` | Recepción, administrador (el odontólogo consulta los de su agenda) |
| Turnos | `/turnos`, `/turnos/{id}/cancelar`, `/turnos/{id}/reprogramar`, `/turnos/{id}/ausente`, `/turnos/{id}/enlace-whatsapp` | Recepción, odontólogo (lectura propia), administrador |
| Agenda | `GET /agenda?desde&hasta&profesionalId` (vista diaria o semanal) | Personal |
| Ausentismo | `GET /ausentismo` | Administrador |
| Exportación | `POST /exportaciones`, `GET /exportaciones/{id}` | Administrador |
| Auditoría | `GET /auditoria` | Administrador |
| **Público** | `GET /publico/{slug}/disponibilidad`, `POST /publico/{slug}/reservas`, `POST /publico/turnos/accion` (confirmar o cancelar con token) | Sin cuenta, limitado por tasa |

## Modelo operativo

- **Despliegue:** un servicio web más un *worker* de tareas (puede ser el mismo proceso en el MVP), sobre un PaaS económico con PostgreSQL gestionado.
- **Equipo:** 4 integrantes. Una persona lidera la fundación (Discovery, KB, Roadmap, reglas del agente, configuración del repositorio). Tres implementan y prueban *changes* en ramas separadas, con foco en backend y reglas de negocio.
- **Entornos:** desarrollo, pruebas y producción. **Nunca se usan datos reales de pacientes** fuera de producción (RN-DA-01).
