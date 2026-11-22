# Modelo de Datos

## Dominios

| Dominio | Entidades |
|---|---|
| Tenant y configuración | `clinica`, `clinica_config` |
| Identidad y acceso | `usuario`, `token_accion`, `codigo_verificacion` |
| Recursos de la clínica | `profesional`, `sillon`, `prestacion`, `horario_atencion`, `feriado` |
| Agenda | `turno`, `bloqueo` |
| Pacientes | `paciente` |
| Comunicación | `notificacion` |
| Trazabilidad | `auditoria` |

## ERD

```
clinica 1───1 clinica_config
   │
   ├──< usuario >──0..1── profesional
   ├──< profesional ──< horario_atencion
   │        │  └──< bloqueo
   ├──< sillon
   ├──< prestacion
   ├──< feriado
   ├──< paciente
   ├──< turno >── paciente / profesional / sillon / prestacion
   │        └──< token_accion
   │        └──< notificacion
   ├──< codigo_verificacion
   └──< auditoria            (solo INSERT)
```

Convenciones: todas las tablas llevan `clinica_id` (uuid, obligatorio) y `id` (uuid). Los instantes se guardan como `timestamptz` en UTC. Los nombres van en `snake_case` y en español.

## Entidades

### clinica
- `id`, `nombre`, `slug` (único global, usado en URLs públicas), `zona_horaria` (IANA, por defecto `America/Argentina/Buenos_Aires`), `activa`, `creada_en`.
- **Sin RLS por `clinica_id`:** la tabla se consulta por `slug` desde rutas públicas mediante una función `SECURITY DEFINER` (ver `08_arquitectura_propuesta.md`).

### clinica_config
- `clinica_id` (PK y FK), `reserva_requiere_confirmacion` (boolean), `cancelacion_anticipacion_horas` (entero, por defecto 24), `granularidad_minutos` (por defecto 15).
- **Suposición:** la anticipación de 24 hs es un valor por defecto parametrizable por clínica; el Discovery fijó solo "24 hs". La granularidad de la grilla de turnos es una propuesta (PO-06).

### usuario
- `id`, `clinica_id`, `email` (único por clínica), `hash_contrasena` (argon2id), `rol` (`administrador` | `recepcionista` | `odontologo`), `profesional_id` (nullable, FK), `activo`, `ultimo_acceso`.

### profesional
- `id`, `clinica_id`, `nombre`, `apellido`, `matricula` (opcional), `activo`.

### horario_atencion
- `id`, `clinica_id`, `profesional_id`, `dia_semana` (0 a 6), `hora_desde`, `hora_hasta` (tipo `time`, en la zona horaria de la clínica).
- **Restricción:** `hora_desde < hora_hasta`. Un profesional puede tener varias franjas por día; no se solapan entre sí.

### sillon
- `id`, `clinica_id`, `nombre`, `buffer_minutos` (entero ≥ 0, por defecto 0; limpieza o desinfección), `activo`.

### prestacion
- `id`, `clinica_id`, `nombre`, `duracion_minutos` (entero > 0), `activa`.

### feriado
- `id`, `clinica_id`, `fecha` (tipo `date`), `descripcion`.
- **Restricción:** única por `(clinica_id, fecha)`.

### paciente
- `id`, `clinica_id`, `nombre`, `apellido`, `dni`, `telefono` (normalizado a formato internacional), `email`, `obra_social` (texto libre, opcional), `creado_en`.
- **Restricción:** `dni` único por clínica. Un mismo paciente en dos clínicas son dos registros independientes (aislamiento).
- **Dato de salud:** ver RN-MT y RN-DA.

### turno
- `id`, `clinica_id`, `paciente_id`, `profesional_id`, `sillon_id`, `prestacion_id`.
- `inicio`, `fin` (`timestamptz`): `fin = inicio + duración de la prestación`.
- `buffer_minutos` (copia del buffer del sillón al momento de reservar).
- `fin_sillon` (`timestamptz`): `fin + buffer_minutos`.
- `estado`: `pendiente_confirmacion` | `confirmado` | `cancelado` | `reprogramado` | `atendido` | `ausente`.
- `origen`: `recepcion` | `enlace_web`.
- `reprogramado_de` (nullable, FK a `turno`).
- `duracion_real_minutos` (nullable; la registra el odontólogo).
- `creado_en`, `actualizado_en`.
- **Rangos:** `rango_profesional = tstzrange(inicio, fin, '[)')` y `rango_sillon = tstzrange(inicio, fin_sillon, '[)')`. Intervalos semiabiertos: un turno que termina a las 10:00 no choca con otro que empieza a las 10:00.
- **Constraints de exclusión** (garantía final de RN-AG-01 y RN-AG-02):

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE turno ADD CONSTRAINT turno_sin_solape_profesional
  EXCLUDE USING gist (clinica_id WITH =, profesional_id WITH =, rango_profesional WITH &&)
  WHERE (estado NOT IN ('cancelado', 'reprogramado'));

ALTER TABLE turno ADD CONSTRAINT turno_sin_solape_sillon
  EXCLUDE USING gist (clinica_id WITH =, sillon_id WITH =, rango_sillon WITH &&)
  WHERE (estado NOT IN ('cancelado', 'reprogramado'));
```

> **Gotcha (validar en la primera change de base de datos):** las columnas generadas de PostgreSQL requieren expresiones inmutables, y `timestamptz + interval` es `STABLE`. Por eso `fin_sillon` se persiste como columna común calculada por la aplicación, y un `CHECK` verifica la coherencia con `buffer_minutos`. Verificar con un *spike* antes de fijar el diseño.

- **Índices:** `(clinica_id, profesional_id, inicio)`, `(clinica_id, sillon_id, inicio)`, `(clinica_id, paciente_id)`, `(clinica_id, estado, inicio)`. Los constraints de exclusión aportan sus propios índices GiST.

### bloqueo
- `id`, `clinica_id`, `profesional_id`, `inicio`, `fin` (`timestamptz`), `motivo` (opcional), `creado_por` (FK a `usuario`).
- **Restricción:** `inicio < fin`. Los bloqueos de un profesional no se solapan entre sí.
- Un bloqueo no puede crearse sobre turnos activos (RN-AG-08).

### token_accion
- `id`, `clinica_id`, `turno_id`, `proposito` (`confirmar` | `cancelar`), `hash_token` (SHA-256 del token aleatorio; el token nunca se guarda), `vence_en`, `usado_en` (nullable).
- **Restricción:** un token se usa una sola vez.

### codigo_verificacion
- `id`, `clinica_id`, `email`, `hash_codigo`, `vence_en`, `intentos`, `consumido_en` (nullable).
- Soporta la validación por email de la reserva pública (pendiente de decisión, PO-02).

### notificacion
- `id`, `clinica_id`, `turno_id`, `canal` (`email`), `tipo` (`confirmacion` | `recordatorio` | `cancelacion` | `codigo`), `estado` (`pendiente` | `enviada` | `fallida`), `programada_para`, `enviada_en`, `error`.

### auditoria (append-only)
- `id` (secuencial), `clinica_id`, `ocurrio_en`, `actor_tipo` (`usuario` | `paciente_enlace` | `sistema`), `actor_id`, `accion`, `entidad`, `entidad_id`, `datos_antes`, `datos_despues` (jsonb), `ip`.
- **Solo INSERT:** el rol de la aplicación no tiene `UPDATE` ni `DELETE`, y un *trigger* rechaza ambas operaciones (RN-AU-01).
- Registra también las **lecturas de la ficha de un paciente** y las **exportaciones** (RN-AU-03).

## Seed data inicial

Solo datos **sintéticos o públicos**. Nunca datos reales (RN-DA-01).

| Dato | Contenido |
|---|---|
| Catálogo de roles | `administrador`, `recepcionista`, `odontologo` |
| Plantilla de prestaciones (opcional, por clínica) | Ejemplos del Discovery: consulta 30 min, limpieza 45 min, conducto 60 min |
| Feriados nacionales (plantilla) | Calendario público del año en curso; cada clínica lo copia y ajusta |
| Clínica de demostración | Datos inventados generados por un script con *faker* en español (Argentina) |

El script de seed **se niega a ejecutarse** si la conexión apunta a un host de producción (RN-DA-02).
