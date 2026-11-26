# Informe de Discovery — Mercado de software odontológico con gestión de turnos (Argentina y Latinoamérica)

**Materia:** Desarrollo de Software  
**Carrera:** Tecnicatura Universitaria en Programación, UTN  
**Comisión:** 3k09  
**Trabajo:** Trabajo de Integración "Del Discovery al primer Change" (SDD + Active Stack)

**Integrantes:**

- Stocco Bárbara (líder)
- Bricco Martín
- Castro Santiago
- Yanzón Santiago

**Fecha:** 26/11/2026

<div style="page-break-after: always"></div>

## Resumen ejecutivo

**Qué se hizo.** Se relevaron 16 sistemas de software odontológico con gestión de turnos (Argentina y Latinoamérica) a partir de sus páginas oficiales, consultadas el 2026-11-22. Las fuentes se verificaron después: 6 manualmente por la Líder (2026-11-22) y 10 con extracción automática asistida por el agente (2026-11-25). Ninguna funcionalidad se probó en una demo: todo es declaración del proveedor y "No evidenciado" (NE) no significa que la función no exista.

**Ranking.** Con una matriz ponderada de 0 a 5 (turnos 25 %, clínica 20 %, integraciones 15 %, administración 15 %, paciente 10 %, seguridad 10 %, precio 5 %), lideran Oclusar (3,90), AgendaPro (3,75) y DentalSoft (3,70); Atiendo y Bilog empatan en 3,30. Las diferencias menores de 0,3 puntos no son significativas.

**Estándar de mercado.** Agenda multi-profesional, enlace de reserva online, recordatorios y confirmaciones por WhatsApp o email, ficha con odontograma y presupuestos, seguimiento de obras sociales, señas con Mercado Pago, Google Calendar y plan gratuito o prueba.

**Vacíos.** El buffer de limpieza por sillón no está evidenciado en ninguno de los 16. Ningún sitio describe de forma explícita y completa la prevención de solapamientos por profesional y por sillón a la vez. La API pública, la WhatsApp Business API formal, el cumplimiento declarado de la Ley 25.326 y la regla de cancelación con anticipación configurable casi no aparecen. Son ausencias de evidencia pública, no ausencias comprobadas.

**Oportunidades.** Garantía integral de no solapamiento, producto API-first y multi-tenant, aislamiento por clínica con trazabilidad, precios transparentes en pesos, reserva pública sin cuenta con validación por email y ausentismo medible.

**Recomendación.** Analizar en demo a Oclusar, AgendaPro, DentalSoft, Atiendo y Bilog (sexto candidato: Dentalink). Tomar como referencias de experiencia de usuario a Atiendo, DentalSoft y Oclusar. El MVP imprescindible es la prevención de solapamientos con buffer y caso borde, agenda con horarios, feriados y bloqueos, duración por prestación, aislamiento por clínica y roles, ficha básica, reserva pública con código por email, cancelación con 24 hs, email y click-to-chat de WhatsApp, ausentismo y auditoría. El MVP definido (API REST sin interfaz) es coherente con el mercado, pero no compite todavía como producto terminado.

**Límites.** Una o dos páginas por proveedor, sin reseñas verificables de terceros y con puntajes que dependen de criterios del analista: sirven para priorizar demos, no como medición objetiva.

<div style="page-break-after: always"></div>

**Fecha de consulta de todas las fuentes:** 2026-11-22 (verificación de las 16 fuentes: 2026-11-22 y 2026-11-25)  
**Proyecto:** Turnos Odontología (SaaS multi-tenant; MVP como API REST y lógica de dominio)  
**Insumo para:** `kb-creator` (fase `kb`) y `roadmap-generator`  
**Complementa a:** `discovery/discovery.md` (entrevista), `docs/discovery/checklist-discovery.md` (checklist de 11 puntos)

---

## 0. Alcance, método y límites (leer antes de usar los datos)

**Qué se hizo.** Se identificaron sistemas mediante búsqueda web y se relevó la página oficial de cada proveedor (home y, cuando la búsqueda lo indicó, la página de planes o de producto). Se extrajeron únicamente afirmaciones explícitas del sitio. Lo que no aparece se consigna como **NE (No evidenciado)**.

**Niveles de evidencia usados en este informe.** Ninguna funcionalidad fue probada en una demo, por lo que ninguna está "comprobada" en sentido estricto. Se distinguen:

| Código | Significado |
|---|---|
| **D** | Descripta con detalle operativo en la página oficial (cómo funciona, condiciones o límites). Sigue siendo declaración del proveedor. |
| **C** | Mención comercial genérica, sin detalle verificable (ej. "recordatorios automáticos"). |
| **NE** | No evidenciado en las páginas consultadas. **No significa que no exista**: significa que no se demostró públicamente en lo relevado. |

**Límites que condicionan las conclusiones:**

1. **Método de verificación mixto.** El relevamiento inicial se hizo por extracción automática de cada página (lectura y resumen por un modelo auxiliar). En la verificación posterior, las 6 fuentes del 2026-11-22 (https://bilog.com.ar/, https://odontograma.com.ar/, https://reservo.cl/ar/, https://www.dentally.com/en-gb/, https://www.softwaredentalink.com/ar y https://web-latam.softwaremedilink.com/) las abrió y revisó **manualmente** la Líder (Stocco Bárbara). Las otras 10 (2026-11-25) se verificaron con **extracción automática asistida por el agente**, no con una lectura manual completa; en esas 10 puede haber omisiones.
2. **Se consultó una o dos páginas por proveedor.** No se revisaron centros de ayuda, videos oficiales ni páginas de planes de todos. Por eso los **NE son más probables en sitios de una sola página** (OdontoApp, Reservo, Open Dental, OdontoGRAMA).
3. **No se obtuvieron reseñas verificables de terceros.** Capterra devolvió HTTP 403. Las reseñas y cifras de clientes citadas abajo son **publicadas por el propio proveedor** y están marcadas como tales.
4. **Algunas páginas no declaran país de origen.** Se indica solo lo que el sitio permite inferir, marcado como inferencia.
5. **Los puntajes de la sección B** dependen de la evidencia anterior y de criterios del analista (ver nota metodológica). Son una guía para priorizar demos, no una medición objetiva.

---

## Contexto del proyecto (síntesis de la entrevista de Discovery)

Resumen de los 11 puntos del checklist, tomado de `discovery/discovery.md` (entrevista del 2026-11-22). La entrevista se hizo **sin investigar competidores**; este informe cubre ese punto.

| Punto | Síntesis |
|---|---|
| 1. Problema | Solapamientos de profesional y de sillón, y ausentismo, en consultorios y clínicas odontológicas pequeñas o medianas de Argentina. Hoy se resuelve con agenda en papel o Excel y WhatsApp manual. Modelo: SaaS multi-tenant. |
| 2. Usuarios y roles | Recepcionista, odontólogo, paciente y administrador o dueño. |
| 3. Casos de uso | Agendar con paciente, profesional, prestación y sillón; reprogramar o cancelar liberando el horario; reservar o cancelar por enlace web; bloquear franjas por ausencia. |
| 4. Competidores | Sin relevamiento en la entrevista. Práctica actual: papel, Excel y WhatsApp. Se cubre en las secciones A a D de este informe (16 sistemas). |
| 5. Funcionalidades necesarias (v1) | Ficha básica del paciente; recordatorios y confirmación por enlace (click-to-chat de WhatsApp y email automático); agenda diaria y semanal; reserva por enlace web. |
| 6. Funcionalidades opcionales | Lista de espera y sobreturnos, métricas de asistencia, señas con Mercado Pago, facturación ARCA, obras sociales, odontograma e historia clínica, app móvil, interfaz web. |
| 7. Reglas de negocio | Sin solapamiento por profesional ni por sillón (intervalo semiabierto: terminar a las 10:00 y empezar a las 10:00 no solapa); duración variable por prestación; buffer de limpieza por sillón; horarios, feriados y bloqueos; cancelación online con 24 hs de anticipación; registro de ausentismo. |
| 8. Integraciones | MVP: click-to-chat de WhatsApp y email. Posteriores: WhatsApp Business API, Google Calendar, Mercado Pago, ARCA. |
| 9. Restricciones | Bajo costo en la nube; 8 a 12 semanas; TypeScript, Node.js y PostgreSQL; MVP sin interfaz gráfica; Ley 25.326 y aislamiento por clínica; sin datos reales de pacientes en desarrollo; equipo de 4. |
| 10. Riesgos | Fricción del recordatorio manual por WhatsApp; reservas falsas o duplicadas por el enlace público; poca visibilidad de precios de la competencia; datos de salud en un sistema multi-tenant. |
| 11. Preguntas abiertas | Monetización (por clínica o por sillón o profesional); validación de identidad al reservar (DNI y email u OTP); sobreturnos y lista de espera en v2; registro de la base ante la AAIP; cómo se sirve el enlace de reserva sin interfaz web. |

---

## A. Tabla comparativa (16 sistemas, ordenados por relevancia para Argentina)

**Criterio de orden:** presencia o foco declarado en Argentina, profundidad de evidencia pública y cercanía al caso de uso (clínicas pequeñas y medianas con varios profesionales). No es el ranking de la sección B.

### A.1 Identificación, segmento, modalidad y modelo comercial

| # | Producto | Proveedor y país | URL oficial | Segmento | Modalidad | Modelo comercial (según el sitio) | Fecha de consulta |
|---|---|---|---|---|---|---|---|
| 1 | **Oclusar** | Oclusar. Argentina (inferido: leyes argentinas, ARCA, pesos) | https://www.oclusar.com.ar/ | Consultorios individuales y clínicas con equipo; casas dentales y laboratorios vía "Red Oclusar" | Web y celular, sin instalación. "SaaS" no se declara | Plan gratuito sin tarjeta; precios "en pesos"; **montos de planes NE** | 2026-11-22 |
| 2 | **DentalSoft** | DentalSoft. Argentina (oficinas en La Plata y Rosario, "Hecho en Argentina") | https://dentalsoft.com.ar/ | Consultorios y clínicas | SaaS "100% en la nube" | Gratis $0 (50 turnos/mes, 3 meses); Gestión $30.000/mes; Pro $60.000/mes. **Moneda sin código ISO** (símbolo "$"). Demo gratuita con datos de ejemplo | 2026-11-22 |
| 3 | **AgendaPro** | AgendaPro Inc. País de origen NE (respaldo: Y Combinator, Kayyak, Riverwood) | https://agendapro.com/ar/dental/software-odontologico | Consultorios y clínicas, multi-sillón y multi-sede | Nube (AWS). "SaaS" no se declara | Desde $9.900 ARS/mes (plan Individual, mensual, IVA incluido; precios "solo para cuentas nuevas"); prueba 14 días sin tarjeta | 2026-11-22 |
| 4 | **Dentalink** | Engenis SpA. Chile (dirección en Santiago) | https://www.softwaredentalink.com/ar | Consultas individuales y clínicas con varias sedes | "100% en la nube" | Planes Esencial, Pro, Titanium; **precios de planes NE** (solo botones "Solicitá tu cotización"); complemento Contact Center IA "por solo USD 50 al mes"; sin contratos de permanencia; prueba gratuita NE ("prueba gratis" y "demo" no aparecen) | 2026-11-22 |
| 5 | **Bilog** | Bilog. Argentina (inferido: "sector odontológico argentino") | https://bilog.com.ar/ | Consultorios, clínicas, obras sociales y gerenciadoras | App web y móvil; galería "en la nube" | Alta sin costo, mensualidad sin permanencia; **montos y prueba NE** | 2026-11-22 |
| 6 | **Atiendo** | Atiendo (contacto bajo bitpampa.com). Argentina (inferido) | https://atiendoapp.com/ | Consultorios médicos y odontológicos chicos y medianos | SaaS en navegador | Por profesional, plan mensual o anual, en ARS; **montos NE**; prueba 30 días sin tarjeta | 2026-11-22 |
| 7 | **Odonto.ar** | Odonto.ar. País NE | https://odonto.ar/ | Odontólogos desde individuales hasta equipos de 10 | PC, tablet y celular. Nube no declarada | Prueba 30 días; Individual USD 29, Profesional USD 49, Clínica USD 99 (equivalente en ARS publicado); cobro en pesos por Mercado Pago | 2026-11-22 |
| 8 | **Agenda Profesional** | País inferido Argentina ("Hecho para profesionales de la salud en Argentina"); entidad NE | https://www.agenda-profesional.com/ | Profesionales de la salud con consultorio (ejemplo odontológico) | Web; hosting NE. **Sin alta pública**: las cuentas las arma el equipo | Planes, moneda y prueba NE | 2026-11-22 |
| 9 | **OdontoApp** | País NE | https://odontoapp.com.ar/ | Odontólogos y consultorios de Latinoamérica | NE | Sección de planes enlazada, **sin montos visibles** | 2026-11-22 |
| 10 | **OdontoGRAMA** | Solsoftware (copyright Julio Santolo). País NE | https://odontograma.com.ar/ | "Consultorio" en general | Web ("solo necesita internet") | "Acceda a todas las funciones ¡GRATIS!"; planes pagos NE | 2026-11-22 |
| 11 | **Medilink** | Engenis SpA ("Una marca de Healthatom", pie de página). Chile (dirección en Santiago) | https://web-latam.softwaremedilink.com/ | Centros de salud de cualquier tipo; la página **no menciona odontología** ("odont", "dental" y "dentista" no aparecen) | "100% en línea" | Planes enlazados, **precios NE**; sin contratos mínimos | 2026-11-22 |
| 12 | **Dentidesk** | Dentidesk. Chile (oficina en Providencia, Santiago) | https://www.dentidesk.cl/ | Clínicas dentales; también centros médicos y otros | NE | Prueba 15 días; **precios NE** | 2026-11-22 |
| 13 | **Reservo** | País NE (el dominio `.cl` sugiere Chile; es inferencia) | https://reservo.cl/ar/ | "Software médico líder para consultorios argentinos"; **la página no menciona odontología**, es un producto médico general | NE | Precios NE | 2026-11-22 |
| 14 | **CareStack** | Good Methods Global Inc. País NE (selector US, UK, Australia) | https://www.carestack.com/ | Prácticas dentales, grupos y DSO | Nube | Precios NE | 2026-11-22 |
| 15 | **Dentally** | Henry Schein One UK LTD (registro 02940919, Gillingham, Kent). Reino Unido | https://www.dentally.com/en-gb/ | Clínicas independientes y grupos multisede (NHS) | Nube | Precios NE | 2026-11-22 |
| 16 | **Open Dental** | Open Dental Software. País NE | https://www.opendental.com/ | Consultorios de cualquier tamaño | NE | Precios NE; existe "Trial Version" en el menú | 2026-11-22 |

> Nota: Dentalink y Medilink comparten operador (Engenis SpA). No son competidores independientes en términos de propiedad.

### A.2 Capacidades relevadas (D = detalle, C = mención genérica, NE = no evidenciado)

**Agenda**

| Producto | Multi-profesional | Multi-sillón / box | Duración variable | Bloqueos | Sobreturnos | Prevención de solapamientos |
|---|---|---|---|---|---|---|
| Oclusar | D | D ("asignás los sillones") | NE | NE | NE | D ("la agenda te avisa sola si se superpone") |
| DentalSoft | D | NE | NE | D (feriados) | D | D (detección automática) |
| AgendaPro | D | D (ocupación por sillón) | D ("cada práctica con su duración") | NE | NE | NE (solo "disponibilidad real") |
| Dentalink | C | NE | NE | NE | NE | NE |
| Bilog | D | NE | C (estirar el turno) | NE | D | NE |
| Atiendo | D | NE | NE | C ("Bloqueos por vacaciones, congresos o feriados") | NE | NE |
| Odonto.ar | C ("Agenda de todo el equipo") | NE | D | NE | NE | NE |
| Agenda Profesional | C | C (vista "Box") | NE | C ("excepciones") | NE | NE |
| OdontoApp | NE | NE | NE | NE | NE | NE |
| OdontoGRAMA | C | NE | NE | NE | NE | NE |
| Medilink | D | C ("espacios clínicos") | NE | NE | NE | NE |
| Dentidesk | C (indirecto: "Usuarios con Agenda") | NE | NE | NE | NE | NE |
| Reservo | NE | NE | NE | NE | NE | NE |
| CareStack | NE | NE | NE | NE | NE | NE |
| Dentally | NE | NE | NE | NE | NE | NE |
| Open Dental | C (indirecto: "Schedule Setup" por proveedor, en beta) | NE | NE | C (mejoras anunciadas) | NE | NE |

**Turnos digitales y automatización**

| Producto | Reserva online / enlace | WhatsApp | Confirmación | Cancelación por el paciente | Lista de espera | Recordatorios |
|---|---|---|---|---|---|---|
| Oclusar | D (enlace + seña opcional Mercado Pago) | D (número propio del profesional, un toque; envío manual) | D | NE | NE | D (WhatsApp, envío manual) |
| DentalSoft | D (4 pasos, reconoce paciente por DNI) | D (confirma y cancela por WhatsApp; asistente en plan Pro) | D | C ("si el paciente confirma o cancela, la agenda se actualiza sola") | NE | D (WhatsApp manual en Gestión; automático en Pro; email) |
| AgendaPro | D (24/7, Google Maps, asistente IA) | D (asistente IA) | D | C ("cada turno, pago o cancelación reflejado al instante") | NE | D (WhatsApp automático; "1, 2 o 3 días antes" no verificado en la relectura) |
| Dentalink | D | C ("turnos online y por WhatsApp") | C | NE | NE | C (recordatorios WhatsApp) |
| Bilog | D | D | D | D | NE | D (WhatsApp, email o llamada) |
| Atiendo | D (enlace y QR, sin crear cuenta) | Manual (aviso prearmado); recordatorio WhatsApp "próximamente" | D (por email) | D (por email) | D (automática) | D (email) |
| Odonto.ar | D (enlace) | NE | NE | C (reglas definidas por la clínica) | NE | NE |
| Agenda Profesional | D (página de reserva) | NE | D | NE | C ("una lista de espera para cubrir cancelaciones") | C |
| OdontoApp | NE | NE | NE | NE | NE | C |
| OdontoGRAMA | NE | NE | NE | NE | NE | NE |
| Medilink | D | C (solo confirmaciones) | D (email o WhatsApp) | NE | NE | NE ("recordatorio" no aparece) |
| Dentidesk | C (integración disponible) | Anunciado a futuro | NE | NE | NE | C |
| Reservo | C ("turnero online") | NE | NE | NE | NE | NE |
| CareStack | C ("Online Self-service Scheduling"; "Reserve with Google") | NE (SMS bidireccional: C, "Two-way Patient Texting") | D (coordinador IA; sin plan indicado) | NE ("Launching Soon": solo cubrir huecos por cancelación) | NE | C |
| Dentally | C ("Online appointment booking") | NE | C | NE | C ("waitlists" y "short notice appointment filler") | C |
| Open Dental | C (Web Sched) | NE | NE | NE | NE | C |

**Gestión clínica**

| Producto | Odontograma | Periodontograma | Imágenes | Presupuestos | Otros |
|---|---|---|---|---|---|
| Oclusar | C | NE | C | D | Historia clínica con evolución, documentos con firma electrónica |
| DentalSoft | D (18 estados, FDI) | NE | D (5 o 10 GB) | D | Consentimientos, recetas, módulo de ortodoncia |
| AgendaPro | D | NE | C | D | Historia clínica, consentimiento con firma electrónica |
| Dentalink | D | C (solo en una URL) | D | D | Notas clínicas con IA, análisis de radiografías con IA, receta con firma digital |
| Bilog | D | NE | D | D | Firma electrónica (Ley 25.506, afirmación del proveedor) |
| Atiendo | D (FDI) | NE | D | C ("plan de tratamiento") | Plantillas para 33 especialidades |
| Odonto.ar | D | NE | C | C | Historia clínica completa (C) |
| Agenda Profesional | C | C | NE | C | Estudios (C) |
| OdontoApp | C | NE | NE | NE | Historia clínica |
| OdontoGRAMA | NE (solo en el nombre) | NE | C | NE | Ficha de paciente con imágenes |
| Medilink | NE | NE | NE | C (ítem de una lista) | Firma de recetas y certificados |
| Dentidesk | D | NE (hay ficha de Periodoncia) | NE | NE | Fichas por especialidad |
| Reservo | NE | NE | NE | NE | "Ficha clínica electrónica" |
| CareStack | C (charting) | C | C (integraciones) | C (con firma electrónica) | Recetas electrónicas (C) |
| Dentally | C ("Efficient charting") | NE | C ("AI-powered detection") | NE | Notas con IA (C) |
| Open Dental | C (3D) | NE | NE | NE | — |

**Administración, integraciones y operación**

| Producto | Caja / cobros | Facturación electrónica | Mercado Pago | Obras sociales | Reportes | Google Calendar | ARCA/AFIP | API pública | Roles | Auditoría | Exportación | Backup |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Oclusar | D | D (ARCA) | D | D | NE | C | D | NE | D | D (append-only) | D | D |
| DentalSoft | D | NE | D | D | D | D | NE | NE | D | C | C (PDF, Excel) | C |
| AgendaPro | D | C (complemento "Próximamente") | D | NE | D | C | NE | D (US$200/mes en cualquier plan) | C (acceso por profesional) | NE | NE | C |
| Dentalink | D | NE | NE | D | D | NE | NE | C (add-on) | NE | NE | C (Excel) | D (diarios) |
| Bilog | C | C | NE | D | D | NE | NE | NE | NE | NE | NE | NE |
| Atiendo | NE | NE (**no emite factura**, explícito) | D (seña) | D | D | C | NE (**no emite factura**) | NE | D | D | D | C (diarios) |
| Odonto.ar | C (panel) | NE | Solo suscripción | D | NE | NE | NE | NE | C | C (odontograma) | NE (importa Excel) | NE |
| Agenda Profesional | C | NE | D (seña) | C | NE | NE | NE | NE | C | NE | NE | NE |
| OdontoApp | NE | NE | NE | NE | NE | NE | NE | NE | NE | NE | NE | NE |
| OdontoGRAMA | D | NE | NE | D | C | NE | NE | NE | C | NE | NE | C |
| Medilink | C ("Controla el flujo de dinero") | D ("boletas electrónicas", régimen chileno) | NE | NE | D (+80) | D | NE | NE | NE | NE | D (reportes) | NE |
| Dentidesk | C | C (SII, Chile; D solo para República Dominicana) | NE | NE | D (+20) | NE | NE | NE | NE | NE | NE | NE |
| Reservo | NE | C (título "factura AFIP/ARCA") | C | NE | NE | NE | C | NE | NE | NE | NE | NE |
| CareStack | C (US) | NE | NE | C (seguros de EE. UU.) | C | NE | NE | C | NE | NE | NE | C |
| Dentally | C | NE | NE | NE | C ("Real-time reporting") | NE | NE | C (Developer Hub) | NE | NE | NE | NE |
| Open Dental | C | NE | NE | NE | C | NE | NE | NE | NE | NE | NE | NE |

### A.3 Seguridad, cumplimiento y adopción declarados por el proveedor

| Producto | Seguridad y normativa declaradas | Adopción publicada (afirmación del proveedor, no verificada) |
|---|---|---|
| Oclusar | Cifrado en tránsito, copias diarias con restauración probada, hash SHA-256 por documento, plazo de 90 días para descargar la información antes del borrado tras el cierre. Cita Leyes 26.529, 25.326 y 25.506; inscripción como responsable realizada y registro de las bases "en trámite"; REFEPS | Cantidad de clientes NE |
| DentalSoft | Genérico ("seguro"); enlaza política de privacidad y eliminación de datos | 11 reseñas de Google, promedio 5,0 (mostradas en el sitio) |
| AgendaPro | Datos en AWS, cifrado, backups; cita Leyes 25.326 y 26.529 (no verificado en la relectura de 2026-11-25: la página se leyó de forma parcial) | "+30.000" clínicas en Latinoamérica; "4,8 estrellas, +1.200 reseñas" (Capterra, Software Advice, GetApp). "+30.000" clínicas y "135.000 profesionales" miden magnitudes distintas (no se contradicen) |
| Dentalink | ISO 27001 con auditoría anual, AWS cifrado, "alineado a HIPAA". Ley 26.529 solo en un artículo de blog | "+15.000 clínicas", "-30% ausentismo" (afirmaciones del proveedor) |
| Bilog | Solo declaración genérica sobre la información | "+1.500 clínicas", "+5.000 usuarios", "+150.000 turnos/mes", "+10 M pacientes gestionados", 19 testimonios (15 con nombre) |
| Atiendo | Conexión cifrada, datos aislados por consultorio, acceso registrado; secretaria sin acceso a la historia clínica. Sin referencias a la Ley 25.326 | NE |
| Odonto.ar | NE (la pregunta "¿son seguros los datos?" aparece sin respuesta visible) | NE |
| Agenda Profesional | "Tus datos los trata el consultorio que te atiende"; sin medidas descritas | NE |
| OdontoApp | NE | "+100 odontólogos y clínicas" |
| OdontoGRAMA | "Olvídese de los backups" (afirmación sin detalle) | NE |
| Medilink | Enlaza "Políticas de Privacidad", "Acuerdo de procesamiento de datos" y "Política General de Seguridad de la Información"; contenido no leído | "+12.000 clientes", "+60.000 usuarios" |
| Dentidesk | "Se prepara" para la nueva ley de datos de Chile | 3 testimonios con nombre |
| Reservo | NE | NE |
| CareStack | HIPAA, SOC 2 Tipo 2, ISO 27001:2022, GDPR (insignias en la página) | "+3.000 prácticas" |
| Dentally | Sección de seguridad sin detalle | 3 testimonios |
| Open Dental | NE | NE |

### A.4 Fortalezas y limitaciones evidentes (síntesis crítica)

| Producto | Fortaleza respaldada por la evidencia | Limitación o duda |
|---|---|---|
| **Oclusar** | Cobertura local más completa: ARCA, Mercado Pago, obras sociales, Google Calendar, auditoría append-only, exportación, normativa citada | No evidencia lista de espera, duración variable ni bloqueos. Precios de planes NE. WhatsApp con número propio (envío manual), no API |
| **DentalSoft** | Único con precios publicados, detalle de costo de WhatsApp (Meta: "0,026 USD por recordatorio") y detección de solapamientos | Sin multi-sillón evidenciado, sin facturación electrónica, seguridad genérica |
| **AgendaPro** | Multi-sillón y duración variable evidenciados; IA conversacional; mayor escala declarada | Mucho discurso comercial; prevención de solapamientos NE; origen NE; facturación electrónica "Próximamente"; API paga (US$200/mes) |
| **Dentalink** | Madurez y certificación ISO 27001 | Sin precios; detalle de agenda NE; funciones por plan |
| **Bilog** | Mayor base argentina declarada; obras sociales y gerenciadoras | Sin precios, sin seguridad evidenciada |
| **Atiendo** | Mejor experiencia de reserva (sin cuenta, QR, lista de espera automática, seña que se cancela sola) y mejor trazabilidad | No emite factura; WhatsApp automático aún "próximamente"; sin multi-sillón |
| **Odonto.ar** | Precios publicados y por tramos de usuarios | Sin recordatorios ni seguridad evidenciados |
| **Agenda Profesional** | Menciona odontograma, periodontograma y lista de espera (una frase cada uno, sin detalle) | Sin alta pública, sin precios |
| **OdontoApp, OdontoGRAMA, Reservo** | — | Sitios de una página con muy poca evidencia |
| **Medilink, Dentidesk** | Escala regional (Medilink), reportes | Foco chileno (SII), poco encaje con Argentina |
| **CareStack, Dentally, Open Dental** | Seguridad certificada (CareStack: HIPAA, SOC 2 Tipo 2, ISO 27001:2022) y amplitud de funciones clínicas listadas, casi todas como títulos sin detalle | Sin WhatsApp, Mercado Pago ni ARCA evidenciados; orientados a mercados con seguros y NHS |

---

## B. Matriz de puntuación ponderada

| Criterio | Peso |
|---|---|
| T. Gestión de turnos y automatización | 25 % |
| C. Funcionalidad odontológica clínica | 20 % |
| I. Integraciones locales y WhatsApp | 15 % |
| A. Administración, cobros y facturación | 15 % |
| P. Experiencia del paciente | 10 % |
| S. Seguridad, exportación y trazabilidad | 10 % |
| $. Precio y facilidad de adopción | 5 % |

| Producto | T | C | I | A | P | S | $ | **Total ponderado (0-5)** |
|---|---|---|---|---|---|---|---|---|
| Oclusar | 4 | 3 | 4 | 4 | 4 | 5 | 4 | **3,90** |
| AgendaPro | 4 | 3 | 4 | 4 | 4 | 3 | 5 | **3,75** |
| DentalSoft | 4 | 4 | 3 | 4 | 4 | 2 | 5 | **3,70** |
| Atiendo | 4 | 3 | 2 | 3 | 4 | 4 | 3 | **3,30** |
| Bilog | 4 | 4 | 2 | 4 | 4 | 1 | 2 | **3,30** |
| Dentalink | 3 | 4 | 2 | 3 | 3 | 4 | 1 | **3,05** |
| Medilink | 3 | 1 | 1 | 3 | 3 | 1 | 1 | **2,00** |
| Dentidesk | 2 | 3 | 1 | 3 | 1 | 1 | 2 | **2,00** |
| Odonto.ar | 2 | 2 | 1 | 2 | 2 | 1 | 5 | **1,90** |
| CareStack | 2 | 1 | 1 | 1 | 2 | 4 | 1 | **1,65** |
| Agenda Profesional | 2 | 1 | 1 | 2 | 3 | 1 | 1 | **1,60** |
| OdontoGRAMA | 2 | 2 | 0 | 3 | 0 | 1 | 3 | **1,60** |
| Open Dental | 2 | 1 | 1 | 1 | 1 | 0 | 1 | **1,15** |
| Reservo | 1 | 1 | 1 | 2 | 1 | 0 | 1 | **1,05** |
| Dentally | 1 | 1 | 1 | 1 | 1 | 0 | 1 | **0,90** |
| OdontoApp | 1 | 2 | 0 | 0 | 0 | 0 | 1 | **0,70** |

Los totales se calcularon con la suma ponderada de las columnas (script reproducible en la sesión de trabajo).

### Nota metodológica

**Escala por criterio:**

| Puntaje | Significado |
|---|---|
| 0 | Sin ninguna evidencia en las páginas consultadas |
| 1 | Solo menciones genéricas (C) |
| 2 | Capacidad básica descripta (D) en pocos aspectos |
| 3 | Capacidad sólida: varios aspectos con detalle (D) |
| 4 | Capacidad amplia: casi todos los aspectos del criterio con detalle (D) |
| 5 | Cobertura completa con detalle y condiciones explícitas |

**Tratamiento de "No evidenciado":** se puntuó **sin crédito** (equivale a ausencia para el cálculo), de forma conservadora. Esto **penaliza a los sitios de una página** (OdontoApp, Reservo, Open Dental, OdontoGRAMA) y puede subestimar productos que sí tienen la función pero no la publican. Los puntajes bajos de esos sistemas expresan "poca evidencia pública", no "mal producto".

**Otras decisiones:**

- Se puntuó la **capacidad evidenciada**, no la calidad de implementación, que solo una demo puede juzgar.
- En el criterio I (integraciones locales y WhatsApp) se premió la integración con WhatsApp, Google Calendar, Mercado Pago y ARCA, relevantes para Argentina. CareStack, Dentally y Open Dental quedan bajos por falta de esas integraciones, aunque tengan otras.
- En S, CareStack y Dentalink suben por certificaciones declaradas; Oclusar y Atiendo por funciones concretas de trazabilidad.
- El criterio $ no penaliza a quien tiene plan gratuito aunque no publique montos, pero sí cuando no hay ni precios ni prueba.
- Las **diferencias menores de 0,3 puntos no son significativas** dados los márgenes de este método. Atiendo y Bilog quedan empatados (3,30).
- **Reevaluación del 2026-11-25:** al aplicar el criterio D/C estricto a los otros 10 sistemas (ver "Verificación de fuentes"), cambiaron los puntajes de Oclusar (4,10 a 3,90), Atiendo (3,40 a 3,30), Odonto.ar (2,55 a 1,90), Agenda Profesional (2,70 a 1,60), CareStack (3,10 a 1,65) y Open Dental (1,50 a 1,15). Se aplicó la escala tal como está escrita: si en un criterio la evidencia queda solo en menciones de una línea (C), el puntaje de ese criterio baja a 1 o 2. Los 5 primeros puestos no cambian.

---

## C. Análisis competitivo

### C.1 Funcionalidades que ya son estándar de mercado (aparecen en la mayoría de los productos argentinos relevados)

- Agenda multi-profesional con vista por profesional.
- Enlace de reserva online para pacientes.
- Recordatorios y confirmaciones por WhatsApp o email.
- Ficha del paciente con odontograma digital y presupuestos.
- Seguimiento de obras sociales y prepagas (al menos registro).
- Cobro de señas con Mercado Pago.
- Sincronización con Google Calendar.
- Plan gratuito o prueba de 14 a 30 días.

Un MVP sin estas piezas no es competitivo como producto final. Pero el MVP definido (API, sin interfaz) **no compite todavía en producto terminado**: compite como motor sobre el que se construye después.

### C.2 Funcionalidades diferenciadoras reales (presentes en pocos productos)

| Diferenciador | Quién lo evidencia |
|---|---|
| Aviso de solapamiento de agenda | Oclusar, DentalSoft (los demás: NE; en DentalSoft comparte la misma frase con los sobreturnos) |
| Multi-sillón con asignación | Oclusar, AgendaPro |
| Duración variable por prestación | AgendaPro, Odonto.ar (Bilog parcial) |
| Lista de espera automática | Atiendo (Agenda Profesional la menciona) |
| Auditoría de accesos y cambios | Oclusar, Atiendo |
| Facturación electrónica ARCA | Oclusar (AgendaPro la lista como complemento "Próximamente") |
| Asistente de IA por WhatsApp | AgendaPro, DentalSoft Pro, Oclusar (OCLU IA) |
| Certificaciones de seguridad | Dentalink (ISO 27001), CareStack |

### C.3 Vacíos frecuentes del mercado argentino (con el sesgo de los NE)

1. **Buffer de limpieza o desinfección por sillón: no evidenciado en ninguno de los 16.** Es una regla de negocio que definiste como obligatoria.
2. **Prevención de solapamientos por profesional y por sillón a la vez:** ningún sitio la describe de forma explícita y completa. Oclusar y DentalSoft avisan solapamientos, pero no se evidencia el control cruzado.
3. **API pública para integradores:** Dentalink la menciona como complemento y AgendaPro la ofrece por US$200 al mes en cualquier plan, ambas sin documentación técnica visible. El resto no la evidencia.
4. **WhatsApp Business API como integración formal:** ninguno la declara. Oclusar usa el número del profesional y DentalSoft trae un costo por mensaje de Meta que sugiere uso de la API, pero no lo afirma.
5. **Cumplimiento de la Ley 25.326 declarado y concreto:** solo Oclusar y AgendaPro la citan (la de AgendaPro no se pudo reverificar); Atiendo no la cita pero evidencia aislamiento por consultorio.
6. **Transparencia de precios:** apenas DentalSoft, Odonto.ar y AgendaPro (desde) publican montos.
7. **Reglas de cancelación (anticipación mínima):** Odonto.ar dice que la clínica define las reglas sin detalle; ninguno evidencia la regla de 24 hs configurable.

> Importante: estos vacíos son **ausencias de evidencia pública**, no ausencias comprobadas. Deben validarse con demos antes de basar una decisión de producto en ellos.

### C.4 Oportunidades para un nuevo sistema

1. **Garantía fuerte e integral de no solapamiento** (profesional y sillón, buffer, caso borde fin = inicio), presentada como propiedad verificable. Hoy es una promesa vaga en el mercado.
2. **Producto API-first y multi-tenant** para integrarse con otros sistemas y canales. El mercado relevado compite con aplicaciones cerradas.
3. **Aislamiento por clínica y cumplimiento de la Ley 25.326 como argumento comercial**, con trazabilidad real. Pocos lo demuestran.
4. **Precios transparentes en pesos y plan de entrada gratuito**, siguiendo el patrón de DentalSoft y Oclusar.
5. **Reserva pública sin cuenta, con validación mínima anti-abuso** (código por email), tomando el flujo de Atiendo. Resuelve el riesgo de reservas falsas que identificaste.
6. **Ausentismo medible:** Atiendo y DentalSoft evidencian reportes de ausentismo; ninguno muestra cómo se calcula ni cómo se actúa sobre él.

---

## D. Recomendación final

### D.1 Cinco competidores prioritarios para analizar mediante demo

| Prioridad | Producto | Por qué | Qué validar en la demo |
|---|---|---|---|
| 1 | **Oclusar** | Mayor puntaje; el más completo en integración local, trazabilidad y cumplimiento | Si el aviso de solapamiento considera profesional y sillón; reglas de cancelación; lista de espera; precios |
| 2 | **AgendaPro** | Mayor escala declarada; multi-sillón y duración variable evidenciados | Cómo previene solapamientos; calidad real de la IA; precios por profesional |
| 3 | **DentalSoft** | Precios publicados; detección de solapamientos; planes de entrada | Multi-sillón (NE); costo real de WhatsApp; alcance del plan gratuito |
| 4 | **Atiendo** | Mejor flujo de reserva y trazabilidad | Lista de espera, seña con cancelación automática, manejo de múltiples profesionales |
| 5 | **Bilog** | Mayor base argentina declarada; obras sociales y gerenciadoras | Control de solapamientos, seguridad, precios, API |

Sexto candidato: **Dentalink**, por su certificación de seguridad y su API como complemento.

### D.2 Tres referencias de experiencia de usuario

1. **Atiendo:** reserva sin cuenta, QR, lista de espera automática, seña que libera el turno si no se paga.
2. **DentalSoft:** reserva en 4 pasos con reconocimiento por DNI y reprogramación arrastrando con confirmación previa.
3. **Oclusar:** enlace de reserva compartible por WhatsApp o Instagram y recordatorio con un toque.

> Esta selección se basa en descripciones de los sitios, no en uso real. Debe confirmarse en las demos.

### D.3 MVP sugerido

El MVP definido en el Discovery (API REST y lógica de dominio, sin interfaz) **es coherente con el mercado**: Atiendo y el plan Gestión de DentalSoft también trabajan con recordatorios por email automáticos y WhatsApp manual con mensaje prearmado, lo que valida el enfoque de bajo costo del MVP.

**Imprescindible (v1):**

- Prevención de solapamientos por profesional y por sillón, con buffer y caso borde.
- Agenda por profesional con horarios de atención, feriados y bloqueos.
- Duración variable por prestación.
- Aislamiento por clínica (multi-tenant) y control de acceso por roles.
- Ficha básica del paciente.
- Reserva pública por enlace con validación mínima (código por email).
- Cancelación con 24 hs de anticipación configurable.
- Email automático y enlace click-to-chat de WhatsApp.
- Registro de ausentismo.
- Registro de auditoría de accesos y cambios (tomado de Oclusar y Atiendo; refuerza la Ley 25.326).
- Datos de prueba sintéticos únicamente.

**Diferenciadores para reforzar desde el inicio:**

- Garantía de integridad de agenda comprobable con pruebas automatizadas.
- Auditoría append-only de turnos y accesos.
- Exportación de datos de la clínica (Atiendo y Oclusar lo evidencian; es un estándar de confianza).
- Contrato de API documentado como base para integraciones futuras.

**Para etapas posteriores:**

- Interfaz web de reserva y agenda.
- Lista de espera y sobreturnos.
- WhatsApp Business API (costo de referencia por mensaje publicado por DentalSoft: USD 0,026).
- Seña con Mercado Pago.
- Facturación electrónica ARCA.
- Google Calendar.
- Odontograma e historia clínica.
- Métricas avanzadas de ausentismo.
- Liquidación de obras sociales.

### D.4 Hallazgos que cambian o precisan el Discovery previo

1. **Nueva pregunta abierta:** ¿la lista de espera se considera v1? Atiendo y Agenda Profesional la evidencian como parte del flujo de cancelación, y ayuda a recuperar huecos. Quedó fuera del MVP por decisión del equipo; conviene reconfirmarlo.
2. **Riesgo de posicionamiento:** como el MVP no tiene interfaz, el valor se aprecia recién cuando exista un frontend. El plazo de 8 a 12 semanas no cubre esa etapa.
3. **Riesgo 3 del Discovery (poca visibilidad de precios) queda confirmado y matizado:** hay tres proveedores con precios publicados, pero la mayoría no los publica.
4. **Referencia de costo:** los precios publicados van de $9.900 ARS/mes (AgendaPro Individual, "desde") a $60.000/mes (DentalSoft Pro) y USD 29 a 99 por mes (Odonto.ar). Una guía genérica de un proveedor de desarrollo (Develop Argentina) cita un rango de $15.000 a $80.000 mensuales **sin fuente ni metodología**, por lo que se descarta como dato.

---

## Verificación de fuentes

**Método de verificación:** Verificación manual: 6 fuentes, el 2026-11-22, por la Líder. Verificación asistida por el agente: 10 fuentes, el 2026-11-25. **Alcance:** las 16 URLs de las Referencias. Las 10 verificadas con asistencia del agente se consultaron con una extracción de citas textuales; las que tenían datos del informe no reconfirmados (Bilog, Dentalink y Medilink) se consultaron una segunda vez con búsqueda de cadenas exactas. El 2026-11-25 se contrastó cada celda de las tablas A.2 y A.3 de los otros 10 sistemas con el criterio D/C estricto: **D** solo si la página da detalle operativo (cómo funciona, condiciones, límites o plan que la incluye); **C** si es una mención de una línea o un título.

**Límite que persiste (solo para las 10 fuentes verificadas con extracción automática):** la lectura sigue siendo automática y de una sola página por URL. "No evidenciado" significa que la cadena no apareció en el texto extraído, no que la función no exista. Para AgendaPro (texto literal parcial: 39.938 de 72.093 caracteres) y OdontoApp (la extracción trajo la pantalla de carga) la lectura quedó incompleta; se indica en cada ficha.

### 1. https://bilog.com.ar/ — Confirmado, con 1 corrección menor

**Método:** revisión manual de la página (2026-11-22)

| | |
|---|---|
| **Qué decía el informe** | Multi-profesional, sobreturnos, reserva y cancelación online, recordatorios por WhatsApp, odontograma, imágenes, presupuestos, obras sociales, KPIs, firma electrónica (Ley 25.506); sin precios ni prueba; "+1.500 clínicas", "+5.000 usuarios", "+150.000 turnos/mes"; "más de 20 testimonios" |
| **Qué se comprobó hoy** | Todo lo anterior aparece con cita textual. También: "Deslizá → para recordar el turno por WhatsApp, email o llamada"; "No, la configuración inicial no tiene costo. Solo abonás el monto mensual de tu plan"; pago "por tarjeta de crédito/débito, transferencia o depósito bancario"; "+10 M Pacientes gestionados"; "+20 años de experiencia"; filtros "sucursal, especialidad y profesional" |
| **Corregido** | La cantidad de testimonios es **19** (15 con nombre y 4 atribuidos a un rol o negocio), no "más de 20". Las menciones de auditoría ("Control prestacional, validación de procesos y trazabilidad") están orientadas a obras sociales, no a un registro de auditoría del sistema: se mantiene **NE** |
| **Sin cambios** | Multi-sillón, bloqueos, lista de espera, periodontograma, caja, Mercado Pago, Google Calendar, ARCA, API, roles, exportación y backup siguen **NE**. La prueba gratuita sigue **NE** |

### 2. https://odontograma.com.ar/ — Confirmado sin correcciones

**Método:** revisión manual de la página (2026-11-22)

| | |
|---|---|
| **Qué decía el informe** | Producto en la nube; agendas con control de asistencia; ficha con imágenes; caja, cuentas corrientes, facturación a prepagas y obras sociales; estadísticas; acceso gratuito; odontograma solo en el nombre; sin precios |
| **Qué se comprobó hoy** | Cada punto coincide con la cita textual. La empresa (Solsoftware) solo aparece en el enlace del logo; el titular de derechos es "Copyright © 2023 Julio Santolo"; el país **no figura**. El texto no declara que sea específico para odontología ("Es la solución para su consultorio") |
| **Corregido** | Nada. Se mantiene "consultorio en general" como segmento |

### 3. https://reservo.cl/ar/ (frente a https://reservo.cl/) — URL corregida y alcance aclarado

**Método:** revisión manual de la página (2026-11-22)

| | |
|---|---|
| **Qué decía el informe** | Citaba `https://reservo.cl/`; segmento "consultorios médicos argentinos"; Mercado Pago, factura ARCA y turnero online como menciones; todo lo demás NE |
| **Qué se comprobó hoy** | `/ar/` devuelve el título "Software médico con factura AFIP/ARCA en Argentina" y el titular "Software médico líder para consultorios argentinos", con la frase "Turnero online, ficha clínica electrónica, Mercado Pago y cobro en pesos argentinos". Las cadenas odontograma, odontología y dental **no aparecen**. La consulta de la raíz `reservo.cl/` hecha antes devolvió el mismo contenido y la herramienta no informó ninguna redirección, así que no puedo afirmar si el sitio redirige por ubicación |
| **Corregido** | URL oficial pasada a `https://reservo.cl/ar/` (tabla A.1 y Referencias). Se aclara en A.1 que **no es un producto odontológico según esa página**, lo que cuestiona su inclusión como competidor directo. El puntaje se mantiene (1,05) porque ya reflejaba la falta de evidencia |
| **Sin cambios** | Las menciones de Mercado Pago, ARCA y turnero siguen como **C** (aparecen como etiquetas sin detalle) |

### 4. https://www.dentally.com/en-gb/ — Corregido (evidencia sobreestimada)

**Método:** revisión manual de la página (2026-11-22)

| | |
|---|---|
| **Qué decía el informe** | Reserva online "D (portal)", confirmaciones "D", recordatorios "D", charting "D", imágenes "D", reportes "D"; puntaje 2,00 |
| **Qué se comprobó hoy** | Todas esas funciones aparecen solo como frases de una línea sin detalle operativo: "Online appointment booking", "automated reminders and confirmations", "Efficient charting", "Advanced imaging with AI-powered detection", "Real-time reporting". Lo que sí se confirma: empresa y domicilio (Henry Schein One UK LTD, registro 02940919, Gillingham, Kent); "cloud solution"; "waitlists" y "Short notice appointment filler"; "Developer Hub" y "Partner marketplace"; integración con NHS y HSC; 3 testimonios (Kent Smile Studio, The Smile Designers, Love Teeth Dental). Sin precios, sin cifra de clientes, sin mención de GDPR, roles, auditoría ni exportación |
| **Corregido** | Los 6 ítems anteriores pasaron de **D a C** en A.2. URL pasada a `/en-gb/`. En la matriz B, Dentally bajó de **2,00 a 0,90** (T, C y P de 3 a 1, aplicando la escala tal como está escrita: solo menciones genéricas = 1) y se reubicó en la tabla |
| **Aviso de consistencia** | Dentalink y otros productos tienen frases igual de cortas, pero con condiciones concretas (qué plan incluye cada función), por lo que se mantuvieron como **D**. Ese criterio se aplicó a los otros 10 sistemas el 2026-11-25 (fichas 7 a 16) |

### 5. https://www.softwaredentalink.com/ar — Confirmado, con datos agregados

**Método:** revisión manual de la página (2026-11-22)

| | |
|---|---|
| **Qué decía el informe** | Engenis SpA, Chile; nube; planes Esencial, Pro y Titanium sin precios; ISO 27001 con auditoría anual; AWS cifrado con backups diarios; mejores prácticas de HIPAA; API como complemento; "+15.000 clínicas"; "-30% ausentismo"; Ley 26.529 solo en un blog |
| **Qué se comprobó hoy** | La búsqueda dirigida confirma "ISO 27001 y HIPAA" (en la sección de seguridad y en la FAQ), "Amazon Web Services, con datos cifrados y respaldos diarios", "-30% inasistencias" y los botones "Solicitá tu cotización". La cifra "+15.000" aparece con dos rótulos distintos ("Clínicas nos eligen" y "clientes"). Planes: **Esencial** (agenda online, turnos online y por WhatsApp, historia clínica, odontograma, presupuestos, caja y cobros); **Pro** (reportes y dashboard, comisiones, obras sociales, inventario, multicentro, gastos); **Titanium** (módulo de ortodoncia, seguimiento automático de presupuestos, estética facial, reagendamiento automático, cobranza automática, email marketing) |
| **Corregido** | Se agregó el complemento "Contact Center IA por solo USD 50 al mes" y se aclaró que "prueba gratis" y "demo" **no aparecen**, con lo que la prueba gratuita queda **NE** confirmada. No se corrigió ningún dato previo |
| **Observación** | El detalle de agenda (multi-sillón, duración variable, bloqueos, solapamientos) sigue **NE** también en esta página |

### 6. https://web-latam.softwaremedilink.com/ — Corregido (2 ítems) y alcance aclarado

**Método:** revisión manual de la página (2026-11-22)

| | |
|---|---|
| **Qué decía el informe** | Engenis SpA, "marca de Healthatom"; multi-profesional, reserva online, confirmación por email o WhatsApp, recordatorios **C**, presupuestos **D**, caja **D**, boletas electrónicas, 80 reportes, Google Calendar, "+12.000 clientes", "+60.000 usuarios"; vinculado a la odontología |
| **Qué se comprobó hoy** | Confirmado: "Una marca de Healthatom" (pie de página), "42M de citas efectivas", "+20 países", "Firma recetas y certificados sin salir de Medilink", enlaces a "Políticas de Privacidad", "Acuerdo de procesamiento de datos" y "Política General de Seguridad de la Información" (contenido no leído), integración con BSale. **No aparecen** las cadenas "odont", "dental", "dentista" ni "recordatorio" |
| **Corregido** | (1) **Recordatorios** pasó de C a **NE**: la página habla de confirmaciones, no de recordatorios. (2) **Presupuestos** (ítem de una lista) y **caja** ("Controla el flujo de dinero…") pasaron de D a **C**. (3) Se aclaró que la página **no menciona odontología**, por lo que su vínculo con el rubro dental se apoya solo en fuentes secundarias no usadas como evidencia. (4) Facturación se mantiene como D, con la aclaración de que habla de "boletas electrónicas" del régimen chileno |
| **Efecto en puntajes** | Ninguno. Los puntajes de Medilink ya eran bajos o intermedios por estos criterios y no cambian con la corrección |

### 7. https://www.oclusar.com.ar/ — Confirmado, con 3 ajustes de nivel y 2 de redacción

**Método:** extracción automática asistida por el agente (2026-11-25)

| | |
|---|---|
| **Qué decía el informe** | Agenda con aviso de solapamiento y asignación de sillones; reserva con seña por Mercado Pago; WhatsApp con número propio; ARCA, caja, obras sociales, roles, auditoría append-only, exportación y backup con restauración probada; leyes 26.529, 25.326 y 25.506; AAIP "en trámite"; retención de 90 días; plan gratuito sin tarjeta; sin precios de planes ni cifra de clientes |
| **Qué se comprobó el 2026-11-25** | Citas textuales: "la agenda te avisa sola si se superpone con otro", "asignás los sillones", "Pedís una seña por Mercado Pago para reservar", "Append-only: no se edita ni se borra", "Copias diarias fuera del servidor, con restauración probada", "Huella digital SHA-256 por documento", "Facturás desde el cobro, sin salir del sistema ni pelear con la web de ARCA", "Empezás gratis, sin tarjeta", REFEPS y las tres leyes en el pie. El WhatsApp y los recordatorios son de **envío manual** desde el número propio; la página no describe un recordatorio automático |
| **Corregido** | (1) **Odontograma** D a C: solo se nombra "el odontograma" y se muestra una maqueta. (2) **Google Calendar** D a C: una frase ("los turnos aparecen también en tu calendario") sin condiciones. (3) **Reportes** C a NE: la palabra "reportes" no aparece; solo hay una vista de caja ("Cuánto entró y cuánto falta"). Redacción: el registro AAIP dice "Inscripción como responsable realizada (Ley 25.326); registro de las bases en trámite"; los 90 días son un plazo para descargar antes del borrado, no una retención. Se aclara el envío manual de WhatsApp y recordatorios. Efecto en B: criterio C de 4 a 3, total 4,10 a 3,90 |
| **Sin cambios** | Cantidad de clientes y montos de planes siguen NE. La página cita además el Decreto 1089/2012 y el alta en el Registro de Dominios de Interoperabilidad en Salud (no estaban en el informe) |

### 8. https://dentalsoft.com.ar/ — Confirmado, con 2 ajustes de nivel

**Método:** extracción automática asistida por el agente (2026-11-25)

| | |
|---|---|
| **Qué decía el informe** | Multi-profesional, bloqueos, sobreturnos y detección automática de solapamientos; reserva en 4 pasos con DNI; WhatsApp y asistente en plan Pro; odontograma de 18 estados FDI; precios Gratis, Gestión $30.000 y Pro $60.000; costo de Meta 0,026 USD; 11 reseñas de Google, 5,0 |
| **Qué se comprobó el 2026-11-25** | Citas textuales: "Urgencias y sobreturnos con detección automática de solapamiento", "Flujo guiado de 4 pasos", "Reconocimiento automático de pacientes existentes por DNI", "18 estados clínicos, notación FDI", "Meta cobra 0,026 USD por cada recordatorio de WhatsApp", precios $0, $30.000 y $60.000 por mes, "5,0 calificación de 11 reseñas". Los recordatorios por WhatsApp son manuales en Gestión ("No se manda nada de forma automática") y automáticos en Pro; los de email son gratuitos y automáticos |
| **Corregido** | (1) **Cancelación por el paciente** D a C: solo aparece en una captura y en "Si el paciente confirma o cancela, la agenda se actualiza sola", sin flujo ni condiciones. (2) **Exportación** D a C: es una línea del plan ("Copias de seguridad y exportación de datos"). Sin efecto en B |
| **Sin cambios** | Multi-sillón, duración variable, lista de espera, facturación electrónica, ARCA y API siguen NE. Sobreturnos y prevención de solapamientos se apoyan en la misma frase, así que no son dos evidencias independientes (se aclaró en C.2) |

### 9. https://agendapro.com/ar/dental/software-odontologico (y https://agendapro.com/ar/planes) — Corregido (precio y 3 niveles); lectura parcial

**Método:** extracción automática asistida por el agente (2026-11-25)

| | |
|---|---|
| **Qué decía el informe** | Multi-sillón y duración variable; asistente IA por WhatsApp; Mercado Pago; API NE; facturación electrónica listada; AWS, cifrado y backups; Leyes 25.326 y 26.529; "+30.000" clínicas y "135.000 profesionales" como cifras inconsistentes; "4,8 estrellas, +1.200 reseñas"; precio "desde $13.900 ARS/mes" |
| **Qué se comprobó el 2026-11-25** | Citas textuales: "Agenda por odontólogo, práctica y sillón", "Sillón 1 · Ortodoncia 92%", "Tu asistente IA conecta tu WhatsApp, Instagram y Facebook Messenger a tu agenda", "Reservas desde Google Maps", "Integración con Mercado Pago" (todos los planes), "+30.000 clínicas y consultorios en LATAM", "más de 135.000 profesionales de la salud", "4.8" y "+ 1.200 Reseñas" con logos de Capterra, Software Advice y GetApp. Planes mensuales con IVA: Individual $9.900, Básico $19.900, Premium $39.900 y Pro IA $129.900, "solo para cuentas nuevas" |
| **Corregido** | (1) **Precio:** "$13.900" **no aparece** en la página de planes; el mínimo publicado es **$9.900 ARS/mes** (se corrigieron A.1 y D.4). (2) **API pública** NE a D: "con nuestra API para integraciones, disponible en cualquier plan por US$200 al mes" (sin detalle técnico). (3) **Cancelación** D a C y **Google Calendar** D a C: son menciones de una línea. (4) **Facturación electrónica** sigue C pero figura como complemento "Próximamente". (5) Las cifras "+30.000" (clínicas) y "135.000" (profesionales) miden cosas distintas: ya no se las llama inconsistentes. Sin cambios en B (los criterios I y $ se mantienen) |
| **Sin cambios** | **No verificado:** "1, 2 o 3 días antes" de los recordatorios, y AWS, cifrado, backups y Leyes 25.326 y 26.529; el texto literal llegó parcial (39.938 de 72.093 caracteres) y esos datos se conservan marcados como no reverificados. Bloqueos, sobreturnos, lista de espera y solapamientos siguen NE. La página cita además "Certificación CENS e integración con FONASA" (referencias chilenas) |

### 10. https://atiendoapp.com/ — Confirmado, con 3 ajustes de nivel

**Método:** extracción automática asistida por el agente (2026-11-25)

| | |
|---|---|
| **Qué decía el informe** | Reserva por enlace y QR sin cuenta; lista de espera automática; confirmación y cancelación por email; seña con Mercado Pago; roles, auditoría, exportación y backups diarios; sin factura electrónica; aislamiento por consultorio; sin referencias a la Ley 25.326; prueba de 30 días |
| **Qué se comprobó el 2026-11-25** | Citas textuales: "Un link propio de tu consultorio, con tu logo, y un código QR", "Sin crear cuenta", "Si un día está completo, tus pacientes se anotan solos desde tu página de turnos online", "El paciente confirma o cancela con un toque desde el email", "No emite la factura electrónica: eso lo seguís haciendo como hasta ahora", "Cada acceso queda registrado", "Exportá la historia completa de un paciente en PDF", "Odontograma con numeración FDI". La Ley 25.326 **no aparece** (cita la Ley 27.553 de receta electrónica). El texto extraído no trae importes de planes |
| **Corregido** | (1) **Bloqueos** D a C: una viñeta ("Bloqueos por vacaciones, congresos o feriados"). (2) **Google Calendar** D a C: una línea. (3) **Backup** D a C: "copias de seguridad diarias" sin detalle de restauración. Efecto en B: criterio S de 5 a 4, total 3,40 a 3,30 (empata con Bilog) |
| **Sin cambios** | Multi-sillón, duración variable, sobreturnos, periodontograma, caja, ARCA y API siguen NE. La exportación es D pero limitada a un PDF por paciente |

### 11. https://odonto.ar/ — Corregido (4 ítems D a C)

**Método:** extracción automática asistida por el agente (2026-11-25)

| | |
|---|---|
| **Qué decía el informe** | Agenda de equipo, duración variable por motivo, reserva por enlace, odontograma con registro de cambios, imágenes, presupuestos, obras sociales, roles, panel de finanzas; precios USD 29, 49 y 99; sin recordatorios ni seguridad evidenciados |
| **Qué se comprobó el 2026-11-25** | Citas textuales: "Configurás los motivos de consulta y el tiempo de cada uno", "Compartí un link para que tus pacientes elijan un horario disponible", "Consultá tratamientos e historial de cada diente, con registro de quién hizo cada modificación y cuándo", "Configurá los planes y calculá cuánto corresponde a la obra social y cuánto al paciente". Precios confirmados: $29 USD/mes (1 usuario), $49 (5) y $99 (10); prueba de $0 por 30 días. Mercado Pago solo se usa para cobrar la suscripción. La pregunta "¿Están seguros los datos de mis pacientes?" aparece sin respuesta visible (puede estar en un acordeón no extraído) |
| **Corregido** | **Multi-profesional**, **imágenes** ("Radiografías y estudios"), **presupuestos** ("Presupuestos y tratamientos") y **roles** ("Permisos para cada persona del equipo") pasaron de D a C: son viñetas de una línea. Efecto en B: criterios C de 4 a 2, A de 3 a 2 y S de 2 a 1; total 2,55 a 1,90 |
| **Sin cambios** | Precios, duración variable, reserva, odontograma y obras sociales confirmados como D. Exportación sigue NE (solo hay importación desde Excel). Recordatorios y WhatsApp para pacientes NE. Seguridad NE: no se concluye porque la respuesta pudo no extraerse |

### 12. https://www.agenda-profesional.com/ — Corregido (6 ítems D a C)

**Método:** extracción automática asistida por el agente (2026-11-25)

| | |
|---|---|
| **Qué decía el informe** | Reserva por página, confirmación y seña por Mercado Pago, lista de espera, odontograma y periodontograma, presupuestos, caja, obras sociales; "Los datos los trata el consultorio"; sin alta pública, sin precios |
| **Qué se comprobó el 2026-11-25** | Citas textuales: "El paciente elige servicio, día y hora, y recibe la confirmación", "El paciente puede confirmar, reprogramar o pagar la seña desde su enlace", "Si lo activás, el turno se confirma cuando se acredita la seña", "una lista de espera para cubrir cancelaciones", "Incluye odontograma, periodontograma y estudios", "Ficha, historia clínica, presupuestos, tratamientos y pagos", "las cuentas las arma el equipo, no hay alta pública". La cita de seguridad es "Tus datos los trata el consultorio que te atiende" |
| **Corregido** | **Lista de espera**, **odontograma**, **periodontograma**, **presupuestos**, **caja** y **obras sociales** pasaron de D a C: son enumeraciones de una frase sin mecánica. Se corrigió la cita de seguridad. Efecto en B: criterios T de 3 a 2, C de 4 a 1, A de 3 a 2 y P de 4 a 3; total 2,70 a 1,60 |
| **Sin cambios** | Reserva, confirmación y seña con Mercado Pago siguen D. Duración variable, sobreturnos, imágenes, facturación, reportes, Google Calendar, API, auditoría, exportación y backup siguen NE. Las cifras "Reservas web 41%" y "Pacientes 128" son de una captura de demo, no de adopción |

### 13. https://odontoapp.com.ar/ — Confirmado, con lectura incompleta

**Método:** extracción automática asistida por el agente (2026-11-25)

| | |
|---|---|
| **Qué decía el informe** | Todo NE salvo recordatorios, odontograma e historia clínica como menciones; "+100 odontólogos y clínicas"; país NE; planes sin montos visibles |
| **Qué se comprobó el 2026-11-25** | La extracción trajo la pantalla de carga ("Cargando OdontoApp") con el texto de portada; las secciones de funcionalidades, planes y preguntas frecuentes no llegaron. Cita: "Agenda digital, historia clínica, odontograma y recordatorios automáticos"; "Más de 100 odontólogos y clínicas ya gestionan su consultorio con OdontoApp". Lista 20 países donde está disponible; no declara país de origen ni precios |
| **Corregido** | Nada. "Agenda digital" es una mención sin subfunciones, por lo que no sostiene multi-profesional ni ninguna otra columna de agenda |
| **Sin cambios** | Todos los NE: significan que la cadena no apareció en el texto extraído, no que la función no exista. Es el sistema con menor confiabilidad del informe |

### 14. https://www.dentidesk.cl/ — Confirmado, con 3 ajustes de nivel

**Método:** extracción automática asistida por el agente (2026-11-25)

| | |
|---|---|
| **Qué decía el informe** | Odontograma D; reserva online, WhatsApp futuro y recordatorios como C; facturación D (SII); reportes D (+20); "Se prepara" para la nueva ley de datos de Chile; 3 testimonios con nombre; prueba de 15 días |
| **Qué se comprobó el 2026-11-25** | Citas textuales: "recordatorios personalizados", "WhatsApp automático es una de las próximas alternativas que queremos sumar", "más de 20 tipos de reportes financieros y administrativos", "Todo está completamente integrado con el SII", "DENTIDESK ya se está preparando para estos cambios", "Prueba DENTIDESK gratis por 15 días". El odontograma tiene detalle (nomenclatura chilena, internacional y universal; ruta de configuración Administrador, Usuarios, Usuarios con Agenda). Sede en Providencia, Santiago; clientes también en República Dominicana y Cabo Verde |
| **Corregido** | (1) **Multi-profesional** NE a C (indirecto: "Usuarios con Agenda"). (2) **Caja** NE a C ("al registrar un pago dentro de DENTIDESK"). (3) **Facturación electrónica** D a C para Chile: la integración con el SII se afirma sin condiciones; sigue D solo para República Dominicana, donde se detalla "la configuración y certificación directamente con Alegra". Sin efecto en B |
| **Sin cambios** | Periodontograma sigue NE (hay una ficha "Periodoncia", no un periodontograma). Aparecen además "Gestión de Insumos y Stock" (C) y el reporte REMASEP de Chile ("Próximamente") |

### 15. https://www.carestack.com/ — Corregido (10 ítems D a C)

**Método:** extracción automática asistida por el agente (2026-11-25)

| | |
|---|---|
| **Qué decía el informe** | Reserva online, recordatorios, charting, periodontograma, imágenes, presupuestos con firma, caja, seguros y backup como D; coordinador IA D; HIPAA, SOC 2 Tipo 2, ISO 27001:2022 y GDPR; "+3.000" prácticas; Good Methods Global Inc.; puntaje 3,10 |
| **Qué se comprobó el 2026-11-25** | La página es sobre todo una lista de títulos con una línea o ninguna de descripción: "Online Self-service Scheduling", "Built-in Appointment Reminders", "General and Perio Clinical Charting", "Periodontal Charting", "Digital Imaging Integrations", "Treatment Planning with E-signatures", "Always-On Backups". Citas confirmadas: "CareStack is fully compliant with HIPAA and possesses SOC 2 Type 2 and ISO 27001:2022 certifications", "More than 3000 dental practices trust CareStack", "© 2017 - 2026 Good Methods Global Inc.". GDPR aparece solo como insignia. Precios NE |
| **Corregido** | **Reserva online, Reserve with Google, recordatorios, odontograma, periodontograma, imágenes, presupuestos, caja, obras sociales y backup** pasaron de D a C. "Two-way Patient Texting" pasó de NE a C. La **cancelación** del paciente: "Launching Soon" aplica a rellenar huecos por cancelación, no a que el paciente cancele, por lo que queda NE. Efecto en B: criterios T de 3 a 2, C de 5 a 1, A de 3 a 1 y P de 3 a 2; total 3,10 a 1,65 |
| **Sin cambios** | La confirmación por el coordinador IA sigue D ("Confirms appointments through calls, texts, and emails"; estado "Available Now"), sin plan indicado. Seguridad sigue D (certificaciones con cita textual). El texto extraído terminó truncado: no se leyó el pie completo |

### 16. https://www.opendental.com/ — Corregido (3 ítems)

**Método:** extracción automática asistida por el agente (2026-11-25)

| | |
|---|---|
| **Qué decía el informe** | Web Sched C; odontograma 3D D; reportes D; bloqueos con mejoras anunciadas C; caja C; sin adopción, precios ni seguridad |
| **Qué se comprobó el 2026-11-25** | Citas textuales: "Enhancements to Blockouts" (versión 26.3 beta), "Web Sched" y "Automated Messaging" como eServices, "3D tooth chart shows patient dentition and treatment over time", "Built-in, Graphic, and User Queries" (solo enlaces), "at an affordable price for practices of any size". Es la página de inicio: varias funciones solo aparecen como enlaces a subpáginas no leídas. País, adopción y normativa NE |
| **Corregido** | **Odontograma** D a C (una frase sin detalle operativo); **Reportes** D a C (solo enlaces en la portada; el detalle estaría en una subpágina no leída); **Multi-profesional** NE a C (indirecto, en beta: "Schedule Setup" por empleado y proveedor). Efecto en B: criterios C de 2 a 1 y A de 2 a 1; total 1,50 a 1,15 |
| **Sin cambios** | Facturación, Mercado Pago, Google Calendar, ARCA, roles, auditoría, exportación y backup siguen NE. "20+ Clearinghouses" son reclamos a seguros dentales de EE. UU., no obras sociales |

### Resumen de cambios aplicados

| URL | Resultado | Cambios en el informe |
|---|---|---|
| bilog.com.ar | Confirmado | Testimonios: 19 (15 con nombre); se agrega "+10 M pacientes gestionados" |
| odontograma.com.ar | Confirmado | Ninguno |
| reservo.cl/ar/ | Corregido | URL; aclaración de que no es dental |
| dentally.com/en-gb/ | Corregido | 6 ítems D a C; URL; puntaje 2,00 a 0,90 |
| softwaredentalink.com/ar | Confirmado | Se agrega precio del Contact Center IA y detalle por plan |
| web-latam.softwaremedilink.com | Corregido | Recordatorios C a NE; presupuestos y caja D a C; sin odontología |
| oclusar.com.ar | Confirmado con ajustes | Odontograma y Google Calendar D a C; reportes C a NE; AAIP y 90 días reformulados; puntaje 4,10 a 3,90 |
| dentalsoft.com.ar | Confirmado con ajustes | Cancelación y exportación D a C |
| agendapro.com/ar | Corregido | Precio $13.900 a $9.900; API NE a D; cancelación y Google Calendar D a C; cifras ya no "inconsistentes" |
| atiendoapp.com | Confirmado con ajustes | Bloqueos, Google Calendar y backup D a C; puntaje 3,40 a 3,30 |
| odonto.ar | Corregido | Multi-profesional, imágenes, presupuestos y roles D a C; puntaje 2,55 a 1,90 |
| agenda-profesional.com | Corregido | 6 ítems D a C; cita de seguridad; puntaje 2,70 a 1,60 |
| odontoapp.com.ar | Confirmado (lectura incompleta) | Ninguno |
| dentidesk.cl | Confirmado con ajustes | Multi-profesional y caja NE a C; facturación D a C (Chile) |
| carestack.com | Corregido | 10 ítems D a C; puntaje 3,10 a 1,65 |
| opendental.com | Corregido | Odontograma y reportes D a C; multi-profesional NE a C; puntaje 1,50 a 1,15 |

### Efecto sobre las conclusiones

- **Puntajes:** cambian seis (ver la nota metodológica de la sección B). Los cinco primeros puestos y su orden no cambian: Oclusar (3,90), AgendaPro (3,75), DentalSoft (3,70), Atiendo (3,30) y Bilog (3,30, empatado). Las secciones C y D se ajustaron donde citaban datos corregidos (API pública, precio de AgendaPro, perfil de CareStack y de Agenda Profesional).
- **Límites que persisten (en las 10 fuentes verificadas con extracción automática):** la lectura sigue siendo automática y de una sola página por sitio; AgendaPro se leyó de forma parcial y OdontoApp solo mostró la pantalla de carga. Un NE significa "no apareció en el texto extraído", no "no existe". Lo que sigue sin hacerse (centros de ayuda, demos en vivo y reseñas verificables) está listado en las Referencias.

---

## Referencias

**Fecha de consulta de las fuentes:** 2026-11-22.

**Sitios oficiales leídos**

| Producto | URL |
|---|---|
| Oclusar | https://www.oclusar.com.ar/ |
| DentalSoft | https://dentalsoft.com.ar/ |
| AgendaPro | https://agendapro.com/ar/dental/software-odontologico |
| Dentalink | https://www.softwaredentalink.com/ar |
| Bilog | https://bilog.com.ar/ |
| Atiendo | https://atiendoapp.com/ |
| Odonto.ar | https://odonto.ar/ |
| Agenda Profesional | https://www.agenda-profesional.com/ |
| OdontoApp | https://odontoapp.com.ar/ |
| OdontoGRAMA | https://odontograma.com.ar/ |
| Medilink | https://web-latam.softwaremedilink.com/ (redirige desde medilink.cl) |
| Dentidesk | https://www.dentidesk.cl/ |
| Reservo | https://reservo.cl/ar/ |
| CareStack | https://www.carestack.com/ |
| Dentally | https://www.dentally.com/en-gb/ |
| Open Dental | https://www.opendental.com/ |

**Fuentes secundarias (solo para identificar candidatos; no se usan como evidencia de funcionalidades)**

- Resultados de búsqueda web del 2026-11-22 sobre software odontológico en Argentina y Latinoamérica.
- https://developargentina.com/blog/software-clinicas-consultorios-argentina-2026 (contenido de marketing de un proveedor de desarrollo; cifras sin fuente).
- Capterra, GetApp y comparativas de Medesk y Softwaredoit: **no se usaron como evidencia** (Capterra devolvió HTTP 403; las demás son sitios comerciales con intereses propios).

**Pendientes de verificación (no realizados en esta pasada)**

- Páginas de planes y centros de ayuda de cada proveedor.
- Videos oficiales y demos en vivo.
- Reseñas verificables de terceros.
- Productos argentinos adicionales mencionados en los resultados y no relevados: Turnera, TurneroMed y otras opciones de turnos para consultorios en general.
