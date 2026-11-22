# Flujos Principales

Cada flujo se describe extremo a extremo. Los códigos `RN-*` remiten a `05_reglas_de_negocio.md`.

## Flujo 1: Autenticación del personal

**Disparador**: el usuario inicia sesión.
**Actor**: administrador, recepcionista u odontólogo.

**Pasos**:
1. El cliente envía `POST /auth/login` con email y contraseña (y el `slug` de su clínica, **Suposición**: el email es único por clínica, no global).
2. La API busca al usuario en esa clínica y verifica el hash (argon2id).
3. Emite un token de acceso corto y un token de refresco rotativo.
4. En cada pedido siguiente, la API valida el JWT, abre una transacción y ejecuta `SET LOCAL app.clinica_id = <clinica_id>` para activar Row-Level Security.
5. Se audita el inicio de sesión.

**Casos de error**:
- Credenciales inválidas → `401` con mensaje genérico (no revela si el email existe).
- Usuario desactivado → `401`.
- Exceso de intentos → bloqueo temporal por límite de tasa.

## Flujo 2: Agendar un turno desde la recepción

**Disparador**: la recepción agenda un turno.
**Actor**: recepcionista.

**Pasos**:
1. La recepción elige paciente (existente o nuevo), profesional, prestación, sillón e inicio.
2. La aplicación carga la prestación y el sillón y calcula `fin = inicio + duración` y `fin_sillon = fin + buffer`.
3. El dominio valida (sin tocar la base): horario del profesional, feriado, bloqueo, inicio en el pasado y granularidad.
4. La infraestructura inserta el turno dentro de una transacción.
5. Los **constraints de exclusión** de PostgreSQL rechazan el INSERT si hay solape de profesional o de sillón.
6. Si tiene éxito: se encolan los emails, se registra la auditoría y se responde `201`.

```
Recepción → API → Dominio (valida) → PostgreSQL (INSERT + exclusión)
                                          ← 201 | 409
```

**Casos de error**:
- Solape detectado por el dominio o por la base → `409` con `TURNO_SOLAPADO_PROFESIONAL` o `TURNO_SOLAPADO_SILLON`.
- Fuera de horario, feriado o bloqueo → `422` con el motivo.
- Dos pedidos concurrentes por el mismo hueco → gana uno; el otro recibe `409`.

## Flujo 3: Reserva pública por enlace

**Disparador**: el paciente abre el enlace de reserva de la clínica.
**Actor**: paciente (sin cuenta).

**Pasos**:
1. `GET /publico/{slug}/prestaciones` y `GET /publico/{slug}/disponibilidad` devuelven prestaciones y horarios libres. El `slug` se resuelve con una función de base de datos que no requiere sesión.
2. El paciente elige profesional, prestación y horario, e informa sus datos básicos.
3. **(Propuesto, PO-02)** La API envía un código por email y el paciente lo ingresa para validar que controla el email.
4. `POST /publico/{slug}/reservas`: la API busca o crea al paciente por DNI, elige un sillón libre automáticamente y crea el turno.
5. El estado inicial es `pendiente_confirmacion` o `confirmado` según la configuración de la clínica.
6. Se envía un email con enlaces de confirmación y cancelación (tokens de un solo uso).

```
Paciente → API pública → (código por email, propuesto) → Dominio → PostgreSQL
                                                  ← 201 + email con enlaces
```

**Casos de error**:
- El hueco se ocupó entre la consulta y la reserva → `409`; el cliente vuelve a consultar disponibilidad.
- No hay sillón libre para ese horario → `409`.
- Código vencido o incorrecto → `422`, con límite de intentos.
- Exceso de pedidos → `429`.

## Flujo 4: Confirmación o cancelación por el paciente

**Disparador**: el paciente hace clic en un enlace de su email.
**Actor**: paciente.

**Pasos**:
1. `POST /publico/turnos/accion` con el token.
2. La API compara el hash del token, valida que no esté usado ni vencido y que corresponda al propósito.
3. **Confirmar:** pasa a `confirmado`.
4. **Cancelar:** verifica que falten al menos 24 horas (o el valor de la clínica) para el inicio. Si es así, pasa a `cancelado` y libera horario y sillón.
5. Marca el token como usado, audita y envía el email correspondiente.

**Casos de error**:
- Token usado, vencido o inexistente → `410` o `404` genérico.
- Cancelación con menos de 24 hs → `409` con el mensaje "contactá a la clínica" (RN-RE-02).

## Flujo 5: Reprogramación desde la recepción

**Disparador**: la recepción mueve un turno.
**Actor**: recepcionista.

**Pasos**:
1. La recepción elige el nuevo horario, profesional o sillón.
2. En **una transacción**: se crea el turno nuevo con `reprogramado_de` y el original pasa a `reprogramado`.
3. Si el INSERT del nuevo turno falla por solape, **toda la transacción se revierte** y el original queda intacto.
4. Se audita y se notifica al paciente.

**Casos de error**: igual que el Flujo 2. El turno original nunca se pierde.

## Flujo 6: Bloqueo de franja por el odontólogo

**Disparador**: el odontólogo bloquea una franja.
**Actor**: odontólogo.

**Pasos**:
1. El odontólogo envía el rango y el motivo.
2. La API verifica que no existan turnos activos del profesional dentro del rango.
3. Si hay turnos, responde `409` con la lista de turnos en conflicto (RN-AG-08, **Suposición**).
4. Si no, crea el bloqueo y lo audita. La disponibilidad pública ya no ofrece esa franja.

**Caso de error**: bloqueo sobre turnos activos → la recepción debe reprogramar o cancelar primero.

## Flujo 7: Recordatorio por email

**Disparador**: el *worker* detecta turnos próximos.
**Actor**: sistema.

**Pasos**:
1. Un trabajo periódico busca turnos `confirmado` o `pendiente_confirmacion` cuyo recordatorio corresponda (**Suposición**: 24 hs antes).
2. Encola un email por turno y registra la notificación como `pendiente`.
3. El *worker* envía vía el proveedor de email y marca `enviada` o `fallida`, con reintentos.

**Casos de error**: fallo del proveedor → reintento con espera creciente; tras el máximo de intentos queda `fallida` y la recepción puede usar el enlace de WhatsApp (Flujo 8).

## Flujo 8: Recordatorio manual por WhatsApp

**Disparador**: la recepción quiere avisar a un paciente.
**Actor**: recepcionista.

**Pasos**:
1. `GET /turnos/{id}/enlace-whatsapp`.
2. La API normaliza el teléfono (`549` + área + número, sin `15`) y arma `https://wa.me/<número>?text=<mensaje codificado>`.
3. La recepción abre el enlace y envía el mensaje desde su propio WhatsApp.

**Caso de error**: teléfono ausente o inválido → la API lo informa.

## Flujo 9: Registro de ausentismo

**Disparador**: pasó la hora del turno y el paciente no asistió.
**Actor**: recepcionista u odontólogo.

**Pasos**:
1. Se invoca `POST /turnos/{id}/ausente`.
2. La API valida que el turno esté `confirmado` y que ya haya comenzado.
3. Pasa a `ausente` y se audita (quién y cuándo).

**Caso de error**: turno futuro o en otro estado → `409`.

## Flujo 10: Exportación de datos de la clínica

**Disparador**: el administrador pide sus datos.
**Actor**: administrador.

**Pasos**:
1. `POST /exportaciones` genera el archivo con los datos de **su** clínica (RLS lo garantiza).
2. La exportación se audita (actor, fecha, contenido).
3. `GET /exportaciones/{id}` entrega el archivo en un formato abierto.

**Casos de error**: usuario sin rol de administrador → `403`.
