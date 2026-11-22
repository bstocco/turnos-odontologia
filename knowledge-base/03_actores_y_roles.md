# Actores y Roles

## Actores del sistema

| Actor | Descripción | Cómo interactúa | Autenticación |
|---|---|---|---|
| **Administrador / Dueño** | Responsable de la clínica (tenant) | API con sesión: configura profesionales, sillones, prestaciones, feriados, usuarios; consulta ausentismo, auditoría; exporta datos | JWT |
| **Recepcionista / Secretaria** | Gestiona la agenda diaria | API con sesión: agenda, reprograma, cancela, registra ausentes, da de alta pacientes, genera enlaces de WhatsApp | JWT |
| **Odontólogo** | Profesional que atiende | API con sesión: consulta su agenda, bloquea franjas, registra atención y duración | JWT |
| **Paciente** | Persona atendida | Sin cuenta. Usa la API pública y enlaces firmados de un solo uso | Enlace firmado |
| **Sistema (worker)** | Proceso interno | Envía recordatorios por email y registra eventos | Interno |
| *(Pendiente)* **Operador de plataforma** | Quien da de alta clínicas del SaaS | No definido en el Discovery | Ver pregunta abierta PO-04 |

## Modelo de autenticación (Q3 = a)

- **Personal de la clínica:** JWT. **Suposición:** token de acceso de vida corta (por ejemplo 15 minutos) más token de refresco rotativo. El Discovery fijó "JWT" sin detallar vigencias.
- **Paciente:** no tiene cuenta. Cada acción sensible (confirmar o cancelar un turno) usa un **enlace con token aleatorio de un solo uso**, atado a un turno y a un propósito, con vencimiento. El servidor guarda solo el hash del token.
- **Validación de la reserva pública:** código por email antes de confirmar la reserva (recomendado por el equipo de fundación para el riesgo de reservas falsas). **Pendiente de decisión del equipo** (PO-02).

## RBAC — Matriz de permisos

C = crear, R = leer, U = modificar, D = eliminar o desactivar. "Propio" = solo lo suyo. "—" = sin acceso.

| Recurso | Administrador | Recepcionista | Odontólogo | Paciente (por enlace) |
|---|---|---|---|---|
| Clínica (configuración) | R U | R | R | — |
| Usuarios | C R U D | — | — | — |
| Profesionales | C R U D | R | R | — |
| Horarios de atención | C R U D | R | R (propios) | — |
| Sillones | C R U D | R | R | — |
| Prestaciones | C R U D | R | R | R (nombre y duración, vía API pública) |
| Feriados | C R U D | R | R | — |
| Bloqueos de agenda | C R U D | C R U D | C R U D (propios) | — |
| Pacientes (ficha básica) | C R U D | C R U | R (de sus turnos) | — |
| Turnos | C R U D | C R U (cancelar, reprogramar, ausente) | R (propios); U (registrar atención y duración) | C (reservar), U (confirmar o cancelar el propio turno) |
| Disponibilidad | R | R | R | R (pública) |
| Agenda (vista diaria y semanal) | R | R | R (propia) | — |
| Enlace de WhatsApp | R | R | — | — |
| Registro de ausentismo | R | R | R (propio) | — |
| Auditoría | R | — | — | — |
| Exportación de datos | C R | — | — | — |

**Reglas transversales de permisos**

- Toda consulta o escritura se limita a la clínica del usuario autenticado (aislamiento por `clinica_id` más RLS; RN-MT-01).
- El Odontólogo solo ve y modifica sus propios turnos, sus bloqueos y su registro de atención.
- La Recepcionista no tiene acceso a configuración, usuarios, auditoría ni exportación.
- El paciente solo actúa sobre el turno al que lo habilita su token.
- **Suposición:** un Odontólogo se vincula con un `profesional` de la clínica. Un usuario con rol Odontólogo sin profesional asociado no puede operar agenda.

## Rutas públicas

Sin sesión. Limitadas por tasa y protegidas contra abuso (RN-RE-05).

| Ruta | Propósito |
|---|---|
| `GET /api/v1/publico/{slug}/disponibilidad` | Horarios libres por profesional y prestación |
| `GET /api/v1/publico/{slug}/prestaciones` | Prestaciones y duraciones |
| `POST /api/v1/publico/{slug}/reservas` | Reservar (alta básica del paciente incluida) |
| `POST /api/v1/publico/turnos/accion` | Confirmar o cancelar con un token de un solo uso |
| `POST /api/v1/auth/login` | Autenticación del personal |
| `GET /salud` | Chequeo de salud del servicio |

> `slug` identifica a la clínica en la URL. Se resuelve con una función de base de datos que no depende de la sesión (ver `08_arquitectura_propuesta.md`).
