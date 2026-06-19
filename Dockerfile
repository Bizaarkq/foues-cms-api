# ==============================================================
# ARG BUILD_ENV controla el entorno: "production" o "development"
# Se pasa desde docker-compose via build args
# ==============================================================
ARG BUILD_ENV=production

# ---- Stage: Base (compartido) ----
FROM node:22-alpine AS base
RUN apk update && apk add --no-cache build-base gcc autoconf automake zlib-dev libpng-dev vips-dev git poppler-utils > /dev/null 2>&1
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate
WORKDIR /opt/app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches/ ./patches/

# ---- Stage: Build para Producción ----
FROM base AS build-production
ENV NODE_ENV=production
RUN --mount=type=cache,id=pnpm-api-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
ENV PATH=/opt/app/node_modules/.bin:$PATH
COPY . .
RUN pnpm run build

# ---- Stage: Imagen Final de Producción ----
FROM node:22-alpine AS production
RUN apk add --no-cache vips-dev poppler-utils
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate
ENV NODE_ENV=production
WORKDIR /opt/app
COPY --from=build-production /opt/app ./
ENV PATH=/opt/app/node_modules/.bin:$PATH
RUN chown -R node:node /opt/app
USER node
EXPOSE 1337

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
    CMD wget --spider --quiet http://localhost:1337/_health || exit 1

CMD ["pnpm", "run", "start"]

# ---- Stage: Desarrollo ----
FROM base AS development
ENV NODE_ENV=development
RUN --mount=type=cache,id=pnpm-api-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
ENV PATH=/opt/app/node_modules/.bin:$PATH
COPY . .
RUN chown -R node:node /opt/app
USER node
RUN pnpm run build
EXPOSE 1337
CMD ["pnpm", "run", "develop"]

# ---- Stage Final: selección dinámica por BUILD_ENV ----
FROM ${BUILD_ENV} AS final
