# Spec Delta

## Purpose

Convierte entre la hora local de una clínica, expresada en su zona horaria IANA, e instantes UTC, para interpretar horarios de atención y feriados sin desplazamientos fijos (RN-DA-03, DD-07).

## ADDED Requirements

### Requirement: Zona horaria IANA validada
Toda conversión SHALL recibir la zona horaria de la clínica como identificador IANA (por ejemplo `America/Argentina/Buenos_Aires`). Un identificador desconocido MUST rechazarse con `ZONA_HORARIA_INVALIDA` (tipo `solicitud_invalida`). Las conversiones MUST NOT usar desplazamientos fijos como `-03:00`.

#### Scenario: Zona inexistente
- **WHEN** se convierte una hora local con la zona `America/Atlantida`
- **THEN** se rechaza con `ZONA_HORARIA_INVALIDA`

### Requirement: Hora local de la clínica a instante UTC
Dada una fecha local (`AAAA-MM-DD`), una hora local (minutos desde la medianoche) y una zona IANA, el dominio SHALL devolver el instante UTC correspondiente según las reglas vigentes de esa zona en esa fecha. Una fecha u hora mal formada MUST rechazarse con `FECHA_HORA_LOCAL_INVALIDA` (tipo `solicitud_invalida`).

#### Scenario: Buenos Aires
- **WHEN** se convierte `2026-03-10` a las 09:00 en `America/Argentina/Buenos_Aires`
- **THEN** el instante es `2026-03-10T12:00:00Z`

#### Scenario: Zona con horario de verano
- **WHEN** se convierte `2026-01-15` y `2026-07-15` a las 09:00 en `America/Santiago`
- **THEN** los instantes reflejan desplazamientos distintos (`-03:00` en enero y `-04:00` en julio) según la base IANA

#### Scenario: Fecha imposible
- **WHEN** se convierte la fecha `2026-02-30`
- **THEN** se rechaza con `FECHA_HORA_LOCAL_INVALIDA`

### Requirement: Horas locales inexistentes o ambiguas
Si la hora local no existe en la zona por un adelanto de reloj, la conversión MUST rechazarse con `HORA_LOCAL_INEXISTENTE` (tipo `regla_de_negocio`). Si la hora local ocurre dos veces por un atraso de reloj, la conversión SHALL devolver la primera ocurrencia.

#### Scenario: Hora que se saltea
- **WHEN** se convierte `2026-09-06` a las 00:30 en `America/Santiago` (el reloj salta de 00:00 a 01:00)
- **THEN** se rechaza con `HORA_LOCAL_INEXISTENTE`

#### Scenario: Hora repetida
- **WHEN** se convierte `2026-04-04` a las 23:30 en `America/Santiago` (la hora ocurre con `-03:00` y luego con `-04:00`)
- **THEN** se devuelve `2026-04-05T02:30:00Z`, la primera ocurrencia

### Requirement: Instante UTC a fecha y día de semana locales
Dado un instante UTC y una zona IANA, el dominio SHALL devolver la fecha local, los minutos desde la medianoche local y el día de semana local (0 = domingo a 6 = sábado, como `horario_atencion.dia_semana`).

#### Scenario: Cambio de día por la zona
- **WHEN** se consulta el instante `2026-03-11T01:30:00Z` en `America/Argentina/Buenos_Aires`
- **THEN** la fecha local es `2026-03-10`, la hora local 22:30 y el día de semana 2 (martes)
