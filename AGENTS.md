<!-- active-stack:agent-instruction -->
# Turnos Odontología — Instrucciones para Agentes

<!-- active-stack:agent-instruction -->

> Este archivo (y su copia `AGENTS.md`) es lo PRIMERO que todo agente lee al entrar al repo.
> Generado a partir de `knowledge-base/` y `CHANGES.md`. No editar a mano sin re-sincronizar ambos archivos.

SaaS multi-tenant para clínicas odontológicas argentinas pequeñas y medianas. Su valor central es **garantizar que no haya solapamientos de profesional ni de sillón**. El MVP es una **API REST sin interfaz gráfica**.

**Equipo: 4 integrantes.** 1 líder (fundación y configuración del repositorio) y 3 implementadores (Agentes A, B y C) que implementan y prueban los changes en ramas separadas, con foco en backend y reglas de negocio. El reparto está en [CHANGES.md](CHANGES.md).

---

## Stack Tecnológico

| Capa | Tecnología | Versión |
|------|------------|---------|
| Lenguaje y runtime | TypeScript sobre Node.js | TypeScript 6.0, Node 22 (22.12 o superior, por pg-boss) |
| API | REST con Fastify | 5.12 |
| Base de datos | PostgreSQL con `btree_gist` y Row-Level Security | 17 |
| Acceso a datos | SQL explícito (`pg`) con migraciones versionadas | pg 8.23 |
| Pruebas | Vitest (más fast-check para propiedades) | Vitest 5.1, fast-check 4.11 |
| Cola de tareas | pg-boss sobre PostgreSQL, sin Redis | 12.39 |
| Email | Resend (DD-04) por **SMTP** con nodemailer (`smtp.resend.com:465`, TLS, usuario `resend`, contraseña `EMAIL_API_KEY`); no usa la API HTTP de Resend. Adaptador: `src/infrastructure/email/smtp-sender.ts` | nodemailer 10.6 |
| Hosting de la aplicación | Fly.io, región `gru` (API y worker en una sola imagen Docker) | — |
| Base gestionada | Neon, `aws-sa-east-1` (Fly Managed Postgres se descartó por no permitir `GRANT ... TO app`) | PostgreSQL 17 |

Versiones exactas en `package-lock.json`; el detalle de despliegue y operación, en [docs/operacion/](docs/operacion/).

Detalle completo: [knowledge-base/02_descripcion_general.md](knowledge-base/02_descripcion_general.md)

---

## Base de Conocimiento

La fuente de verdad del dominio vive en `knowledge-base/`. **Leé el archivo relevante ANTES de implementar.**

| Archivo | Cuándo leerlo |
|---------|---------------|
| [01_vision_y_objetivos.md](knowledge-base/01_vision_y_objetivos.md) | Entender propósito y alcance |
| [03_actores_y_roles.md](knowledge-base/03_actores_y_roles.md) | Auth, RBAC, permisos, rutas públicas |
| [04_modelo_de_datos.md](knowledge-base/04_modelo_de_datos.md) | Entidades, ERD, constraints de exclusión, RLS, migraciones |
| [05_reglas_de_negocio.md](knowledge-base/05_reglas_de_negocio.md) | Reglas codificadas (`RN-*`) |
| [06_funcionalidades.md](knowledge-base/06_funcionalidades.md) | Historias de usuario (`US-*`) por épica |
| [07_flujos_principales.md](knowledge-base/07_flujos_principales.md) | Flujos de extremo a extremo |
| [08_arquitectura_propuesta.md](knowledge-base/08_arquitectura_propuesta.md) | Patrones, estructura de directorios, seguridad, variables de entorno |
| [09_decisiones_y_supuestos.md](knowledge-base/09_decisiones_y_supuestos.md) | Decisiones (`DD-*`) y supuestos (`SU-*`) |
| [10_preguntas_abiertas.md](knowledge-base/10_preguntas_abiertas.md) | ⚠️ Inconsistencias y preguntas a resolver ANTES de codear |

> ⚠️ Revisá `10_preguntas_abiertas.md` antes de trabajo nuevo. PO-03 y PO-09 figuran resueltas; PO-10 (retención) y PO-14 (registro ante la AAIP) siguen abiertas y bloquean el lanzamiento con datos reales.

---

## Skills Disponibles

| Agente | Rol | Skills que carga |
|--------|-----|------------------|
| **Líder** | Fundación, configuración del repositorio, revisión de PR y reparto | `active-orchestrator`, `active-delivery`, `kb-creator`, `roadmap-generator`, `agent-instruction`, `skill-registry`, `openspec-propose`, `openspec-update-change`, `openspec-archive-change` |
| **Agente A** | Plataforma, seguridad y turnos (C-03, C-06, C-09, C-12, C-16, C-17) | `active-delivery`, `openspec-explore`, `openspec-apply-change` |
| **Agente B** | Dominio, gestión y pruebas (C-02, C-05, C-08, C-13, C-10, C-18) | `active-delivery`, `openspec-explore`, `openspec-apply-change` |
| **Agente C** | Comunicación, reserva pública y trazabilidad (C-04, C-07, C-11, C-14, C-15, C-19) | `active-delivery`, `openspec-explore`, `openspec-apply-change` |

Cargá la skill correspondiente al contexto ANTES de escribir código.

Las skills especializadas del stack (Fastify, Vitest, PostgreSQL, seguridad) están **recomendadas, no instaladas**: ver `.atl/skill-registry.md`.

> Los compact rules de cada skill los resuelve el orquestador desde [.atl/skill-registry.md](.atl/skill-registry.md) (generado por `skill-registry` y versionado en el repo, por decisión del Líder: es un artefacto evaluable). Esta tabla solo mapea skill→rol.

---

## Roadmap de Changes

El plan de implementación completo está en [CHANGES.md](CHANGES.md). Resumen:

- **Total**: 20 changes en 7 fases (FASE 0 a FASE 6). **Los 20 están completos (`[x]`) y archivados** en `openspec/changes/archive/`.
- **Camino crítico** (8): `C-01 → C-03 → C-05 → C-09 → C-13 → C-15 → C-18 → C-20` (C-19 cerró junto con C-18).
- **Gobernanza**: 5 changes CRITICO (C-03, C-06, C-07, C-15, C-17), 9 ALTO, 5 MEDIO y 1 BAJO.
- **Trabajo pendiente**: no hay un próximo change planificado. Lo abierto está en "Limitaciones conocidas" (abajo) y en la sección "Trabajo posterior" del `design.md` archivado de C-20.

Antes de iniciar cualquier trabajo nuevo, leé [CHANGES.md](CHANGES.md) y los archivos de "Leer antes" del change relacionado.

### Limitaciones conocidas

- **F1, F2, F6, F8 y F9** (defectos de autenticación y autorización detectados en C-18) siguen abiertos. Están documentados en [docs/seguridad/checklist-ley-25326.md](docs/seguridad/checklist-ley-25326.md) y se resuelven en un **change correctivo aparte**. Mientras tanto hay pruebas marcadas `it.fails`: al corregirlos hay que quitar esas marcas.
- **No se da de alta ninguna clínica real ni se usan datos reales** hasta cerrar esos defectos y el checklist legal de [docs/operacion/proteccion-datos.md](docs/operacion/proteccion-datos.md) (PO-03, PO-10, PO-14, todo pendiente).
- El entorno `produccion` está solo documentado; no se aprovisionó (C-20).

---

## Reglas Duras (específicas del proyecto)

> Reglas globales ya definidas en el archivo global de instrucciones del cliente activo (orquestador, governance, TDD, engram): el proyecto las hereda. Acá viven solo las reglas **específicas de este proyecto** + las universales que el global no cubra.

Son contrato; romperlas es un defecto.

### Privacidad, aislamiento y agenda (reforzadas)

1. **Ley 25.326** — NUNCA registrar datos de pacientes (DNI, teléfono, email, obra social) en logs, errores ni payloads de la cola → loguear solo IDs. Auditar las lecturas de fichas y las exportaciones.
2. **Sin datos reales** — NUNCA usar datos reales de pacientes en desarrollo, tests ni CI → solo datos sintéticos, y los seeds con `assertNoProduction()`.
3. **Multi-tenant** — NUNCA crear una tabla con datos de clínica sin `clinica_id` y RLS → usar `aplicar_rls`, el rol de la app sin `BYPASSRLS` ni propiedad de las tablas, y `withTenant` con `SET LOCAL`. Toda tabla nueva lleva una prueba de aislamiento entre clínicas.
4. **Solapamientos** — NUNCA permitir dos turnos solapados por profesional ni por sillón → intervalos `[inicio, fin)`; el buffer bloquea solo al sillón; los constraints de exclusión de PostgreSQL son la garantía final; los conflictos responden `409` con código de dominio.

### Stack: TypeScript, Node.js, Fastify, PostgreSQL, Vitest

5. NUNCA `any` ni `@ts-ignore` → usar `strict` y `unknown` validado en el borde.
6. NUNCA concatenar SQL → consultas parametrizadas, SQL explícito y migraciones `C{NN}_{seq}_nombre.sql`; nunca editar una migración ya fusionada.
7. NUNCA poner lógica de negocio en rutas ni adaptadores → el dominio vive en `src/domain` sin I/O y las dependencias apuntan hacia adentro.
8. NUNCA mockear PostgreSQL en pruebas de integración → base real para exclusión, RLS y auditoría; mock solo de email y reloj.
9. NUNCA guardar instantes sin zona → `timestamptz` en UTC y horarios en la zona IANA de la clínica, sin desplazamientos fijos.
10. NUNCA guardar tokens, códigos o contraseñas en claro → hash SHA-256 para tokens y códigos, argon2id para contraseñas; un solo uso, con vencimiento y comparación en tiempo constante.
11. NUNCA hacer `UPDATE` ni `DELETE` sobre `auditoria` → solo `INSERT`.
12. NUNCA revelar que existe un recurso de otra clínica → responder `404`.
13. NUNCA poner secretos en el repo ni en los logs → solo variables de entorno.

### Equipo de 4 y flujo de trabajo

14. **Equipo de 4**: 1 líder y 3 implementadores (Agentes A, B y C) en ramas separadas.
    - Una rama por change (`change/C-NN-nombre`) con PR a `main` y sin commits directos.
    - Cada integrante trabaja solo en la zona de su change.
    - Los contratos congelados (`RequestContext`, los puertos de dominio y `TurnoEventPublisher`) no se cambian sin aviso.
    - Las dependencias de npm las toca solo el líder.
    - El `[x]` de `CHANGES.md` lo marca quien fusiona el PR.
    - En los changes CRITICO y ALTO hay propuesta de diseño aprobada antes del código.

### Universales que el global no cubre

15. NUNCA commitear ni pushear sin pedido explícito → commits en formato conventional commits.
16. NUNCA buildear después de cada cambio salvo pedido explícito.

---

## Flujo de Trabajo

```
1. Leer la KB relevante (knowledge-base/)        → entender el dominio
2. Identificar el change en CHANGES.md           → respetar dependencias
3. Acordar alcance y criterios de aceptación
4. Implementar y verificar respetando las reglas del proyecto
5. Registrar la evidencia y actualizar el estado en CHANGES.md
```

Aplicar TODAS las reglas duras en cada paso. Ante conflicto entre la KB y este archivo, las reglas duras prevalecen.
<!-- /active-stack:agent-instruction -->

<!-- /active-stack:agent-instruction -->
