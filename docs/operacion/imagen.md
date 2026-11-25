# Imagen de contenedor: construcción y modos de arranque

> Change `c-20-despliegue-paas-y-operacion`, tarea 2.3. El procedimiento coincide con lo que ejecuta el job `verificar-imagen` de `.github/workflows/deploy.yml`, que es la verificación automática de este documento (no hace falta Docker local para verificar la imagen: se verifica en GitHub Actions).

Una sola imagen (`Dockerfile`, Node 22, usuario `node`, `NODE_ENV=production`) con tres modos de arranque; el modo se elige con el comando, sin recompilar. La imagen no contiene secretos, `.env` ni dependencias de desarrollo.

## Construcción

```powershell
docker build --tag turnos:local .
```

No hace falta ninguna variable de entorno. `.dockerignore` deja afuera `.env*`, `node_modules`, `.git`, `openspec/`, `docs/`, `test/` y otros archivos que no van en runtime.

## Modos de arranque

| Modo | Comando | Variables obligatorias |
|---|---|---|
| API (por defecto) | `node dist/main.js` | `DATABASE_URL` (rol `app`) |
| Worker | `node dist/infrastructure/queue/worker-cli.js` | `DATABASE_URL`, `EMAIL_API_KEY`, `EMAIL_FROM` válido; `PUBLIC_BASE_URL` recomendada |
| Migraciones | `node dist/infrastructure/db/migrate-cli.js` | `DATABASE_MIGRATION_URL` (rol `migra`) |

Si falta una variable obligatoria, el proceso termina con un error que nombra la variable y nunca imprime valores.

## Prueba local contra el PostgreSQL de `docker-compose.yml`

Con la base levantada (`docker compose up -d --wait`) y las URLs de tu `.env` local (no las pegues en chats ni tickets):

```powershell
# Migraciones
docker run --rm --env DATABASE_MIGRATION_URL="<url del rol migra>" turnos:local node dist/infrastructure/db/migrate-cli.js

# API en el puerto 3100
docker run --detach --name api --publish 3100:3100 --env PORT=3100 --env DATABASE_URL="<url del rol app>" turnos:local
curl http://127.0.0.1:3100/salud          # {"estado":"ok"}
docker stop api                           # SIGTERM: cierre ordenado, código de salida 0

# Worker (valores falsos de email: la base local no tiene turnos, no se envía nada)
docker run --detach --name worker --env DATABASE_URL="<url del rol app>" `
  --env EMAIL_API_KEY=valor-descartable --env EMAIL_FROM="Turnos <no-responder@example.test>" `
  turnos:local node dist/infrastructure/queue/worker-cli.js
docker logs worker                        # "Worker de notificaciones iniciado"
docker stop worker
```

Desde un contenedor, `localhost` es el propio contenedor: usá `host.docker.internal` (Docker Desktop en Windows) como host de la base, o `--network host` en Linux.

## Qué verifica el CI

El job `verificar-imagen` construye la imagen sin variables de producción y comprueba: ausencia de archivos `.env`, usuario distinto de `root` y ausencia de dependencias de desarrollo; migraciones sobre un PostgreSQL efímero; API con `GET /salud` y cierre con `SIGTERM`; worker con arranque y cierre con `SIGTERM`; y los errores de configuración (nombre de la variable sin mostrar su valor). Todas las credenciales del job son falsas y descartables.
