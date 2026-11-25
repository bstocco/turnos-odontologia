# Copias de seguridad y ventana de recuperación

> Change `c-20-despliegue-paas-y-operacion`, tarea 4.1 (`Q2`). Datos transcriptos del panel de cada proveedor por la Líder el **2026-11-25**; el detalle está en `docs/operacion/evidencia/spike-postgres.md`. No incluye credenciales ni datos de pacientes.

## Regla

No se opera con datos reales sobre un plan de base de datos que no ofrezca recuperación a un punto en el tiempo (o equivalente documentado) ni copias automáticas con una ventana conocida. La ventana efectiva de cada plan se registra acá con su fuente y fecha antes del primer alta real.

## Planes evaluados

| Plan | Copias automáticas | Recuperación | Frecuencia y retención | Fuente | Veredicto |
|---|---|---|---|---|---|
| Fly.io Managed Postgres, Developer (USD 4/mes) | Backup completo automático al crear el cluster | **Sin PITR** (solo backups, manuales posibles) | **Sin verificar**: el panel no muestra frecuencia ni retención | Panel de Fly, 2026-11-25 | No apto para datos reales sin verificar |
| Neon, Free (USD 0) | Historial restaurable | Restauración desde historial en una ventana de **6 horas**; snapshots **manuales**; los snapshots programados requieren plan pago | Ventana de 6 h | Panel de Neon, 2026-11-25 | Suficiente para `pruebas` (datos sintéticos); **insuficiente para datos reales** |
| Neon, plan pago para `produccion` | A confirmar | A confirmar | A confirmar | Sin verificar | Pendiente: elegir plan y registrar precio (`Q6`) y ventana antes de datos reales |

## Consecuencias

- La política de retención propuesta (`docs/operacion/retencion.md`) pide copias con una ventana objetivo de hasta 30 días: **no se cumple con el plan Free de Neon**. Hace falta un plan pago con snapshots programados o con historial mayor, o un procedimiento de snapshots manuales con un responsable.
- Las copias que salgan del PaaS (por ejemplo volcados exportados) deben permanecer cifradas y no se guardan en el repositorio, en tickets ni en chats.
- La prueba de restauración (verificar migraciones, RLS, `app` sin `BYPASSRLS`, aislamiento entre clínicas y `auditoria` append-only) quedó como trabajo posterior (`design.md`, "Trabajo posterior"). Se puede hacer solo con Neon.
