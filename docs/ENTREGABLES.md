# Entregables del Trabajo de Integración "Del Discovery al primer Change"

Índice de los entregables del Trabajo de Integración (SDD + Active Stack). Materia: Desarrollo de Software. Carrera: Ingeniería en Sistemas de Información. Facultad: Universidad Tecnológica Nacional, Facultad Regional Mendoza (UTN FRM). Comisión 3k9.

Integrantes: Stocco Bárbara (líder), Bricco Martín, Castro Santiago y Yanzón Santiago.

> El MVP es una **API REST sin interfaz gráfica** (front y back en el mismo proyecto: el backend vive en `src/` y no hay front en esta entrega).

## Video

**Video: https://youtu.be/GGHIPzrCWtQ?si=K-pCCaEcMSl_l9AZ**

## Reflexión

- [Reflexión sobre SDD (PDF)](reflexion/reflexion-sdd.pdf)

## Discovery

- Informe de Discovery: [Markdown](discovery/informe-discovery.md) y [PDF](discovery/informe-discovery.pdf).
- [Verificación de fuentes](discovery/informe-discovery.md#verificación-de-fuentes) (6 fuentes revisadas manualmente por la Líder el 2026-11-22 y 10 con extracción automática asistida por el agente el 2026-11-25).
- [Checklist de 11 puntos de discovery-research](discovery/checklist-discovery.md) (banco de preguntas). Las respuestas de la entrevista están en [discovery/discovery.md](../discovery/discovery.md).

## Fundación

- [Knowledge base](../knowledge-base/README.md) (10 archivos canónicos).
- [CHANGES.md](../CHANGES.md): roadmap de 20 changes, dependencias, camino crítico y riesgos.
- [AGENTS.md](../AGENTS.md) y [CLAUDE.md](../CLAUDE.md).
- [Skill registry](../.atl/skill-registry.md).
- [Estado del orquestador](../.active-orchestrator-state.json). Las skills recomendadas con su justificación (`fit` y `use`) están en `skills.recommended`.

## Change OPSX elegido: C-15 `reserva-publica-otp-y-tokens`

- [Change archivado](../openspec/changes/archive/2026-11-25-c-15-reserva-publica-otp-y-tokens/): [proposal](../openspec/changes/archive/2026-11-25-c-15-reserva-publica-otp-y-tokens/proposal.md), [design](../openspec/changes/archive/2026-11-25-c-15-reserva-publica-otp-y-tokens/design.md), [tasks](../openspec/changes/archive/2026-11-25-c-15-reserva-publica-otp-y-tokens/tasks.md) y [specs](../openspec/changes/archive/2026-11-25-c-15-reserva-publica-otp-y-tokens/specs/).
- Tests: `test/unit/reserva-publica/` y `test/integration/reserva-publica/`.
- También se revisó [C-09 `turnos-persistencia-y-casos-de-uso`](../openspec/changes/archive/2026-11-24-c-09-turnos-persistencia-y-casos-de-uso/).

**Por qué C-15.** Es un change de gobernanza CRÍTICO y está en el camino crítico. Integra los cuatro frentes del dominio en un flujo de extremo a extremo: código OTP por email, reserva pública sin cuenta, asignación automática de sillón sin solapamientos y enlaces de un solo uso. Además cubre el riesgo de reservas falsas o duplicadas (R-02) y la regla PO-09 (máximo 2 reservas públicas activas por email o DNI).

## Specs vigentes

- [openspec/specs/](../openspec/specs/) (52 specs).

## Trazabilidad entre CHANGES.md y el MVP del Discovery (sección D.3)

El MVP "imprescindible" de la [sección D.3 del informe](discovery/informe-discovery.md#d3-mvp-sugerido) se implementa con los changes de [CHANGES.md](../CHANGES.md): prevención de solapamientos y duración por prestación (C-02, C-09), aislamiento por clínica y roles (C-03, C-06), ficha del paciente (C-05, C-10), agenda con horarios, feriados y bloqueos (C-08, C-12), reserva pública con código por email y cancelación con anticipación (C-13, C-15), email y recordatorios (C-11, C-14), ausentismo, auditoría y exportación (C-07, C-16). Los 20 changes están completos y archivados en [openspec/changes/archive/](../openspec/changes/archive/).
