# repositorio-pacientes Specification

## Purpose

Persiste la ficha básica del paciente de cada clínica (nombre, apellido, DNI, teléfono, email y obra social) con DNI único por clínica, tratándola como dato de salud bajo la Ley 25.326: aislada por clínica y sin filtrar datos personales en errores ni registros.

## Requirements

### Requirement: Ficha básica del paciente
El sistema SHALL persistir por clínica la ficha básica del paciente: nombre, apellido, DNI, teléfono, email, obra social o prepaga (opcional) y fecha de alta en UTC (RN-PA-01). No SHALL persistir historia clínica ni odontograma.

#### Scenario: Alta de un paciente
- **WHEN** se crea un paciente con nombre, apellido, DNI, teléfono y email dentro del contexto de la clínica A
- **THEN** se devuelve con un `id` nuevo, el `clinica_id` de la clínica A y su fecha de alta

#### Scenario: Obra social opcional
- **WHEN** se crea un paciente sin obra social
- **THEN** se persiste con la obra social vacía (`null`)

### Requirement: DNI único por clínica
El alta o la actualización de un paciente con un DNI que ya existe en la misma clínica SHALL fallar con `PACIENTE_DNI_DUPLICADO` de tipo `conflicto` (RN-PA-02). El error MUST NOT contener el DNI ni otros datos del paciente.

#### Scenario: Alta con DNI repetido
- **WHEN** se crea un paciente con un DNI ya registrado en la clínica
- **THEN** falla con `PACIENTE_DNI_DUPLICADO` y ni el mensaje ni las propiedades del error contienen el DNI

#### Scenario: Mismo DNI en otra clínica
- **WHEN** la clínica B crea un paciente con un DNI que existe en la clínica A
- **THEN** el alta se acepta

### Requirement: Teléfono ya normalizado
El repositorio SHALL guardar el teléfono tal como lo recibe, ya normalizado a formato internacional por la capa de aplicación (RN-PA-03, C-04), y MUST rechazar con `DATOS_INVALIDOS` un teléfono que no tenga formato internacional (`+` seguido de 8 a 15 dígitos).

#### Scenario: Teléfono internacional
- **WHEN** se crea un paciente con teléfono `+5491123456789`
- **THEN** se persiste sin cambios

#### Scenario: Teléfono sin normalizar
- **WHEN** se crea un paciente con teléfono `011 15-2345-6789`
- **THEN** falla con `DATOS_INVALIDOS` sin incluir el teléfono en el error

### Requirement: Búsqueda de pacientes de la clínica
El sistema SHALL permitir obtener un paciente por id, buscarlo por DNI exacto (para reutilizar el registro, RN-RE-04) y listar pacientes por prefijo de apellido sin distinguir mayúsculas, con un límite de resultados. Toda búsqueda MUST limitarse a la clínica del contexto.

#### Scenario: Paciente por DNI
- **WHEN** se busca por un DNI registrado en la clínica del contexto
- **THEN** se devuelve ese paciente

#### Scenario: DNI de otra clínica
- **WHEN** se busca en la clínica A un DNI registrado solo en la clínica B
- **THEN** se devuelve `null`

#### Scenario: Búsqueda por apellido
- **WHEN** la clínica tiene pacientes de apellido "Gómez" y "Godoy" y se busca el prefijo "go" con límite 10
- **THEN** se devuelven ambos, ordenados por apellido y nombre

### Requirement: Datos personales fuera de errores y registros
Los repositorios de pacientes MUST NOT registrar en logs ni incluir en mensajes, propiedades o causas de error el nombre, apellido, DNI, teléfono, email ni obra social; solo identificadores y códigos de error (Ley 25.326, regla dura 1).

#### Scenario: Error inesperado del motor
- **WHEN** una operación sobre pacientes falla con un error de base no previsto
- **THEN** el error que se propaga contiene solo el código SQLSTATE y el nombre del constraint, si lo hay, sin el detalle del motor ni valores de la fila
