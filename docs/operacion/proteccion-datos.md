# Protección de datos personales (Ley 25.326): transferencias y checklist

> Change `c-20-despliegue-paas-y-operacion`, tarea 6.1 (`Q3`, `Q5`, `PO-14`). Ordena el trabajo técnico y los puntos a validar: **no es dictamen jurídico**. Estado al **2026-11-25**.

## 1. Inventario de transferencias

| Proveedor | Rol | País de tratamiento | Datos que recibe | Base legal | Contrato |
|---|---|---|---|---|---|
| **Fly.io** | Aplicación (API y worker), región `gru` | Brasil | Datos en tránsito y en memoria: todos los de la API | Cláusulas contractuales modelo (Disposición DNPDP 60/2016 y Resolución AAIP 198/2023), sujetas a validación legal | **Pendiente** de firma |
| **Neon** | Base de datos PostgreSQL (`aws-sa-east-1`) y copias | Brasil | Todos los datos en reposo y las copias | Ídem | **Pendiente** de firma |
| **Resend** | Email transaccional (SMTP) | A verificar en la cuenta | Nombre, email y detalle del turno de pacientes | Ídem | **Pendiente** de firma; la cuenta aún no existe |
| GitHub / GitHub Actions | Código y CI | — | **Ningún dato personal**: solo datos sintéticos y credenciales descartables (regla 2) | No aplica | No aplica |

Brasil no figura entre los países de nivel adecuado de la AAIP (verificado el 2026-11-22 en `argentina.gob.ar/transferencias-internacionales`).

## 2. Medidas técnicas ya verificadas

| Medida | Estado | Evidencia |
|---|---|---|
| Aislamiento entre clínicas (RLS forzada) y `app` sin `BYPASSRLS` ni propiedad de tablas | Verificado en Neon, 2026-11-25 | `spike-postgres.md`; 516 pruebas de integración |
| Auditoría append-only | Verificado en Neon | Pruebas de integración y `docs/seguridad/checklist-ley-25326.md` |
| Logs sin datos de pacientes | Verificado | Suite de seguridad de C-19 (`logs-sin-fugas`) |
| Cifrado en tránsito a la base | Por configurar y verificar (`sslmode=require` en las URLs de Neon) | `design.md` D2 |
| Datos reales fuera de CI, tests y seeds | Verificado | Guardas `assertNoProduction()` y suite de seguridad |

## 3. Checklist previo a cargar datos reales

Sin todos los ítems cumplidos no se da de alta ninguna clínica real y solo se opera con datos sintéticos.

| # | Condición | Responsable | Fecha | Estado |
|---|---|---|---|---|
| 1 | Cláusulas contractuales modelo con Fly.io | Líder / asesoría legal | — | Pendiente |
| 2 | Cláusulas contractuales modelo con Neon | Líder / asesoría legal | — | Pendiente |
| 3 | Cláusulas contractuales modelo con Resend (y país de tratamiento) | Líder / asesoría legal | — | Pendiente |
| 4 | Validación legal de `PO-03` (transferencia internacional) | Líder / asesoría legal | — | Pendiente |
| 5 | Validación legal de `PO-10` (retención, `docs/operacion/retencion.md`) | Líder / asesoría legal | — | Pendiente |
| 6 | Análisis del registro de la base ante la AAIP (`PO-14`) | Líder / asesoría legal | — | Pendiente |
| 7 | Plan de base con recuperación a un punto en el tiempo y ventana registrada (`docs/operacion/respaldo.md`) | Líder | — | Pendiente (Free de Neon insuficiente) |
| 8 | Defectos F1, F2, F6, F8 y F9 corregidos en un change aparte (`docs/seguridad/checklist-ley-25326.md`) | Agente A / Líder | — | Pendiente |
| 9 | `produccion` aprovisionada (app, secretos, base con colación `es-AR`) | Líder | — | Pendiente (documentada, no creada; `design.md` D11) |
| 10 | Valores de `ALLOW_SEED=false`, `NODE_ENV=production` y `CORS_ALLOWED_ORIGINS` restringido en `produccion` | Líder | — | Pendiente (se verifican al aprovisionar) |

Cuando todos figuren cumplidos, con fecha y responsable, el runbook de alta de la primera clínica real puede ejecutarse (`docs/operacion/runbook.md` §1).
