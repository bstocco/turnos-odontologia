# Spec Delta

## Purpose

Verifica automáticamente, para cada endpoint de la API y cada actor posible, que el acceso coincida con la matriz de permisos de `03_actores_y_roles.md §RBAC`, y que ningún endpoint nuevo quede sin decidir quién puede usarlo.

## ADDED Requirements

### Requirement: Matriz declarativa endpoint por actor
La matriz SHALL declarar, para cada operación (método y ruta) de la API, el resultado esperado para cada actor: anónimo, administrador, recepcionista, odontólogo, usuario de otra clínica y, donde aplique, la clave de servicio interna. Los valores esperados MUST provenir de `03 §RBAC`.

#### Scenario: Recepcionista en configuración de la clínica
- **WHEN** una recepcionista intenta modificar la configuración de la clínica
- **THEN** la matriz espera `403` y la prueba lo verifica contra la API real

#### Scenario: Administrador en usuarios
- **WHEN** un administrador lista los usuarios de su clínica
- **THEN** la matriz espera acceso permitido y la prueba lo verifica

### Requirement: Matriz completa respecto de las rutas registradas
La lista de operaciones SHALL obtenerse de las rutas registradas en la aplicación. Una operación registrada sin fila en la matriz, o una fila sin operación registrada, MUST hacer fallar la prueba.

#### Scenario: Endpoint nuevo sin fila
- **WHEN** un módulo agrega una ruta y la matriz no tiene su fila
- **THEN** la prueba falla nombrando el método y la ruta

#### Scenario: Fila obsoleta
- **WHEN** se elimina una ruta y su fila queda en la matriz
- **THEN** la prueba falla nombrando la fila sobrante

### Requirement: Resultados verificados por actor
Para cada celda la prueba SHALL verificar: rutas del personal sin token → `401`; rol sin permiso → `403` con el código de acceso prohibido; rol con permiso → una respuesta que no sea `401` ni `403`; rutas públicas → acceso sin sesión; ruta interna → `401` sin clave de servicio válida.

#### Scenario: Ruta del personal sin token
- **WHEN** un actor anónimo llama a cualquier ruta del personal
- **THEN** la respuesta es `401`

#### Scenario: Ruta pública con token
- **WHEN** un usuario autenticado llama a una ruta pública
- **THEN** la respuesta es la misma que sin token

### Requirement: Aislamiento por clínica en la matriz
Para cada operación con un identificador de recurso, la matriz SHALL verificar que un usuario de otra clínica con el rol más amplio reciba `404` y nunca `403`, para no revelar la existencia del recurso.

#### Scenario: Administrador de otra clínica
- **WHEN** el administrador de la clínica B pide por id un paciente de la clínica A
- **THEN** la respuesta es `404`

### Requirement: Alcance propio del odontólogo
Donde `03 §RBAC` limita al odontólogo a lo propio, la matriz SHALL registrar la celda como permitida con alcance y la prueba MUST verificar que el resultado excluya lo ajeno.

#### Scenario: Pacientes del odontólogo
- **WHEN** un odontólogo consulta un paciente que no tiene turnos con él
- **THEN** no obtiene sus datos

### Requirement: Diferencias con la matriz documentadas
Toda celda en la que el comportamiento implementado difiera de `03 §RBAC` SHALL quedar marcada en la matriz con su motivo y el change responsable, y MUST NOT silenciarse cambiando el valor esperado sin esa marca.

#### Scenario: Defecto conocido
- **WHEN** una celda difiere de lo esperado por un defecto ya reportado
- **THEN** la matriz la marca con el defecto y el resumen de la prueba lo informa

### Requirement: Matriz completa al cierre (Fase 2)
Antes de archivar el change, la matriz SHALL incluir los endpoints de turnos, agenda, bloqueos, enlace de WhatsApp, reserva pública con token, exportación, auditoría y ausentismo.

#### Scenario: Endpoints de turnos fusionados
- **WHEN** C-12 agrega sus rutas a `main`
- **THEN** la matriz tiene una fila por cada una antes de archivar el change
