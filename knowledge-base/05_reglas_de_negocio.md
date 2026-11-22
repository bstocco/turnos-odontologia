# Reglas de Negocio

Cada regla tiene un código único `RN-{DOMINIO}-{NN}`. Origen: `discovery/discovery.md` §7 y respuestas del equipo. Las reglas marcadas **(Suposición)** no fueron fijadas en el Discovery y requieren confirmación.

## Dominio: Agenda (RN-AG)

- **RN-AG-01**: Un profesional no puede tener dos turnos activos superpuestos.
- **RN-AG-02**: Un sillón no puede tener dos turnos activos superpuestos. La ocupación del sillón incluye el buffer de limpieza (RN-AG-05).
- **RN-AG-03**: Los intervalos son **semiabiertos** `[inicio, fin)`. Si un turno termina a las 10:00 y otro empieza a las 10:00, **no hay solapamiento**. Esto vale para el profesional y, con buffer 0, para el sillón.
- **RN-AG-04**: La duración del turno es la de la prestación elegida (`fin = inicio + duracion_minutos`). El turno ocupa al profesional y al sillón durante toda esa duración.
- **RN-AG-05**: Cada sillón tiene un buffer de limpieza o desinfección configurable (por defecto 0). El buffer se suma **al final del turno** y solo bloquea al **sillón**, no al profesional. Se copia al turno al reservar: cambiar el buffer después no altera los turnos ya creados.
- **RN-AG-06**: Un turno solo puede crearse dentro de una franja de atención del profesional (`horario_atencion`), en la zona horaria de la clínica.
- **RN-AG-07**: No se crean turnos en un feriado de la clínica ni dentro de un bloqueo del profesional. **(Suposición)** La recepción no puede forzar excepciones en v1 (PO-07).
- **RN-AG-08**: Un bloqueo no puede crearse si se superpone con turnos activos del profesional. La API devuelve los turnos en conflicto para que la recepción los reprograme antes. **(Suposición)** (PO-08).
- **RN-AG-09**: Un turno activo es el que está en estado `pendiente_confirmacion`, `confirmado`, `atendido` o `ausente`. Los estados `cancelado` y `reprogramado` liberan el horario del profesional y del sillón.
- **RN-AG-10**: No se crean turnos con inicio en el pasado. **(Suposición)**
- **RN-AG-11**: Los inicios de turno se alinean a la granularidad configurada de la clínica (por defecto 15 minutos). **(Suposición)** (PO-06).
- **RN-AG-12**: El sistema es la única fuente de verdad de la disponibilidad. Dos reservas concurrentes sobre el mismo hueco nunca pueden ganar las dos: la segunda recibe un conflicto (`409`).

## Dominio: Turnos y estados (RN-TU)

- **RN-TU-01**: Transiciones permitidas:

| Desde | Hacia |
|---|---|
| `pendiente_confirmacion` | `confirmado`, `cancelado`, `reprogramado` |
| `confirmado` | `cancelado`, `reprogramado`, `atendido`, `ausente` |
| `atendido`, `ausente`, `cancelado`, `reprogramado` | (estado final) |

- **RN-TU-02**: Reprogramar crea un turno nuevo con `reprogramado_de` apuntando al original y pasa el original a `reprogramado`, en **una sola transacción**. **(Suposición)** Evita dejar al paciente sin turno si el nuevo hueco falla.
- **RN-TU-03**: Cancelar o reprogramar libera de inmediato el horario del profesional y del sillón.
- **RN-TU-04**: Un turno no puede marcarse `atendido` ni `ausente` antes de su hora de inicio.
- **RN-TU-05**: El odontólogo puede registrar la duración real de la atención (`duracion_real_minutos`) sobre sus propios turnos.

## Dominio: Reserva pública y cancelación (RN-RE)

- **RN-RE-01**: La reserva por enlace queda en `pendiente_confirmacion` o `confirmado` según `clinica_config.reserva_requiere_confirmacion`.
- **RN-RE-02**: El paciente puede **cancelar online solo si faltan al menos 24 horas** (parametrizable por clínica, valor por defecto 24) para el inicio del turno. Con menos tiempo debe contactar a la recepción. La recepción puede cancelar sin esa restricción.
- **RN-RE-03**: En la reserva pública el sistema **asigna el sillón automáticamente** entre los libres. El paciente elige profesional, prestación y horario, no sillón. **(Suposición)**
- **RN-RE-04**: El paciente se da de alta con sus datos básicos al reservar, o lo carga la recepción. Si ya existe un paciente con el mismo DNI en la clínica, se reutiliza el registro. **(Suposición)** El sistema no expone datos de pacientes existentes en la respuesta pública.
- **RN-RE-05**: Las rutas públicas tienen límite de tasa y validación anti-abuso para evitar reservas falsas o duplicadas. **(Suposición)** Se propone un código enviado por email antes de confirmar la reserva (PO-02) y un tope de reservas activas por email o DNI (PO-09).
- **RN-RE-06**: Los enlaces de acción (confirmar o cancelar) son de **un solo uso**, atados a un turno y a un propósito, y vencen. El servidor guarda solo su hash.

## Dominio: Pacientes (RN-PA)

- **RN-PA-01**: La ficha básica contiene nombre, apellido, DNI, teléfono, email y obra social o prepaga. No hay historia clínica ni odontograma en v1.
- **RN-PA-02**: El DNI es único dentro de una clínica.
- **RN-PA-03**: El teléfono se normaliza a formato internacional al guardarlo (ver RN-NO-04).

## Dominio: Ausentismo (RN-AB)

- **RN-AB-01**: Cuando un paciente no asiste, la recepción o el odontólogo marcan el turno como `ausente`. El sistema lo registra con fecha y autor (auditoría).
- **RN-AB-02**: El administrador consulta el registro de ausentismo (listado y conteo por período, paciente y profesional). Las métricas avanzadas quedan para una etapa posterior.

## Dominio: Notificaciones (RN-NO)

- **RN-NO-01**: El sistema envía **emails automáticos** por la creación, confirmación y cancelación del turno, y un recordatorio previo. **(Suposición)** El recordatorio sale 24 horas antes (PO-05).
- **RN-NO-02**: El recordatorio por WhatsApp es **manual**: la API genera un enlace click-to-chat con el mensaje prearmado y la recepción lo dispara.
- **RN-NO-03**: Los envíos se encolan y se reintentan; un fallo de email no impide crear el turno.
- **RN-NO-04**: Para `wa.me`, los celulares argentinos se normalizan a `549` + código de área + número, sin el `15`.

## Dominio: Multi-tenant y seguridad (RN-MT)

- **RN-MT-01**: Todo dato pertenece a una clínica (`clinica_id`). Ninguna consulta cruza datos entre clínicas. La base lo hace respetar con Row-Level Security; el código no es la única barrera.
- **RN-MT-02**: La conexión de la aplicación usa un rol de base de datos **sin** privilegios de superusuario ni `BYPASSRLS`, distinto del rol de migraciones.
- **RN-MT-03**: Los datos de pacientes son datos de salud, sensibles bajo la Ley 25.326. Se aplica el mínimo acceso por rol (ver `03_actores_y_roles.md`).

## Dominio: Auditoría y datos (RN-AU, RN-DA)

- **RN-AU-01**: La auditoría es **append-only**: no se actualiza ni se borra, ni siquiera por el rol de la aplicación.
- **RN-AU-02**: Se audita toda creación, modificación y cancelación de turnos, pacientes, bloqueos y configuración, con actor, fecha y valores antes y después.
- **RN-AU-03**: Se audita la **lectura de la ficha de un paciente** y cada **exportación** de datos.
- **RN-DA-01**: **Prohibido usar datos reales de pacientes** en desarrollo, pruebas o integración continua. Solo datos sintéticos.
- **RN-DA-02**: Los scripts de seed y de carga de prueba verifican el destino y **se niegan a ejecutarse contra producción**.
- **RN-DA-03**: Los instantes se guardan en UTC. La zona horaria de la clínica es **`America/Argentina/Buenos_Aires`** por defecto, fija por clínica. Los horarios de atención y los feriados se interpretan en esa zona.
- **RN-DA-04**: Cada clínica puede **exportar sus datos** (pacientes, turnos, profesionales, sillones, prestaciones y auditoría) en un formato abierto. Solo el administrador, y la exportación queda auditada.

## Dominio: Excepciones globales

- Un error de conflicto de agenda se informa como `409` con un código de dominio estable (`TURNO_SOLAPADO_PROFESIONAL`, `TURNO_SOLAPADO_SILLON`). La API no filtra detalles internos de la base.
- Los errores de autorización sobre datos de otra clínica responden como "no encontrado", sin revelar que el recurso existe.
