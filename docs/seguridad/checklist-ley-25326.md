# Checklist de Cumplimiento — Ley 25.326 (Protección de Datos Personales)

> Generado en el marco de `C-19` (`hardening-seguridad-y-privacidad`).
> Referencias canónicas: [05_reglas_de_negocio.md](../../knowledge-base/05_reglas_de_negocio.md), [08_arquitectura_propuesta.md](../../knowledge-base/08_arquitectura_propuesta.md), [10_preguntas_abiertas.md](../../knowledge-base/10_preguntas_abiertas.md).

## 1. Matriz de cumplimiento técnico y regulatorio

| ID / Norma | Requisito / Control | Estado | Responsable | Evidencia técnica / Criterio de cierre |
|---|---|---|---|---|
| **Ley 25.326 art. 9** (`RN-MT-01`, `R-03`) | Aislamiento estricto entre clínicas (multi-tenant) en base de datos y API | Verificado (con bloqueantes previos a despliegue en §2) | Líder técnico / Agente A | RLS habilitada y forzada (`FORCE ROW LEVEL SECURITY`) en toda tabla con `clinica_id`; verificado automáticamente en [verificar-seguridad-bd.ts](../../src/infrastructure/db/verificar-seguridad-bd.ts) y [cross-tenant.test.ts](../../test/seguridad/cross-tenant.test.ts). |
| **Ley 25.326 art. 9** (`RN-MT-02`) | Rol de aplicación con mínimo privilegio (sin `SUPERUSER`, sin `BYPASSRLS`, sin propiedad de tablas) | Verificado | Líder técnico | [01-roles.sql](../../docker/postgres/init/01-roles.sql) y [postura-bd-y-seeds.test.ts](../../test/seguridad/postura-bd-y-seeds.test.ts); funciones `SECURITY DEFINER` con `search_path` fijo y sin `EXECUTE` para `PUBLIC`. |
| **Ley 25.326 art. 9** (`RN-MT-03`, `RN-AU-01..03`) | Auditoría append-only de lecturas de fichas, cambios y exportaciones | Verificado | Líder técnico | Tabla `auditoria` con privilegios `SELECT`/`INSERT` únicamente para `app` y trigger inmutable; verificado en [postura-bd-y-seeds.test.ts](../../test/seguridad/postura-bd-y-seeds.test.ts). |
| **Ley 25.326 art. 9** (`RN-DA-04`) | Exportación de datos de la clínica restringida al administrador y auditada | Verificado | Líder técnico | [exportaciones/index.ts](../../src/interfaces/http/modules/exportaciones/index.ts) y aislamiento comprobado en [cross-tenant.test.ts](../../test/seguridad/cross-tenant.test.ts). |
| **Ley 25.326 art. 9** (Logs y secretos) | Cero datos personales de pacientes (DNI, teléfono, email, nombre, apellido, obra social) ni secretos en logs | Verificado | Líder técnico | Redacción profunda en [redactor.ts](../../src/infrastructure/logging/redactor.ts), sin registro de query ni body en [logger.ts](../../src/infrastructure/logging/logger.ts), y validación E2E en [logs-sin-fugas.test.ts](../../test/seguridad/logs-sin-fugas.test.ts). |
| **Ley 25.326 art. 9** (`RN-DA-01`, `RN-DA-02`) | Prohibición de datos reales fuera de producción y guardas en seeds | Verificado | Líder técnico | `ALLOW_SEED=false` por defecto en [.env.example](../../.env.example); guardas `assertNoProduction()` en [assert-no-production.ts](../../src/infrastructure/seed/assert-no-production.ts), `seeds/run.ts`, `seeds/demo-clinica.ts` y `seeds/primera-clinica.ts`, verificadas en [postura-bd-y-seeds.test.ts](../../test/seguridad/postura-bd-y-seeds.test.ts). |
| **Ley 25.326 art. 9** (`RN-RE-04..06`) | Hash de credenciales, códigos OTP y tokens de acción; hardening HTTP | Verificado | Líder técnico | Contraseñas con `argon2id`, tokens/OTP con SHA-256 + `timingSafeEqual`; cabeceras Helmet, CORS *default-deny*, `bodyLimit` y rate limit verificados en [hardening-http.test.ts](../../test/seguridad/hardening-http.test.ts). |
| **Ley 25.326 art. 12** (**`PO-03`**) | Transferencia internacional de datos por alojamiento en PaaS región `sa-east-1` (São Paulo, Brasil) | **Pendiente validación legal pre-producción** | Equipo de producto / Asesoría legal | Región decidida: `sa-east-1` (Brasil no cuenta con adecuación AAIP). Se adoptan las cláusulas contractuales modelo (Disposición DNPDP 60/2016 y Resolución AAIP 198/2023) y cifrado en tránsito/reposo. Debe firmarse/validarse previo a salir a producción en `C-20`. |
| **Ley 25.326 art. 21** (**`PO-14`**) | Inscripción de las bases de datos personales ante la Agencia de Acceso a la Información Pública (AAIP) | **Pendiente gestión pre-producción** | Equipo de producto / Asesoría legal | Alta del responsable y declaración de la base de datos ante la AAIP antes de operar con datos reales de pacientes en producción. |
| **Política de retención** (**`PO-10`**) | Plazo de retención de copias de seguridad y datos tras la baja de una clínica | **Pendiente definición en `C-20` / legal** | Equipo de producto / Asesoría legal / Líder técnico | Definir plazo de retención (referencia de mercado: 90 días), procedimiento de borrado/anonimización segura y prueba de restauración en `C-20`. |

---

## 2. Bloqueantes técnicos obligatorios previos al despliegue (`C-20`)

Los siguientes defectos previos de autenticación/autorización fueron detectados en `C-18`, quedan fuera de la zona de `C-19` (Regla 14) y **bloquean la salida a producción hasta ser resueltos**:

| ID | Módulo / Change origen | Descripción del defecto | Impacto en seguridad / cumplimiento | Responsable |
|---|---|---|---|---|
| **F1** | `usuarios` (`C-06`) | No registra `pluginDeAutenticacion`: `request.userContext` nunca se completa y todo pedido responde `401` incluso con JWT válido. | Impide administrar usuarios y ejecutar pruebas funcionales cross-tenant sobre `usuarios`. | Agente A / Líder técnico |
| **F2** | `interno` / aprovisionamiento (`C-17`) | El alta interna (`POST /api/v1/interno/clinicas`) crea al primer administrador con una contraseña temporal pero **no la devuelve** (responde solo `clinicaId` y `slug`) y no hay flujo de restablecimiento: el primer administrador de una clínica no puede iniciar sesión. | Imposibilita dar de alta la primera clínica real (puesta en marcha). | Agente A / Líder técnico |
| **F6** | `turnos`, `agenda`, `bloqueos` (`C-12`) | No registran `pluginDeAutenticacion` (`401` con sesión válida) y usan `requireRole(ctx, 'odontologo')` en acciones donde `03 §RBAC` habilita a administración y recepción. | Bloquea el núcleo de agenda y turnos en operación real. | Agente A / Líder técnico |
| **F8** | `ausentismo` (`C-16`) | `GET /api/v1/ausentismo` admite solo `administrador`; `03 §RBAC` habilita también a `recepcionista` y (con alcance propio) a `odontologo`. | Inconsistencia con la matriz RBAC aprobada. | Agente A / Líder técnico |
| **F9** | `auditoria`, `ausentismo`, `exportaciones` (`C-16`) | Sin cabecera `Authorization` responden `403 ACCESO_PROHIBIDO` en lugar de `401` (`exigirContextoDeAdministrador`). | Desvío del contrato de autenticación HTTP (`401` ante ausencia de credenciales). | Agente A / Líder técnico |

> **Decisión de la Líder (2026-11-25):** **F1, F2, F6, F8 y F9 se resuelven en un change correctivo aparte** (no en `C-20`, que no toca código de otros changes). Hasta que ese change esté fusionado, siguen siendo **bloqueantes previos al go-live real**. `C-20` puede aprovisionar `pruebas` y `produccion` sin datos reales, pero no se da de alta ninguna clínica real.

---

## 3. Criterio de salida para producción (`C-20`)

1. Resolver y fusionar en `main`, mediante el change correctivo aparte, los bloqueantes técnicos **F1**, **F2**, **F6**, **F8** y **F9** (quitando las marcas `it.fails` en `test/e2e/permisos/matriz.ts` y `test/seguridad/cross-tenant.test.ts`).
2. Completar la validación legal de **PO-03** (cláusulas contractuales modelo `sa-east-1`), gestionar el registro ante la **AAIP (`PO-14`)** y aprobar la política de retención (**PO-10**).
3. Verificar en el entorno desplegable de `C-20`:
   - `ALLOW_SEED=false` y `NODE_ENV=production` en variables del PaaS.
   - Rol de conexión de la app sin `BYPASSRLS`, sin `SUPERUSER` y sin propiedad de tablas.
   - `CORS_ALLOWED_ORIGINS` vacío o restringido exclusivamente a los orígenes explícitos autorizados (nunca `*`).
   - CI en verde incluyendo `npm run test:security` y `npm audit --omit=dev --audit-level=high`.
