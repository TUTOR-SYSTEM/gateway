# Backend Memory — gateway (HTTP edge, no DB)

## Project Structure

```
gateway/
├── src/
│   ├── main.ts                    # Bootstrap: CORS, interceptors, filters, listen (port 8888)
│   ├── app.module.ts              # Root module (imports all feature modules)
│   ├── app.controller.ts          # Health-check controller (+ RPC demo routes under /kafka/* — paths kept, transport is RabbitMQ)
│   ├── app.service.ts             # Health-check service
│   ├── features/                  # Every feature is a thin proxy controller (no service/repository,
│   │   │                          # no DB) except auth's OAuth routes; each forwards via `RmqProducer`
│   │   │                          # to whichever service owns it:
│   │   ├── auth/                  # → `user` (OAuth Google/Facebook stays here, needs live Response)
│   │   ├── user/ admin/ student/   # → `user`
│   │   ├── class/ schedule/ session/ curriculum/ chapter/ lesson/ tuition/ exercise/
│   │   │   attendance/ dashboard/ report/ ai-chat/   # → `tutor-service`
│   │   ├── email/ notification/ redis/ upload/   # → `third-service`
│   │   └── rabbitmq/              # RmqModule + RmqProducer: one RMQ client per queue
│   │                              # (user_queue/tutor_queue/third_queue), routed by pattern prefix
│   └── packages/                  # Shared utilities
│       ├── configs/               # JWT sign config
│       ├── decorators/            # @ApiResponse, @Public, @Roles, @CurrentUser
│       ├── entities/              # DTOs + Zod schemas (kept for request validation even with no DB)
│       ├── filters/               # HttpExceptionFilter (global)
│       ├── guards/                # JwtAuthGuard (RPC existence check, no local DB), RolesGuard
│       ├── helpers/                # hashing, JWT
│       ├── interceptor/           # ResponseInterceptor, ErrorInterceptor, LoggerInterceptor
│       ├── interfaces/            # ApiResponseInterface, UserInterface
│       ├── pipes/                 # ZodValidationPipe
│       └── strategy/              # Google/Facebook Passport strategies
└── test/                          # Jest + Supertest tests
```

**No `src/database/`, no Drizzle, no `drizzle/` migrations, no `scripts/` seeds** — those only
exist in `user`/`tutor-service`/`third-service`. Gateway is a thin RPC-forwarding edge; see
`CLAUDE.md` and `.claude/rules/nestjs-feature-pattern.md` for the full "why".

## Feature Module Pattern (gateway-specific)

```
features/{name}/
├── {name}.module.ts     # Module definition (controller only)
└── {name}.controller.ts # return this.rmqProducer.send('<feature>.<methodName>', payload)
```

No `{name}.service.ts` / `{name}.repository.ts` for any feature — that logic lives in the
owning service's `*.service.ts` behind a `@MessagePattern`. All three downstream clients
(`USER_SERVICE`/`TUTOR_SERVICE`/`THIRD_SERVICE`) are live and have responders wired up — see
`[[gateway-rmq-refactor]]` memory and `../.claude/rules/architecture.md` for the RPC contract.

## Request/Response Flow

1. Request → Global `JwtAuthGuard` (unless `@Public()`) — verifies JWT locally, then confirms
   the user has an active session via `rmqProducer.send('redis.get', ...)` (fails open)
2. Controller validates body via `ZodValidationPipe`
3. Controller → `rmqProducer.send('<pattern>', payload)` → RabbitMQ queue → owning service
4. `ResponseInterceptor` wraps the RPC result the same as a local return value
5. Errors: `RmqProducer.send` turns the responder's `RpcErrorPayload` into an `HttpException`, then the
   normal `ErrorInterceptor` + `HttpExceptionFilter` handle it like any local exception

## Authentication

- **Global guard**: `JwtAuthGuard` via `APP_GUARD` — RPC-based existence check, no local DB
- **Public routes**: `@Public()`. **Admin routes**: `@Roles('ADMIN')` + `RolesGuard`
  (there is no `@Admin()` decorator — don't invent one)
- **OAuth**: Google/Facebook Passport guards + redirect stay in gateway (need a live
  `Response`); only the final token-issuance call goes over RPC to `user`
- **Token flow**: issued entirely by `user` — access (3h default) + refresh (7d default)

## Key Files

- `src/main.ts` — Bootstrap with CORS, interceptors, filters
- `src/app.module.ts` — Root module, all imports + global JWT guard
- `src/features/rabbitmq/` — `RmqModule` (clients per queue), `RmqProducer` (the only sanctioned
  downstream call path), `rmq.constants.ts` (pattern-prefix → queue routing)
- `src/packages/guards/jwt-auth.guard.ts` — Global JWT guard (RPC existence check)
- `src/packages/interceptor/response.interceptor.ts` — Standard response wrapper
- `src/packages/pipes/zod-validation.pipe.ts` — Zod validation pipe

## Commands

```bash
bun start:dev / start:debug / build / start:prod
bun run lint / lint:check / format / format:check
bun run test / test:watch / test:cov / test:e2e / test:debug   # Jest only — no Bun test runner
bun compose:up / compose:down            # RabbitMQ only (Postgres/Redis are for the other 3 services)
bun podman:up / podman:down / podman:logs
```

No `db:*` scripts exist here — gateway has nothing to migrate/seed.

## Environment Variables

| Variable                      | Description                    |
| ----------------------------- | ------------------------------- |
| `NODE_ENV` / `PORT`           | Standard (port default `8888`)  |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Must match `user`'s secrets |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` / `GOOGLE_OAUTH_REDIRECT_URL` | Google OAuth (lives in gateway) |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` / `BACKEND_URL` | Facebook OAuth (lives in gateway) |
| `RABBITMQ_URL` | AMQP URL (local `amqp://admin:admin@localhost:5672`; Railway: RabbitMQ service private URL) |
| `USER_QUEUE` / `TUTOR_QUEUE` / `THIRD_QUEUE` | Downstream queue names (default `user_queue` / `tutor_queue` / `third_queue`) |

No `POSTGRES_*`/`DATABASE_URL`/`REDIS_*`/mail vars — gateway doesn't read them.

## Code Conventions

- `@packages/*` path alias; Prettier single quotes/trailing commas/100-width/semicolons
  (auto-applied by a PostToolUse hook); ESLint + typescript-eslint.
- Every RPC call through `RmqProducer.send`/`.emit` (`src/features/rabbitmq/`) — never a raw
  `ClientProxy`. New pattern prefixes go in `RMQ_PREFIX_ROUTES` (`rmq.constants.ts`).

## Testing

- **One runner: Jest** (+ Supertest). No Bun-native unit test runner — `bun run test` just runs
  the `test` npm script, which is Jest.
- Mock the injected `RmqProducer` and assert on the `send` pattern/payload rather than
  mocking a repository (there isn't one).

## RPC Producer Patterns

Message queue is **RabbitMQ** (switched back from Kafka on 2026-09-27). **Timeout support**:
`RmqProducer.send()` takes an optional per-attempt `timeoutMs` (default 10000) and `maxRetries`
(default 2):
```ts
await this.rmqProducer.send('<pattern>', payload, 15000)  // 15-second timeout
```
Omit the parameter to use the default. Use this for long-running operations
(e.g., report generation, data processing) to avoid indefinite hangs.

**Error logging & debugging** (added 2026-09-26): All RPC requests include:
- `requestId` — unique per-request identifier for correlating gateway ↔ user service logs
- `duration` — total time from send to response/error in milliseconds
- `isTimeout` — boolean flag indicating timeout vs. other errors
- `originalError` — the actual root cause, not a generic message

Controllers should wrap RPC calls with try/catch and log with `requestId` for production
debugging. See `ERROR_ANALYSIS.md` and `PRODUCTION_DEBUGGING.md` for diagnostic workflows.

## Available Skills

`generate-controller`, `generate-db-table`, `generate-entity`, `generate-feature`,
`generate-module`, `generate-repository`, `generate-service` (gateway-adapted: these generate
the thin proxy shape, not the full service/repository layering the other 3 services use) —
plus `add-rpc-endpoint` at `../.claude/skills/` for the cross-repo workflow.

## Available Agents

`dev.md`, `review.md`, `security.md`, `test.md` — see `.claude/agents/` (rewritten to match the
no-DB, no-service/repository RPC-proxy architecture; they used to describe Drizzle/service/repo
layering copied from the other services — fixed).

## Rules

`conventions.md`, `nestjs-feature-pattern.md` (gateway-specific — no `database.md`, gateway has
no DB) plus `../.claude/rules/architecture.md` and `shared-conventions.md` (cross-service).

## Selective File Reading Guideline (IMPORTANT)

**Do NOT read entire source code.** Only read files necessary for the task — see `CLAUDE.md`'s
"IMPORTANT: Selective File Reading" section for the full breakdown.

## Memory Index

- `[[rmq-rpc-plumbing]]` — how RmqProducer routes patterns, carries trace headers, and translates errors
