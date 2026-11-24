# esquema-datos-clinica Specification

## Purpose

Define el esquema persistente de los recursos de la clínica (profesionales, horarios de atención, sillones, prestaciones, feriados), de los pacientes y de los bloqueos de agenda, con aislamiento multi-tenant forzado por la base y constraints que garantizan las invariantes de datos aunque falle la validación de la aplicación.

## Requirements

### Requirement: Tablas de recursos, pacientes y bloqueos con clinica_id
La migración `C05_001` SHALL crear las tablas `profesional`, `horario_atencion`, `sillon`, `prestacion`, `feriado`, `paciente` y `bloqueo`, cada una con `id` uuid y `clinica_id` uuid obligatorio con clave foránea a `clinica`, con las columnas de `04_modelo_de_datos.md`. Los instantes MUST ser `timestamptz`; las horas de atención `time` y los feriados `date`, en la zona de la clínica (RN-DA-03).

#### Scenario: Migración aplicada
- **WHEN** se aplica `C05_001` sobre una base con `C03_001`
- **THEN** existen las siete tablas, cada una con `clinica_id NOT NULL` referenciando `clinica(id)`, y `bloqueo.inicio`/`bloqueo.fin` son `timestamptz`

#### Scenario: Fila sin clínica
- **WHEN** se inserta una fila en cualquiera de las siete tablas sin `clinica_id`
- **THEN** la base la rechaza

### Requirement: RLS forzada en cada tabla nueva
Cada tabla creada por `C05_001` SHALL tener Row-Level Security habilitada y forzada mediante `aplicar_rls`, de modo que el rol `app` solo vea y escriba filas de la clínica del contexto de la transacción, y sin contexto no vea ninguna (RN-MT-01, DD-01).

#### Scenario: Aislamiento de lectura por tabla
- **WHEN** existen filas de las clínicas A y B en una tabla de C-05 y el rol `app` consulta con el contexto de la clínica A
- **THEN** solo obtiene filas de la clínica A

#### Scenario: Aislamiento de escritura por tabla
- **WHEN** el rol `app`, con el contexto de la clínica A, inserta una fila con el `clinica_id` de la clínica B
- **THEN** la base rechaza la inserción por violación de política (42501)

#### Scenario: Sin contexto de clínica
- **WHEN** el rol `app` consulta una tabla de C-05 sin contexto de clínica
- **THEN** no obtiene filas (falla cerrada)

### Requirement: Privilegios mínimos del rol de la aplicación
`C05_001` SHALL conceder al rol `app` `SELECT`, `INSERT` y `UPDATE` sobre las siete tablas y `DELETE` solo sobre `horario_atencion`, `feriado` y `bloqueo`. El rol `app` MUST NOT ser propietario de ninguna de ellas.

#### Scenario: Borrado de un recurso que se desactiva
- **WHEN** el rol `app` ejecuta `DELETE` sobre `profesional`, `sillon`, `prestacion` o `paciente`
- **THEN** la base lo rechaza por falta de privilegio

#### Scenario: Propiedad de las tablas
- **WHEN** se consulta el propietario de las siete tablas
- **THEN** ninguna pertenece al rol `app`

### Requirement: Referencias sin cruce de clínicas
Toda referencia de una tabla de C-05 a un profesional SHALL validarse por el par `(clinica_id, profesional_id)`, de modo que una fila nunca pueda apuntar a un profesional de otra clínica. `profesional`, `sillon`, `prestacion` y `paciente` SHALL exponer la clave única `(clinica_id, id)` para que las tablas futuras (p. ej. `turno`) referencien del mismo modo.

#### Scenario: Horario con profesional de otra clínica
- **WHEN** con el contexto de la clínica A se inserta un horario cuyo `profesional_id` pertenece a la clínica B
- **THEN** la base rechaza la inserción por clave foránea

#### Scenario: Bloqueo con profesional de otra clínica
- **WHEN** con el contexto de la clínica A se inserta un bloqueo cuyo `profesional_id` pertenece a la clínica B
- **THEN** la base rechaza la inserción por clave foránea

### Requirement: Franjas de atención válidas
`horario_atencion` SHALL exigir `dia_semana` entre 0 (domingo) y 6 (sábado) y `hora_desde < hora_hasta`, admitiendo `24:00` como fin del día. Las franjas de un mismo profesional y día MUST NOT solaparse, con intervalos semiabiertos `[hora_desde, hora_hasta)` (RN-AG-03, RN-AG-06).

#### Scenario: Hora de fin no posterior
- **WHEN** se inserta una franja con `hora_desde = 10:00` y `hora_hasta = 10:00`
- **THEN** la base la rechaza por constraint de verificación

#### Scenario: Día fuera de rango
- **WHEN** se inserta una franja con `dia_semana = 7`
- **THEN** la base la rechaza por constraint de verificación

#### Scenario: Franja hasta medianoche
- **WHEN** se inserta una franja de 20:00 a 24:00
- **THEN** la base la acepta

#### Scenario: Franjas contiguas y solapadas
- **WHEN** un profesional tiene la franja lunes 09:00-13:00 y se inserta lunes 13:00-17:00, y luego lunes 12:00-14:00
- **THEN** la franja contigua se acepta y la solapada se rechaza por constraint de exclusión

### Requirement: Valores de sillones y prestaciones
`sillon.buffer_minutos` SHALL ser un entero mayor o igual a 0, por defecto 0 (RN-AG-05). `prestacion.duracion_minutos` SHALL ser un entero mayor que 0. Sillones, prestaciones y profesionales SHALL tener una marca de activo, por defecto verdadera.

#### Scenario: Buffer negativo
- **WHEN** se inserta un sillón con `buffer_minutos = -5`
- **THEN** la base lo rechaza por constraint de verificación

#### Scenario: Sillón sin buffer explícito
- **WHEN** se inserta un sillón sin indicar `buffer_minutos`
- **THEN** queda con `buffer_minutos = 0` y activo

#### Scenario: Duración nula
- **WHEN** se inserta una prestación con `duracion_minutos = 0`
- **THEN** la base la rechaza por constraint de verificación

### Requirement: Feriado único por fecha y clínica
`feriado` SHALL ser único por `(clinica_id, fecha)`. Dos clínicas distintas MUST poder registrar la misma fecha.

#### Scenario: Feriado repetido
- **WHEN** la clínica A ya tiene un feriado el `2026-12-25` y se inserta otro en la misma fecha
- **THEN** la base lo rechaza por unicidad

#### Scenario: Misma fecha en otra clínica
- **WHEN** la clínica A tiene un feriado el `2026-12-25` y la clínica B registra la misma fecha
- **THEN** la base lo acepta

### Requirement: DNI único por clínica
`paciente` SHALL ser único por `(clinica_id, dni)` (RN-PA-02). Un mismo DNI en dos clínicas MUST corresponder a dos registros independientes.

#### Scenario: DNI repetido en la clínica
- **WHEN** la clínica A ya tiene un paciente con un DNI y se inserta otro paciente con el mismo DNI
- **THEN** la base lo rechaza por unicidad

#### Scenario: Mismo DNI en otra clínica
- **WHEN** la clínica B inserta un paciente con un DNI que ya existe en la clínica A
- **THEN** la base lo acepta y la clínica A no ve el registro de la B

### Requirement: Bloqueos válidos y sin solape por profesional
`bloqueo` SHALL exigir `inicio < fin` y MUST NOT admitir dos bloqueos del mismo profesional cuyos intervalos semiabiertos `[inicio, fin)` se intersecten, garantizado por un constraint de exclusión. `bloqueo.creado_por` SHALL ser obligatorio y MUST NOT tener clave foránea en este change.

#### Scenario: Bloqueo invertido
- **WHEN** se inserta un bloqueo con `fin <= inicio`
- **THEN** la base lo rechaza por constraint de verificación

#### Scenario: Bloqueos solapados del mismo profesional
- **WHEN** un profesional tiene un bloqueo `[10:00, 12:00)` y se inserta otro `[11:00, 13:00)` para el mismo profesional
- **THEN** la base lo rechaza con violación de exclusión (23P01)

#### Scenario: Bloqueos contiguos o de otro profesional
- **WHEN** un profesional tiene un bloqueo `[10:00, 12:00)` y se insertan `[12:00, 13:00)` para el mismo profesional y `[10:00, 12:00)` para otro
- **THEN** la base acepta ambos

#### Scenario: Autor del bloqueo sin usuario
- **WHEN** se inserta un bloqueo con un `creado_por` que no corresponde a ningún usuario
- **THEN** la base lo acepta (la clave foránea la agrega C-12)
