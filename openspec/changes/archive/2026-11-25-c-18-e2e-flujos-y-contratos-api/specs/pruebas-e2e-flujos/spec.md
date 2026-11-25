# Spec Delta

## Purpose

Verifica de extremo a extremo los flujos principales de `07_flujos_principales.md` sobre la API real y una base PostgreSQL de pruebas, con datos sintéticos, para detectar fallas que las pruebas por módulo no ven.

## ADDED Requirements

### Requirement: Entorno e2e aislado sobre PostgreSQL real
Las pruebas e2e SHALL ejecutarse contra la aplicación completa con todos sus módulos reales y una base PostgreSQL de pruebas con las migraciones reales aplicadas por el rol de migraciones, accediendo como el rol de la aplicación sin `BYPASSRLS`. MUST NOT sustituir PostgreSQL por simulaciones; solo el email y el reloj pueden simularse.

#### Scenario: Preparación del entorno
- **WHEN** arranca la ejecución de las pruebas e2e
- **THEN** el esquema de la base de pruebas queda reiniciado, con todas las migraciones aplicadas, antes del primer flujo

#### Scenario: Base fuera de lo permitido
- **WHEN** la base configurada para las pruebas e2e está en un host no permitido o su nombre no termina en `_test`
- **THEN** la ejecución se detiene antes de borrar o escribir nada

### Requirement: Solo datos sintéticos
Los flujos e2e SHALL usar únicamente datos sintéticos generados para la prueba (emails en dominios reservados, documentos y teléfonos ficticios) y credenciales descartables, y MUST NOT leer ni copiar datos de bases reales.

#### Scenario: Datos de un paciente en un flujo
- **WHEN** un flujo da de alta un paciente
- **THEN** sus datos son sintéticos y su email pertenece a un dominio reservado para pruebas

### Requirement: Sin datos personales en las salidas
Durante los flujos e2e, los logs de la aplicación MUST NOT contener DNI, teléfono, email ni obra social de los pacientes usados, y los mensajes de las pruebas MUST NOT volcar esos datos.

#### Scenario: Logs de un flujo con pacientes
- **WHEN** termina un flujo que creó, buscó y modificó pacientes
- **THEN** ninguno de los datos personales sintéticos usados aparece en los logs capturados

### Requirement: Aislamiento entre flujos
Cada flujo e2e SHALL crear su propia clínica sintética con un `slug` único, de modo que los flujos no dependan del orden ni de datos dejados por otros.

#### Scenario: Dos flujos en la misma ejecución
- **WHEN** dos flujos crean recursos en la misma ejecución
- **THEN** ninguno ve los recursos del otro y ambos pasan en cualquier orden

### Requirement: Flujo de autenticación del personal
La prueba del Flujo 1 SHALL verificar, con pedidos reales, el inicio de sesión con email, contraseña y `slug`, el uso del token de acceso en un pedido posterior limitado a la clínica, la rotación del token de refresco y el cierre de sesión, y sus casos de error.

#### Scenario: Sesión completa
- **WHEN** un usuario activo inicia sesión, consulta un recurso de su clínica, refresca y cierra sesión
- **THEN** cada paso responde con éxito, el recurso consultado es de su clínica y el token de refresco usado deja de servir

#### Scenario: Credenciales inválidas
- **WHEN** se intenta iniciar sesión con una contraseña incorrecta o un email inexistente
- **THEN** la respuesta es `401` con el mismo mensaje genérico en ambos casos

#### Scenario: Usuario desactivado
- **WHEN** inicia sesión un usuario desactivado
- **THEN** la respuesta es `401`

#### Scenario: Exceso de intentos
- **WHEN** se superan los intentos de inicio de sesión permitidos
- **THEN** la respuesta es `429`

### Requirement: Flujo de puesta en marcha de una clínica
La prueba de puesta en marcha SHALL encadenar el alta interna de la clínica, la configuración (clínica, profesionales, horarios, sillones, prestaciones y feriados) y el alta y búsqueda de pacientes, dejando una clínica lista para agendar. Es la precondición de los Flujos 2 a 10.

#### Scenario: Clínica lista para agendar
- **WHEN** se ejecuta la puesta en marcha completa por la API
- **THEN** la clínica tiene al menos un profesional con horario, un sillón, una prestación y un paciente, todos consultables por la API

#### Scenario: Recursos de otra clínica
- **WHEN** un usuario de una clínica pide por id un recurso creado en otra
- **THEN** la respuesta es `404`

### Requirement: Flujo de reserva pública — consulta
La prueba del Flujo 3 SHALL verificar, sin sesión, la consulta de prestaciones, profesionales y disponibilidad de una clínica por su `slug`, y que la disponibilidad refleje la configuración hecha por la API del personal.

#### Scenario: Disponibilidad tras configurar la clínica
- **WHEN** la clínica configurada en la puesta en marcha se consulta por la API pública
- **THEN** se ofrecen huecos dentro del horario del profesional y ninguno en un feriado cargado

#### Scenario: Slug inexistente
- **WHEN** se consulta la API pública con un `slug` que no existe
- **THEN** la respuesta es `404` sin revelar información de otras clínicas

### Requirement: Flujos de turnos, notificaciones, reserva y exportación (Fase 2)
Cuando estén en `main` los endpoints de C-12, C-14, C-15 y C-16, las pruebas e2e SHALL cubrir los Flujos 2, 4, 5, 6, 7, 8, 9 y 10 y el resto del Flujo 3 (código por email, reserva y enlaces), con sus casos de error de `07_flujos_principales.md`.

#### Scenario: Agendar desde la recepción con solape
- **WHEN** la recepción agenda un turno y luego otro que se solapa en el mismo profesional
- **THEN** el primero responde `201` y el segundo `409` con `TURNO_SOLAPADO_PROFESIONAL`

#### Scenario: Reprogramación fallida
- **WHEN** una reprogramación choca con otro turno
- **THEN** la respuesta es `409` y el turno original queda intacto

#### Scenario: Exportación sin rol de administrador
- **WHEN** una recepcionista pide una exportación
- **THEN** la respuesta es `403`

### Requirement: Concurrencia entre reserva del personal y reserva pública (Fase 2)
Cuando existan ambos caminos de reserva, una prueba e2e SHALL lanzar en simultáneo una reserva del personal y una reserva pública sobre el mismo hueco y verificar que exactamente una tenga éxito.

#### Scenario: Mismo hueco en simultáneo
- **WHEN** la recepción y un paciente reservan a la vez el mismo profesional y horario
- **THEN** exactamente una reserva responde con éxito, la otra responde `409` y la base contiene un único turno activo en ese hueco
