# THIRD_SERVICE HTTP, RPC, and WebSocket inventory

**Scanned:** 2026-10-10. Source root: `THIRD_SERVICE/src/`.

> Saved from the subagent's report. Source code is the truth; line numbers refer to the scan date.

## Module-wide behavior

- **HTTP:** port `PORT` (default 8888). No global prefix. Swagger at `/api-docs`. CORS `origin: true, credentials: true` (`main.ts:22`).
- **Transport:** RabbitMQ only, queue `THIRD_QUEUE` (default `third_queue`), durable, prefetch 10 (`main.ts:40-51`). No Kafka usage in `src/`.
- **Global guards (APP_GUARD, `app.module.ts:36-47`), in order:**
  - `JwtAuthGuard` (`packages/guards/jwt-auth.guard.ts`): skipped when `@Public()`. Otherwise requires `Authorization: Bearer`, verifies with `JWT_ACCESS_SECRET ?? JWT_SECRET ?? 'dev-insecure-jwt-secret'`, requires `typ=access`, then checks the user exists in `users`. Failures return 401 `"Unauthorized ..."`.
  - `LanguageGuard`: sets `req.language` from `Accept-Language` (`vi` default). Never rejects.
  - `TokenBucketGuard` (`token-bucket.guard.ts`): Redis token bucket, default 60 requests per 60s, keyed by user id or IP plus method and path. Returns 429 `TOO_MANY_REQUESTS` and sets `X-RateLimit-*` and `Retry-After`. Applies to `@Public` routes too (keyed by IP).
- **Global interceptors and filter:**
  - `ResponseInterceptor` wraps HTTP success as `{statusCode, message, data, timestamp, method, path}`. `message` defaults to `SUCCESS`, translated.
  - `ErrorInterceptor` turns non-HTTP errors into 500 `InternalServerError`. Postgres codes 23503/23505/23502/23514 get fixed messages. Other `Failed query:` errors become `"Database error"`.
  - `HttpExceptionFilter` error body: `{success:false, statusCode, message, errors?, path, timestamp, correlationId, serviceName?}`. `trace` only for 5xx outside production.
- **Validation:** `ZodValidationPipe` failures return **422** `"Validation failed"` with `errors: [{field, message, code}]`. Used only on `notifications` and `logs` HTTP routes.
- **RPC:** `RpcExceptionFilter` replies `{statusCode, message, errors?, serviceName:'third-service'}`. Non-HTTP errors become 500 with the raw `error.message`. `TraceContextInterceptor` is the only RPC interceptor. No RPC handler applies a pipe.

---

## 1. Summary: HTTP routes (16)

| # | Method | Path | Auth | Success | Notable errors |
|---|---|---|---|---|---|
| 1 | GET | `/` | JWT | 200 `"Hello World!"` | 401 |
| 2 | GET | `/emails` | **Public** | 200 Resend `{id}` | 500 on send failure |
| 3 | GET | `/redis?key=` | JWT (any role) | 200 string or null | 401; 429; 500 if Redis down |
| 4 | GET | `/logs` | JWT + ADMIN | 200 paged request_logs | 401; 403; 422 |
| 5 | GET | `/logs/trace/:correlationId` | JWT + ADMIN | 200 array | 401; 403 |
| 6 | GET | `/logs/stats` | JWT + ADMIN | 200 endpoint stats | 401; 403 |
| 7 | POST | `/notifications` | JWT | 201 notification row | 401; 422 |
| 8 | GET | `/notifications` | JWT | 200 paged list | 401; 422 |
| 9 | GET | `/notifications/:id` | JWT | 200 row | 404; 500 on non-UUID id |
| 10 | PATCH | `/notifications/:id/read` | JWT | 200 updated row | 404; 500 on non-UUID id |
| 11 | PATCH | `/notifications/read-all` | JWT | 200 raw update result | 401 |
| 12 | DELETE | `/notifications/:id` | JWT | 200 `{id}` | 404; 500 on non-UUID id |
| 13 | POST | `/upload` | **Public** | 201 `{url,key,size,mimetype}` | 500 if no file or S3 error |
| 14 | POST | `/upload/multiple` | **Public** | 201 array of the above | 400 if >10 files (unverified); 500 |
| 15 | GET | `/upload/download?key=` | **Public** | 200 raw file stream | 400 empty key; 404 missing; 500 |
| 16 | DELETE | `/upload/:key` | **Public** | 200 (empty data) | 500 on S3 error |

## 2. Summary: RPC and WebSocket (36 entries)

| # | Kind | Pattern | Auth | Success | Notable errors |
|---|---|---|---|---|---|
| R1 | MessagePattern | `health.redis` | none in source | `{status:'healthy',...}` or `{status:'unhealthy',...}` | never throws |
| R2 | MessagePattern | `email.test` | none in source | Resend `{id}` | Resend error (raw) |
| R3 | MessagePattern | `email.sendForgotPasswordMail` | none in source | Resend `{id}` | Resend error (raw) |
| R4 | MessagePattern | `redis.get` | none in source | string or null | Redis error |
| R5 | MessagePattern | `redis.set` | none in source | `{ok:true}` | Redis error |
| R6 | EventPattern | `redis.del` | none in source | (no reply) | logged only |
| R7 | EventPattern | `log.create` | none in source | (no reply) | errors swallowed |
| R8 | MessagePattern | `log.query` | none in source | paged rows | NaN offset if page/limit omitted (unverified) |
| R9 | MessagePattern | `log.trace` | none in source | array | none |
| R10 | MessagePattern | `log.stats` | none in source | stats array | none |
| R11 | MessagePattern | `notification.create` | none in source | inserted row | raw DB errors |
| R12 | MessagePattern | `notification.getAll` | none in source | paged list | NaN offset if page/limit omitted |
| R13 | MessagePattern | `notification.markAllAsRead` | none in source | update result | none |
| R14 | MessagePattern | `notification.getById` | none in source | row | 404 |
| R15 | MessagePattern | `notification.markAsRead` | none in source | row | 404 |
| R16 | MessagePattern | `notification.delete` | none in source | `{id}` | 404 |
| R17 | MessagePattern | `upload.upload` | none in source | `{url,key,size,mimetype}` | raw S3/sharp errors |
| R18 | MessagePattern | `upload.uploadMultiple` | none in source | array | raw errors |
| R19 | MessagePattern | `upload.download` | none in source | `{content:Buffer, contentType, contentLength, filename}` | raw S3 errors |
| R20 | MessagePattern | `upload.delete` | none in source | void | raw S3 errors |
| R21 | MessagePattern | `testscenario.create` | none in source | scenario row | raw DB errors |
| R22 | MessagePattern | `testscenario.list` | none in source | scenarios | none |
| R23 | MessagePattern | `testscenario.update` | none in source | row | 404 |
| R24 | MessagePattern | `testscenario.delete` | none in source | row | 404 |
| R25 | MessagePattern | `testscenario.stats` | none in source | stats | none |
| R26 | MessagePattern | `testscenario.runs` | none in source | run rows | 404 |
| R27 | MessagePattern | `testscenario.run` | none in source | run row, or `{correlationId, scenarioId}` if `wait:false` | 404 scenario; setup failures recorded as failed run |
| R28 | MessagePattern | `testscenario.generate` | none in source | `{scenarios, fixtures}` | none |
| R29 | MessagePattern | `testscenario.createMany` | none in source | `{created, skipped}` | raw DB errors |
| R30 | MessagePattern | `testscenario.authprofiles` | none in source | `[{profile, configured, email}]` | none |
| R31 | MessagePattern | `testscenario.fixtures.list` | none in source | fixture rows | none |
| R32 | MessagePattern | `testscenario.fixtures.create` | none in source | row | 409 key taken |
| R33 | MessagePattern | `testscenario.fixtures.update` | none in source | row | 409; 404 |
| R34 | MessagePattern | `testscenario.fixtures.delete` | none in source | row | 404 |
| R35 | MessagePattern | `testscenario.fixtures.resolve` | none in source | row | 404; 400 resolve failed |
| W1 | WS namespace `/logs` (server to client `log:new`) | JWT ADMIN in handshake | row broadcast on every insert | disconnect on bad auth |

---

## 3. HTTP routes

### 3.1 GET `/` (health)
- **Source:** `app.controller.ts:16` (method at `:23`).
- **Guards:** global JWT (no `@Public`). No role.
- **Request:** none.
- **Success:** 200. `data` = `"Hello World!"`.
- **Errors:** 401. 429.
- **Downstream:** none.

### 3.2 GET `/emails`
- **Source:** `features/email/email.controller.ts:10`.
- **Guards:** `@Public()`. Global throttle per IP.
- **Request:** none.
- **Success:** 200. `data` = Resend `{id}`. Sends one test email.
- **Errors:** 500 with Resend message. 429.
- **Downstream:** Resend API. Recipient is **hardcoded** (`email.service.ts:27`). `RESEND_API_KEY` and `MAIL_FROM` are `getOrThrow` in the constructor, so missing env fails at boot.

### 3.3 GET `/redis`
- **Source:** `features/redis/redis.controller.ts:17`.
- **Guards:** global JWT. **Any role.** No ownership or key allowlist.
- **Request:** query `key` (string). **No validation in code**; missing key goes straight to `GET`.
- **Success:** 200. `data` = string or null.
- **Errors:** 401. 429. 500 if Redis errors. (Docs claim 400 for missing key; not in source.)
- **Downstream:** Redis (`redis.service.ts:84`), via `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT` (default 6380).

### 3.4 GET `/logs`
- **Source:** `features/log/log.controller.ts:29`. `@UseGuards(RolesGuard)`, `@Roles('ADMIN')`.
- **Guards:** JWT, then ADMIN.
- **Request:** query (`getRequestLogsQuerySchema`, `packages/entities/log/log.schema.ts:25`):
  - `page`: int, min 1, default 1
  - `limit`: int, 1-100, default 20
  - `serviceName`: string, optional
  - `type`: `HTTP` or `RPC`, optional
  - `correlationId`: string, optional
  - `search`: trimmed, min 1, optional (ILIKE on `path`)
- **Success:** 200. `data = {data: rows, pagination: {total, page, limit, totalPages}}`.
- **Errors:** 401. 403 `You do not have permission to access this resource`. 422.
- **Downstream:** `request_logs` (`log.repository.ts:45-78`).

### 3.5 GET `/logs/trace/:correlationId`
- **Source:** `features/log/log.controller.ts:46`.
- **Guards:** JWT + ADMIN.
- **Request:** path `correlationId` (not validated).
- **Success:** 200. Array of rows ordered by `createdAt` asc. Empty array if none (no 404).
- **Errors:** 401; 403.
- **Downstream:** `request_logs`.

### 3.6 GET `/logs/stats`
- **Source:** `features/log/log.controller.ts:58`.
- **Guards:** JWT + ADMIN.
- **Request:** none.
- **Success:** 200. `data` = `[{method, path, calls24h, errorCount24h, p95Ms}]`, last 24h, `serviceName='gateway'`, `type='HTTP'`, ordered by call count.
- **Errors:** 401; 403.
- **Downstream:** `request_logs` with `percentile_cont(0.95)` (`log.repository.ts:91-118`).

### 3.7 POST `/notifications`
- **Source:** `features/notification/notification.controller.ts:29` (`@HttpCode(201)`).
- **Guards:** global JWT. **No role check.** Any authenticated user can create any type (including `SYSTEM`) for any `userId`.
- **Request:** body (`createNotificationSchema`, `notification.schema.ts:6`):
  - `type`: `SYSTEM|TUITION|STUDENT|TUTOR`, required
  - `title`: string 1-255, required
  - `content`: string, **required** in zod (Swagger omits it)
  - `subContent`: string, max 255, optional
  - `userId`, `classId`, `studentId`: UUID or null, optional
  - `senderId`: body value **overwritten** with JWT `user.id` (`controller:58`)
  - `redirectUrl`: string max 500, optional
  - `actionLabel`: string max 100, optional
  - `actionType`: `VIEW|CONTACT|PAYMENT|UPDATE`, optional
  - `metadata`: record, optional
- **Success:** 201. `data` = inserted row.
- **Errors:** 422 `Validation failed`. 400 `classId/studentId is not valid` (effectively unreachable). 401. 429.
- **Downstream:** `notifications` insert only.

### 3.8 GET `/notifications`
- **Source:** `features/notification/notification.controller.ts:61`.
- **Guards:** global JWT.
- **Request:** query (`getNotificationsQuerySchema`):
  - `page`: int ≥1, default 1
  - `limit`: int 1-100, default 10
  - `search`: trimmed, optional (ILIKE on `title`; `%` not escaped)
  - `type`: enum, optional
  - `isRead`: **`z.coerce.boolean()`** — bug: `"false"` coerces to `true`.
- **Success:** 200. `data = {data: rows, pagination}`. Rows where `userId = me OR senderId = me`.
- **Errors:** 401; 422.
- **Downstream:** `notifications` (`notification.repository.ts:39-79`).

### 3.9 GET `/notifications/:id`
- **Source:** `features/notification/notification.controller.ts:78`.
- **Guards:** global JWT. **No ownership check.**
- **Request:** path `id`, not validated as UUID. Non-UUID → 500.
- **Success:** 200. Row.
- **Errors:** 404 `Notification not found`. 401. 500 on non-UUID.

### 3.10 PATCH `/notifications/:id/read`
- **Source:** `features/notification/notification.controller.ts:87`.
- **Guards:** global JWT. **No ownership check.**
- **Request:** path `id` (same UUID caveat).
- **Success:** 200. Updated row with `isRead=true`.
- **Errors:** 404; 401; 500 on non-UUID.
- **Downstream:** `notifications` update (`notification.repository.ts:86-93`).

### 3.11 PATCH `/notifications/read-all`
- **Source:** `features/notification/notification.controller.ts:96`.
- **Guards:** global JWT. Scoped to caller's `userId`.
- **Request:** none.
- **Success:** 200. Raw postgres-js update result (docs' `{markedAll:true}` does not exist).
- **Errors:** 401. 429.
- **Downstream:** update where `userId = me` (`notification.repository.ts:95-101`). `senderId` not matched.

### 3.12 DELETE `/notifications/:id`
- **Source:** `features/notification/notification.controller.ts:107`.
- **Guards:** global JWT. **No ownership check.**
- **Request:** path `id` (same UUID caveat).
- **Success:** 200. `{id}`.
- **Errors:** 404; 401; 500 on non-UUID.

### 3.13 POST `/upload`
- **Source:** `features/uploads/upload.controller.ts:39` (`@HttpCode(201)`, `FileInterceptor('file')`).
- **Guards:** `@Public()`. **Unauthenticated.**
- **Request:** multipart field `file`. Multer `memoryStorage()` with **no size or MIME limits** (`upload.module.ts:10`).
- **Success:** 201. `data = {url, key, size, mimetype}`.
  - `key = uploads/<uuid>.<ext>`.
  - Images re-encoded with sharp: rotate, fit inside 1920×1920, JPEG q80. Key `.jpg`, mimetype `image/jpeg`.
  - Other files keep extension or `bin`.
  - `url = CLOUDFLARE_R2_PUBLIC_URL + "/" + key`.
- **Errors:** 500 if `file` missing (`upload.service.ts:57`). 500 for corrupt image. 500 S3 errors. 429.
- **Downstream:** Cloudflare R2 `PutObjectCommand` (`upload.service.ts:74`).

### 3.14 POST `/upload/multiple`
- **Source:** `features/uploads/upload.controller.ts:59`.
- **Guards:** `@Public()`.
- **Request:** multipart field `files`, up to 10 (`FilesInterceptor('files', 10)`). No size/MIME limits.
- **Success:** 201. Array of `{url,key,size,mimetype}`, uploaded with `Promise.all`.
- **Errors:** 400 when >10 files (message unverified). 500 for any single failure; earlier uploads **not rolled back**.
- **Downstream:** R2 `PutObject` per file.

### 3.15 GET `/upload/download`
- **Source:** `features/uploads/upload.controller.ts:82`.
- **Guards:** `@Public()`. **Any object in the bucket is readable** by key.
- **Request:** query `key` (required). Empty → 400.
- **Success:** 200, raw stream (not envelope).
  - `Content-Type` from R2 metadata, default `application/octet-stream`.
  - `Content-Disposition: attachment; filename="<last segment>"`.
  - `Content-Length` when known.
- **Errors:** 400 `key query param is required`. 404 `File "<key>" not found` on `NoSuchKey`/`NotFound`. 500 otherwise. Stream errors after headers sent are unhandled.
- **Downstream:** R2 `GetObjectCommand`.

### 3.16 DELETE `/upload/:key`
- **Source:** `features/uploads/upload.controller.ts:110`.
- **Guards:** `@Public()`. **Anyone can delete any object.** Slashed keys must be `%2F`-encoded.
- **Request:** path `key` (not validated).
- **Success:** 200. Empty data (idempotent).
- **Errors:** 500 on S3 error. 429.
- **Downstream:** R2 `DeleteObjectCommand` (`upload.service.ts:107-110`).

---

## 4. RPC message and event patterns

**Shared:** no RPC handler has a guard, auth check, or zod pipe in source. Errors go through `RpcExceptionFilter`. Each entry is wrapped by `TraceContextInterceptor`, which writes a `request_logs` row (`RPC` type).

### 4.1 Health (`app.controller.ts`)
**R1 `health.redis`** (`:27`). Payload `{fetchData?: boolean}`. Reply `{status:'healthy'|'unhealthy', cache, connection, timestamp, message, ping, stats:{totalKeys, info}, sampleKeys?}`. Never throws. Downstream: Redis `PING`, `INFO memory`, `DBSIZE`, and `SCAN`/`MGET` when `fetchData`.

### 4.2 Email (`features/email/email.rpc.controller.ts`)
**R2 `email.test`** (`:14`). No payload. Reply Resend `{id}`. Same hardcoded test email.

**R3 `email.sendForgotPasswordMail`** (`:19`). Payload `{to, resetToken, displayName}` (no validation). Reply Resend `{id}`. Link `PASSWORD_RESET_URL_BASE/reset-password?token=<encoded>` (default `http://localhost:3000`). Expires in 5 min per email body.

### 4.3 Redis (`features/redis/redis.rpc.controller.ts`)
**R4 `redis.get`** (`:14`). Payload `{key}`. Reply string or null. Unauthenticated equivalent of `GET /redis`.

**R5 `redis.set`** (`:22`). Payload `{key, value, ttlSeconds?}`. Reply `{ok:true}`. Comment says reset-password tokens are written this way.

**R6 `redis.del`** (EventPattern, `:28`). Payload `{keys: string[]}`. No reply.

### 4.4 Logs (`features/log/log.rpc.controller.ts`)
**R7 `log.create`** (EventPattern, `:17`). Payload `CreateRequestLogDto` (no zod). No reply; errors swallowed (`log.service.ts:19-22`). Inserts row then broadcasts `log:new`.

**R8 `log.query`** (`:22`). Payload `GetRequestLogsQueryDto`, **not validated** → missing `page`/`limit` gives `offset = NaN` (`log.repository.ts:47`). Unverified.

**R9 `log.trace`** (`:27`). Payload `{correlationId}`. Reply array.

**R10 `log.stats`** (`:32`). No payload. Reply stats array.

### 4.5 Notifications (`features/notification/notification.rpc.controller.ts`)
**R11 `notification.create`** (`:15`). Payload `CreateNotificationDto & {senderId}`, not validated; only `senderId` UUID-checked (`notification.service.ts:27`). Raw DB errors leak.

**R12 `notification.getAll`** (`:20`). Payload `{userId, query}`, query not validated (NaN offset risk as R8).

**R13 `notification.markAllAsRead`** (`:25`). Payload `{userId}`. Reply raw update result.

**R14 `notification.getById`** (`:30`). Payload `{id}`, no UUID check. 404.

**R15 `notification.markAsRead`** (`:35`). Payload `{id}`. 404.

**R16 `notification.delete`** (`:40`). Payload `{id}`. Reply `{id}`. 404.

### 4.6 Uploads (`features/uploads/upload.rpc.controller.ts`)
**R17 `upload.upload`** (`:26`). Payload `{file: {fieldname, originalname, encoding, mimetype, size, buffer:{type:'Buffer', data:number[]}}}`. Same as 3.13 incl. sharp re-encode.

**R18 `upload.uploadMultiple`** (`:31`). Payload `{files[]}`. No count limit in RPC.

**R19 `upload.download`** (`:36`). Payload `{key}`. Reply `{content: Buffer, contentType, contentLength, filename}`; whole object read into memory.

**R20 `upload.delete`** (`:51`). Payload `{key}`. No key restriction.

### 4.7 Test scenarios (`features/test-scenario/test-scenario.rpc.controller.ts`)
RabbitMQ only; used by gateway's `test-scenarios` proxy. Payloads **not validated** even though zod schemas exist in `packages/entities/test-scenario/test-scenario.schema.ts`.

**R21 `testscenario.create`** (`:27`). Raw `CreateTestScenarioDto`; `path` must-start-with-`/` rule bypassed. Insert into `test_scenarios`.

**R22 `testscenario.list`** (`:32`). Payload `GetTestScenariosQueryDto`.

**R23 `testscenario.update`** (`:37`). Payload `{id, dto}`. 404.

**R24 `testscenario.delete`** (`:42`). Payload `{id}`. 404.

**R25 `testscenario.stats`** (`:47`). Reply `ScenarioStatsDto[]`.

**R26 `testscenario.runs`** (`:52`). Payload `{id, limit?}` (clamped 1-100, default 20). 404.

**R27 `testscenario.run`** (`:57`). Payload `{id, userId?, accessToken?, wait?}`. If `wait:false` returns `{correlationId, scenarioId}` immediately; otherwise saved `test_runs` row. Calls `GATEWAY_BASE_URL` (default `http://localhost:8888`) + stored `path`, 15s timeout, attaches profile token. Setup failures become failed runs. Response bodies redacted and capped at 4000 chars. 404 scenario.

**R28 `testscenario.generate`** (`:68`). Payload `GenerateScenariosDto`. Reply `{scenarios, fixtures}` with `exists` flags. No writes.

**R29 `testscenario.createMany`** (`:73`). Payload `{scenarios[]}`. Skips existing method+path+name. Reply `{created, skipped}`.

**R30 `testscenario.authprofiles`** (`:78`). Reply `[{profile, configured, email}]` for `admin|tutor|student|parent` from `TEST_ACCOUNT_*` env. No passwords.

**R31 `testscenario.fixtures.list`** (`:83`). Reply rows ordered by key.

**R32 `testscenario.fixtures.create`** (`:88`). Raw DTO; key regex and value-or-resolver rule bypassed. 409 `Test fixture key already exists`.

**R33 `testscenario.fixtures.update`** (`:93`). Payload `{id, dto}`. 409; 404.

**R34 `testscenario.fixtures.delete`** (`:98`). Payload `{id}`. 404.

**R35 `testscenario.fixtures.resolve`** (`:103`). Payload `{id, accessToken?}`. For resolver fixtures, calls `GET resolver.path` on gateway with profile token, extracts dot path, stores value. 404; 400 `Could not resolve fixture value: <reason>`.

---

## 5. WebSocket

**W1: namespace `/logs`** (`features/log/log.gateway.ts:31-34`). CORS `origin: true, credentials: true`.
- **Handshake auth:** `handshake.auth.token` or `Authorization: Bearer`. Same secret as `JwtAuthGuard`. Requires `typ=access`, `role=ADMIN`, `sub`; user must exist. Otherwise `client.disconnect()`.
- **Server → client:** `log:new` with full inserted row (`emitNewLog`, `:92-94`), called from `LogService.createInternal` after each insert.
- **Client → server:** no `@SubscribeMessage` handlers.
- **Broadcast:** `server.emit` → all sockets in namespace.

---

## Unclear / not verified

1. **RPC auth and global guards.** RPC handlers have no guards in source. `APP_GUARD` providers are not confirmed to run for RPC; `JwtAuthGuard` calls `switchToHttp()`. If they don't run, RPC is unauthenticated at app level and only RabbitMQ access control protects it. Not run.
2. **Test-scenario RPC bypasses validation → likely host redirect.** Raw payloads skip the `path` rule. `buildRequest` concatenates `baseUrl + path` and attaches the admin test token (`test-scenario.service.ts:207`, `test-fixture.service.ts:89`). A path like `@attacker.example/x` could send the token to another host. Likely, not executed.
3. **`GET /redis` and `redis.get` read any key.** Unknown which keys other services store (`redis.set` comment mentions reset-password tokens). If stored here, any logged-in user could read them. Not verified.
4. **Health route requires JWT.** `GET /` has no `@Public()`; docs may say otherwise.
5. **Log WebSocket race.** `handleConnection` is async; socket may receive `log:new` before auth completes. Expired admin tokens not re-checked on open sockets. Not run.
6. **Redis outage behavior.** `maxRetriesPerRequest: null` plus `TokenBucketGuard` awaiting Redis may hang all HTTP requests rather than fail open. Not run.
7. **JWT secret fallback.** Falls back to `'dev-insecure-jwt-secret'` if both env vars unset. Production setting unverified.
8. **Notification ownership.** GET/PATCH/DELETE on `/notifications/:id` have no ownership check; POST lets any role send `SYSTEM` notifications. Confirmed by reading source.
9. **`isRead` coercion bug.** `z.coerce.boolean()` turns `"false"` into `true` (`notification.schema.ts:29`). Confirmed by JS semantics.
10. **Non-UUID `:id` → 500**, not 400/404. Confirmed by reading.
11. **RPC errors leak raw messages**; SQL text may reach RabbitMQ callers. Not run.
12. **Upload has no size or MIME limits.** Not run.
13. **Public upload/download/delete** on `/upload`. Confirmed by source.
14. **`GET /emails` is public** and always sends to a hardcoded address, consuming Resend quota. Confirmed by source.
15. **`S3ClientProvider` throws when R2 env missing** (`upload.provider.ts:15-17`), contradicting `S3Client | null` handling in `upload.service.ts`. Boot behavior not run.
16. **`ResponseInterceptor` vs `@Res()` in download.** Expected to be ignored; not run.
17. **Multer limit error status/message** (400 for >10 files) not verified at runtime.
18. **Missing `key` in `GET /redis`**: no check; actual ioredis behavior not run.
19. **`PATCH /notifications/read-all` response shape** not verified in serialized form.
20. **Unused Passport strategies** in `packages/strategy/` (`jwt-user`, `google`, `facebook`) not registered anywhere. Treated as dead code.
21. **Unvalidated paged RPC queries** (`log.query`, `notification.getAll`): NaN offset expected to error. Not run.
22. **Log content.** `request_logs` stores `requestBody`, `requestHeaders`, `responseBody` as sent; redaction of tokens upstream not verified in this module.
23. **Existing-doc divergences.** `API_ENDPOINTS.md` lists 400 for `GET /redis` without key and `{markedAll:true}` for read-all; neither exists in source.
