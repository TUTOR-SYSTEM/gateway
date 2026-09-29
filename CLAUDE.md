# CLAUDE.md — Gateway

## Project Overview

API **gateway** for a tutoring-platform backend split into 4 independent NestJS services:
`gateway` (this repo, HTTP-facing), `user` (auth/user/admin/student + Postgres), `tutor-service`
(education domain), `third-service` (notification/email/upload). Built with **NestJS 11** +
**TypeScript**.

**Gateway makes no runtime database queries and has no business logic.** It is the only service
clients talk to over HTTP; every request, across every feature, is validated here (Zod, guards)
then forwarded over **RabbitMQ** (`@nestjs/microservices`, RMQ transport, request/reply) via
`RmqProducer.send(...)` to whichever service owns that domain: `user` (auth/user/admin/student),
`tutor-service` (the education domain — class/schedule/session/curriculum/chapter/lesson/tuition/
exercise/attendance/dashboard/report/ai-chat), or `third-service` (email/notification/redis/
upload). See `[[gateway-rmq-refactor]]` for the history of this split (gateway used to be a full
Drizzle-backed duplicate of `user`, and the same thin-proxy shape has since been extended
gateway-wide to the other two services' domains as well).

**2026-09-28 schema consolidation**: gateway is now the canonical owner of the Drizzle
**schema + migration tooling** for the one shared Postgres database all 4 services connect to
(`src/database/schema.ts`, `drizzle.config.ts`, `drizzle/`, `db:generate`/`db:push`/`db:migrate`/
`db:studio`). This does not reintroduce a `DatabaseModule` or any query code here — `user`/
`tutor-service`/`third-service` still own all runtime queries against their own tables, now
importing the shared table/enum definitions from gateway's `./schema` export
(`"@tutor/gateway"` local package, see their `src/database/database.module.ts`) instead of each
maintaining a divergent local copy.

## IMPORTANT: Selective File Reading

**Do NOT read entire source code.** Only read files necessary for the current task:

### When working on a feature:
1. Read `CLAUDE.md` and `.claude/rules/*.md` for conventions
2. Read the specific feature module: `src/features/{name}/*`
3. Read related entities: `src/packages/entities/{name}/*`
4. Read `app.module.ts` only when registering new modules
5. Read the matching `*.rpc.controller.ts` in the **owning service's repo** (`user/`,
   `tutor-service/`, or `third-service/` — not this one) to see what a message pattern actually
   does — gateway only forwards, it never implements the logic

### When fixing a bug:
1. Read the specific file with the bug
2. Read related files only if needed for context
3. Do NOT read unrelated features

### Files to read ONLY when necessary:
- `src/main.ts` — Only when changing bootstrap configuration
- `src/features/rabbitmq/*` — Only when adding a new pattern prefix route, changing queue names,
  or changing how RPC errors are translated
- `src/data/constants/*` — Only when adding error/success messages

## Tech Stack

| Layer            | Technology                                          |
| ---------------- | ---------------------------------------------------- |
| Framework        | NestJS 11                                           |
| Language         | TypeScript 5 (strictNullChecks only)                |
| Inter-service    | RabbitMQ via `@nestjs/microservices` (RMQ transport, request/reply) |
| Authentication   | JWT (access + refresh) verified locally; user existence confirmed via RPC to `user` |
| Validation       | Zod v4 (via custom `ZodValidationPipe`)             |
| API Docs         | @nestjs/swagger                                     |
| Package Manager  | Bun (runtime) / npm (lock file present)             |
| Formatting       | Prettier (single quotes, trailing commas)           |
| Linting          | ESLint + typescript-eslint                          |
| Containerization | Docker Compose / Podman Compose (Postgres/Redis/RabbitMQ — shared with the other 3 services) |
| Database tooling | Drizzle ORM schema + `drizzle-kit` migrations (`src/database/schema.ts`, `drizzle.config.ts`) — canonical for the shared DB since the 2026-09-28 consolidation, but **dev/CLI-only**: gateway has no `DatabaseModule` and opens no DB connection at request time |

Gateway has no runtime database connection, business-logic services, or seed scripts — query
code lives only in the services that own data (`user`, `tutor-service`, `third-service`); they
now import gateway's schema definitions rather than maintaining their own copies.

## Commands

```bash
# Development
bun start:dev             # Start dev server with watch
bun start:debug           # Start with debug + watch
bun run build             # Production build
bun run start:prod        # Run compiled JS

# Code Quality
bun run lint              # ESLint with --fix
bun run lint:check        # ESLint without fix (CI-friendly)
bun run format            # Prettier write
bun run format:check      # Prettier check

# Testing
bun run test              # Unit tests (Jest)
bun run test:watch        # Unit tests in watch mode
bun run test:cov          # Unit tests with coverage
bun run test:e2e          # E2E tests
bun run test:debug        # Debug tests with inspect

# Containers (shared Postgres/Redis/RabbitMQ used by the other 3 services)
bun compose:up            # Docker Compose up -d
bun compose:down          # Docker Compose down
bun podman:up             # Podman Compose up -d
bun podman:down           # Podman Compose down

# Database (Drizzle) — canonical schema + migration tooling for the shared Postgres DB (dev/CLI
# only; gateway itself never opens a DB connection at runtime)
bun run db:generate       # Generate migration SQL from schema changes
bun run db:migrate        # Run pending migrations
bun run db:push           # Push schema directly (dev only)
bun run db:studio         # Open Drizzle Studio
```

Gateway must run alongside `user` (and, once wired, `tutor-service`/`third-service`) with
RabbitMQ reachable — it has nothing to serve on its own. Each service's `PORT` in its own
`.env` must be distinct when running more than one on the same host.

## Project Structure

```
src/
├── main.ts                       # Bootstrap: CORS, interceptors, filters, listen
├── app.module.ts                 # Root module (imports all feature modules)
├── app.controller.ts             # Health-check + RPC demo routes (`/kafka/*` paths kept for compat)
├── app.service.ts                # Health-check service (publishes/subscribes `health.check`)
├── features/                     # Feature modules (NestJS pattern) — every one below is a thin
│                                  # proxy controller only (no service/repository), except auth's
│                                  # OAuth routes. All forward to whichever service owns them:
│   ├── auth/                     # → `user` (RPC), except OAuth: Passport strategies stay here
│   │   ├── auth.controller.ts
│   │   └── auth.module.ts
│   ├── user/ admin/ student/     # → `user` (RPC)
│   ├── class/ schedule/ session/ curriculum/ chapter/ lesson/ tuition/ exercise/ attendance/
│   │   dashboard/ report/ ai-chat/   # → `tutor-service` (RPC)
│   ├── email/ notification/ redis/ upload/ log/ test-scenario/   # → `third-service` (RPC).
│   │                              # `test-scenario` proxies `testscenario.*`; `POST /:id/run` also
│   │                              # forwards the caller's bearer token + `?async=true` → `wait:false`
│   └── rabbitmq/                 # RmqModule (@Global): one RMQ client per downstream queue
│                                  # (user_queue/tutor_queue/third_queue) + RmqProducer, which
│                                  # routes each pattern by prefix (rmq.constants.ts)
└── packages/                     # Shared utilities (import via @packages/*)
    ├── configs/                  # JWT sign config
    ├── decorators/               # @ApiResponse, @Public, @Roles, @CurrentUser decorators
    ├── entities/                 # DTOs + Zod schemas per domain (still used here for
    │                              # request validation even though there's no DB)
    ├── filters/                  # HttpExceptionFilter (global)
    ├── guards/                   # JwtAuthGuard (verifies JWT locally, confirms the user
    │                              # still exists via an RPC call — no local DB), RolesGuard
    ├── helpers/                  # hashing, JWT
    ├── interceptor/              # ResponseInterceptor, ErrorInterceptor, LoggerInterceptor
    ├── interfaces/               # ApiResponseInterface, UserInterface
    ├── pipes/                    # ZodValidationPipe
    └── strategy/                 # Google/Facebook Passport strategies (OAuth stays in gateway)
```

## Code Conventions

### Path Alias

- `@packages/*` → `src/packages/*` (configured in `tsconfig.json` and Jest `moduleNameMapper`)
- Example: `import { Public } from '@packages/decorators'`

### Feature Module Pattern (gateway-specific — do not copy the `user`/`tutor-service` layering)

```
features/{name}/
├── {name}.module.ts     # Module definition (controller only, no service/repository)
└── {name}.controller.ts # Route handlers: validate with ZodValidationPipe, then
                          # `return this.rmqProducer.send('<pattern>', payload);`
```

- No `{name}.service.ts` / `{name}.repository.ts` for any feature — business logic lives only in
  the owning service (`user`, `tutor-service`, or `third-service`). If you're about to add one
  here, stop: the logic belongs in that service's `*.service.ts` behind a new `@MessagePattern`,
  and gateway only needs a new `rmqProducer.send(...)` call site (plus a `RMQ_PREFIX_ROUTES`
  entry if the prefix is new).
- **Message pattern naming**: `<feature>.<methodName>`, matching the owning service's method it
  wraps (e.g. `auth.login`, `user.updateUserByAdmin`, `admin.createTutor`, `student.findById`,
  `ai.chat`, `email.test`). Keep gateway's pattern strings and the owning repo's
  `@MessagePattern(...)` strings in sync — they are the contract between the two repos and
  nothing enforces them at compile time across repos.
- **Every RPC call goes through `RmqProducer`** (`src/features/rabbitmq/`) — never inject a raw
  `ClientProxy` or call `client.send(...)` directly from a controller. It converts the RPC error payload back into the
  right `HttpException` (status + message) so error handling looks identical to a local call.

### Entity / DTO Pattern

Entities live in `src/packages/entities/{domain}/` — unchanged despite gateway having no DB:

- `{domain}.schema.ts` — Zod validation schemas (used in controllers via `ZodValidationPipe`)
- `{domain}.dto.ts` — TypeScript interfaces/types derived from schemas
- `index.ts` — Re-exports everything

### Request/Response Flow

1. Request → Global `JwtAuthGuard` (unless `@Public()`) — verifies the JWT locally, then confirms
   the user has an active session via `rmqProducer.send('redis.get', { key })` (third-service; fails open)
2. Controller validates body via `ZodValidationPipe` (Zod schema)
3. Controller → `rmqProducer.send('<pattern>', payload)` → RabbitMQ queue → the owning
   service's `*.rpc.controller.ts` → its (unmodified) `*.service.ts` → its own Postgres
4. `ResponseInterceptor` wraps the RPC result the same way it would a local return value:
   ```json
   { "statusCode": 200, "message": "Success", "data": { ... }, "timestamp": "...", "method": "POST", "path": "/auth/login" }
   ```
5. Errors: `RmqProducer.send` turns the responder's `RpcErrorPayload` into an `HttpException`, then the
   normal `ErrorInterceptor` + `HttpExceptionFilter` handle it exactly like a local exception

### Authentication

- **Global guard**: `JwtAuthGuard` applied via `APP_GUARD` in `AppModule` — no local DB, existence
  check is an RPC call to `user`
- **Public routes**: `@Public()` decorator to skip JWT verification
- **Admin routes**: `@Roles('ADMIN')` + `RolesGuard`
- **OAuth (Google/Facebook)**: Passport guards + redirect logic stay in gateway (needs the live
  HTTP `Response`); only the final token-issuance call (`auth.googleLogin`/`auth.facebookLogin`)
  goes over RPC to `user`
- **Token flow**: Access token (3h default) + Refresh token (7d default), both issued by `user`

### Validation

- All request bodies validated with **Zod v4** schemas via custom `ZodValidationPipe`
- Schemas defined in `src/packages/entities/{domain}/{domain}.schema.ts`

### Code Style

- **Prettier**: Single quotes, trailing commas (all), 100 print width, semicolons
- **ESLint**: With typescript-eslint and prettier plugin
- **Import style**: `import { X } from '@packages/...'` using path alias
- **Decorator order**: `@Controller` → `@Public` → `@HttpCode` → `@ApiResponse` → method

## Environment Variables

| Variable                      | Description                    | Default                              |
| ----------------------------- | ------------------------------ | ------------------------------------ |
| `NODE_ENV`                    | Environment mode               | `development`                        |
| `PORT`                        | Server port                    | Must be unique per service when running several on one host |
| `JWT_ACCESS_SECRET`           | Access token secret            | Required (must match `user`'s)       |
| `JWT_REFRESH_SECRET`          | Refresh token secret           | Required (must match `user`'s)       |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` / `GOOGLE_OAUTH_REDIRECT_URL` | Google OAuth (lives in gateway) | Required for Google login |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` / `BACKEND_URL` | Facebook OAuth (lives in gateway) | Required for Facebook login |
| `RABBITMQ_URL`                | RabbitMQ connection URL (on Railway: reference the RabbitMQ service's private URL) | `amqp://guest:guest@localhost:5672` |
| `USER_QUEUE` / `TUTOR_QUEUE` / `THIRD_QUEUE` | Override the RMQ queue name for each downstream client | `user_queue` / `tutor_queue` / `third_queue` |
| `DATABASE_URL` or `POSTGRES_*`| Postgres connection — read only by `drizzle.config.ts` for the `db:*` CLI scripts (`resolveDatabaseUrl()`, same resolution as the other 3 services). Not read by any runtime app code — gateway's NestJS process never opens this connection. | none (required to run `db:generate`/`db:push`/`db:migrate`) |

Gateway reads no `REDIS_*` or mail vars at runtime — those belong to the services that actually
use them.

## Docker Services

`docker-compose.yml` still provisions Postgres/Redis (used by `user`/`tutor-service`/
`third-service`, not gateway's own NestJS process) plus **RabbitMQ** (used by all four services
— this is the one dependency gateway's app actually needs at runtime). Gateway's `drizzle.config.ts`
does need Postgres reachable, but only when a human runs `bun run db:generate`/`db:push`/
`db:migrate` locally.

## Key Files to Know

- `src/main.ts` — Bootstrap with CORS, interceptors, filters
- `src/app.module.ts` — Root module with all imports + global JWT guard
- `src/features/rabbitmq/rmq.module.ts` — RMQ client registration (`USER_SERVICE`,
  `TUTOR_SERVICE`, `THIRD_SERVICE`)
- `src/features/rabbitmq/rmq.producer.ts` — `RmqProducer`, the only sanctioned way to call a
  downstream service (trace headers, retry/timeout, error → `HttpException`)
- `src/features/rabbitmq/rmq.constants.ts` — pattern-prefix → queue routing table
- `src/packages/guards/jwt-auth.guard.ts` — Global JWT auth guard (RPC-based existence check)
- `src/packages/interceptor/response.interceptor.ts` — Standard response wrapper
- `src/packages/pipes/zod-validation.pipe.ts` — Zod validation pipe
- `src/packages/decorators/public.decorator.ts` — `@Public()` decorator
- `src/packages/entities/` — All DTOs and validation schemas

## Project Rules

The following rule files are loaded as part of these instructions and must be followed:

@.claude/rules/nestjs-feature-pattern.md
@.claude/rules/conventions.md

## Automated Hooks

Configured in `.claude/settings.json` (scripts in `.claude/hooks/`):

- **PreToolUse (Write|Edit)** → `guard-paths.mjs` blocks edits to `.env*` and generated
  `drizzle/**` files (gateway owns the canonical migration history since 2026-09-28).
- **PostToolUse (Write|Edit)** → `format-ts.mjs` runs prettier + eslint `--fix` on the
  touched `.ts/.js` file.
- **Stop** → `review-skills.mjs` runs after each task that changed `src/`, and asks Claude to
  review/update `.claude/rules/**`, `.claude/skills/**`, and memory (`MEMORY.md` + memory
  files) so they stay in sync with new or changed patterns/facts.
