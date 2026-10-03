# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
# Flowline release image: one image, two processes (web / worker), plus a one-shot migrate command.
#   docker build --build-arg GIT_SHA=$(git rev-parse HEAD) -t flowline:<sha> .
#   web:     docker run ... flowline:<sha>                       (next start on :3000)
#   worker:  docker run ... flowline:<sha> node_modules/.bin/tsx worker/index.ts
#   migrate: docker run ... flowline:<sha> node_modules/.bin/tsx src/db/migrate.ts   (expand-only migrations)
# Configuration comes only from the environment (no .env files are copied into the image).
FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@10.32.1 --no-fund --no-audit
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Route modules are imported while Next collects page config; the pool is created but never connected.
# Build-stage only placeholders — the runtime stage gets real configuration from its environment.
RUN DATABASE_URL=postgres://build:build@127.0.0.1:1/build BETTER_AUTH_SECRET=build-only-placeholder-not-a-secret pnpm build

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
COPY --from=build --chown=node:node /app/scripts ./scripts
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
