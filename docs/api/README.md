# API de turnos odontológicos: contrato y ejemplos

Esta carpeta reúne el contrato OpenAPI de la API, su registro de cambios y ejemplos de uso. El
contrato **no se escribe a mano**: se genera a partir de las rutas y los esquemas de la aplicación
real y una prueba lo mantiene al día.

| Archivo | Qué es |
|---|---|
| `openapi.json` | Contrato OpenAPI 3 normalizado (claves ordenadas, determinista). |
| `CHANGELOG.md` | Registro de cambios del contrato; manda la versión de `info.version`. |
| `excepciones-de-respuesta.json` | Operaciones sin esquema de respuesta exitosa, con motivo y change responsable. Solo puede achicarse. |
| `ejemplos/*.http` | Ejemplos de uso, uno por operación (formato REST Client / HTTP Client de JetBrains). |

## Regenerar el contrato

Cuando cambia una ruta o un esquema, la prueba de contrato falla nombrando las operaciones
afectadas. Con la base de pruebas levantada:

```bash
ACTUALIZAR_CONTRATO=1 npm run test:e2e -- contrato
```

Revisá el diff de `openapi.json` y agregá la entrada correspondiente en `CHANGELOG.md`.

## Declarar un cambio rompiente

Son rompientes: quitar una operación, un código de respuesta o una propiedad de la respuesta;
volver obligatorio un campo de entrada o agregar uno obligatorio; cambiar un tipo; achicar un
enumerado. La verificación compara contra el contrato de `main` (`origin/main`, o la referencia de
`CONTRATO_BASE_REF`) y exige:

1. subir el número **mayor** de la versión en `CHANGELOG.md` (por ejemplo `## [2.0.0] - AAAA-MM-DD`);
2. que esa entrada contenga la marca `**Rompiente**`.

Un cambio aditivo (operación nueva, propiedad opcional nueva) no exige nada. En CI, si no se puede
leer el contrato de `main`, la verificación falla; en local se omite con un aviso. Si hace falta,
traé la base con `git fetch origin main`.

## Correr las pruebas e2e

Las pruebas de extremo a extremo, la matriz de permisos y el contrato comparten un único comando,
igual en local y en CI. Necesitan la base de pruebas (`TEST_DATABASE_URL` y
`TEST_DATABASE_MIGRATION_URL`, ver el README del repositorio):

```bash
npm run test:e2e
```

Usan solo datos sintéticos y secretos descartables generados en cada ejecución. En `npm test`
corren después de las pruebas de integración, nunca en paralelo.

### Flujos cubiertos (`test/e2e/flujos`)

| Archivo | Flujo de `07_flujos_principales.md` |
|---|---|
| `01-autenticacion`, `00-puesta-en-marcha` | 1 y puesta en marcha |
| `02-agendar-desde-recepcion` | 2 (turnos, solapes, horario, feriado, bloqueo) |
| `03-reserva-publica` | 3, solo la consulta pública (el resto depende de C-15) |
| `05-reprogramacion`, `06-bloqueo-de-franja`, `09-ausentismo` | 5, 6 y 9 |
| `07-recordatorio-por-email` | 7 (reloj y proveedor de email simulados) |
| `08-whatsapp-manual` | 8: brecha, la ruta no existe todavía |
| `10-exportacion` | 10 |

Los escenarios que hoy no se cumplen por defectos de otros changes se escriben con el comportamiento
esperado y se marcan `it.fails` con el defecto y el change responsable en el nombre: el día que se
corrija, la prueba avisa y hay que quitar la marca. Nunca se cambia lo esperado para que pase.

## Usar los ejemplos

Los archivos de `ejemplos/` usan variables, nunca credenciales:

| Variable | Valor |
|---|---|
| `{{baseUrl}}` | URL de la API (por defecto `http://localhost:3000`). |
| `{{slug}}` | `slug` de la clínica. |
| `{{token}}` | Token de acceso obtenido con `POST /api/v1/auth/login`. |
| `{{refreshToken}}`, `{{password}}`, `{{claveInterna}}` | Secretos: definilos en tu entorno, no en el archivo. |
| `{{profesionalId}}`, `{{sillonId}}`, `{{prestacionId}}`, `{{pacienteId}}`, `{{feriadoId}}`, `{{usuarioId}}`, `{{turnoId}}`, `{{bloqueoId}}`, `{{exportacionId}}` | Ids devueltos por las altas. |

En VS Code (extensión REST Client) definilas en `rest-client.environmentVariables`; en JetBrains,
en `http-client.private.env.json` (ignorado por git). Una prueba verifica que cada ejemplo
corresponda a una operación del contrato y que no haya tokens, claves ni contraseñas literales.

### Equivalentes con curl

Reemplazá las variables de shell por tus valores; no los escribas en el historial compartido.

```bash
# Inicio de sesión (devuelve { "token": "..." })
curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"slug\":\"$SLUG\",\"email\":\"recepcion@ejemplo.invalid\",\"password\":\"$PASSWORD\"}"

# Alta de un paciente sintético
curl -s -X POST "$BASE_URL/api/v1/pacientes" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"nombre":"Paciente","apellido":"Sintético","dni":"99000001","telefono":"+54 9 11 5555 1001"}'

# Disponibilidad pública (sin sesión)
curl -s "$BASE_URL/api/v1/publico/$SLUG/disponibilidad?profesionalId=$PROFESIONAL_ID&prestacionId=$PRESTACION_ID&desde=2026-12-14&hasta=2026-12-18"
```
