# runtime-configuration Specification

## Purpose

Define cómo el sistema lee, valida y documenta su configuración de entorno, de modo que un valor faltante o inválido se detecte al arrancar y ningún secreto tenga valores por defecto ni se filtre.

## Requirements

### Requirement: Validación de la configuración al arrancar
El proceso SHALL validar toda su configuración al iniciar. Si falta una variable obligatoria o un valor es inválido, SHALL terminar con código distinto de cero y un mensaje que liste los nombres de las variables afectadas, sin mostrar sus valores.

#### Scenario: Variable obligatoria ausente
- **WHEN** se inicia el servicio sin la conexión de base de datos
- **THEN** el proceso termina con código distinto de cero
- **AND** el mensaje nombra la variable faltante sin imprimir ningún valor

#### Scenario: Valor inválido
- **WHEN** el puerto configurado no es un número entero válido
- **THEN** el proceso termina con un error que nombra la variable

#### Scenario: Zona horaria inválida
- **WHEN** la zona horaria por defecto no es un identificador IANA válido
- **THEN** el proceso termina con un error que nombra la variable

### Requirement: Sin valores por defecto para datos sensibles
Las conexiones a base de datos, los secretos de firma y las claves de proveedores SHALL NOT tener valor por defecto. Las variables no sensibles MAY tener un valor por defecto documentado.

#### Scenario: Secreto no configurado
- **WHEN** una variable sensible no está definida
- **THEN** el sistema no inventa un valor y trata la variable como ausente

#### Scenario: Variable no sensible con valor por defecto
- **WHEN** no se define el puerto
- **THEN** el servicio usa el valor por defecto documentado

### Requirement: Secretos fuera de registros y volcados
Los valores de variables sensibles MUST NOT aparecer en logs, mensajes de error ni en ningún volcado de la configuración.

#### Scenario: Configuración registrada al arrancar
- **WHEN** el servicio registra un resumen de su configuración
- **THEN** las variables sensibles se muestran como `[REDACTADO]` o se omiten

### Requirement: Variables documentadas y archivo local fuera del repositorio
El repositorio SHALL incluir un `.env.example` que liste cada variable que la aplicación lee, con su descripción y si es sensible, sin valores reales. El archivo `.env` SHALL estar ignorado por el control de versiones.

#### Scenario: Variable nueva sin documentar
- **WHEN** el código lee una variable que no figura en `.env.example`
- **THEN** una verificación automática falla e indica la variable

#### Scenario: Archivo local de entorno
- **WHEN** una persona crea un `.env` con valores reales
- **THEN** el control de versiones lo ignora
