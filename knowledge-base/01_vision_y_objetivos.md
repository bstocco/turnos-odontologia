# Visión y Objetivos

## Propósito del sistema

Evitar solapamientos de horarios, la doble asignación de sillones/boxes y reducir el ausentismo en consultorios y clínicas odontológicas pequeñas o medianas de Argentina que trabajan con varios profesionales.

Hoy esos consultorios coordinan con agenda en papel o planillas de Excel más mensajes manuales de WhatsApp. El resultado son turnos pisados entre sillones, olvidos de confirmación y huecos sin cubrir ante cancelaciones de último momento (`discovery/discovery.md` §1, §4).

**Modelo de negocio:** SaaS multi-consultorio en la nube. Cada clínica es un *tenant* aislado, con sus propios profesionales, sillones, pacientes y turnos. El MVP se valida con consultorios individuales y clínicas chicas de **una sola sede**. Multi-sede queda para etapas posteriores.

**Forma del MVP:** API REST y lógica de dominio, **sin interfaz gráfica web**. Las pantallas mínimas de reserva y de agenda quedan para una etapa posterior.

## Objetivos por actor

| Actor | Objetivo principal | Objetivos secundarios |
|---|---|---|
| Recepcionista / Secretaria | Agendar, reprogramar y cancelar turnos sin solapamientos | Asignar profesional y sillón; gestionar la disponibilidad diaria; disparar recordatorios por WhatsApp |
| Odontólogo | Ver su agenda diaria y semanal | Bloquear franjas por ausencia o imprevisto; registrar la atención y su duración |
| Paciente | Reservar y cancelar por un enlace según la disponibilidad real | Confirmar el turno; recibir recordatorios; no depender de llamadas |
| Administrador / Dueño | Configurar profesionales, sillones y prestaciones con su duración | Consultar el registro de ausentismo; exportar los datos de su clínica; auditar accesos y cambios |

## Alcance v1 (MVP)

- **Agenda sin solapamientos** por profesional y por sillón, con duración variable por prestación y buffer de limpieza por sillón.
- **Horarios de atención** por profesional, feriados y bloqueos manuales.
- **Ficha básica del paciente:** nombre, DNI, teléfono, email, obra social o prepaga.
- **Reserva pública por enlace** (API pública): consulta de disponibilidad, reserva, confirmación y cancelación. La reserva queda "pendiente de confirmar" o "confirmada" según la configuración de la clínica. El paciente se da de alta al reservar, o lo carga la recepción.
- **Cancelación online** del paciente con al menos 24 hs de anticipación.
- **Notificaciones:** email automático y enlace click-to-chat de WhatsApp disparado por la recepción.
- **Vista diaria y semanal** de la agenda (como datos de API).
- **Registro de ausentismo.**
- **Multi-tenant** con aislamiento por clínica, control de acceso por roles y cumplimiento de la Ley 25.326.
- **Auditoría append-only** de accesos y cambios, y **exportación de datos** de la clínica.

## Fuera de alcance (v1)

- Interfaz gráfica web de reserva y de agenda.
- Lista de espera y sobreturnos (v2).
- Métricas avanzadas de asistencia.
- Señas online con Mercado Pago.
- Facturación electrónica ARCA/AFIP.
- Liquidación de obras sociales y prepagas.
- Odontograma digital e historia clínica completa.
- App móvil nativa.
- WhatsApp Business API oficial, Google Calendar.
- Multi-sede.
- Cobro del propio SaaS (suscripciones): el modelo de monetización está abierto (ver `10_preguntas_abiertas.md`).

## Métricas de éxito

> **Suposición:** el Discovery no fijó métricas. Se proponen estas para validar con el equipo.

| Métrica | Cómo se mide |
|---|---|
| Cero solapamientos por profesional y por sillón | Invariante verificada por pruebas automatizadas y por constraints en la base |
| Reducción del ausentismo | Comparar la tasa de ausentes por clínica antes y después de usar el sistema |
| Reservas hechas por enlace sobre el total | Proporción de turnos con `origen = enlace_web` |
| Plazo del MVP | Primera versión funcional en 8 a 12 semanas |
| Costo de infraestructura | Dentro de un tier gratuito o económico durante la validación |

## Trazabilidad

- Fuente primaria: `discovery/discovery.md` y `docs/discovery/informe-discovery.md`.
- El informe de mercado muestra que la combinación "email automático + WhatsApp manual con mensaje prearmado" ya existe en productos comerciales (Atiendo, plan Gestión de DentalSoft). Valida el enfoque de bajo costo del MVP.
