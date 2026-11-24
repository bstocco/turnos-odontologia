# Design

## Context

Punto de partida (ver `specs/alta-clinicas-interno/spec.md` para el contrato):

- Ficha de C-17 (`CHANGES.md` §[C-17] `alta-clinicas-interno`): alcance (endpoint interno protegido, creación de clínica/config/primer admin, seed, slug único, auditoría con actor `sistema`); Zona: `src/interfaces/http/modules/interno/**`, `src/application/aprovisionamiento/**`, `seeds/primera-clinica.*`.
- DD-11: en la v1 las clínicas nuevas se crean por endpoint interno o seed inicial; sin autoservicio ni rol de operador (aprobado el 2026-11-22).
- PO-04 cerrado (`10_preguntas_abiertas.md`).
- C-03 (`db-tenant-rls`) ya fusionado: `aplicar_rls`, tablas `clinica`/`clinica_config` (ver `openspec/specs/db-tenant-rls/spec.md`).
- C-06 (`auth-personal-rbac`) ya fusionado: rol `usuario` con `rol` (`administrador`, `recepcionista`, `odontólogo`).
- KB: `03_actores_y_roles.md` (actor "Sistema (worker)"), `04_modelo_de_datos.md` §clinica/§clinica_config, `08_arquitectura_propuesta.md` §Seguridad (secretos en env, regla 13).

## Goals

- Cumplir los escenarios de `specs/alta-clinicas-interno/spec.md`.

## Non-Goals

- No automatizar la alta de clínicas ni proveer rol de operador de plataforma (DD-11, v1).
- No hacer la alta desde fuera de la red interna sin revisión del equipo propietario de seguridad.
- No configurar entornos de PaaS sin aprobación del líder (DD-04).
- No romper contratos congelados (regla 14).

## Decisions

1. **Clave de servicio en env**: `ADMIN_INTERNAL_KEY`, verificada con comparación en tiempo constante; puede desactivarse por entorno.
2. **Endpoint fuera del RBAC de clínicas**: no requiere contexto de clínica — al crear la primera clínica aún no existe ninguna.
3. **Primer usuario administrador**: generado con aleatoriedad (heredado de C-06: sin datos reales, RN-DA), devuelto en la respuesta del endpoint; se exige cambio de contraseña tras el primer login.
4. **Seed inicial**: `seeds/primera-clinica.*`; bloqueado en producción salvo una bandera explícita.
