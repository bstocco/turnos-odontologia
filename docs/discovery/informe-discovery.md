# Informe de Discovery — Mercado de software odontológico con gestión de turnos (Argentina y Latinoamérica)

**Fecha de consulta de todas las fuentes:** 2026-11-22
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

1. **La extracción de cada página fue automática** (lectura y resumen de la página por un modelo auxiliar), no una lectura manual completa. Puede haber omisiones.
2. **Se consultó una o dos páginas por proveedor.** No se revisaron centros de ayuda, videos oficiales ni páginas de planes de todos. Por eso los **NE son más probables en sitios de una sola página** (OdontoApp, Reservo, Open Dental, OdontoGRAMA).
3. **No se obtuvieron reseñas verificables de terceros.** Capterra devolvió HTTP 403. Las reseñas y cifras de clientes citadas abajo son **publicadas por el propio proveedor** y están marcadas como tales.
4. **Algunas páginas no declaran país de origen.** Se indica solo lo que el sitio permite inferir, marcado como inferencia.
5. **Los puntajes de la sección B** dependen de la evidencia anterior y de criterios del analista (ver nota metodológica). Son una guía para priorizar demos, no una medición objetiva.

---

## A. Tabla comparativa (16 sistemas, ordenados por relevancia para Argentina)

**Criterio de orden:** presencia o foco declarado en Argentina, profundidad de evidencia pública y cercanía al caso de uso (clínicas pequeñas y medianas con varios profesionales). No es el ranking de la sección B.

### A.1 Identificación, segmento, modalidad y modelo comercial

| # | Producto | Proveedor y país | URL oficial | Segmento | Modalidad | Modelo comercial (según el sitio) |
|---|---|---|---|---|---|---|
| 1 | **Oclusar** | Oclusar. Argentina (inferido: leyes argentinas, ARCA, pesos) | https://www.oclusar.com.ar/ | Consultorios individuales y clínicas con equipo; casas dentales y laboratorios vía "Red Oclusar" | Web y celular, sin instalación. "SaaS" no se declara | Plan gratuito sin tarjeta; precios "en pesos"; **montos de planes NE** |
| 2 | **DentalSoft** | DentalSoft. Argentina (oficinas en La Plata y Rosario, "Hecho en Argentina") | https://dentalsoft.com.ar/ | Consultorios y clínicas | SaaS "100% en la nube" | Gratis $0 (50 turnos/mes, 3 meses); Gestión $30.000/mes; Pro $60.000/mes. **Moneda sin código ISO** (símbolo "$"). Demo gratuita con datos de ejemplo |
| 3 | **AgendaPro** | AgendaPro Inc. País de origen NE (respaldo: Y Combinator, Kayyak, Riverwood) | https://agendapro.com/ar/dental/software-odontologico | Consultorios y clínicas, multi-sillón y multi-sede | Nube (AWS). "SaaS" no se declara | Desde "$13.900 ARS/mes"; prueba 14 días sin tarjeta |
| 4 | **Dentalink** | Engenis SpA. Chile (dirección en Santiago) | https://www.softwaredentalink.com/ar | Consultas individuales y clínicas con varias sedes | "100% en la nube" | Planes Esencial, Pro, Titanium; **precios de planes NE** (solo botones "Solicitá tu cotización"); complemento Contact Center IA "por solo USD 50 al mes"; sin contratos de permanencia; prueba gratuita NE ("prueba gratis" y "demo" no aparecen) |
| 5 | **Bilog** | Bilog. Argentina (inferido: "sector odontológico argentino") | https://bilog.com.ar/ | Consultorios, clínicas, obras sociales y gerenciadoras | App web y móvil; galería "en la nube" | Alta sin costo, mensualidad sin permanencia; **montos y prueba NE** |
| 6 | **Atiendo** | Atiendo (contacto bajo bitpampa.com). Argentina (inferido) | https://atiendoapp.com/ | Consultorios médicos y odontológicos chicos y medianos | SaaS en navegador | Por profesional, plan mensual o anual, en ARS; **montos NE**; prueba 30 días sin tarjeta |
| 7 | **Odonto.ar** | Odonto.ar. País NE | https://odonto.ar/ | Odontólogos desde individuales hasta equipos de 10 | PC, tablet y celular. Nube no declarada | Prueba 30 días; Individual USD 29, Profesional USD 49, Clínica USD 99 (equivalente en ARS publicado); cobro en pesos por Mercado Pago |
| 8 | **Agenda Profesional** | País inferido Argentina ("Hecho para profesionales de la salud en Argentina"); entidad NE | https://www.agenda-profesional.com/ | Profesionales de la salud con consultorio (ejemplo odontológico) | Web; hosting NE. **Sin alta pública**: las cuentas las arma el equipo | Planes, moneda y prueba NE |
| 9 | **OdontoApp** | País NE | https://odontoapp.com.ar/ | Odontólogos y consultorios de Latinoamérica | NE | Sección de planes enlazada, **sin montos visibles** |
| 10 | **OdontoGRAMA** | Solsoftware (copyright Julio Santolo). País NE | https://odontograma.com.ar/ | "Consultorio" en general | Web ("solo necesita internet") | "Acceda a todas las funciones ¡GRATIS!"; planes pagos NE |
| 11 | **Medilink** | Engenis SpA ("Una marca de Healthatom", pie de página). Chile (dirección en Santiago) | https://web-latam.softwaremedilink.com/ | Centros de salud de cualquier tipo; la página **no menciona odontología** ("odont", "dental" y "dentista" no aparecen) | "100% en línea" | Planes enlazados, **precios NE**; sin contratos mínimos |
| 12 | **Dentidesk** | Dentidesk. Chile (oficina en Providencia, Santiago) | https://www.dentidesk.cl/ | Clínicas dentales; también centros médicos y otros | NE | Prueba 15 días; **precios NE** |
| 13 | **Reservo** | País NE (el dominio `.cl` sugiere Chile; es inferencia) | https://reservo.cl/ar/ | "Software médico líder para consultorios argentinos"; **la página no menciona odontología**, es un producto médico general | NE | Precios NE |
| 14 | **CareStack** | Good Methods Global Inc. País NE (selector US, UK, Australia) | https://www.carestack.com/ | Prácticas dentales, grupos y DSO | Nube | Precios NE |
| 15 | **Dentally** | Henry Schein One UK LTD (registro 02940919, Gillingham, Kent). Reino Unido | https://www.dentally.com/en-gb/ | Clínicas independientes y grupos multisede (NHS) | Nube | Precios NE |
| 16 | **Open Dental** | Open Dental Software. País NE | https://www.opendental.com/ | Consultorios de cualquier tamaño | NE | Precios NE; existe "Trial Version" en el menú |

> Nota: Dentalink y Medilink comparten operador (Engenis SpA). No son competidores independientes en términos de propiedad.

### A.2 Capacidades relevadas (D = detalle, C = mención genérica, NE = no evidenciado)

**Agenda**

| Producto | Multi-profesional | Multi-sillón / box | Duración variable | Bloqueos | Sobreturnos | Prevención de solapamientos |
|---|---|---|---|---|---|---|
| Oclusar | D | D ("asignás los sillones") | NE | NE | NE | D ("la agenda te avisa sola si se superpone") |
| DentalSoft | D | NE | NE | D (feriados) | D | D (detección automática) |
| AgendaPro | D | D (ocupación por sillón) | D (por procedimiento) | NE | NE | NE (solo "disponibilidad real") |
| Dentalink | C | NE | NE | NE | NE | NE |
| Bilog | D | NE | C (estirar el turno) | NE | D | NE |
| Atiendo | D | NE | NE | D | NE | NE |
| Odonto.ar | D | NE | D | NE | NE | NE |
| Agenda Profesional | C | C (vista "Box") | NE | C ("excepciones") | NE | NE |
| OdontoApp | NE | NE | NE | NE | NE | NE |
| OdontoGRAMA | C | NE | NE | NE | NE | NE |
| Medilink | D | C ("espacios clínicos") | NE | NE | NE | NE |
| Dentidesk | NE | NE | NE | NE | NE | NE |
| Reservo | NE | NE | NE | NE | NE | NE |
| CareStack | NE | NE | NE | NE | NE | NE |
| Dentally | NE | NE | NE | NE | NE | NE |
| Open Dental | NE | NE | NE | C (mejoras anunciadas) | NE | NE |

**Turnos digitales y automatización**

| Producto | Reserva online / enlace | WhatsApp | Confirmación | Cancelación por el paciente | Lista de espera | Recordatorios |
|---|---|---|---|---|---|---|
| Oclusar | D (enlace + seña opcional Mercado Pago) | D (número propio del profesional, un toque) | D | NE | NE | D (WhatsApp) |
| DentalSoft | D (4 pasos, reconoce paciente por DNI) | D (confirma y cancela por WhatsApp; asistente en plan Pro) | D | D | NE | D (WhatsApp manual en Gestión; automático en Pro; email) |
| AgendaPro | D (24/7, Google Maps, asistente IA) | D (asistente IA) | D | D | NE | D (WhatsApp 1, 2 o 3 días antes) |
| Dentalink | D | C ("turnos online y por WhatsApp") | C | NE | NE | C (recordatorios WhatsApp) |
| Bilog | D | D | D | D | NE | D (WhatsApp, email o llamada) |
| Atiendo | D (enlace y QR, sin crear cuenta) | Manual (aviso prearmado); recordatorio WhatsApp "próximamente" | D (por email) | D (por email) | D (automática) | D (email) |
| Odonto.ar | D (enlace) | NE | NE | C (reglas definidas por la clínica) | NE | NE |
| Agenda Profesional | D (página de reserva) | NE | D | NE | D | C |
| OdontoApp | NE | NE | NE | NE | NE | C |
| OdontoGRAMA | NE | NE | NE | NE | NE | NE |
| Medilink | D | C (solo confirmaciones) | D (email o WhatsApp) | NE | NE | NE ("recordatorio" no aparece) |
| Dentidesk | C (integración disponible) | Anunciado a futuro | NE | NE | NE | C |
| Reservo | C ("turnero online") | NE | NE | NE | NE | NE |
| CareStack | D (+ Reserve with Google) | NE (SMS bidireccional) | D (coordinador IA) | "Próximamente" | NE | D |
| Dentally | C ("Online appointment booking") | NE | C | NE | C ("waitlists" y "short notice appointment filler") | C |
| Open Dental | C (Web Sched) | NE | NE | NE | NE | C |

**Gestión clínica**

| Producto | Odontograma | Periodontograma | Imágenes | Presupuestos | Otros |
|---|---|---|---|---|---|
| Oclusar | D | NE | C | D | Historia clínica con evolución, documentos con firma electrónica |
| DentalSoft | D (18 estados, FDI) | NE | D (5 o 10 GB) | D | Consentimientos, recetas, módulo de ortodoncia |
| AgendaPro | D | NE | C | D | Historia clínica, consentimiento con firma electrónica |
| Dentalink | D | C (solo en una URL) | D | D | Notas clínicas con IA, análisis de radiografías con IA, receta con firma digital |
| Bilog | D | NE | D | D | Firma electrónica (Ley 25.506, afirmación del proveedor) |
| Atiendo | D (FDI) | NE | D | C ("plan de tratamiento") | Plantillas para 33 especialidades |
| Odonto.ar | D | NE | D | D | Historia clínica completa |
| Agenda Profesional | D | D | NE | D | Estudios |
| OdontoApp | C | NE | NE | NE | Historia clínica |
| OdontoGRAMA | NE (solo en el nombre) | NE | C | NE | Ficha de paciente con imágenes |
| Medilink | NE | NE | NE | C (ítem de una lista) | Firma de recetas y certificados |
| Dentidesk | D | NE (hay ficha de Periodoncia) | NE | NE | Fichas por especialidad |
| Reservo | NE | NE | NE | NE | "Ficha clínica electrónica" |
| CareStack | D (charting) | D | D (integraciones) | D (con firma electrónica) | Recetas electrónicas |
| Dentally | C ("Efficient charting") | NE | C ("AI-powered detection") | NE | Notas con IA (C) |
| Open Dental | D (3D) | NE | NE | NE | — |

**Administración, integraciones y operación**

| Producto | Caja / cobros | Facturación electrónica | Mercado Pago | Obras sociales | Reportes | Google Calendar | ARCA/AFIP | API pública | Roles | Auditoría | Exportación | Backup |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Oclusar | D | D (ARCA) | D | D | C | D | D | NE | D | D (append-only) | D | D |
| DentalSoft | D | NE | D | D | D | D | NE | NE | D | C | D (PDF, Excel) | C |
| AgendaPro | D | C (listada, sin detalle) | D | NE | D | D | NE | NE (hay enlace a Integraciones) | C (acceso por profesional) | NE | NE | C |
| Dentalink | D | NE | NE | D | D | NE | NE | C (add-on) | NE | NE | C (Excel) | D (diarios) |
| Bilog | C | C | NE | D | D | NE | NE | NE | NE | NE | NE | NE |
| Atiendo | NE | NE (**no emite factura**, explícito) | D (seña) | D | D | D | NE (**no emite factura**) | NE | D | D | D | D (diarios) |
| Odonto.ar | C (panel) | NE | Solo suscripción | D | NE | NE | NE | NE | D | C (odontograma) | NE (importa Excel) | NE |
| Agenda Profesional | D | NE | D (seña) | D | NE | NE | NE | NE | C | NE | NE | NE |
| OdontoApp | NE | NE | NE | NE | NE | NE | NE | NE | NE | NE | NE | NE |
| OdontoGRAMA | D | NE | NE | D | C | NE | NE | NE | C | NE | NE | C |
| Medilink | C ("Controla el flujo de dinero") | D ("boletas electrónicas", régimen chileno) | NE | NE | D (+80) | D | NE | NE | NE | NE | D (reportes) | NE |
| Dentidesk | NE | D (SII, Chile) | NE | NE | D (+20) | NE | NE | NE | NE | NE | NE | NE |
| Reservo | NE | C (título "factura AFIP/ARCA") | C | NE | NE | NE | C | NE | NE | NE | NE | NE |
| CareStack | D (US) | NE | NE | D (seguros de EE. UU.) | C | NE | NE | C | NE | NE | NE | D |
| Dentally | C | NE | NE | NE | C ("Real-time reporting") | NE | NE | C (Developer Hub) | NE | NE | NE | NE |
| Open Dental | C | NE | NE | NE | D | NE | NE | NE | NE | NE | NE | NE |

### A.3 Seguridad, cumplimiento y adopción declarados por el proveedor

| Producto | Seguridad y normativa declaradas | Adopción publicada (afirmación del proveedor, no verificada) |
|---|---|---|
| Oclusar | Cifrado en tránsito, copias diarias con restauración probada, hash SHA-256 por documento, retención de 90 días tras cierre. Cita Leyes 26.529, 25.326 y 25.506; inscripción AAIP "en trámite"; REFEPS | Cantidad de clientes NE |
| DentalSoft | Genérico ("seguro"); enlaza política de privacidad y eliminación de datos | 11 reseñas de Google, promedio 5,0 (mostradas en el sitio) |
| AgendaPro | Datos en AWS, cifrado, backups; cita Leyes 25.326 y 26.529 | "+30.000" clínicas en Latinoamérica; "4,8 estrellas, +1.200 reseñas" (Capterra, Software Advice, GetApp). Cifras internas inconsistentes: "+30.000" vs "135.000 profesionales" |
| Dentalink | ISO 27001 con auditoría anual, AWS cifrado, "alineado a HIPAA". Ley 26.529 solo en un artículo de blog | "+15.000 clínicas", "-30% ausentismo" (afirmaciones del proveedor) |
| Bilog | Solo declaración genérica sobre la información | "+1.500 clínicas", "+5.000 usuarios", "+150.000 turnos/mes", "+10 M pacientes gestionados", 19 testimonios (15 con nombre) |
| Atiendo | Conexión cifrada, datos aislados por consultorio, acceso registrado; secretaria sin acceso a la historia clínica. Sin referencias a la Ley 25.326 | NE |
| Odonto.ar | NE (la pregunta "¿son seguros los datos?" aparece sin respuesta visible) | NE |
| Agenda Profesional | "Los datos los trata el consultorio"; sin medidas descritas | NE |
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
| **Oclusar** | Cobertura local más completa: ARCA, Mercado Pago, obras sociales, Google Calendar, auditoría append-only, exportación, normativa citada | No evidencia lista de espera, duración variable ni bloqueos. Precios de planes NE. WhatsApp con número propio, no API |
| **DentalSoft** | Único con precios publicados, detalle de costo de WhatsApp (Meta: "0,026 USD por recordatorio") y detección de solapamientos | Sin multi-sillón evidenciado, sin facturación electrónica, seguridad genérica |
| **AgendaPro** | Multi-sillón y duración variable evidenciados; IA conversacional; mayor escala declarada | Mucho discurso comercial; prevención de solapamientos NE; origen NE |
| **Dentalink** | Madurez y certificación ISO 27001 | Sin precios; detalle de agenda NE; funciones por plan |
| **Bilog** | Mayor base argentina declarada; obras sociales y gerenciadoras | Sin precios, sin seguridad evidenciada |
| **Atiendo** | Mejor experiencia de reserva (sin cuenta, QR, lista de espera automática, seña que se cancela sola) y mejor trazabilidad | No emite factura; WhatsApp automático aún "próximamente"; sin multi-sillón |
| **Odonto.ar** | Precios publicados y por tramos de usuarios | Sin recordatorios ni seguridad evidenciados |
| **Agenda Profesional** | Odontograma y periodontograma, lista de espera | Sin alta pública, sin precios |
| **OdontoApp, OdontoGRAMA, Reservo** | — | Sitios de una página con muy poca evidencia |
| **Medilink, Dentidesk** | Escala regional (Medilink), reportes | Foco chileno (SII), poco encaje con Argentina |
| **CareStack, Dentally, Open Dental** | Referentes de profundidad clínica y seguridad (CareStack) | Sin WhatsApp, Mercado Pago ni ARCA evidenciados; orientados a mercados con seguros y NHS |

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
| Oclusar | 4 | 4 | 4 | 4 | 4 | 5 | 4 | **4,10** |
| AgendaPro | 4 | 3 | 4 | 4 | 4 | 3 | 5 | **3,75** |
| DentalSoft | 4 | 4 | 3 | 4 | 4 | 2 | 5 | **3,70** |
| Atiendo | 4 | 3 | 2 | 3 | 4 | 5 | 3 | **3,40** |
| Bilog | 4 | 4 | 2 | 4 | 4 | 1 | 2 | **3,30** |
| CareStack | 3 | 5 | 1 | 3 | 3 | 4 | 1 | **3,10** |
| Dentalink | 3 | 4 | 2 | 3 | 3 | 4 | 1 | **3,05** |
| Agenda Profesional | 3 | 4 | 1 | 3 | 4 | 1 | 1 | **2,70** |
| Odonto.ar | 2 | 4 | 1 | 3 | 2 | 2 | 5 | **2,55** |
| Medilink | 3 | 1 | 1 | 3 | 3 | 1 | 1 | **2,00** |
| Dentidesk | 2 | 3 | 1 | 3 | 1 | 1 | 2 | **2,00** |
| OdontoGRAMA | 2 | 2 | 0 | 3 | 0 | 1 | 3 | **1,60** |
| Open Dental | 2 | 2 | 1 | 2 | 1 | 0 | 1 | **1,50** |
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
- Las **diferencias menores de 0,3 puntos no son significativas** dados los márgenes de este método.

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
| Aviso de solapamiento de agenda | Oclusar, DentalSoft (los demás: NE) |
| Multi-sillón con asignación | Oclusar, AgendaPro |
| Duración variable por prestación | AgendaPro, Odonto.ar (Bilog parcial) |
| Lista de espera automática | Atiendo (Agenda Profesional la menciona) |
| Auditoría de accesos y cambios | Oclusar, Atiendo |
| Facturación electrónica ARCA | Oclusar (AgendaPro la lista sin detalle) |
| Asistente de IA por WhatsApp | AgendaPro, DentalSoft Pro, Oclusar (OCLU IA) |
| Certificaciones de seguridad | Dentalink (ISO 27001), CareStack |

### C.3 Vacíos frecuentes del mercado argentino (con el sesgo de los NE)

1. **Buffer de limpieza o desinfección por sillón: no evidenciado en ninguno de los 16.** Es una regla de negocio que definiste como obligatoria.
2. **Prevención de solapamientos por profesional y por sillón a la vez:** ningún sitio la describe de forma explícita y completa. Oclusar y DentalSoft avisan solapamientos, pero no se evidencia el control cruzado.
3. **API pública para integradores:** solo Dentalink la menciona (como complemento). El resto no la evidencia.
4. **WhatsApp Business API como integración formal:** ninguno la declara. Oclusar usa el número del profesional y DentalSoft trae un costo por mensaje de Meta que sugiere uso de la API, pero no lo afirma.
5. **Cumplimiento de la Ley 25.326 declarado y concreto:** solo Oclusar y AgendaPro la citan; Atiendo no la cita pero evidencia aislamiento por consultorio.
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
4. **Referencia de costo:** los precios publicados van de $13.900 ARS/mes (AgendaPro, "desde") a $60.000/mes (DentalSoft Pro) y USD 29 a 99 por mes (Odonto.ar). Una guía genérica de un proveedor de desarrollo (Develop Argentina) cita un rango de $15.000 a $80.000 mensuales **sin fuente ni metodología**, por lo que se descarta como dato.

---

## Anexo: fuentes consultadas (fecha de consulta: 2026-11-22)

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

---

## Verificación de fuentes

**Fecha de verificación:** 2026-11-22. **Alcance:** 6 URLs. Cada una se consultó con una extracción de citas textuales; las que tenían datos del informe no reconfirmados (Bilog, Dentalink y Medilink) se consultaron una segunda vez con búsqueda de cadenas exactas.

**Límite que persiste:** la lectura sigue siendo automática y de una sola página por URL. "No evidenciado" significa que la cadena no apareció en el texto extraído, no que la función no exista. Los otros 10 sistemas **no fueron re-verificados** en esta pasada.

### 1. https://bilog.com.ar/ — Confirmado, con 1 corrección menor

| | |
|---|---|
| **Qué decía el informe** | Multi-profesional, sobreturnos, reserva y cancelación online, recordatorios por WhatsApp, odontograma, imágenes, presupuestos, obras sociales, KPIs, firma electrónica (Ley 25.506); sin precios ni prueba; "+1.500 clínicas", "+5.000 usuarios", "+150.000 turnos/mes"; "más de 20 testimonios" |
| **Qué se comprobó hoy** | Todo lo anterior aparece con cita textual. También: "Deslizá → para recordar el turno por WhatsApp, email o llamada"; "No, la configuración inicial no tiene costo. Solo abonás el monto mensual de tu plan"; pago "por tarjeta de crédito/débito, transferencia o depósito bancario"; "+10 M Pacientes gestionados"; "+20 años de experiencia"; filtros "sucursal, especialidad y profesional" |
| **Corregido** | La cantidad de testimonios es **19** (15 con nombre y 4 atribuidos a un rol o negocio), no "más de 20". Las menciones de auditoría ("Control prestacional, validación de procesos y trazabilidad") están orientadas a obras sociales, no a un registro de auditoría del sistema: se mantiene **NE** |
| **Sin cambios** | Multi-sillón, bloqueos, lista de espera, periodontograma, caja, Mercado Pago, Google Calendar, ARCA, API, roles, exportación y backup siguen **NE**. La prueba gratuita sigue **NE** |

### 2. https://odontograma.com.ar/ — Confirmado sin correcciones

| | |
|---|---|
| **Qué decía el informe** | Producto en la nube; agendas con control de asistencia; ficha con imágenes; caja, cuentas corrientes, facturación a prepagas y obras sociales; estadísticas; acceso gratuito; odontograma solo en el nombre; sin precios |
| **Qué se comprobó hoy** | Cada punto coincide con la cita textual. La empresa (Solsoftware) solo aparece en el enlace del logo; el titular de derechos es "Copyright © 2023 Julio Santolo"; el país **no figura**. El texto no declara que sea específico para odontología ("Es la solución para su consultorio") |
| **Corregido** | Nada. Se mantiene "consultorio en general" como segmento |

### 3. https://reservo.cl/ar/ (frente a https://reservo.cl/) — URL corregida y alcance aclarado

| | |
|---|---|
| **Qué decía el informe** | Citaba `https://reservo.cl/`; segmento "consultorios médicos argentinos"; Mercado Pago, factura ARCA y turnero online como menciones; todo lo demás NE |
| **Qué se comprobó hoy** | `/ar/` devuelve el título "Software médico con factura AFIP/ARCA en Argentina" y el titular "Software médico líder para consultorios argentinos", con la frase "Turnero online, ficha clínica electrónica, Mercado Pago y cobro en pesos argentinos". Las cadenas odontograma, odontología y dental **no aparecen**. La consulta de la raíz `reservo.cl/` hecha antes devolvió el mismo contenido y la herramienta no informó ninguna redirección, así que no puedo afirmar si el sitio redirige por ubicación |
| **Corregido** | URL oficial pasada a `https://reservo.cl/ar/` (tabla A.1 y anexo). Se aclara en A.1 que **no es un producto odontológico según esa página**, lo que cuestiona su inclusión como competidor directo. El puntaje se mantiene (1,05) porque ya reflejaba la falta de evidencia |
| **Sin cambios** | Las menciones de Mercado Pago, ARCA y turnero siguen como **C** (aparecen como etiquetas sin detalle) |

### 4. https://www.dentally.com/en-gb/ — Corregido (evidencia sobreestimada)

| | |
|---|---|
| **Qué decía el informe** | Reserva online "D (portal)", confirmaciones "D", recordatorios "D", charting "D", imágenes "D", reportes "D"; puntaje 2,00 |
| **Qué se comprobó hoy** | Todas esas funciones aparecen solo como frases de una línea sin detalle operativo: "Online appointment booking", "automated reminders and confirmations", "Efficient charting", "Advanced imaging with AI-powered detection", "Real-time reporting". Lo que sí se confirma: empresa y domicilio (Henry Schein One UK LTD, registro 02940919, Gillingham, Kent); "cloud solution"; "waitlists" y "Short notice appointment filler"; "Developer Hub" y "Partner marketplace"; integración con NHS y HSC; 3 testimonios (Kent Smile Studio, The Smile Designers, Love Teeth Dental). Sin precios, sin cifra de clientes, sin mención de GDPR, roles, auditoría ni exportación |
| **Corregido** | Los 6 ítems anteriores pasaron de **D a C** en A.2. URL pasada a `/en-gb/`. En la matriz B, Dentally bajó de **2,00 a 0,90** (T, C y P de 3 a 1, aplicando la escala tal como está escrita: solo menciones genéricas = 1) y se reubicó en la tabla |
| **Aviso de consistencia** | Dentalink y otros productos tienen frases igual de cortas, pero con condiciones concretas (qué plan incluye cada función), por lo que se mantuvieron como **D**. Ese criterio no se revisó para los otros 10 sistemas |

### 5. https://www.softwaredentalink.com/ar — Confirmado, con datos agregados

| | |
|---|---|
| **Qué decía el informe** | Engenis SpA, Chile; nube; planes Esencial, Pro y Titanium sin precios; ISO 27001 con auditoría anual; AWS cifrado con backups diarios; mejores prácticas de HIPAA; API como complemento; "+15.000 clínicas"; "-30% ausentismo"; Ley 26.529 solo en un blog |
| **Qué se comprobó hoy** | La búsqueda dirigida confirma "ISO 27001 y HIPAA" (en la sección de seguridad y en la FAQ), "Amazon Web Services, con datos cifrados y respaldos diarios", "-30% inasistencias" y los botones "Solicitá tu cotización". La cifra "+15.000" aparece con dos rótulos distintos ("Clínicas nos eligen" y "clientes"). Planes: **Esencial** (agenda online, turnos online y por WhatsApp, historia clínica, odontograma, presupuestos, caja y cobros); **Pro** (reportes y dashboard, comisiones, obras sociales, inventario, multicentro, gastos); **Titanium** (módulo de ortodoncia, seguimiento automático de presupuestos, estética facial, reagendamiento automático, cobranza automática, email marketing) |
| **Corregido** | Se agregó el complemento "Contact Center IA por solo USD 50 al mes" y se aclaró que "prueba gratis" y "demo" **no aparecen**, con lo que la prueba gratuita queda **NE** confirmada. No se corrigió ningún dato previo |
| **Observación** | El detalle de agenda (multi-sillón, duración variable, bloqueos, solapamientos) sigue **NE** también en esta página |

### 6. https://web-latam.softwaremedilink.com/ — Corregido (2 ítems) y alcance aclarado

| | |
|---|---|
| **Qué decía el informe** | Engenis SpA, "marca de Healthatom"; multi-profesional, reserva online, confirmación por email o WhatsApp, recordatorios **C**, presupuestos **D**, caja **D**, boletas electrónicas, 80 reportes, Google Calendar, "+12.000 clientes", "+60.000 usuarios"; vinculado a la odontología |
| **Qué se comprobó hoy** | Confirmado: "Una marca de Healthatom" (pie de página), "42M de citas efectivas", "+20 países", "Firma recetas y certificados sin salir de Medilink", enlaces a "Políticas de Privacidad", "Acuerdo de procesamiento de datos" y "Política General de Seguridad de la Información" (contenido no leído), integración con BSale. **No aparecen** las cadenas "odont", "dental", "dentista" ni "recordatorio" |
| **Corregido** | (1) **Recordatorios** pasó de C a **NE**: la página habla de confirmaciones, no de recordatorios. (2) **Presupuestos** (ítem de una lista) y **caja** ("Controla el flujo de dinero…") pasaron de D a **C**. (3) Se aclaró que la página **no menciona odontología**, por lo que su vínculo con el rubro dental se apoya solo en fuentes secundarias no usadas como evidencia. (4) Facturación se mantiene como D, con la aclaración de que habla de "boletas electrónicas" del régimen chileno |
| **Efecto en puntajes** | Ninguno. Los puntajes de Medilink ya eran bajos o intermedios por estos criterios y no cambian con la corrección |

### Resumen de cambios aplicados

| URL | Resultado | Cambios en el informe |
|---|---|---|
| bilog.com.ar | Confirmado | Testimonios: 19 (15 con nombre); se agrega "+10 M pacientes gestionados" |
| odontograma.com.ar | Confirmado | Ninguno |
| reservo.cl/ar/ | Corregido | URL; aclaración de que no es dental |
| dentally.com/en-gb/ | Corregido | 6 ítems D→C; URL; puntaje 2,00 → 0,90 |
| softwaredentalink.com/ar | Confirmado | Se agrega precio del Contact Center IA y detalle por plan |
| web-latam.softwaremedilink.com | Corregido | Recordatorios C→NE; presupuestos y caja D→C; sin odontología |

### Pendiente derivado de esta verificación

- Revisar con el mismo criterio D/C estricto a los otros 10 sistemas, para que la escala se aplique de forma uniforme.
- Las conclusiones de las secciones C y D no cambian, porque no dependían de Dentally ni de los ítems corregidos de Medilink.
