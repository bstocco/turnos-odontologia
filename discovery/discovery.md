# Discovery — Turnos Odontología

**Fecha**: 2026-11-22
**Fuentes investigadas**: ninguna (Discovery por entrevista, sin scraping de competidores)

## 1. Problema que resuelve

Evitar solapamientos de horarios, doble asignación de sillones/boxes y ausentismo
en consultorios y clínicas odontológicas pequeñas o medianas de Argentina con
múltiples profesionales. Hoy lo resuelven con agenda en papel o Excel más
mensajes manuales de WhatsApp.

**Modelo de negocio**: SaaS multi-consultorio en la nube (multi-tenant, cada
clínica con cuenta aislada, sus profesionales y sus sillones). El MVP se valida
con consultorios individuales y clínicas chicas de una sola sede; multi-sede
queda para etapas posteriores.

## 2. Usuarios / roles

- **Recepcionista/Secretaria**: agenda, reprograma y cancela turnos, asigna
  profesional y sillón/box, gestiona la disponibilidad diaria.
- **Odontólogo**: consulta su agenda diaria/semanal, bloquea horarios y registra
  la atención o duración estimada de cada prestación.
- **Paciente**: solicita, confirma, reprograma o cancela turnos mediante enlace
  de reserva o recordatorios.
- **Administrador/Dueño**: configura profesionales, sillones/boxes y tipos de
  prestación con su duración.

## 3. Casos de uso

1. Como recepcionista, quiero agendar un turno asignando paciente, odontólogo,
   prestación (con su duración) y sillón/box para evitar solapamientos por
   profesional y por sillón.
2. Como recepcionista, quiero reprogramar o cancelar un turno para liberar
   inmediatamente el horario del profesional y del sillón.
3. Como paciente, quiero reservar o cancelar un turno desde un enlace web según
   la disponibilidad real para no depender de llamadas o mensajes manuales.
4. Como odontólogo, quiero bloquear franjas horarias por ausencia o imprevistos
   para que no se asignen turnos en esos horarios.

## 4. Competidores / soluciones existentes

No se investigaron competidores. La práctica actual es agenda en papel o
planillas de Excel más WhatsApp manual, con errores de solapamiento entre
sillones, olvidos de confirmación y huecos sin cubrir ante cancelaciones de
último momento. Los competidores locales casi no publican precios ni
documentación técnica (riesgo, ver sección 10).

## 5. Funcionalidades necesarias (v1)

- Ficha básica del paciente: nombre, DNI, teléfono, email, obra social/prepaga.
  El paciente puede darse de alta al reservar por enlace, o cargarlo la recepción.
- Recordatorios y confirmación/cancelación por enlace: en v1, enlaces
  click-to-chat de WhatsApp (disparados por la recepción) y emails automáticos.
- Vista diaria y semanal de la agenda.
- Reserva por enlace web: queda "pendiente de confirmar" o "confirmada" según
  configuración de la clínica.

## 6. Funcionalidades opcionales (etapas posteriores)

- Lista de espera y manejo de sobreturnos.
- Métricas avanzadas de asistencia.
- Señas online con Mercado Pago.
- Facturación electrónica ARCA/AFIP.
- Liquidación de obras sociales/prepagas.
- Odontograma digital e historia clínica completa.
- App móvil nativa.
- Pantallas de reserva y agenda (interfaz gráfica web).

## 7. Reglas de negocio

- Un profesional no puede tener dos turnos superpuestos, ni un sillón/box. Si un
  turno termina a las 10:00 y otro empieza a las 10:00 NO hay solapamiento.
- El turno ocupa profesional y sillón durante toda la duración de la prestación.
- Duración variable por tipo de prestación (ej. consulta 30 min, limpieza 45,
  conducto 60).
- Buffer configurable de limpieza/desinfección por sillón, sumado al final del
  turno al calcular disponibilidad; con buffer 0 rige el caso borde anterior.
- Respeto de horarios de atención por profesional, feriados y bloqueos manuales.
- El paciente solo puede cancelar online con al menos 24 hs de anticipación; con
  menos tiempo debe contactar a recepción.
- Registro de ausentismo cuando un paciente no asiste.

## 8. Integraciones

- **MVP**: enlaces click-to-chat de WhatsApp y notificaciones por email.
- **Posteriores**: WhatsApp Business API oficial, Google Calendar, Mercado Pago
  (señas), ARCA/AFIP.

## 9. Restricciones

- **Costo**: bajo costo inicial en la nube (tiers gratuitos o económicos).
- **Plazo**: 8 a 12 semanas para una primera versión funcional.
- **Stack definido**: TypeScript con Node.js (API REST, pruebas automatizadas con
  Vitest/Jest) y PostgreSQL.
- **Alcance del MVP**: API REST y lógica de dominio pura, sin interfaz gráfica
  web por ahora (pantallas de reserva y agenda en una etapa posterior).
- **Legal**: Ley 25.326 de protección de datos personales (Argentina),
  aislamiento multi-tenant por clínica, control de acceso por roles y
  prohibición total de usar datos reales de pacientes en desarrollo o pruebas.
- **Equipo**: 4 integrantes. 1 líder a cargo de la fundación (Discovery, KB,
  Roadmap, reglas del agente, configuración del repositorio) y 3 integrantes que
  implementan y prueban los changes en ramas separadas, con foco en backend y
  reglas de negocio. `team-mode` se omitió en la fundación; se puede activar
  después con `/active-orchestrator team`.

## 10. Riesgos

- **Riesgo**: la carga manual de recordatorios por WhatsApp click-to-chat sigue
  generando fricción en recepciones con mucho volumen. Sin API oficial, solo el
  email es automático, por lo que el MVP no resuelve del todo el ausentismo.
- **Riesgo**: reservas falsas o duplicadas por el enlace web público si no hay
  validación mínima (código por email o confirmación de recepción).
- **Riesgo**: poca visibilidad de precios y funcionalidades reales de los
  competidores locales.
- **Riesgo**: datos de salud en un sistema multi-tenant exigen aislamiento serio
  entre clínicas y cumplimiento de la Ley 25.326.

## 11. Preguntas abiertas

- Monetización: suscripción mensual fija por clínica vs. por cantidad de
  sillones/profesionales.
- Validación de identidad del paciente al reservar por enlace: DNI + email vs. OTP.
- Política de sobreturnos y lista de espera en v2.
- Registro de la base de datos ante la AAIP.
- Cómo se sirve el enlace de reserva si el MVP no tiene interfaz web (¿página
  mínima en una etapa posterior, o solo endpoints?).
