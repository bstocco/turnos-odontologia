# Política de retención de datos (`PO-10`)

> **Estado: BORRADOR, pendiente de validación legal.** No es vinculante. Change `c-20-despliegue-paas-y-operacion`, tarea 4.3 (`design.md` D7, `Q5`). Si la normativa sobre registros de atención exigiera plazos mayores, prevalece el plazo legal.

## Plazos propuestos

| Dato | Plazo | Detalle |
|---|---|---|
| Datos activos de una clínica dada de baja | **90 días** | La clínica se puede reactivar. Referencia de mercado: 90 días. Pasado el plazo, se eliminan de la base activa. |
| Copias de seguridad | Según la ventana del plan, objetivo **≤ 30 días** | Las copias conservan los datos hasta que vence su ventana. |
| Desaparición total de los datos de una clínica | **≈ 120 días** tras la baja | 90 días en base activa + la ventana de copias. |
| Tabla `auditoria` | Sin borrado | Es de solo inserción (regla 11); su tratamiento al retirar una clínica se define con la asesoría legal. |

## Estado de validación

| Ítem | Estado |
|---|---|
| Plazos en base activa | Propuesto; **pendiente de validación legal** (`PO-10`, `Q5`) |
| Plazos en copias | Propuesto; **no se cumple hoy con el plan Free de Neon** (6 horas, ver `docs/operacion/respaldo.md`) |
| Procedimiento de retiro de una clínica | **Pendiente de definir**: no hay endpoint ni procedimiento implementado |
| Validación por asesoría legal | **Pendiente**, responsable: la Líder |

## Reglas

- No se borra nada a mano en `produccion` sin un procedimiento de retiro aprobado: hay datos de salud (Ley 25.326) y `auditoria` es de solo inserción.
- Mientras la política no esté validada legalmente, solo se opera con datos sintéticos.
