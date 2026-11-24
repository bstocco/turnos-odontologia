# Tasks

## 0. Puerta de gobernanza CRÍTICO (bloqueante antes de implementar)

- [ ] 0.1 Confirmar aprobación explícita del Líder sobre `proposal.md`, las tres delta specs y `design.md` (incluyendo las resoluciones de `Q1`–`Q6` en `design.md §Open Questions`), verificando que cualquier ajuste quede reflejado en los artefactos de OpenSpec antes de iniciar `/opsx:apply`.

## 1. Esquema SQL e inmutabilidad (`migrations/C07_001_auditoria.sql`)

- [ ] 1.1 Crear la migración `migrations/C07_001_auditoria.sql` con la tabla `auditoria` (`id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY`, `clinica_id`, `ocurrio_en`, `actor_tipo`, `actor_id`, `accion`, `entidad`, `entidad_id`, `datos_antes`, `datos_despues`, `ip`), los `CHECK` de actores/formatos compatibles con `C-17`, los 4 índices de consulta para `C-16`, `REVOKE ALL` + `GRANT SELECT, INSERT ON TABLE auditoria TO app`, la función/trigger `auditoria_inmutable` (`BEFORE UPDATE OR DELETE OR TRUNCATE FOR EACH STATEMENT`) y `SELECT aplicar_rls('auditoria')`; verificar que `npm run db:migrate` (en base de prueba) la aplica de forma limpia y atómica.
- [ ] 1.2 Crear el soporte de pruebas de integración `test/integration/auditoria/soporte.ts` reutilizando `test/support/base-de-datos.ts` y `test/support/aislamiento.ts` (con `reiniciarEsquema` + `aplicarMigraciones` sobre `migrations/` y alta de `CLINICA_A` y `CLINICA_B`, sin usar `TRUNCATE auditoria`) y agregar pruebas de esquema, propiedad (`migra`), privilegios de `app` y constraints en `test/integration/auditoria/esquema.test.ts`; verificar que fallen en RED antes de la migración y pasen en GREEN al aplicarla.
- [ ] 1.3 Agregar pruebas de integración en `test/integration/auditoria/inmutabilidad.test.ts` verificando la doble barrera de `RN-AU-01`: rechazo `42501` para `app` ante `UPDATE`, `DELETE` y `TRUNCATE`, y rechazo `P0001` del trigger para el propietario `migra` ante `UPDATE` (con y sin filas), `DELETE` (con y sin filas) y `TRUNCATE`, además de la compatibilidad literal con el `INSERT` de `C-17` (`repositorio-de-clinicas.ts`); verificar con `npm run test:integration`.
- [ ] 1.4 Agregar pruebas de aislamiento multi-tenant en `test/integration/auditoria/aislamiento.test.ts` usando `CLINICA_A` y `CLINICA_B` (lectura aislada por clínica, rechazo `42501` al insertar `clinica_id` ajeno, 0 filas y rechazo sin contexto tanto para `app` como para `migra`); verificar con `npm run test:integration`.

## 2. Enmascaramiento recursivo puro (`src/application/auditoria/enmascarar.ts`)

- [ ] 2.1 Escribir pruebas unitarias y propiedades (`fast-check`) en `test/unit/auditoria/enmascarar.test.ts` (fase RED) cubriendo: datos personales (`dni`, `telefono`, `email`, `nombre`, `apellido`, `obra_social` y variantes con `paciente` en cualquier mayúscula/tilde/separador), credenciales y secretos (`contrasena`, `password`, `passwd`, `token`, `secret`, `apikey`, `authorization`, `cookie`, `codigoverificacion`, `verificationcode`, `hashcodigo`), preservación de `codigo` de dominio, saneamiento de texto libre (`motivo`, `mensaje`, `message`, `msg`, `stack`, `observacion`, `detalle`, `descripcion`), conversión de `Date` a ISO-8601 UTC, límite de profundidad (`[TRUNCADO]`), referencias circulares (`[CIRCULAR]`), `undefined` raíz a `null` y no mutación del objeto original.
- [ ] 2.2 Implementar `enmascararDatosAuditoria` en `src/application/auditoria/enmascarar.ts` (respetando la resolución aprobada de `Q1` y sin importar `infrastructure/` ni `interfaces/`) hasta poner todos los casos y propiedades de `test/unit/auditoria/enmascarar.test.ts` en GREEN y refactorizar manteniendo complejidad acotada (`npm run test:unit`).

## 3. Puertos, validaciones y `AuditoriaService` (`src/application/auditoria/`)

- [ ] 3.1 Definir los contratos y el puerto append-only (`AuditoriaRepositorio` con único método `insertar`, `ServicioAuditoria`, `EntradaAuditoria`, `RegistroAuditoriaAInsertar`, `RegistroAuditoriaCreado`) en `src/application/auditoria/puertos.ts` sin modificar `src/application/shared/request-context.ts`, y verificar tipos con `npm run typecheck`.
- [ ] 3.2 Aplicar Strict TDD (RED → GREEN → TRIANGULATE → REFACTOR) entre `test/unit/auditoria/servicio.test.ts` y `src/application/auditoria/{validaciones,servicio}.ts` para validar UUID de `clinicaId`, tipos de actor (`usuario`, `paciente_enlace`, `sistema`), obligatoriedad de `actor.id` en `usuario`/`paciente_enlace` y normalización de vacío a `null` en `sistema`, formato snake_case de `accion`/`entidad`, `entidadId` opcional, formato de `ip` (IPv4/IPv6), enmascaramiento de `antes`/`despues` y delegación única a `AuditoriaRepositorio.insertar`; verificar con `npm run test:unit`.

## 4. Hooks reutilizables *fail-closed* (`src/application/auditoria/hooks.ts`)

- [ ] 4.1 Aplicar Strict TDD (RED → GREEN → TRIANGULATE → REFACTOR) entre `test/unit/auditoria/hooks.test.ts` y `src/application/auditoria/hooks.ts` (más exportaciones en `src/application/auditoria/index.ts`) para `conAuditoriaDeCambio`, `conAuditoriaDeLecturaPaciente` (`lectura_ficha` con `antes: null, despues: null`, sin auditar si el paciente es `null`/`undefined`) y `conAuditoriaDeExportacion` (`exportacion` con metadatos saneados), cubriendo éxito, error del caso de uso (no audita) y fallo de auditoría (propagado en modo *fail-closed*); verificar con `npm run test:unit` y `npm run lint`.

## 5. Adaptador PostgreSQL transaccional (`src/infrastructure/audit/`)

- [ ] 5.1 Implementar la traducción segura de errores en `src/infrastructure/audit/errores.ts` (`ErrorDeAuditoriaPersistencia` y mapeo de `42501`, `23514`, `23503` sin exponer `detail` ni datos personales) y las fábricas `crearRepositorioAuditoriaPg(ejecutor)` / `crearAuditoriaPg(ejecutor)` en `src/infrastructure/audit/repositorio-pg.ts` e `index.ts`, serializando `jsonb` con `JSON.stringify`, `id::text`, `host(ip)` y pasando `ctx.clinicaId` como `$1`.
- [ ] 5.2 Agregar pruebas de integración sobre PostgreSQL real en `test/integration/auditoria/servicio-pg.test.ts` verificando: inserción dentro de `withTenant` para los tres actores (`usuario`, `paciente_enlace`, `sistema`), enmascaramiento persistido en `jsonb`, devolución de `id` secuencial y `ip` canónica, rechazo `42501` ante desalineación `ctx.clinicaId !== app.clinica_id`, reversión atómica completa cuando un hook/transacción hace `ROLLBACK` (comprobando 0 filas insertadas), y ausencia de PII en errores serializados; verificar con `npm run test:integration`.

## 6. Verificación integral y cierre técnico del change

- [ ] 6.1 Ejecutar la batería completa de calidad y pruebas sobre el estado final (`npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run test:unit`, `npm run test:integration`, `npm run test:api`) y confirmar 100% en verde.
- [ ] 6.2 Ejecutar `openspec validate "c-07-auditoria-append-only" --strict` y verificar con `git status` que no se modificaron archivos fuera de la zona exclusiva de `C-07` (`RequestContext`, `package.json`, `package-lock.json`, `test/support/**` y migraciones previas intactos).

## Workflow follow-up

- Abrir PR de `change/C-07-auditoria-append-only` hacia `main` para revisión del Líder tras completar el apply.
- Sincronizar delta specs a `openspec/specs/` y archivar el change con `openspec-archive-change` una vez aprobada la implementación.
- Marcar `[x]` en `CHANGES.md` al fusionar el PR a `main` (responsabilidad del Líder).
