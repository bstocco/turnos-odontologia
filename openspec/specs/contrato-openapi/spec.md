# contrato-openapi Specification

## Purpose
Mantiene un contrato OpenAPI de la API derivado de la aplicación real, versionado en el repositorio y verificado en CI, para que ningún cambio rompiente llegue a los clientes sin declararse, junto con ejemplos de uso que no queden desactualizados.

## Requirements

### Requirement: Contrato derivado de la aplicación
El contrato SHALL ser un documento OpenAPI 3 generado a partir de las rutas y esquemas efectivamente registrados en la aplicación, y MUST NOT escribirse a mano.

#### Scenario: Endpoint nuevo
- **WHEN** un módulo registra una ruta nueva con sus esquemas
- **THEN** el contrato generado incluye la operación con sus parámetros, cuerpo y respuestas declaradas

### Requirement: Contrato versionado y determinista
El contrato SHALL versionarse en `docs/api/openapi.json` en forma normalizada (claves ordenadas, sin datos variables), de modo que dos generaciones sobre el mismo código produzcan el mismo archivo.

#### Scenario: Generación repetida
- **WHEN** se genera el contrato dos veces sin cambios de código
- **THEN** ambos resultados son idénticos byte a byte

### Requirement: Contrato al día en CI
La verificación SHALL fallar si el contrato generado difiere del versionado, indicando qué operaciones cambiaron y cómo regenerarlo.

#### Scenario: Ruta cambiada sin regenerar
- **WHEN** se modifica el esquema de una ruta y no se actualiza `docs/api/openapi.json`
- **THEN** la verificación falla y nombra la operación afectada

### Requirement: Cambios rompientes declarados
Ante un cambio rompiente respecto del contrato de `main`, la verificación SHALL exigir que la versión del contrato suba su número mayor y que `docs/api/CHANGELOG.md` tenga una entrada de esa versión marcada como rompiente. Son rompientes: quitar una operación, un código de respuesta o una propiedad de respuesta; volver obligatorio un campo de entrada; agregar un campo de entrada obligatorio; cambiar un tipo o achicar un enumerado.

#### Scenario: Rompiente sin declarar
- **WHEN** se quita una propiedad de una respuesta y no se declara en el registro de cambios
- **THEN** la verificación falla y lista el cambio rompiente

#### Scenario: Rompiente declarado
- **WHEN** el mismo cambio viene con subida de versión mayor y entrada rompiente en el registro
- **THEN** la verificación pasa

#### Scenario: Cambio aditivo
- **WHEN** se agrega una operación nueva o una propiedad opcional
- **THEN** la verificación pasa sin exigir subida de versión mayor

### Requirement: Base de comparación disponible en CI
En CI, la verificación de cambios rompientes MUST fallar si no puede leer el contrato de `main`, salvo que `main` todavía no tenga contrato. Fuera de CI, sin acceso a `main`, SHALL omitirse con un aviso.

#### Scenario: Primer contrato
- **WHEN** `main` aún no contiene `docs/api/openapi.json`
- **THEN** la verificación de cambios rompientes pasa y solo se exige el contrato al día

### Requirement: Operaciones sin esquema de respuesta acotadas
Toda operación SHALL declarar el esquema de su respuesta exitosa, salvo las listadas como excepción en `docs/api/`; una operación nueva sin esquema de respuesta que no esté en esa lista MUST hacer fallar la verificación.

#### Scenario: Endpoint nuevo sin respuesta declarada
- **WHEN** se agrega una ruta sin esquema de respuesta exitosa y sin excepción registrada
- **THEN** la verificación falla y nombra la operación

### Requirement: Colección de ejemplos validada
El repositorio SHALL incluir una colección de ejemplos de uso de la API en `docs/api/` en un formato de texto que no requiera dependencias nuevas, con datos sintéticos y variables en lugar de credenciales; cada ejemplo MUST corresponder a una operación existente del contrato.

#### Scenario: Ejemplo de una ruta eliminada
- **WHEN** un ejemplo apunta a un método y ruta que el contrato ya no tiene
- **THEN** la verificación falla y nombra el ejemplo

#### Scenario: Ejemplo con credenciales
- **WHEN** un ejemplo contiene un token, una clave o una contraseña literal en lugar de una variable
- **THEN** la verificación falla

### Requirement: Contrato y ejemplos completos al cierre (Fase 2)
Antes de archivar el change, el contrato y la colección de ejemplos SHALL cubrir los endpoints de turnos y agenda, notificaciones, reserva pública y exportación, auditoría y ausentismo.

#### Scenario: Cierre del change
- **WHEN** se archiva el change
- **THEN** cada operación del contrato tiene al menos un ejemplo en la colección
