# syntax=docker/dockerfile:1.7
# Imagen del worker. Construir desde la raíz del monorepo:
#   docker build -f apps/worker/Dockerfile -t asesor-worker .
# Las variables de entorno se pasan en runtime (docker run --env-file ...): no hay secretos en la imagen.

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# --- Build: instala solo el worker y sus paquetes internos, y genera un bundle autocontenido.
FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@asesor/worker..."
RUN pnpm --filter @asesor/worker build

# --- Runtime: solo Node y el bundle. Sin node_modules, sin código fuente, sin .env.
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/worker/dist ./dist
USER node
# El worker atiende SIGTERM/SIGINT: deja de tomar jobs y espera los que están en curso.
STOPSIGNAL SIGTERM
CMD ["node", "--enable-source-maps", "dist/index.js"]
