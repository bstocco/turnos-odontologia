# agenda-puertos Specification

## Purpose

Fija los contratos de los puertos del dominio de agenda (persistencia de turnos, lectura de agenda y lectura de recursos) que implementan los adaptadores de infraestructura y consumen los casos de uso, y que quedan congelados al fusionarse.

## Requirements

### Requirement: Puertos solo como interfaces del dominio
El dominio SHALL declarar los puertos `TurnoRepository`, `AgendaReader` y `RecursosReader` como interfaces de TypeScript sin implementación, sin dependencias de infraestructura, HTTP ni aplicación, y con operaciones asíncronas. Los tipos que exponen MUST ser tipos del dominio, nunca filas de la base ni tipos de un driver.

#### Scenario: Importaciones del dominio
- **WHEN** se ejecuta el lint sobre `src/domain/**`
- **THEN** ningún archivo de puertos importa `pg`, `fastify`, `src/infrastructure`, `src/interfaces` ni `src/application`

#### Scenario: Doble de prueba en memoria
- **WHEN** una prueba unitaria implementa los tres puertos con estructuras en memoria
- **THEN** compila en modo `strict` sin `any` ni `@ts-ignore`

### Requirement: Tenant implícito en los puertos
Las operaciones de los puertos MUST NOT recibir el identificador de clínica: el adaptador SHALL operar siempre dentro del contexto de tenant fijado por la capa de aplicación (`withTenant`), de modo que un recurso de otra clínica se comporte como inexistente.

#### Scenario: Recurso de otra clínica
- **WHEN** un caso de uso pide por id un turno que pertenece a otra clínica
- **THEN** `TurnoRepository` lo informa como inexistente (`null`), igual que un id que no existe

### Requirement: Contrato de TurnoRepository
`TurnoRepository` SHALL ofrecer: obtener un turno por id (o `null`), insertar un turno nuevo ya validado y devolverlo persistido, y actualizar un turno condicionado al estado que se leyó. Ante un solape detectado por la base, la inserción MUST fallar con `TURNO_SOLAPADO_PROFESIONAL` o `TURNO_SOLAPADO_SILLON`; si el estado cambió entre la lectura y la actualización, MUST fallar con `TURNO_MODIFICADO_CONCURRENTEMENTE` (tipo `conflicto`).

#### Scenario: Inserción que choca en la base
- **WHEN** dos inserciones concurrentes ocupan el mismo profesional en el mismo horario
- **THEN** una se persiste y la otra falla con `TURNO_SOLAPADO_PROFESIONAL`

#### Scenario: Actualización con estado desactualizado
- **WHEN** se actualiza un turno esperando `pendiente_confirmacion` pero en la base ya está `cancelado`
- **THEN** la actualización falla con `TURNO_MODIFICADO_CONCURRENTEMENTE` y no cambia nada

### Requirement: Contrato de AgendaReader
`AgendaReader` SHALL ofrecer, en tipos del dominio: las franjas de atención de un profesional, los feriados de la clínica en un rango de fechas locales, los bloqueos de un profesional que intersectan un intervalo, los turnos activos de un profesional cuyo rango de profesional intersecta un intervalo y los turnos activos de un conjunto de sillones cuyo rango de sillón intersecta un intervalo. MUST devolver solo turnos activos (RN-AG-09).

#### Scenario: Turno de otro profesional en el sillón
- **WHEN** se piden los turnos activos del sillón S en un intervalo y en S hay un turno de otro profesional cuyo buffer entra en el intervalo
- **THEN** ese turno se incluye

#### Scenario: Turnos cancelados
- **WHEN** se piden turnos activos de un profesional y existe uno `cancelado` en el intervalo
- **THEN** ese turno no se incluye

### Requirement: Contrato de RecursosReader
`RecursosReader` SHALL ofrecer, en tipos del dominio: un profesional por id, una prestación por id (con su duración en minutos), un sillón por id (con su buffer en minutos), los sillones activos de la clínica y la configuración de agenda de la clínica (zona horaria IANA y granularidad en minutos). Un recurso inexistente o de otra clínica MUST devolverse como `null`.

#### Scenario: Configuración por defecto
- **WHEN** una clínica no cambió su configuración
- **THEN** la configuración de agenda trae zona `America/Argentina/Buenos_Aires` y granularidad 15

### Requirement: Contratos congelados
Una vez fusionado este change, las firmas de los puertos y de los tipos de dominio que exponen MUST NOT cambiarse sin un PR del dueño del change y aviso a los consumidores (C-05, C-09, C-12, C-13 y siguientes). Agregar una operación opcional nueva SHALL considerarse también un cambio de contrato.

#### Scenario: Cambio de firma propuesto
- **WHEN** un change posterior necesita modificar `AgendaReader`
- **THEN** lo hace en un PR propio que avisa a los dueños de los adaptadores y casos de uso que lo consumen
