# seed-clinica-demo Specification

## Purpose

Carga una clínica de demostración con recursos, horarios, feriados, bloqueos y pacientes sintéticos para desarrollo y demos, de forma reproducible y sin posibilidad de ejecutarse contra producción ni de usar datos reales.

## Requirements

### Requirement: Guardas antes de tocar la base
El seed de la clínica de demostración SHALL ejecutar `assertNoProduction()` antes de abrir cualquier conexión, y MUST NOT ejecutarse si las guardas lo rechazan (RN-DA-02).

#### Scenario: Seeds deshabilitados
- **WHEN** se ejecuta el seed sin `ALLOW_SEED=true`
- **THEN** termina con error, sin abrir conexión ni escribir datos

#### Scenario: Host no permitido
- **WHEN** se ejecuta el seed con la base en un host fuera de `SEED_ALLOWED_HOSTS`
- **THEN** termina con error, sin abrir conexión ni escribir datos

### Requirement: Datos exclusivamente sintéticos
El seed SHALL generar solo datos inventados (RN-DA-01): nombres generados, emails en el dominio reservado `example.com`, teléfonos con formato internacional argentino y DNI generados, sin leer ninguna fuente externa de personas.

#### Scenario: Emails de los pacientes
- **WHEN** se ejecuta el seed
- **THEN** todos los emails de pacientes terminan en `@example.com`

### Requirement: Contenido de la clínica de demostración
El seed SHALL crear una clínica con `slug` fijo de demostración, su `clinica_config` por defecto, profesionales con franjas de lunes a viernes, sillones con y sin buffer, las prestaciones de ejemplo del Discovery (consulta 30 min, limpieza 45 min, conducto 60 min), feriados nacionales del año, al menos un bloqueo y pacientes, respetando todos los constraints del esquema.

#### Scenario: Recursos cargados
- **WHEN** se ejecuta el seed sobre una base vacía con las migraciones aplicadas
- **THEN** la clínica de demostración tiene al menos dos profesionales con franjas, dos sillones (uno con buffer mayor que 0), las tres prestaciones de ejemplo, feriados, un bloqueo y pacientes

### Requirement: Determinismo e idempotencia
Dos ejecuciones del seed con la misma configuración SHALL producir los mismos datos (mismos identificadores y valores). Si la clínica de demostración ya existe, el seed MUST NOT duplicarla ni modificar otras clínicas.

#### Scenario: Ejecución repetida
- **WHEN** se ejecuta el seed dos veces seguidas
- **THEN** la segunda ejecución termina sin error, informa que la clínica ya existe y la cantidad de filas no cambia

#### Scenario: Reproducibilidad
- **WHEN** se ejecuta el seed en dos bases vacías distintas
- **THEN** los identificadores y datos de la clínica de demostración son idénticos

### Requirement: Salida del seed sin datos personales
El seed SHALL informar solo cantidades e identificadores de lo creado y MUST NOT imprimir nombres, DNI, teléfonos ni emails de pacientes.

#### Scenario: Resumen al terminar
- **WHEN** el seed termina con éxito
- **THEN** la salida muestra el `id` y el `slug` de la clínica y la cantidad de filas por tabla, sin datos de pacientes
