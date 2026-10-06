# syntax=docker/dockerfile:1

# --- BUILD: full deps (incl. dev) + compile TS ---
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && test -f dist/main.js

# --- PROD DEPS: runtime-only node_modules ---
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev --legacy-peer-deps --ignore-scripts

# --- RUNTIME ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8888

COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node package.json ./

# Required at runtime (pass via --env-file docker.env or compose):
# - DATABASE_URL or POSTGRES_* (for db:* CLI only, not runtime)
# - RABBITMQ_URL, USER_QUEUE, TUTOR_QUEUE, THIRD_QUEUE
# - JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
# - JWT_ACCESS_EXPIRES_SECONDS, JWT_REFRESH_EXPIRES_SECONDS
# - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL, GOOGLE_OAUTH_REDIRECT_URL
# - FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, BACKEND_URL

USER node
EXPOSE 8888
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD nc -z localhost 8888 || exit 1
CMD ["node", "dist/main"]
