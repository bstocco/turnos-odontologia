# Proposal

## Why

El change C-07 `auditoria-append-only` implementa el registro de auditoría inmutable (`solo INSERT`) requerido por `RN-AU-01`, `RN-AU-02`, `RN-AU-03`, `DD-05` y la Ley 25.326 para garantizar trazabilidad de cambios de estado, lecturas de fichas de pacientes y exportaciones de datos por clínica. Cierra la FASE 2, desbloquea el GATE 3 (`C-08` y `C-09`, y posteriormente `C-10`, `C-12`, `C-15` y `C-16`) y materializa la tabla `auditoria` que `C-17` (`alta-clinicas-interno`) ya invoca al aprovisionar clínicas con actor `sistema`; por su gobernanza **CRÍTICO**, su diseño requiere aprobación explícita del líder antes de iniciar la implementación.

## What Changes

- **Esquema SQL append-only y doble barrera de inmutabilidad (`migrations/C07_001_auditoria.sql`)**: crea la tabla `auditoria` con `id` secuencial (`GENERATED ALWAYS AS IDENTITY`), `clinica_id`, `ocurrio_en` (`timestamptz` UTC), `actor_tipo`, `actor_id`, `accion`, `entidad`, `entidad_id`, `datos_antes` (`jsonb`), `datos_despues` (`jsonb`) e `ip` (`inet`), índices para las consultas posteriores de `C-16`, políticas RLS mediante `aplicar_rls('auditoria')` (`C-03`), privilegios mínimos para el rol `app` (únicamente `SELECT` e `INSERT`) y trigger `BEFORE UPDATE OR DELETE OR TRUNCATE FOR EACH STATEMENT` (`impedir_mutacion_auditoria`) que impide cualquier mutación o vaciado incluso desde el rol propietario `migra`.
- **Servicio de auditoría y puerto append-only en aplicación (`src/application/auditoria/**`)**: define el puerto `AuditoriaRepositorio` (solo `insertar`, sin métodos de actualización ni borrado) y `AuditoriaService.registrar(ctx, entrada)`, tomando `clinicaId`, `actor.tipo` y `actor.id` desde el contrato congelado `RequestContext` (`usuario`, `paciente_enlace` y `sistema`), validando invariantes de entrada y manteniendo la capa de aplicación libre de dependencias de infraestructura o HTTP.
- **Enmascaramiento recursivo de datos sensibles (`enmascararDatosAuditoria`)**: redacta de forma no mutativa los campos personales (`dni`, `telefono`, `email`, `nombre`, `apellido`, `obra_social` y sus variantes compuestas) y credenciales/secretos (`contrasena`, `password`, `token`, `secret`, `apikey`, `authorization`, `cookie`, códigos de verificación y hashes) en `datos_antes` y `datos_despues`, sanea patrones de texto libre (emails, DNIs, Bearer tokens, credenciales en URLs), convierte `Date` a ISO-8601 UTC y controla referencias circulares y profundidad máxima antes de persistir.
- **Hooks reutilizables para casos de uso (`src/application/auditoria/**`)**: provee `conAuditoriaDeCambio` (`RN-AU-02`), `conAuditoriaDeLecturaPaciente` (`RN-AU-03`, registrando `lectura_ficha` sin persistir datos de la ficha) y `conAuditoriaDeExportacion` (`RN-AU-03` y `RN-DA-04`, registrando metadatos sin PII), con comportamiento *fail-closed* para que la transacción del caso de uso se revierta si la auditoría falla.
- **Adaptador PostgreSQL transaccional (`src/infrastructure/audit/**`)**: implementa `crearRepositorioAuditoriaPg(ejecutor)` y `crearAuditoriaPg(ejecutor)` sobre `EjecutorSql` dentro de `withTenant` (`C-03`), serializando `jsonb` e `inet` de forma parametrizada, pasando `ctx.clinicaId` explícitamente para que RLS rechace con `42501` desalineaciones de contexto, y traduciendo errores del motor sin exponer `detail` ni datos personales.
- **Pruebas unitarias y de integración con PostgreSQL real (`test/unit/auditoria/**`, `test/integration/auditoria/**`)**: verifican enmascaramiento, validación por tipo de actor, hooks *fail-closed*, compatibilidad literal con el `INSERT` preexistente de `C-17`, rechazo de `UPDATE`/`DELETE`/`TRUNCATE` tanto para `app` (`42501`) como para `migra` (`P0001`), y aislamiento multi-tenant usando el arnés de `C-03`.

## Capabilities

### New Capabilities
- `esquema-auditoria-append-only`: tabla `auditoria` en PostgreSQL con `aplicar_rls`, privilegios `SELECT`/`INSERT` para `app`, trigger `BEFORE UPDATE OR DELETE OR TRUNCATE`, validaciones estructurales de actores/entidades e compatibilidad con actor `sistema` de `C-17`.
- `servicio-auditoria-y-enmascaramiento`: puerto append-only `AuditoriaRepositorio`, `AuditoriaService.registrar(ctx, entrada)`, validación de los tres tipos de actor sin modificar `RequestContext`, enmascaramiento recursivo de PII/credenciales en `datos_antes`/`datos_despues` y adaptador PostgreSQL transaccional sin filtración de errores.
- `hooks-auditoria-casos-de-uso`: hooks reutilizables *fail-closed* para auditar mutaciones de dominio (`RN-AU-02`), lecturas de fichas de pacientes (`RN-AU-03`) y exportaciones de datos (`RN-AU-03`, `RN-DA-04`).

### Modified Capabilities
<!-- Ninguna: no se modifican capabilities existentes en openspec/specs/. -->

## Impact

- **Código y migraciones (zona exclusiva de C-07)**: `migrations/C07_001_auditoria.sql`, `src/application/auditoria/**`, `src/infrastructure/audit/**`, `test/unit/auditoria/**` y `test/integration/auditoria/**`.
- **Contratos congelados y dependencias**: sin cambios en `RequestContext` (`src/application/shared/request-context.ts`), puertos de `C-02` (`src/domain/**`), `test/support/**` ni `package.json`/`package-lock.json`.
- **Compatibilidad inmediata con C-17**: `src/infrastructure/aprovisionamiento/repositorio-de-clinicas.ts` ya inserta en `auditoria` con `actor_tipo = 'sistema'` sin `actor_id`, `datos_antes`, `datos_despues` ni `ip`, y reutiliza `$1` (`uuid`) para `clinica_id` y `entidad_id`; el esquema de `C-07` soporta esa sentencia sin modificar código de `C-17`.
- **Desbloqueos en el roadmap**: habilita la implementación de `C-08`, `C-09`, `C-10`, `C-12`, `C-15` y `C-16`.
- **Fuera de alcance**: endpoints HTTP de consulta y exportación (`GET /auditoria`, `POST/GET /exportaciones` en `C-16`), integración en casos de uso concretos de configuración/turnos/pacientes/reserva pública (`C-08`, `C-09`, `C-10`, `C-12`, `C-15`), cambios sobre `C-17` y política de retención/archivado (`PO-10` / `C-20`).
