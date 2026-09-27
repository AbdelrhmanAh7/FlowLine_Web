# syntax=docker/dockerfile:1.7
# Flowline release image: one image, two processes (web / worker), plus a one-shot migrate command.
#   docker build --build-arg GIT_SHA=$(git rev-parse HEAD) -t flowline:<sha> .
#   web:     docker run ... flowline:<sha>                       (next start on :3000)
#   worker:  docker run ... flowline:<sha> node_modules/.bin/tsx worker/index.ts
#   migrate: docker run ... flowline:<sha> node_modules/.bin/tsx src/db/migrate.ts   (expand-only migrations)
# Configuration comes only from the environment (no .env files are copied into the image).
FROM node:25-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS runtime
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.revision=$GIT_SHA org.opencontainers.image.title=flowline
ENV NODE_ENV=production FLOWLINE_RELEASE_SHA=$GIT_SHA
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/package.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/worker ./worker
COPY --from=build --chown=node:node /app/drizzle ./drizzle
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
