# Decisiones y Supuestos

Se distingue lo **decidido por el equipo** de lo **propuesto por la fundación y pendiente de confirmar**.

## Decisiones documentadas

### DD-01 — Aislamiento multi-tenant con una sola base, `clinica_id` y Row-Level Security
**Estado**: decidido (Q1 = a)
**Decisión**: una única base y un único esquema. Todas las tablas llevan `clinica_id` y PostgreSQL aplica RLS forzada.
**Contexto**: datos de salud, Ley 25.326 y requisito de aislamiento por clínica.
**Alternativas consideradas**: (b) filtrado solo en el código; (c) un esquema por clínica.
**Justificación**: la base misma hace respetar el aislamiento y es barato. En (b) un descuido en una consulta filtra datos entre clínicas.
**Trade-offs aceptados**: todas las consultas deben pasar por el contexto de tenant; hay que cuidar el rol sin `BYPASSRLS` y el uso de `SET LOCAL`. Menos aislamiento físico que un esquema por clínica.

### DD-02 — No solapamiento garantizado por constraints de exclusión de PostgreSQL
**Estado**: decidido (Q2 = a)
**Decisión**: constraints de exclusión con `tstzrange` sobre profesional y sobre sillón, más validación en el dominio.
**Contexto**: dos personas pueden reservar el mismo hueco a la vez.
**Alternativas consideradas**: (b) solo validación en el código con transacciones.
**Justificación**: solo la base frena de verdad una carrera concurrente. Los rangos semiabiertos resuelven el caso borde y el buffer.
**Trade-offs aceptados**: dependencia de la extensión `btree_gist` y de SQL propio; la columna del rango del sillón no puede ser generada (ver gotcha en `04_modelo_de_datos.md`).

### DD-03 — Autenticación: JWT para el personal y enlaces firmados de un solo uso para el paciente
**Estado**: decidido (Q3 = a)
**Decisión**: el personal usa JWT. El paciente no tiene cuenta y actúa con tokens de un solo uso atados a un turno y un propósito.
**Contexto**: cuatro actores, superficie pública mínima, paciente sin fricción.
**Alternativas consideradas**: (b) cuenta para todos; (c) sesiones con cookie para el personal.
**Justificación**: menos datos y menos superficie de ataque; encaja con el modelo de enlaces del Discovery.
**Trade-offs aceptados**: el paciente no tiene historial propio; la validez de su identidad depende del email y del token.

### DD-04 — Hosting en un PaaS económico y email transaccional
**Estado**: decidido en el tipo (Q4 = a); proveedor concreto abierto
**Decisión**: PaaS económico (Railway, Render o Fly.io) con PostgreSQL gestionado, y Resend o Brevo para email.
**Contexto**: presupuesto bajo y equipo de 4 personas sin dedicación a operaciones.
**Alternativas consideradas**: (b) VPS propia con Docker; (c) diferir.
**Justificación**: menos trabajo de operación.
**Trade-offs aceptados**: dependencia del proveedor; posible transferencia internacional de datos (PO-03).

### DD-05 — Auditoría append-only y exportación de datos incluidas en el MVP
**Estado**: decidido (confirmado por el equipo)
**Decisión**: tabla `auditoria` de solo INSERT, que registra cambios, lecturas de fichas de pacientes y exportaciones. Exportación de datos por clínica en formato abierto.
**Contexto**: el informe de mercado muestra que solo Oclusar y Atiendo evidencian trazabilidad de accesos, y que la exportación es un estándar de confianza.
**Alternativas consideradas**: dejarlas para etapas posteriores.
**Justificación**: refuerzan el cumplimiento de la Ley 25.326 y diferencian el producto.
**Trade-offs aceptados**: más trabajo en el MVP; la auditoría de lecturas aumenta el volumen de escrituras.

### DD-06 — Prioridad de calidad: seguridad de datos primero, mantenibilidad después
**Estado**: decidido (Q5)
**Decisión**: ante un conflicto, se prefiere la opción que proteja mejor los datos; luego la que sea más mantenible.
**Justificación**: datos de salud y modelo multi-tenant.
**Trade-offs aceptados**: menor velocidad de entrega en las piezas de seguridad.

### DD-07 — Zona horaria fija por clínica, instantes en UTC
**Estado**: decidido
**Decisión**: `America/Argentina/Buenos_Aires` por defecto, fija por clínica. Todos los instantes se guardan en UTC (`timestamptz`).
**Justificación**: evita ambigüedades en horarios y feriados.
**Trade-offs aceptados**: clínicas en otra zona requieren cambiar el valor de su configuración. Hay que usar zonas IANA, no desplazamientos fijos.

### DD-08 — Monolito modular hexagonal con Fastify, SQL explícito y Vitest
**Estado**: decidido (aprobado por el equipo el 2026-11-22)
**Decisión**: arquitectura hexagonal en un monolito, Fastify como framework, SQL explícito con migraciones versionadas y Vitest.
**Contexto**: pediste "lógica de dominio pura" y una prueba automatizada fuerte; el equipo es de 3 personas en ramas separadas.
**Alternativas consideradas**: NestJS (más pesado, el dominio tiende a acoplarse); Express o Fastify sin capas fijas (la estructura se degrada).
**Justificación**: el dominio se prueba sin infraestructura y los constraints y políticas RLS requieren SQL que un ORM típico no expresa.
**Trade-offs aceptados**: requiere disciplina en los límites entre capas.

### DD-09 — Cola de tareas sobre PostgreSQL
**Estado**: decidido (aprobado por el equipo el 2026-11-22)
**Decisión**: cola de trabajos sobre PostgreSQL con pg-boss (sin Redis) para emails y recordatorios.
**Justificación**: evita sumar Redis y su costo.
**Trade-offs aceptados**: menor rendimiento que una cola dedicada; suficiente para el volumen del MVP.

### DD-10 — Lista de espera fuera del MVP
**Estado**: decidido
**Decisión**: la lista de espera y los sobreturnos se postergan a la v2.
**Contexto**: Atiendo y Agenda Profesional la evidencian como parte del flujo de cancelación.
**Justificación**: priorizar el núcleo (agenda sin solapamientos) en 8 a 12 semanas.
**Trade-offs aceptados**: menor recuperación de huecos por cancelaciones de último momento en la v1.

### DD-11 — Alta de clínicas por endpoint administrativo interno o seed inicial
**Estado**: decidido (aprobado por el equipo el 2026-11-22; cierra PO-04)
**Decisión**: en el MVP las clínicas nuevas se crean con un endpoint administrativo interno protegido por clave de servicio, o con un seed inicial. No hay autoservicio ni rol de operador de plataforma en la v1.
**Contexto**: el Discovery no definía cómo se aprovisionan los tenants.
**Alternativas consideradas**: autoservicio de alta; rol de operador de plataforma con interfaz.
**Justificación**: cierra la épica 8 con el menor costo y deja el aprovisionamiento fuera de la superficie pública.
**Trade-offs aceptados**: el alta depende de una persona del equipo; el autoservicio queda para una etapa posterior.

### DD-12 — Validación del paciente en la reserva pública por código de email
**Estado**: decidido (aprobado por el equipo el 2026-11-22; cierra PO-02)
**Decisión**: antes de confirmar una reserva pública, el paciente valida el email con un código de un solo uso, con vencimiento y límite de intentos.
**Contexto**: riesgo de reservas falsas o duplicadas por el enlace público (R-02).
**Alternativas consideradas**: DNI más email sin código; confirmación de la recepción.
**Justificación**: valida que el paciente controla el email sin exigirle una cuenta.
**Trade-offs aceptados**: agrega un paso a la reserva y depende de la entrega del email.

## Supuestos inferidos

### SU-01 — La recepción dispara el recordatorio de WhatsApp
**Supuesto**: el recordatorio con click-to-chat lo dispara una persona; no hay envío automático por WhatsApp.
**Origen**: confirmado por el equipo en el Discovery.
**Riesgo si es falso**: no aplica; es una limitación conocida.
**Cómo validar**: pruebas con recepciones reales de alto volumen (riesgo R-01 del Discovery).

### SU-02 — El buffer de limpieza se suma al final del turno y solo bloquea al sillón
**Supuesto**: el profesional no queda ocupado durante el buffer.
**Origen**: confirmado por el equipo; la parte "solo el sillón" es una interpretación de la fundación.
**Riesgo si es falso**: el profesional podría agendarse más ajustado o más holgado de lo esperado.
**Cómo validar**: confirmar con el equipo.

### SU-03 — Reprogramar equivale a crear un turno nuevo y marcar el original como `reprogramado`
**Supuesto**: la reprogramación es transaccional y conserva el historial.
**Origen**: propuesta de la fundación.
**Riesgo si es falso**: otro modelo (modificar el turno en el lugar) cambiaría la auditoría y las métricas.
**Cómo validar**: revisar con el equipo antes de implementar US-011.

### SU-04 — Anticipación de cancelación de 24 hs, parametrizable por clínica
**Supuesto**: 24 horas es el valor por defecto, ajustable por clínica.
**Origen**: el Discovery fija 24 hs; la parametrización es de la fundación.
**Riesgo si es falso**: si debe ser fija, sobra una configuración.
**Cómo validar**: confirmar con el equipo.

### SU-05 — Sillón asignado automáticamente en la reserva pública
**Supuesto**: el paciente no elige sillón y no hay tipos de sillón por prestación.
**Origen**: propuesta de la fundación; **aprobada por el equipo el 2026-11-22** (asignación automática del sillón en la reserva pública).
**Riesgo si es falso**: prestaciones que requieran un sillón particular obligarían a modelar tipos de sillón.
**Cómo validar**: PO-11.

### SU-06 — Un odontólogo corresponde a un único profesional
**Supuesto**: el usuario con rol odontólogo se vincula a un `profesional` de su clínica.
**Origen**: propuesta de la fundación.
**Riesgo si es falso**: un profesional podría necesitar varios usuarios o viceversa.
**Cómo validar**: confirmar con el equipo.

### SU-07 — El Discovery sin interfaz gráfica implica reserva pública como API
**Supuesto**: la "reserva por enlace web" se resuelve con endpoints públicos; la página que los consume llega después.
**Origen**: aclaración del equipo (MVP como API REST).
**Riesgo si es falso**: el valor para el paciente no es demostrable sin una interfaz.
**Cómo validar**: planificar una etapa de interfaz mínima inmediatamente después del MVP.

### SU-08 — El recordatorio por email sale 24 horas antes
**Supuesto**: valor por defecto; no fijado por el Discovery.
**Origen**: propuesta de la fundación; **aprobada por el equipo el 2026-11-22** (recordatorio automático 24 horas antes).
**Riesgo si es falso**: menor eficacia contra el ausentismo.
**Cómo validar**: PO-05.
