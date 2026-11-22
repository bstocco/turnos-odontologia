# Funcionalidades

Organizadas por épica y por historia de usuario (US-NNN). Todas son del MVP salvo que se indique. Como el MVP es una API, cada criterio de aceptación se verifica contra endpoints, no contra pantallas.

## Épica 1: Configuración de la clínica

### US-001 — Configurar profesionales y horarios de atención
**Como** administrador
**Quiero** dar de alta profesionales y definir sus franjas de atención por día
**Para** que solo se ofrezcan turnos dentro de su horario real

**Criterios de aceptación**:
- [ ] Se crea, edita y desactiva un profesional.
- [ ] Un profesional puede tener varias franjas por día; no se aceptan franjas que se superpongan o con `hora_desde >= hora_hasta`.
- [ ] Los horarios se interpretan en la zona horaria de la clínica.

**Reglas relacionadas**: RN-AG-06, RN-DA-03

### US-002 — Configurar sillones con buffer de limpieza
**Como** administrador
**Quiero** registrar sillones o boxes y su tiempo de limpieza entre turnos
**Para** que el sillón no se asigne antes de estar listo

**Criterios de aceptación**:
- [ ] Se crea, edita y desactiva un sillón con `buffer_minutos` ≥ 0.
- [ ] Cambiar el buffer no modifica turnos ya creados.

**Reglas relacionadas**: RN-AG-02, RN-AG-05

### US-003 — Configurar prestaciones con su duración
**Como** administrador
**Quiero** definir los tipos de prestación y cuánto dura cada uno
**Para** que el turno ocupe el tiempo correcto

**Criterios de aceptación**:
- [ ] Se crea, edita y desactiva una prestación con `duracion_minutos` > 0.
- [ ] Una prestación desactivada no puede reservarse, pero los turnos existentes se conservan.

**Reglas relacionadas**: RN-AG-04

### US-004 — Cargar feriados y parametrizar la clínica
**Como** administrador
**Quiero** cargar los feriados y elegir si las reservas web quedan pendientes o confirmadas
**Para** adaptar el sistema a cómo trabaja mi clínica

**Criterios de aceptación**:
- [ ] Se cargan feriados únicos por fecha.
- [ ] Se puede copiar la plantilla de feriados nacionales y ajustarla.
- [ ] Se configura `reserva_requiere_confirmacion` y la anticipación de cancelación (por defecto 24 hs).

**Reglas relacionadas**: RN-AG-07, RN-RE-01, RN-RE-02

### US-005 — Gestionar usuarios del personal
**Como** administrador
**Quiero** crear usuarios con rol recepcionista, odontólogo o administrador
**Para** que cada persona tenga solo los permisos que necesita

**Criterios de aceptación**:
- [ ] Se crea, edita y desactiva un usuario con rol y, si es odontólogo, su profesional asociado.
- [ ] Un usuario solo ve datos de su clínica.

**Reglas relacionadas**: RN-MT-01, RN-MT-03

## Épica 2: Agenda y turnos (recepción)

### US-010 — Agendar un turno sin solapamientos
**Como** recepcionista
**Quiero** agendar un turno asignando paciente, odontólogo, prestación y sillón
**Para** evitar solapamientos por profesional y por sillón

**Criterios de aceptación**:
- [ ] El turno se crea con `fin` calculado desde la duración de la prestación.
- [ ] Se rechaza con `409` si se solapa con otro turno activo del profesional o del sillón (incluido el buffer).
- [ ] Un turno que empieza justo cuando termina otro se acepta (con buffer 0 en el sillón).
- [ ] Se rechaza si cae fuera del horario del profesional, en un feriado o dentro de un bloqueo.
- [ ] Dos solicitudes concurrentes sobre el mismo hueco: solo una tiene éxito.
- [ ] Queda registro de auditoría.

**Reglas relacionadas**: RN-AG-01 a RN-AG-07, RN-AG-09, RN-AG-12, RN-AU-02

### US-011 — Reprogramar un turno
**Como** recepcionista
**Quiero** mover un turno a otro horario, profesional o sillón
**Para** liberar el horario anterior y no perder al paciente

**Criterios de aceptación**:
- [ ] Se crea el turno nuevo y el original pasa a `reprogramado` en una sola transacción.
- [ ] Si el nuevo hueco no está libre, el turno original no cambia.
- [ ] El horario original queda libre de inmediato.

**Reglas relacionadas**: RN-TU-02, RN-TU-03

### US-012 — Cancelar un turno
**Como** recepcionista
**Quiero** cancelar un turno
**Para** liberar el horario del profesional y del sillón

**Criterios de aceptación**:
- [ ] El turno pasa a `cancelado` y su horario queda disponible.
- [ ] La recepción puede cancelar sin límite de anticipación.
- [ ] Se envía el email de cancelación al paciente.

**Reglas relacionadas**: RN-TU-03, RN-RE-02, RN-NO-01

### US-013 — Ver la agenda diaria y semanal
**Como** recepcionista
**Quiero** consultar la agenda por día o por semana, filtrando por profesional
**Para** gestionar la disponibilidad del día

**Criterios de aceptación**:
- [ ] `GET /agenda` devuelve turnos, bloqueos y feriados del rango pedido.
- [ ] Permite filtrar por profesional y por sillón.
- [ ] Los horarios se devuelven en UTC y se interpretan en la zona de la clínica.

**Reglas relacionadas**: RN-DA-03

### US-014 — Registrar ausentismo
**Como** recepcionista
**Quiero** marcar un turno como ausente cuando el paciente no asiste
**Para** llevar el registro de ausentismo

**Criterios de aceptación**:
- [ ] Solo se puede marcar `ausente` desde `confirmado` y después de la hora de inicio.
- [ ] Queda registrado quién y cuándo.

**Reglas relacionadas**: RN-TU-01, RN-TU-04, RN-AB-01

### US-015 — Generar el enlace de WhatsApp para un recordatorio
**Como** recepcionista
**Quiero** obtener un enlace click-to-chat con el mensaje del recordatorio ya redactado
**Para** avisar al paciente por WhatsApp sin escribir cada mensaje

**Criterios de aceptación**:
- [ ] `GET /turnos/{id}/enlace-whatsapp` devuelve la URL `wa.me` y el texto.
- [ ] El teléfono se normaliza a `549` + área + número, sin `15`.
- [ ] Si el paciente no tiene teléfono válido, la API lo informa.

**Reglas relacionadas**: RN-NO-02, RN-NO-04

## Épica 3: Odontólogo

### US-020 — Consultar mi agenda
**Como** odontólogo
**Quiero** ver mi agenda diaria y semanal
**Para** saber qué pacientes tengo y a qué hora

**Criterios de aceptación**:
- [ ] Solo devuelve turnos y bloqueos propios.
- [ ] Un odontólogo no puede consultar la agenda de otro profesional.

**Reglas relacionadas**: `03_actores_y_roles.md` (reglas transversales)

### US-021 — Bloquear franjas horarias
**Como** odontólogo
**Quiero** bloquear franjas por ausencia o imprevisto
**Para** que no se asignen turnos en esos horarios

**Criterios de aceptación**:
- [ ] El bloqueo impide nuevas reservas, incluidas las del enlace público.
- [ ] Si se superpone con turnos activos, se rechaza y se listan los turnos en conflicto.
- [ ] Se puede eliminar un bloqueo propio.

**Reglas relacionadas**: RN-AG-07, RN-AG-08

### US-022 — Registrar la atención y su duración
**Como** odontólogo
**Quiero** marcar el turno como atendido y anotar la duración real
**Para** dejar constancia de la atención

**Criterios de aceptación**:
- [ ] Pasa a `atendido` solo desde `confirmado` y después de la hora de inicio.
- [ ] Se guarda `duracion_real_minutos` (opcional).
- [ ] No existe historia clínica ni odontograma en v1.

**Reglas relacionadas**: RN-TU-04, RN-TU-05

## Épica 4: Reserva pública del paciente

### US-030 — Consultar disponibilidad
**Como** paciente
**Quiero** ver los horarios libres de un profesional para una prestación
**Para** reservar sin llamar ni escribir por WhatsApp

**Criterios de aceptación**:
- [ ] `GET /publico/{slug}/disponibilidad` devuelve solo horarios realmente libres para profesional y sillón.
- [ ] Excluye feriados, bloqueos, turnos y buffers.
- [ ] No expone datos de otros pacientes.

**Reglas relacionadas**: RN-AG-01 a RN-AG-07, RN-AG-12

### US-031 — Reservar un turno por enlace
**Como** paciente
**Quiero** reservar un turno desde un enlace web
**Para** no depender de llamadas ni mensajes manuales

**Criterios de aceptación**:
- [ ] La reserva incluye alta básica del paciente (nombre, DNI, teléfono, email, obra social opcional).
- [ ] El sillón se asigna automáticamente; si el hueco se ocupa entre la consulta y la reserva, devuelve `409`.
- [ ] El turno queda `pendiente_confirmacion` o `confirmado` según la configuración de la clínica.
- [ ] Hay límite de tasa y validación anti-abuso (código por email, pendiente de decisión).
- [ ] El paciente recibe un email con enlaces de confirmación y cancelación.

**Reglas relacionadas**: RN-RE-01, RN-RE-03 a RN-RE-06, RN-NO-01

### US-032 — Confirmar o cancelar mi turno
**Como** paciente
**Quiero** confirmar o cancelar mi turno desde el enlace que recibí
**Para** no tener que llamar

**Criterios de aceptación**:
- [ ] El token es de un solo uso, atado a un turno y a un propósito, y vence.
- [ ] La cancelación online se acepta solo con 24 hs o más de anticipación; con menos, la API indica que debe contactar a recepción.
- [ ] Un token usado o vencido no se acepta.

**Reglas relacionadas**: RN-RE-02, RN-RE-06

## Épica 5: Pacientes

### US-040 — Gestionar la ficha básica de pacientes
**Como** recepcionista
**Quiero** crear, buscar y editar la ficha de un paciente
**Para** agendar turnos sin volver a pedir los datos

**Criterios de aceptación**:
- [ ] Se crea y edita con nombre, apellido, DNI, teléfono, email y obra social.
- [ ] El DNI es único por clínica.
- [ ] La búsqueda por DNI o apellido solo devuelve pacientes de la clínica.
- [ ] Consultar el detalle de una ficha queda auditado.

**Reglas relacionadas**: RN-PA-01 a RN-PA-03, RN-AU-03

## Épica 6: Notificaciones

### US-050 — Enviar emails automáticos
**Como** paciente
**Quiero** recibir un email al reservar, confirmar o cancelar, y un recordatorio antes del turno
**Para** no olvidarme

**Criterios de aceptación**:
- [ ] Los envíos se encolan y se reintentan.
- [ ] Un fallo de email no impide crear el turno.
- [ ] Queda registro del estado de cada envío.

**Reglas relacionadas**: RN-NO-01, RN-NO-03

## Épica 7: Seguridad, auditoría y datos

### US-060 — Aislar los datos entre clínicas
**Como** administrador
**Quiero** que mis datos no se mezclen con los de otra clínica
**Para** cumplir la Ley 25.326

**Criterios de aceptación**:
- [ ] Row-Level Security activo en todas las tablas con `clinica_id`.
- [ ] Una prueba automatizada verifica que la clínica A no lee ni escribe datos de la clínica B.
- [ ] El rol de la aplicación no tiene `BYPASSRLS`.

**Reglas relacionadas**: RN-MT-01, RN-MT-02

### US-061 — Consultar la auditoría
**Como** administrador
**Quiero** ver quién hizo qué y cuándo
**Para** tener trazabilidad de accesos y cambios

**Criterios de aceptación**:
- [ ] `GET /auditoria` filtra por entidad, actor y rango de fechas.
- [ ] Los registros no se pueden modificar ni borrar, ni siquiera con el rol de la aplicación.

**Reglas relacionadas**: RN-AU-01 a RN-AU-03

### US-062 — Exportar los datos de la clínica
**Como** administrador
**Quiero** descargar los datos de mi clínica
**Para** conservar una copia y poder migrarla

**Criterios de aceptación**:
- [ ] Incluye pacientes, turnos, profesionales, sillones, prestaciones y auditoría, en un formato abierto.
- [ ] Solo el administrador la puede pedir.
- [ ] La exportación queda auditada.

**Reglas relacionadas**: RN-DA-04, RN-AU-03

### US-063 — Consultar el registro de ausentismo
**Como** administrador
**Quiero** ver los ausentes por período, paciente y profesional
**Para** entender el ausentismo de mi clínica

**Criterios de aceptación**:
- [ ] `GET /ausentismo` devuelve listado y conteo.
- [ ] Las métricas avanzadas quedan fuera de v1.

**Reglas relacionadas**: RN-AB-02

## Épica 8: Alta de clínicas (pendiente de definición)

> **Pendiente (PO-04):** el Discovery no define cómo se crea una clínica nueva del SaaS ni quién lo hace. No hay historias hasta decidirlo. En v1 se propone un alta manual por script o endpoint interno.

## Fuera del MVP (backlog)

Lista de espera y sobreturnos (v2), interfaz web de reserva y agenda, métricas avanzadas, señas con Mercado Pago, facturación ARCA, WhatsApp Business API, Google Calendar, odontograma e historia clínica, liquidación de obras sociales y app móvil.
