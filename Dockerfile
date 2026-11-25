# Imagen única de Turnos Odontología (C-20, D3).
# Tres modos de arranque sobre la misma imagen; el comando se elige al ejecutar:
#   API:         node dist/main.js                                  (CMD por defecto)
#   Worker:      node dist/infrastructure/queue/worker-cli.js
#   Migraciones: node dist/infrastructure/db/migrate-cli.js
# No se define ninguna variable de entorno de producción ni secreto en la imagen.

# ---- Etapa de compilación ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- Etapa final ----
FROM node:22-bookworm-slim AS final
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# migrate-cli resuelve ../../../migrations desde dist/, o sea /app/migrations.
COPY migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
