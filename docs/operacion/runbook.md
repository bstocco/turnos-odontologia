# Runbook de operación (BORRADOR)

> **Estado: borrador de la tarea 5.3 de `c-20-despliegue-paas-y-operacion`. Ningún procedimiento fue ejecutado todavía.**
> Se completa y se valida cuando `pruebas` esté desplegado: la tarea 5.3 exige que una persona que no lo escribió ejecute el alta y la rotación en `pruebas` siguiendo solo este documento.
> Los pasos marcados **(a verificar)** dependen de algo que todavía no se comprobó.

Arquitectura de referencia (ver `openspec/changes/c-20-despliegue-paas-y-operacion/design.md`): aplicación (API y worker) en Fly.io `gru`, base de datos en Neon `aws-sa-east-1`, dos entornos separados (`pruebas`, `produccion`) con secretos propios.

## Reglas de oro

- Nunca copiar valores de secretos, URLs de conexión, DNI, teléfonos ni emails de pacientes a chats, tickets, logs ni a este repositorio.
- `pruebas` solo con datos sintéticos. `produccion` no recibe datos reales hasta cumplir el checklist de `docs/operacion/proteccion-datos.md`.
- Los secretos solo viven en el PaaS (`fly secrets`) y en el gestor de contraseñas del equipo.

## 1. Alta de la primera clínica (C-17)

Endpoint interno: `POST /api/v1/interno/clinicas`, protegido por `ADMIN_INTERNAL_KEY` (cabecera `Authorization: Bearer <clave>`). Cuerpo: `slug` (minúsculas, números y guiones, 2 a 64), `nombre` y `email` del administrador inicial. Responde `201` con `{ clinicaId, slug }`.

Pasos (PowerShell, con la clave tomada del gestor de contraseñas y sin imprimirla):

```powershell
$clave = Read-Host -AsSecureString "Clave interna"   # no queda en el historial
$texto = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($clave))
Invoke-RestMethod -Method Post -Uri "https://<app>.fly.dev/api/v1/interno/clinicas" `
  -Headers @{ Authorization = "Bearer $texto" } -ContentType "application/json" `
  -Body '{"slug":"clinica-demo","nombre":"Clínica Demo","email":"admin@ejemplo.invalid"}'
```

> **Defecto conocido F2 (C-17): BLOQUEANTE previo al go-live real.** El alta crea al primer administrador con una contraseña temporal aleatoria, pero **la respuesta HTTP no la devuelve** (`src/interfaces/http/modules/interno/index.ts` responde solo `clinicaId` y `slug`) y no hay un flujo de restablecimiento de contraseña en el código. Hoy el primer administrador no tiene forma de iniciar sesión. Está reconocido en `test/e2e/flujos/00-puesta-en-marcha.test.ts` y en `docs/api/excepciones-de-respuesta.json`.
>
> **Decisión de la Líder (2026-11-25):** F2 se resuelve en un **change correctivo aparte**, junto con F1, F6, F8 y F9 (ver `docs/seguridad/checklist-ley-25326.md` §2 y §3). **No se resuelve en C-20** (cambiaría código de otros changes). **No se da de alta ninguna clínica real hasta que ese change esté fusionado.** Hasta entonces, este procedimiento solo puede probarse en `pruebas` con datos sintéticos y queda **(a verificar)** en lo que dependa de que el administrador inicie sesión.

Verificación: `GET /salud` responde `200`; luego el administrador inicia sesión (cuando F2 esté resuelto) y consulta `GET /api/v1/clinica`.

## 2. Despliegue y reversión

Despliegue: GitHub Actions `deploy.yml` (tarea 3.4), manual o por etiqueta `v*`, exige `CI` verde. Las migraciones corren como `release_command` con el rol `migra` antes de reemplazar la versión; si fallan, el despliegue se cancela y la versión anterior sigue activa.

Convención de migraciones: aditivas y compatibles con la versión anterior de la aplicación (las destructivas, en dos pasos). Nunca se edita una migración ya fusionada.

Reversión tras un despliegue exitoso (**a verificar** en `pruebas`):

1. `fly releases --app turnos-<entorno>` para ver las versiones e imágenes.
2. `fly deploy --app turnos-<entorno> --config fly.<entorno>.toml --image <imagen de la versión anterior>`.
3. Si la versión nueva ya aplicó una migración, la anterior debe tolerarla (migraciones aditivas). Si no, restaurar datos según la sección 4.
4. Comprobar `GET /salud`, `fly status` y que el worker figure activo.

## 3. Rotación de secretos

Cada rotación se hace primero en `pruebas`. Cargar secretos sin dejar el valor en el historial: `fly secrets import --app turnos-<entorno>` leyendo `NOMBRE=valor` por la entrada estándar. Cambiar un secreto reinicia las máquinas.

| Secreto | Efecto de rotarlo | Notas |
|---|---|---|
| `JWT_ACCESS_SECRET` | Los tokens de acceso vigentes dejan de ser válidos **(a verificar: no se comprobó si el código admite dos claves a la vez)** | Los usuarios tienen que volver a iniciar sesión. |
| `JWT_REFRESH_SECRET` | Los tokens de refresco firmados con la clave anterior dejan de ser válidos **(a verificar)** | Cierra todas las sesiones. |
| `EMAIL_API_KEY` | **Secreto obligatorio del worker**: sin ella (y sin un `EMAIL_FROM` válido) el worker no arranca. Rotarla corta el envío de correos hasta cargar la nueva | El proveedor de email (`Resend` o `Brevo`) **sigue sin elegirse**: hasta entonces no hay valor real que cargar. En CI se usa un valor falso descartable. |
| `ADMIN_INTERNAL_KEY` | Solo afecta al endpoint interno de alta de clínicas | Sin impacto en usuarios. Actualizar quien la usa. |
| `DATABASE_URL`, `DATABASE_MIGRATION_URL` | Cambiar la contraseña del rol (`app` o `migra`) en la base y luego el secreto, en ese orden, en una ventana corta | Desconexión breve del worker y la API. |

Generar valores nuevos con un generador criptográfico (por ejemplo 32 bytes en hexadecimal) y guardarlos en el gestor de contraseñas antes de cargarlos. Verificar después con `fly secrets list` (muestra nombres, no valores).

## 4. Restauración de datos

El plan Free de Neon permite restaurar desde el historial solo dentro de **6 horas** y los snapshots son manuales (`docs/operacion/evidencia/spike-postgres.md`). La ventana y el procedimiento definitivos de `produccion` dependen del plan que se elija (**a verificar**, tareas 4.1 y 4.2).

Esqueleto del procedimiento:

1. Declarar el incidente y detener escrituras si es posible (`fly scale count 0 --app ...` o poner la API en mantenimiento) **(a verificar)**.
2. Restaurar en una base o rama **nueva**, nunca encima de la actual.
3. Verificar en la copia restaurada: migraciones registradas, políticas RLS vigentes, `app` sin `BYPASSRLS`, aislamiento entre dos clínicas y rechazo de `UPDATE`/`DELETE` sobre `auditoria`.
4. Apuntar `DATABASE_URL` y `DATABASE_MIGRATION_URL` a la base restaurada y reiniciar.
5. Registrar el incidente y qué datos se perdieron.

## 5. Retiro de una clínica

**Pendiente de definir** (decisión de la Líder, 2026-11-25). El plazo de conservación depende de `PO-10` (propuesta de `design.md` D7: 90 días reactivable y luego eliminación, sujeta a validación legal) y hoy **no hay un endpoint ni un procedimiento implementado para dar de baja o eliminar una clínica** (a verificar en el código antes de documentarlo). No se debe borrar nada a mano en `produccion` sin ese procedimiento aprobado: hay datos de salud (Ley 25.326) y la tabla `auditoria` es de solo inserción.

## 6. Contactos y guardia

_(A completar por la Líder: persona de guardia, canal de alertas por email y datos de soporte de Fly.io y Neon.)_
