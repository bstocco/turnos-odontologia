# Spec Delta

## Purpose

Define cómo se aplican las migraciones SQL del proyecto de forma ordenada, trazable e inmutable, para que tres personas trabajando en ramas separadas obtengan siempre el mismo esquema.

## ADDED Requirements

### Requirement: Nombres y orden de las migraciones
Cada migración SHALL ser un archivo `migrations/C{NN}_{seq}_{nombre}.sql`, donde `NN` es el número del change y `seq` el orden dentro del change. Se SHALL aplicar en orden ascendente por `NN` y luego por `seq`.

#### Scenario: Orden entre changes
- **WHEN** existen `C03_001_base.sql` y `C05_001_recursos.sql`
- **THEN** se aplica primero `C03_001_base.sql`

#### Scenario: Nombre fuera del patrón
- **WHEN** hay un archivo en `migrations/` que no cumple el patrón
- **THEN** el runner falla con un error que nombra el archivo y no aplica ninguna migración

#### Scenario: Secuencia repetida
- **WHEN** dos archivos comparten `NN` y `seq`
- **THEN** el runner falla y no aplica ninguna migración

### Requirement: Registro de migraciones aplicadas
El runner SHALL registrar en una tabla de control el nombre, la huella del contenido y el instante de cada migración aplicada, y SHALL aplicar solo las pendientes.

#### Scenario: Segunda ejecución
- **WHEN** se ejecuta el runner dos veces seguidas sin migraciones nuevas
- **THEN** la segunda ejecución no aplica nada y termina con éxito

#### Scenario: Migración nueva
- **WHEN** se agrega una migración con un orden posterior a las ya aplicadas
- **THEN** el runner aplica solo esa migración

### Requirement: Inmutabilidad de lo ya aplicado
El runner MUST NOT continuar si el contenido de una migración ya aplicada difiere de su huella registrada.

#### Scenario: Migración editada
- **WHEN** se modifica el contenido de una migración que ya figura como aplicada
- **THEN** el runner falla con un error que nombra el archivo y no aplica migraciones posteriores

### Requirement: Atomicidad por migración
Cada migración SHALL ejecutarse en una transacción. Si falla, se SHALL revertir completa, el runner SHALL detenerse indicando el archivo y las migraciones anteriores SHALL permanecer aplicadas.

#### Scenario: Sentencia inválida a mitad de archivo
- **WHEN** una migración contiene una sentencia inválida después de crear una tabla
- **THEN** la tabla no queda creada y la migración no figura en la tabla de control

### Requirement: Ejecución única y con rol propio
El runner SHALL impedir que dos instancias apliquen migraciones al mismo tiempo y SHALL usar la conexión del rol de migraciones, nunca la del rol de la aplicación.

#### Scenario: Dos ejecuciones simultáneas
- **WHEN** dos procesos inician el runner a la vez contra la misma base
- **THEN** solo uno aplica migraciones y el otro espera o termina sin aplicar nada duplicado

#### Scenario: Conexión de migraciones ausente
- **WHEN** no está configurada la conexión del rol de migraciones
- **THEN** el runner falla al iniciar y no usa la conexión de la aplicación como sustituto
