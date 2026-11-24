# Proposal

## Why

C-17 `alta-clinicas-interno` cierra PO-04 (DD-11): aprovisionamiento de clínicas nuevas sin autoservicio ni rol de operador de plataforma en la v1. Sin él, no hay una forma de crear una clínica mediante la API ni una seed inicial equivalente.

## What Changes

- `POST /interno/clinicas`: protegida por clave de servicio (`ADMIN_INTERNAL_KEY`, comparación en tiempo constante, desactivable por entorno) y fuera del RBAC de clínicas (no requiere el contexto de una clínica).
- Crea la clínica, su `clinica_config` por defecto y el primer usuario administrador con contraseña temporal.
- Script o seed inicial equivalente para la primera clínica; bloqueado en producción salvo una bandera explícita.
- `slug` único y validado; auditoría con actor `sistema`.

## Capabilities

### New Capabilities

- `alta-clinicas-interno`: aprovisionamiento de clínicas nuevas mediante endpoint interno protegido por clave de servicio (o seed inicial).

### Modified Capabilities

- (none)

## Impact

- Código: `src/interfaces/http/modules/interno/**`, `src/application/aprovisionamiento/**`, `seeds/primera-clinica.*`.
- Sistemas: clave de servicio (variable de entorno `ADMIN_INTERNAL_KEY`); creación de `clinica`, `clinica_config` y primer usuario `usuario` del personal.
