# Preguntas Abiertas

## Inconsistencias detectadas

### IN-01 — Métricas de asistencia del administrador frente al alcance del MVP
**Documento A dice**: el administrador "consulta métricas de asistencia" (`discovery/discovery.md` §2).
**Documento B dice**: las "métricas avanzadas" quedan para etapas posteriores (§6).
**Impacto**: expectativa distinta sobre qué ve el administrador en v1.
**Resolución propuesta**: en v1 solo el registro de ausentismo (listado y conteo). Ver RN-AB-02 y US-063.

### IN-02 — El paciente "reprograma" en los roles, pero no en los casos de uso
**Documento A dice**: el paciente "solicita, confirma, reprograma o cancela" (§2).
**Documento B dice**: el caso de uso del MVP es "reservar o cancelar" (§3).
**Impacto**: no está claro si el MVP debe permitir reprogramar por enlace.
**Resolución propuesta**: en v1 el paciente reserva, confirma y cancela. Reprogramar es una operación de la recepción (PO-12).

### IN-03 — "Reserva por enlace web" frente a "sin interfaz gráfica"
**Documento A dice**: el paciente reserva "desde un enlace web" (§3).
**Documento B dice**: el MVP es una API sin interfaz web (§9).
**Impacto**: el enlace del email apunta a una API, no a una página.
**Resolución propuesta**: los enlaces apuntan a endpoints públicos; la página que los consume llega en una etapa posterior (SU-07).

### IN-04 — El plazo no cubre la interfaz
**Documento A dice**: el MVP debe estar en 8 a 12 semanas (§9).
**Documento B dice**: sin interfaz, el valor para el paciente y la recepción no se aprecia directamente.
**Impacto**: riesgo de que el MVP no sea demostrable ante clínicas reales.
**Resolución propuesta**: planificar una etapa de interfaz mínima de reserva y agenda inmediatamente después.

## Preguntas abiertas (priorizadas)

| ID | Prioridad | Pregunta | Bloquea | Decisor |
|---|---|---|---|---|
| PO-01 | Alta | ¿Cómo se cobra el SaaS (suscripción fija por clínica o por sillón o profesional)? | Modelo comercial, no el MVP técnico | Equipo de producto |
| PO-02 | Resuelta (DD-12) | ¿Cómo se valida al paciente en la reserva pública: código por email (recomendado), DNI + email, o confirmación de la recepción? | US-031, RN-RE-05 | Equipo de producto y seguridad |
| PO-03 | Alta (región elegida; base legal pendiente) | Región decidida por el Líder: `sa-east-1` (São Paulo). Brasil **no** figura entre los países con nivel adecuado de la AAIP: ¿se firman las cláusulas contractuales modelo (Disposición 60/2016, Resolución 198/2023) o se obtiene un dictamen legal? ¿Qué PaaS ofrece región en São Paulo? | Despliegue (C-20) y elección de proveedor (DD-04) | Equipo con asesoría legal |
| PO-04 | Resuelta (DD-11) | ¿Cómo se da de alta una clínica nueva y quién lo hace (script manual, endpoint interno, autoservicio)? ¿Existe un rol de operador de plataforma? | Épica 8, aprovisionamiento de tenants | Equipo de producto |
| PO-05 | Resuelta (SU-08) | ¿Cuánto antes del turno sale el recordatorio por email (propuesto: 24 hs)? ¿Hay más de un recordatorio? | US-050 | Equipo de producto |
| PO-06 | Media | ¿Qué granularidad usa la grilla de turnos (propuesto: 15 min)? ¿Es configurable por clínica? | Disponibilidad (US-030) | Equipo de producto |
| PO-07 | Media | ¿La recepción puede forzar un turno en feriado o fuera del horario del profesional (sobreturno administrativo)? | RN-AG-07 | Equipo de producto |
| PO-08 | Media | Al bloquear una franja con turnos existentes: ¿se rechaza (propuesto) o se cancelan o reprograman automáticamente? | US-021 | Equipo de producto |
| PO-09 | Media | ¿Hay tope de reservas activas por email o DNI en la reserva pública? ¿Cuál? | RN-RE-05 | Equipo de producto y seguridad |
| PO-10 | Media | ¿Cuánto se retienen los datos tras dar de baja una clínica y las copias de seguridad? (Oclusar publica 90 días como referencia) | Política de datos | Equipo con asesoría legal |
| PO-11 | Media | ¿Hay prestaciones que exijan un tipo de sillón particular (cirugía, ortodoncia)? | Modelo de sillón, SU-05 | Equipo de producto |
| PO-12 | Media | ¿El paciente puede reprogramar por enlace, o solo cancelar y volver a reservar? | IN-02 | Equipo de producto |
| PO-13 | Resuelta (DD-08, DD-09) | ¿Se confirma la arquitectura propuesta (hexagonal, Fastify, SQL explícito, Vitest, cola en PostgreSQL)? | DD-08, DD-09; estructura del repositorio | Equipo técnico |
| PO-14 | Media | ¿Se registra la base ante la AAIP (Ley 25.326) y quién lo gestiona? | Lanzamiento | Equipo con asesoría legal |
| PO-15 | Baja | ¿Quién mantiene los feriados cada año (plantilla nacional más ajustes por clínica)? | US-004 | Equipo técnico |
| PO-16 | Baja | ¿Qué formato tiene la exportación (JSON, CSV, ambos)? | US-062 | Equipo técnico |
| PO-17 | Baja | ¿Se desea activar `team-mode` para generar `CODEOWNERS` y la plantilla de PR? | Flujo de equipo | Líder de fundación |
| PO-18 | Baja | Política de sobreturnos y lista de espera para la v2 | Etapa v2 | Equipo de producto |

## Riesgos pendientes de validación

| ID | Riesgo | Mitigación prevista |
|---|---|---|
| R-01 | La carga manual de recordatorios por WhatsApp genera fricción en recepciones con mucho volumen; solo el email es automático | Medir el ausentismo; priorizar WhatsApp Business API (costo de referencia publicado por DentalSoft: USD 0,026 por recordatorio) |
| R-02 | Reservas falsas o duplicadas por el enlace público | Código por email, límite de tasa y tope de reservas activas (PO-02, PO-09) |
| R-03 | Filtración de datos entre clínicas | RLS forzada, rol sin `BYPASSRLS`, pruebas automatizadas de aislamiento |
| R-04 | El diseño con `timestamptz + interval` en columnas generadas no es válido | *Spike* temprano; columna común más `CHECK` |
| R-05 | El PostgreSQL gestionado elegido no habilita `btree_gist` | Verificarlo antes de elegir el proveedor |
| R-06 | Poca evidencia pública en el mercado del buffer de limpieza, del solapamiento por sillón y de la API pública | Validar los diferenciadores con demos antes de apostar a ellos |
