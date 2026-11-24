# Tasks

## 1. Endpoint interno de alta de clínicas

- [x] 1.1 Implementar `POST /interno/clinicas` en `src/interfaces/http/modules/interno/index.ts`: clave de servicio (`ADMIN_INTERNAL_KEY`) con comparación en tiempo constante; sin clave → 401; con clave incorrecta → 401; sin contexto de clínica (fuera del RBAC). Verificar: sin clave → 401; con clave correcta → 201.

## 2. Aprovisionamiento

- [x] 2.1 Implementar `src/application/aprovisionamiento/` (use case + repositorio): crea la clínica (`slug` único y validado, `nombre`), su `clinica_config` por defecto y el primer usuario `usuario` (rol `administrador`, contraseña temporal generada). Verificar: al usuario temporal se le exige cambio de contraseña (ver requerimientos de C-06); slug repetido → rechazo.

## 3. Seed inicial

- [x] 3.1 Crear `seeds/primera-clinica.*`; bloqueado en producción salvo flag explícito.

## 4. Auditoría

- [x] 4.1 Registrar la creación de la clínica con actor `sistema` (ver escenarios del spec).

## 5. Integración final

- [x] 5.1 Re-ejecutar `openspec validate 2026-11-24-c-17-alta-clinicas-interno` y `openspec status --change 2026-11-24-c-17-alta-clinicas-interno --json`. Verificar: proposal, specs, design y tasks presentes y validan. (Resultado: valid ✓; proposal/specs/design/tasks = done.)
