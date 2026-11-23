# Turnos Odontología — Base de Conocimiento

Base de conocimiento generada por entrevista (Mode B de `kb-creator`) a partir de `discovery/discovery.md` y `docs/discovery/informe-discovery.md`, con las decisiones de arquitectura del equipo (Q1 a Q5, zona horaria, auditoría y exportación).

## Índice de archivos

| Archivo | Contenido |
|---|---|
| [01_vision_y_objetivos.md](01_vision_y_objetivos.md) | Propósito, objetivos por actor, alcance v1, fuera de alcance, métricas |
| [02_descripcion_general.md](02_descripcion_general.md) | Stack, arquitectura hexagonal, integraciones, resumen de la API |
| [03_actores_y_roles.md](03_actores_y_roles.md) | Actores, autenticación, matriz RBAC, rutas públicas |
| [04_modelo_de_datos.md](04_modelo_de_datos.md) | Entidades, ERD, constraints de exclusión, RLS, seed sintético |
| [05_reglas_de_negocio.md](05_reglas_de_negocio.md) | Reglas `RN-*` por dominio |
| [06_funcionalidades.md](06_funcionalidades.md) | Historias de usuario `US-*` por épica |
| [07_flujos_principales.md](07_flujos_principales.md) | 10 flujos extremo a extremo |
| [08_arquitectura_propuesta.md](08_arquitectura_propuesta.md) | Patrones, directorios, seguridad, pruebas, variables de entorno |
| [09_decisiones_y_supuestos.md](09_decisiones_y_supuestos.md) | Decisiones `DD-*` y supuestos `SU-*` |
| [10_preguntas_abiertas.md](10_preguntas_abiertas.md) | Inconsistencias, preguntas `PO-*` priorizadas y riesgos |

## Quick Start para desarrolladores

1. Entender el dominio → [01](01_vision_y_objetivos.md), [03](03_actores_y_roles.md)
2. Entender los datos → [04](04_modelo_de_datos.md)
3. Entender las reglas → [05](05_reglas_de_negocio.md)
4. Entender la arquitectura → [02](02_descripcion_general.md), [08](08_arquitectura_propuesta.md)
5. Implementar → [07](07_flujos_principales.md), [06](06_funcionalidades.md)
6. Antes de codificar → [10](10_preguntas_abiertas.md) y las decisiones **propuestas** de [09](09_decisiones_y_supuestos.md)

## Resumen ejecutivo

Sistema SaaS multi-tenant para clínicas odontológicas argentinas pequeñas y medianas. Su valor central es **garantizar que no haya solapamientos de profesional ni de sillón**, con duración variable por prestación y buffer de limpieza. El MVP es una **API REST en TypeScript, Node.js y PostgreSQL**, sin interfaz gráfica, con aislamiento por clínica mediante Row-Level Security, auditoría append-only y exportación de datos, bajo la Ley 25.326.

## Convenciones

- **Decidido** = confirmado por el equipo. **Propuesto** o **Suposición** = propuesta de la fundación pendiente de confirmar.
- Los códigos son estables: `RN-*` reglas, `US-*` historias, `DD-*` decisiones, `SU-*` supuestos, `PO-*` preguntas, `R-*` riesgos, `IN-*` inconsistencias.
- Los datos reales de pacientes están **prohibidos** fuera de producción (RN-DA-01).

## Actualización 2026-11-22

El equipo aprobó DD-08 (hexagonal, Fastify, SQL explícito, Vitest), DD-09 (pg-boss sobre PostgreSQL), SU-05 (asignación automática de sillón), SU-08 (recordatorio 24 hs antes), DD-11 (alta de clínicas por endpoint interno o seed) y DD-12 (validación por código de email). Las marcas "propuesto" o "Suposición" que quedan en los archivos 03, 05, 07 y 08 sobre esos puntos se leen como **decididas**. Las demás Suposiciones siguen pendientes. Ver `CHANGES.md` para la secuencia de implementación.
