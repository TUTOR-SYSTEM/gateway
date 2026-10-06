# syntax=docker/dockerfile:1

ARG NODE_VERSION=22

# --- BUILD: full deps (incl. dev) + compile TS ---
FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --legacy-peer-deps --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && test -f dist/main.js

# --- PROD DEPS: runtime-only node_modules (runs in parallel with builder) ---
FROM node:${NODE_VERSION}-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev --legacy-peer-deps --ignore-scripts --no-audit --no-fund

# --- RUNTIME ---
FROM node:${NODE_VERSION}-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8888

# tini = proper PID 1: forwards SIGTERM and reaps zombies (clean RMQ shutdown on deploy)
RUN apk add --no-cache tini

COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node package.json ./

# Required at runtime (pass via --env-file docker.env or compose):
# - RABBITMQ_URL, USER_QUEUE, TUTOR_QUEUE, THIRD_QUEUE
# - JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
# - JWT_ACCESS_EXPIRES_SECONDS, JWT_REFRESH_EXPIRES_SECONDS
# - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL, GOOGLE_OAUTH_REDIRECT_URL
# - FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, BACKEND_URL
# (DATABASE_URL / POSTGRES_* are only used by the db:* CLI, never at runtime)

USER node
EXPOSE 8888
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD nc -z 127.0.0.1 ${PORT} || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main"]
