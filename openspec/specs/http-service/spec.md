# http-service Specification

## Purpose

Define el comportamiento observable del servicio HTTP base: chequeo de salud, incorporación de módulos de rutas sin editar archivos compartidos y un contrato de errores uniforme con códigos de dominio estables.

## Requirements

### Requirement: Chequeo de salud público
El servicio SHALL exponer `GET /salud`, sin autenticación, que responda `200` con un cuerpo JSON `{"estado":"ok"}` mientras el proceso pueda atender pedidos. La respuesta MUST NOT incluir versiones, variables de entorno ni datos de la base.

#### Scenario: Servicio en marcha
- **WHEN** un cliente sin credenciales pide `GET /salud`
- **THEN** recibe `200` con `{"estado":"ok"}`

#### Scenario: Sin filtración de detalles internos
- **WHEN** un cliente pide `GET /salud`
- **THEN** el cuerpo y las cabeceras no contienen versiones de dependencias, rutas del servidor ni valores de configuración

### Requirement: Carga automática de módulos de rutas
El servicio SHALL cargar al arrancar cada módulo ubicado en `src/interfaces/http/modules/<nombre>/`, en orden alfabético, sin que agregar un módulo exija editar un archivo compartido.

#### Scenario: Módulo nuevo
- **WHEN** se agrega una carpeta de módulo válida y se arranca el servicio
- **THEN** las rutas de ese módulo quedan disponibles sin otros cambios

#### Scenario: Módulo inválido
- **WHEN** una carpeta de módulo no expone el punto de entrada esperado
- **THEN** el arranque falla con un error que nombra el módulo y el servicio no empieza a escuchar

### Requirement: Contrato de errores uniforme
Toda respuesta de error SHALL ser JSON con `codigo` (estable, en mayúsculas con guiones bajos) y `mensaje` legible. Un error de dominio SHALL responder con el estado HTTP y el código con que fue declarado.

#### Scenario: Error de dominio
- **WHEN** un caso de uso lanza un error de dominio con código `TURNO_SOLAPADO_SILLON` y estado `409`
- **THEN** la respuesta es `409` con `{"codigo":"TURNO_SOLAPADO_SILLON","mensaje":"..."}`

#### Scenario: Ruta inexistente
- **WHEN** un cliente pide una ruta que no existe
- **THEN** recibe `404` con `codigo` `RUTA_NO_ENCONTRADA`

#### Scenario: Solicitud con forma inválida
- **WHEN** un cliente envía un cuerpo o parámetros que no cumplen el esquema de la ruta
- **THEN** recibe `400` con `codigo` `SOLICITUD_INVALIDA` y la lista de campos inválidos, sin eco de los valores recibidos

### Requirement: Errores inesperados sin detalles internos
Ante un error no previsto el servicio SHALL responder `500` con `codigo` `ERROR_INTERNO` y un mensaje genérico. La respuesta MUST NOT incluir trazas, sentencias SQL ni datos del entorno, y el detalle SHALL quedar solo en el log.

#### Scenario: Fallo no controlado
- **WHEN** un manejador lanza un error que no es de dominio
- **THEN** la respuesta es `500` con `ERROR_INTERNO` y sin traza ni mensaje original
- **AND** el detalle del error queda registrado en el log con el identificador del pedido
