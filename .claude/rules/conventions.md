# Rule: Code conventions

- **Imports**: use the `@packages/*` alias for anything under `src/packages/`
  (e.g. `import { Public } from '@packages/decorators'`) — never long relative `../../..` paths.
- **Validation**: every request body/query is validated with a **Zod v4** schema via
  `new ZodValidationPipe<Dto>(schema)`. DTOs are `z.infer<>` types, never hand-written interfaces.
  Pagination query schemas use plain `z.coerce.number()` fields (`page`/`limit`), not `z.preprocess`.
  Use `z.coerce` only for query strings. Body numbers use plain `z.number()` — JSON is already typed,
  and coerce turns `""`/`null` into `0` (see `gradeExerciseSchema`).
  `ZodValidationPipe` JSON-parses string values by default (so `?filter={...}` works); **path params
  must pass `{ parseJsonStrings: false }`**, otherwise `/:id` values like `12345` become numbers and
  fail `z.string()` with a 422.
- **Secrets**: `.env*` files may be read and edited (no hook gate; user decision 2026-11-28). Never print secret values into chat or commit them.
  Reference config via `process.env` / `ConfigModule`.
- **Style**: single quotes, trailing commas, 100-char width, semicolons. Formatting/lint is
  auto-applied by a PostToolUse hook, so match surrounding code and let the hook normalize it.
- **Auth**: routes are guarded globally by `JwtAuthGuard`; add `@Public()` only for
  intentionally open endpoints, and `@Roles('ADMIN')` (from `@packages/decorators`, paired with
  `RolesGuard` from `@packages/guards`) for admin-only ones. `AdminRoleGuard` is also available
  in `@packages/guards`. Read the acting user with `@CurrentUser()` from `@packages/decorators`
  (returns the JWT payload; use `user.id`).
- **Helpers** (`@packages/helpers`): `checkUuidValid` / `generateCode` (from `generate.helper`),
  `hashData` / `compareData` (bcrypt from `hashingData.helper`). Downstream calls go through
  `RmqProducer` (`src/features/rabbitmq/`), not a helper — see `nestjs-feature-pattern.md`.
  `jwt.helper`'s `signAccessToken`/`signRefreshToken` are no longer called from gateway (token
  issuance moved to the `user` service) — the `JwtUserRole`/`JwtGuardUser` *types* from that file
  are still used by `jwt-auth.guard.ts`. There is no `buildListWhereClause` here anymore (it was
  gateway-local dead code left over from when gateway had its own DB — deleted, see
  `[[gateway-rmq-refactor]]`); list/pagination filtering happens inside the owning service.
- **Messages**: error strings in `ERROR_MESSAGES` (`src/data/constants`); success strings in
  `SUCCESS_MESSAGES` (same barrel). Never hardcode message text in services.
- **Production-only gates** (2026-11-28): `RABBITMQ_URL` is required when `NODE_ENV=production`
  (no `guest:guest` fallback); Swagger `/api-docs` is off in production unless `SWAGGER_ENABLED=true`;
  `/kafka/*` and `/health/postgres` debug routes 404 in production unless `ENABLE_DEBUG_ROUTES=true`;
  `GET /redis` blocks sensitive prefixes including `verify-email:`. Keep new debug/stub routes behind
  the same gate.
- **Swagger**: body/query schemas in `src/data/swaggers/data/{name}.swagger.ts`, response
  messages in `src/data/swaggers/messages/{name}.msg.ts`. Use `@ApiResponse()` decorator from
  `@packages/decorators` for success messages.
- **Request logging (removed 2026-11-28)**: the request/response logging interceptor, the `log-sink` pipeline and the `request_logs` writes were deleted. Do not add request logging back. Error responses still go through `ErrorInterceptor` and `HttpExceptionFilter`, and boot/error messages still use the Nest `Logger`. Correlation ids and `RequestContext` still propagate as described in the tracing bullet.
- **Distributed tracing** (added 2026-09-19): `@packages/context/request-context.ts` holds an
  `AsyncLocalStorage`-based `RequestContext` (`correlationId`/`traceId`/`parentTraceId`/
  `serviceName`), opened per-HTTP-request by `requestContextMiddleware`
  (`@packages/context/request-context.middleware.ts`, wired first in `main.ts`'s `app.use(...)`
  chain — reuses an incoming `x-correlation-id` header or mints one, and echoes it back on the
  response). `RmqProducer.send()`/`.emit()` automatically read this context and attach it as
  AMQP message headers (`properties.headers`) on every outbound call — **no call site needs to do
  anything** (`this.rmqProducer.send('auth.login', loginDto)` is unchanged). Both
  `ResponseInterceptor` and `HttpExceptionFilter` include `correlationId` in every JSON response,
  and `HttpExceptionFilter` also surfaces `serviceName` — which downstream service actually threw
  — when the RPC error payload carried one through. See `[[rmq-rpc-plumbing]]` memory for the
  full mechanism (`RmqRecord` headers, the sibling repos' matching `TraceContextInterceptor`
  reading `RmqContext.getMessage().properties.headers`).
- **RPC identity seal** (2026-11-28): any RPC message carrying `userId` or `role` is sealed with `RPC_ACTOR_SECRET` (`src/features/rabbitmq/rpc-identity.helper.ts`; identical copies in tutor/third `src/packages/helpers/`). The gateway and tutor-service seal in `RmqProducer` (not for `user_queue`, not for `log.*`); tutor-service and third-service verify in `RpcIdentityInterceptor` and reject with 403 otherwise. Any new cross-service call that names a user or role must go through `RmqProducer`, or the receiver rejects it. Deploy order: gateway first, then tutor/third.
- **RPC timeouts**: `RmqProducer.send()` accepts an optional `timeoutMs` parameter (3rd
  argument, default 10000) applied per attempt via RxJS `timeout()`, plus `maxRetries` (4th,
  default 2). Pass it for
  operations that should fail fast if the responder doesn't reply within a deadline:
  `await this.rmqProducer.send('<pattern>', payload, 15000)` for a 15-second timeout. Omit it
  to use the default. After the last attempt times out the caller gets a 504.
  Retries are only for idempotent patterns (`isIdempotentPattern` in `rmq.constants.ts`: read-only
  method prefixes). Add single-use-token or other state-consuming reads to `NON_IDEMPOTENT_PATTERNS`
  there even when their name starts with `verify`/`get` (e.g. `auth.verifyEmail`).
- **RPC request tracking for debugging** (added 2026-09-26): Controller endpoints making RPC
  calls should track requests with a unique `requestId` and log start/success/failure for
  production diagnostics:
  ```ts
  const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  this.logger.log(`[SEND-START] requestId=${requestId} <pattern> -> <service>, payload=...`);
  try {
    const response = await this.rmqProducer.send('<pattern>', payload, timeoutMs);
    this.logger.log(`[SEND-SUCCESS] requestId=${requestId} duration=${Date.now()-start}ms`);
    return { statusCode: 200, message: 'Success', data: response, requestId, duration };
  } catch (error) {
    this.logger.error(`[SEND-FAILED] requestId=${requestId} error=${error.message}`);
    throw error;
  }
  ```
  The responder service should log `[RECEIVE-START]`/`[PROCESSING]`/`[RESPONSE-READY]` with the
  same `requestId` for correlation. Use `requestId` to correlate gateway and responder service
  logs when debugging production failures — see `ERROR_ANALYSIS.md` and `PRODUCTION_DEBUGGING.md`
  for diagnostic workflows.
- **Rate limiting**: `ThrottleModule` (`src/features/throttler/`) applies `AppThrottlerGuard`
  globally, per client IP, with three buckets: `short` 3/s, `medium` 20/10s, `long` 100/min.
  A route without `@Throttle` (from `@nestjs/throttler`) gets all three, so many users behind one
  NAT (e.g. a class of students on `POST /auth/login/user-code`) share one bucket and hit 429
  `TOO_MANY_REQUESTS`. `@Throttle({ short: {...} })` overrides **only** the named bucket — the
  other two still apply, so raise all three when a route legitimately needs more. Behind Railway
  `TRUST_PROXY_HOPS` (default 1, `main.ts`) must match the proxy hop count or every client shares
  one IP.
