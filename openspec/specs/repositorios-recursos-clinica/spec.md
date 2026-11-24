# repositorios-recursos-clinica Specification

## Purpose

Provee los adaptadores de persistencia que implementan los puertos de lectura de C-02 para los recursos de la clínica (`RecursosReader` y la parte de `AgendaReader` de franjas, feriados y bloqueos) y la escritura de esos recursos que consumen los casos de uso de configuración y agenda.

## Requirements

### Requirement: Operación dentro del contexto de tenant
Los repositorios SHALL ejecutar todas sus consultas sobre la transacción con contexto de clínica que les entrega la capa de aplicación (`withTenant`) y MUST NOT abrir conexiones propias ni recibir el identificador de clínica como parámetro de sus operaciones de lectura (tenant implícito, regla 12).

#### Scenario: Recurso de otra clínica
- **WHEN** dentro del contexto de la clínica A se pide por id un profesional, sillón o prestación de la clínica B
- **THEN** el repositorio devuelve `null`, igual que para un id inexistente

#### Scenario: Sin contexto de clínica
- **WHEN** un repositorio se usa con una transacción sin contexto de clínica
- **THEN** las lecturas devuelven `null` o listas vacías y las escrituras son rechazadas por la base

### Requirement: Implementación de RecursosReader
El sistema SHALL implementar `RecursosReader` de C-02 sin cambiar su contrato: profesional por id (`id`, `activo`), prestación por id (`id`, `duracionMinutos`), sillón por id (`id`, `bufferMinutos`, `activo`), sillones activos de la clínica y configuración de agenda.

#### Scenario: Sillón con buffer
- **WHEN** se pide un sillón existente con `buffer_minutos = 10`
- **THEN** se devuelve con `bufferMinutos = 10` y su marca de activo

#### Scenario: Sillones activos
- **WHEN** la clínica tiene dos sillones activos y uno inactivo
- **THEN** `sillonesActivos` devuelve solo los dos activos

### Requirement: Configuración de agenda de la clínica del contexto
`configuracionAgenda` SHALL devolver la zona horaria IANA de la clínica del contexto y su granularidad en minutos, leyendo `clinica` y `clinica_config`. Como `clinica` no tiene RLS, la lectura MUST filtrarse explícitamente por la clínica del contexto de la transacción.

#### Scenario: Clínica con configuración por defecto
- **WHEN** la clínica del contexto tiene `zona_horaria = America/Argentina/Buenos_Aires` y `granularidad_minutos = 15`
- **THEN** se devuelve `{ zonaHoraria: 'America/Argentina/Buenos_Aires', granularidadMinutos: 15 }`

#### Scenario: Otra clínica con zona distinta
- **WHEN** existen las clínicas A (Buenos Aires) y B (`America/Santiago`) y se consulta con el contexto de la A
- **THEN** se devuelve la zona de la clínica A

#### Scenario: Clínica sin configuración
- **WHEN** la clínica del contexto no tiene fila en `clinica_config`
- **THEN** la operación falla con un error interno sin datos de la clínica en el mensaje

### Requirement: Franjas de atención en minutos locales
`franjasDeAtencion(profesionalId)` SHALL devolver las franjas del profesional con `diaSemana` y las horas convertidas a minutos desde la medianoche local (0 a 1440), ordenadas por día y hora de inicio. La escritura de franjas SHALL aceptar minutos y persistirlos como `time`.

#### Scenario: Franja de mañana
- **WHEN** el profesional tiene la franja martes 09:00-13:30
- **THEN** se devuelve `{ diaSemana: 2, desdeMinutos: 540, hastaMinutos: 810 }`

#### Scenario: Franja hasta medianoche
- **WHEN** se guarda la franja `{ diaSemana: 5, desdeMinutos: 1200, hastaMinutos: 1440 }` y se vuelve a leer
- **THEN** se devuelve igual, con `hastaMinutos = 1440`

#### Scenario: Reemplazo de franjas
- **WHEN** se reemplazan las franjas de un profesional por un conjunto nuevo y una de las nuevas se solapa con otra del mismo día
- **THEN** la operación falla con un error de conflicto y las franjas anteriores quedan intactas

### Requirement: Feriados por rango de fechas locales
`feriados(desde, hasta)` SHALL devolver las fechas de feriado de la clínica en `[desde, hasta)` como fechas locales `YYYY-MM-DD`, sin desplazamientos por la zona horaria del proceso.

#### Scenario: Rango semiabierto
- **WHEN** hay feriados el `2026-12-08` y el `2026-12-25` y se piden los de `[2026-12-08, 2026-12-25)`
- **THEN** se devuelve solo `2026-12-08`

#### Scenario: Fecha independiente de la zona del proceso
- **WHEN** el proceso corre con una zona horaria distinta de UTC y hay un feriado el `2026-07-09`
- **THEN** se devuelve exactamente `2026-07-09`

### Requirement: Bloqueos que intersectan un intervalo
`bloqueos(profesionalId, intervalo)` SHALL devolver los bloqueos del profesional cuyo `[inicio, fin)` intersecta el intervalo pedido, como intervalos del dominio con instantes UTC.

#### Scenario: Bloqueo adyacente
- **WHEN** el profesional tiene un bloqueo `[10:00, 12:00)` y se piden los que intersectan `[12:00, 13:00)`
- **THEN** no se devuelve ninguno

#### Scenario: Bloqueo parcial
- **WHEN** el profesional tiene un bloqueo `[10:00, 12:00)` y se piden los que intersectan `[11:30, 13:00)`
- **THEN** se devuelve ese bloqueo con su intervalo completo

### Requirement: Escritura de recursos de la clínica
El sistema SHALL permitir crear, actualizar y desactivar profesionales, sillones y prestaciones; crear y eliminar feriados y bloqueos; y listar cada recurso de la clínica del contexto. La desactivación MUST conservar la fila (sin borrado físico).

#### Scenario: Desactivar un sillón
- **WHEN** se desactiva un sillón
- **THEN** sigue existiendo, `sillon(id)` lo devuelve con `activo = false` y `sillonesActivos` ya no lo incluye

#### Scenario: Alta en la clínica del contexto
- **WHEN** se crea un profesional dentro del contexto de la clínica A
- **THEN** queda con el `clinica_id` de la clínica A sin que el llamador lo indique

### Requirement: Errores de persistencia como errores de dominio
Las violaciones de constraints SHALL traducirse a `ErrorDeDominio` con código estable: solape de bloqueos `BLOQUEO_SOLAPADO` (conflicto), solape de franjas `FRANJA_SOLAPADA` (conflicto), feriado repetido `FERIADO_DUPLICADO` (conflicto), referencia a un recurso inexistente o ajeno `RECURSO_NO_ENCONTRADO` (no encontrado) y valores fuera de rango `DATOS_INVALIDOS` (solicitud inválida). El error MUST NOT incluir valores de la fila ni el detalle del motor.

#### Scenario: Bloqueo solapado
- **WHEN** se crea un bloqueo que se solapa con otro del mismo profesional
- **THEN** la operación falla con `BLOQUEO_SOLAPADO` de tipo `conflicto`

#### Scenario: Profesional ajeno en un bloqueo
- **WHEN** dentro del contexto de la clínica A se crea un bloqueo para un profesional de la clínica B
- **THEN** la operación falla con `RECURSO_NO_ENCONTRADO`, sin revelar que el profesional existe en otra clínica
