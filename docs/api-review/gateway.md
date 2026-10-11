# Gateway API Route Review

- **Module:** `/home/haidangphan/Documents/tutor/gateway` (NestJS, source under `src/`)
- **Scanned:** 2026-10-10 (read-only review; no source files changed)
- **Scope:** 134 HTTP routes from `@Controller` handlers. The module has no WebSocket gateways and no `@MessagePattern` or `@EventPattern` handlers; it is an HTTP-to-RabbitMQ edge that only sends RPC patterns. Swagger UI (`/api-docs`, `/api-docs-json`) is registered in `src/main.ts` outside the controllers and is not covered by the global guards.

## Global behaviour (applies to every route unless noted)

- **Prefix / version:** no global prefix and no URI versioning. Paths below are the controller prefix plus the handler path.
- **Guards:** global `JwtAuthGuard` (`src/packages/guards/jwt-auth.guard.ts`) requires a Bearer access JWT on every route unless `@Public()`. It then checks a Redis session through RMQ `redis.get` on `session:<userId>` (30 s in-memory cache). If the RMQ/Redis check fails, the request is allowed (fail-open). `LanguageGuard` only sets the response language. `RolesGuard` is not global; it is applied per controller (`/admin`, `/logs`, `/reports/learning`, `/test-scenarios`).
- **CORS:** `origin: true, credentials: true` (`src/main.ts`).
- **Success envelope:** `{statusCode, message, data, timestamp, method, path, correlationId}`. `data` is the RMQ reply passed through unchanged. `message` is a localized "SUCCESS" unless `@ApiResponse` overrides it (only the auth routes do).
- **Error envelope** (`HttpExceptionFilter`): `{success:false, statusCode, message, errors?, path, correlationId, serviceName?, trace? (non-production, 5xx only), timestamp}`.
- **RPC routing** (`src/features/rabbitmq/rmq.constants.ts`): `user.*`, `auth.*`, `kafka.*`, `health.postgres` go to USER_SERVICE (`user_queue`). `redis.*`, `email.*`, `notification.*`, `upload.*`, `log.*`, `testscenario.*`, `health.redis` go to THIRD_SERVICE (`third_queue`). `tutor`, `curriculum`, `chapter`, `lesson`, `exercise`, `tuition`, `class`, `schedule`, `session`, `attendance`, `dashboard`, `report`, `ai` go to TUTOR_SERVICE (`tutor_queue`).

### Error codes used in the tables

- **E-AUTH (401):** missing, malformed, invalid or expired Bearer token, or a token whose `typ` is not `access` (`Unauthorized ...`). A missing Redis session gives `Session expired or not found ...`.
- **E-ROLE (403):** `RolesGuard` rejected the user (`You do not have permission to access this resource`).
- **E-ZOD (422):** `ZodValidationPipe` failed. Body is `{statusCode:422, message, errors:[{field,message,code}]}`. Applies to `@Body`/`@Query` only; `@Param` values are not validated except where `ParseUUIDPipe` is used.
- **E-400:** `ParseUUIDPipe` or `ParseIntPipe` on the path or query param (test-scenario routes only).
- **E-RPC:** RMQ request failed. The downstream `HttpException` status is propagated with its message. A timeout gives 504 after 3 attempts of 10 s each (plus backoff). A broker failure gives 500. The specific downstream status codes are not defined in this module.
- **E-500:** a non-HTTP exception in the handler, mapped by `ErrorInterceptor` to 500.

## Key observations

1. **Anonymous writes and deletes:** `POST /upload`, `POST /upload/multiple`, `DELETE /upload/:key`, and `GET /upload/download` are `@Public`. `GET /emails` (sends a test email) and `GET /kafka/send` (fixed-payload user-service call) are also public.
2. **No role check on user management:** `GET /users`, `POST /users` (can set `role: ADMIN`), `PUT /users`, `PUT /users/:id`, `PUT /users/:id/status`, `DELETE /users/:id`, all `/students` write routes, `GET /redis`, and `PATCH /exercises/:id/grade` only require a valid session. Only the `/admin`, `/logs`, `/reports/learning` and `/test-scenarios` controllers use `RolesGuard`. Whether the user service enforces roles is not verified.
3. **Redis read-through:** `GET /redis?key=` returns any Redis key to any authenticated user, including the `session:*` keys the JWT guard depends on.
4. **Admin routes do not force the role:** `POST /admin/tutors` and `POST /admin/students` do not send a `role`, and the list routes send no role filter (see Unclear).
5. **Fail-open session check:** if RMQ or Redis is down, a JWT with a valid signature is accepted.
6. **No rate limiting:** a `@Throttle` decorator exists (`src/packages/decorators/throttle.decorator.ts`) but no guard reads it, so `/auth/login` and others are unthrottled.
7. **OAuth redirects** put `accessToken` and `refreshToken` in the query string. The Facebook callback reuses `GOOGLE_OAUTH_REDIRECT_URL`.
8. **Inconsistent password rules:** register and login use 6–25 characters plus complexity; admin and user create apply complexity only at specific lengths; change-password uses 8–14.

## 1. Summary table

| # | Method | Path | Auth | Success | Notable errors |
|---|---|---|---|---|---|
| 1 | GET | `/` | JWT + Redis session (not `@Public`) | 200 | E-AUTH |
| 2 | GET | `/kafka/emit` | Public | 200 | E-500 only (emit has no retry or timeout) |
| 3 | GET | `/kafka/send` | Public | 200 | E-RPC (10 s per attempt, 2 retries); E-500 `RabbitMQ send failed after …` |
| 4 | GET | `/kafka/error` | Public | 200 | E-RPC |
| 5 | GET | `/kafka/tutor/error` | Public | 200 | E-RPC |
| 6 | GET | `/health/postgres` | Public | 200 | E-RPC (rethrown unchanged) |
| 7 | GET | `/health/redis` | Public | 200 | E-RPC (rethrown unchanged) |
| 8 | POST | `/auth/register` | Public | 200 (`HttpCode OK`) | E-ZOD; E-RPC (e.g. duplicate email, status not verified in gateway) |
| 9 | POST | `/auth/login` | Public | 200 | E-ZOD; 401 invalid credentials (Swagger only; propagation from USER_SERVICE not verified) |
| 10 | POST | `/auth/login/user-code` | Public | 200 | E-ZOD; 401 invalid credentials (Swagger only) |
| 11 | POST | `/auth/refresh` | Public | 200 | E-ZOD; 401 invalid or expired refresh token (Swagger only) |
| 12 | POST | `/auth/forgot-password` | Public | 200 | E-ZOD; E-RPC |
| 13 | POST | `/auth/reset-password` | JWT + Redis session (Bearer required, although the handler is not `@Public`) | 200 | E-AUTH; E-ZOD (incl. invalid `jti`, mismatch); E-RPC |
| 14 | GET | `/auth/google` | Public | 302 redirect to Google consent (no body) | Passport failures (shape not verified) |
| 15 | GET | `/auth/google/callback` | Public (Passport `AuthGuard('google')` validates the OAuth code) | 302 to `GOOGLE_OAUTH_REDIRECT_URL` (default `http://localhost:3000/oauth/callback`) with `?accessToken=&refreshToken=` in the query string | Passport failures (shape not verified); E-RPC returns a JSON error, not a redirect |
| 16 | GET | `/auth/facebook` | Public | 302 redirect to Facebook consent | Passport failures (shape not verified) |
| 17 | GET | `/auth/facebook/callback` | Public (Passport `AuthGuard('facebook')`) | 302 to `GOOGLE_OAUTH_REDIRECT_URL` (same env var as Google, no Facebook-specific one) with `?accessToken=&refreshToken=` | Passport failures (shape not verified); E-RPC returns JSON |
| 18 | POST | `/admin/tutors` | JWT + ADMIN (E-ROLE) | 201 | E-AUTH; E-ROLE; E-ZOD; E-RPC |
| 19 | GET | `/admin/tutors` | JWT + ADMIN | 200 | E-AUTH; E-ROLE; E-ZOD; E-RPC |
| 20 | GET | `/admin/tutors/:id` | JWT + ADMIN | 200 | E-AUTH; E-ROLE; E-RPC (not-found behaviour downstream) |
| 21 | PUT | `/admin/tutors/:id` | JWT + ADMIN | 200 | E-AUTH; E-ROLE; E-ZOD; E-RPC |
| 22 | DELETE | `/admin/tutors/:id` | JWT + ADMIN | 200 | E-AUTH; E-ROLE; E-RPC |
| 23 | POST | `/admin/students` | JWT + ADMIN | 201 | E-AUTH; E-ROLE; E-ZOD; E-RPC |
| 24 | GET | `/admin/students` | JWT + ADMIN | 200 | E-AUTH; E-ROLE; E-ZOD; E-RPC |
| 25 | GET | `/admin/students/:id` | JWT + ADMIN | 200 | E-AUTH; E-ROLE; E-RPC |
| 26 | PUT | `/admin/students/:id` | JWT + ADMIN | 200 | E-AUTH; E-ROLE; E-ZOD; E-RPC |
| 27 | DELETE | `/admin/students/:id` | JWT + ADMIN | 200 | E-AUTH; E-ROLE; E-RPC |
| 28 | POST | `/ai-chat/chat` | JWT + Redis session (any role) | 200 | E-AUTH; E-ZOD; E-RPC |
| 29 | GET | `/ai-chat/history` | JWT + Redis session | 200 | E-AUTH; E-ZOD; E-RPC |
| 30 | DELETE | `/ai-chat/history` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 31 | GET | `/attendances/session/:sessionId` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 32 | PUT | `/attendances` | JWT + Redis session | 200 | E-AUTH; E-ZOD; E-RPC |
| 33 | POST | `/chapter/:curriculumId` | JWT + Redis session | 201 | E-AUTH; E-ZOD; E-RPC |
| 34 | GET | `/chapter` | JWT + Redis session | 200 | E-AUTH; E-ZOD (missing or non-uuid `curriculumId`); E-RPC |
| 35 | GET | `/chapter/:id` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 36 | PUT | `/chapter/:id` | JWT + Redis session | 200 | E-AUTH; E-ZOD; E-RPC |
| 37 | DELETE | `/chapter/:id` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 38 | POST | `/classes` | JWT + Redis session | 201 | E-AUTH; E-ZOD; E-RPC |
| 39 | PUT | `/classes/:id` | JWT + Redis session | 200 | E-AUTH; E-ZOD; E-RPC |
| 40 | GET | `/classes/generate-code` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 41 | GET | `/classes` | JWT + Redis session | 200 | E-AUTH; E-ZOD; E-RPC |
| 42 | GET | `/classes/:id` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 43 | POST | `/classes/:id/students` | JWT + Redis session | 200 (`HttpCode OK`, not 201) | E-AUTH; E-ZOD; E-RPC |
| 44 | GET | `/classes/:id/students` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 45 | GET | `/classes/:id/materials` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 46 | GET | `/classes/:id/watches` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 47 | DELETE | `/classes/:id` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 48 | GET | `/curriculum/generate-code` | JWT + Redis session | 201 (`HttpCode CREATED` on a GET) | E-AUTH; E-RPC |
| 49 | POST | `/curriculum` | JWT + Redis session | 201 | E-AUTH; E-ZOD; E-RPC |
| 50 | GET | `/curriculum` | JWT + Redis session | 200 | E-AUTH; E-ZOD; E-RPC |
| 51 | GET | `/curriculum/:id` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 52 | PUT | `/curriculum/:id` | JWT + Redis session | 200 | E-AUTH; E-ZOD; E-RPC |
| 53 | DELETE | `/curriculum/:id` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 54 | POST | `/curriculum/lessons` | JWT + Redis session | 201 | E-AUTH; E-ZOD (body only); E-RPC (query problems surface downstream) |
| 55 | GET | `/curriculum/lessons` | JWT + Redis session | 200 | E-AUTH; E-ZOD; E-RPC |
| 56 | GET | `/curriculum/lessons/:id` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 57 | PUT | `/curriculum/lessons/:id` | JWT + Redis session | 200 | E-AUTH; E-ZOD; E-RPC |
| 58 | DELETE | `/curriculum/lessons/:id` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 59 | POST | `/exercises` | JWT + Redis session (no role check) | 201 | E-AUTH; E-ZOD; E-RPC |
| 60 | GET | `/exercises` | JWT + Redis session | 200 | E-AUTH; E-ZOD; E-RPC |
| 61 | GET | `/exercises/:id` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 62 | PATCH | `/exercises/:id/submit` | JWT + Redis session | 200 | E-AUTH; E-ZOD; E-RPC |
| 63 | PATCH | `/exercises/:id/grade` | JWT + Redis session (no role check; any authenticated user can call it) | 200 | E-AUTH; E-ZOD; E-RPC |
| 64 | POST | `/notifications` | JWT + Redis session (no role check) | 201 | E-AUTH; E-ZOD; E-RPC |
| 65 | GET | `/notifications` | JWT + Redis session | 200 | E-AUTH; E-ZOD; E-RPC |
| 66 | PATCH | `/notifications/read-all` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 67 | GET | `/notifications/:id` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 68 | PATCH | `/notifications/:id/read` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 69 | DELETE | `/notifications/:id` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 70 | POST | `/schedules` | JWT + Redis session | 201 | E-AUTH; E-ZOD; E-RPC |
| 71 | POST | `/schedules/bulk` | JWT + Redis session | 201 | E-AUTH; E-ZOD; E-RPC |
| 72 | GET | `/schedules` | JWT + Redis session | 200 | E-AUTH; E-ZOD; E-RPC |
| 73 | GET | `/schedules/class/:classId` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 74 | GET | `/schedules/:id` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 75 | PATCH | `/schedules/:id` | JWT + Redis session | 200 | E-AUTH; E-ZOD; E-RPC |
| 76 | DELETE | `/schedules/:id` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 77 | POST | `/sessions` | JWT + Redis session | 201 | E-AUTH; E-ZOD; E-RPC |
| 78 | POST | `/sessions/bulk` | JWT + Redis session | 201 | E-AUTH; E-ZOD; E-RPC |
| 79 | GET | `/sessions` | JWT + Redis session | 200 | E-AUTH; E-ZOD; E-RPC |
| 80 | GET | `/sessions/class/:classId` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 81 | GET | `/sessions/:id` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 82 | PUT | `/sessions/:id` | JWT + Redis session | 200 | E-AUTH; E-ZOD; E-RPC |
| 83 | DELETE | `/sessions/:id` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 84 | GET | `/students/get-student-code` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 85 | POST | `/students` | JWT + Redis session (no role check) | 201 | E-AUTH; E-ZOD; E-RPC |
| 86 | GET | `/students` | JWT + Redis session (no role check) | 200 | E-AUTH; E-ZOD; E-RPC |
| 87 | GET | `/students/:id` | JWT + Redis session (no role check) | 200 | E-AUTH; E-RPC |
| 88 | PUT | `/students/:id` | JWT + Redis session (no role check, no ownership check) | 200 | E-AUTH; E-ZOD; E-RPC |
| 89 | DELETE | `/students/:id` | JWT + Redis session (no role check) | 200 | E-AUTH; E-RPC |
| 90 | POST | `/tuitions` | JWT + Redis session | 201 | E-AUTH; E-ZOD; E-RPC |
| 91 | GET | `/tuitions/summary` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 92 | GET | `/tuitions` | JWT + Redis session | 200 | E-AUTH; E-ZOD; E-RPC |
| 93 | GET | `/tuitions/:id` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 94 | PUT | `/tuitions/:id` | JWT + Redis session | 200 | E-AUTH; E-ZOD; E-RPC |
| 95 | DELETE | `/tuitions/:id` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 96 | GET | `/dashboard/overview` | JWT + Redis session | 200 | E-AUTH; E-RPC |
| 97 | GET | `/emails` | Public (no token needed) | 200 | E-RPC |
| 98 | GET | `/logs` | JWT + ADMIN (class-level `RolesGuard` + `@Roles('ADMIN')`, E-ROLE) | 200 | E-AUTH; E-ROLE; E-ZOD; E-RPC |
| 99 | GET | `/logs/trace/:correlationId` | JWT + ADMIN (E-ROLE) | 200 | E-AUTH; E-ROLE; E-RPC |
| 100 | GET | `/logs/stats` | JWT + ADMIN (E-ROLE) | 200 | E-AUTH; E-ROLE; E-RPC |
| 101 | GET | `/redis` | JWT + Redis session (no role check; any authenticated user) | 200 | E-AUTH; E-ZOD (missing `key`); E-RPC |
| 102 | GET | `/reports/learning/summary` | JWT + ADMIN (class-level `RolesGuard` + `@Roles('ADMIN')`, E-ROLE) | 200 | E-AUTH; E-ROLE; E-RPC |
| 103 | GET | `/reports/learning/attendance-trend` | JWT + ADMIN (E-ROLE) | 200 | E-AUTH; E-ROLE; E-RPC |
| 104 | GET | `/reports/learning/classes` | JWT + ADMIN (E-ROLE) | 200 | E-AUTH; E-ROLE; E-ZOD; E-RPC |
| 105 | GET | `/test-scenarios/routes` | JWT + ADMIN (E-ROLE) | 200 | E-AUTH; E-ROLE |
| 106 | POST | `/test-scenarios/generate` | JWT + ADMIN (E-ROLE) | 200 | E-AUTH; E-ROLE; E-ZOD; E-RPC |
| 107 | POST | `/test-scenarios/bulk` | JWT + ADMIN (E-ROLE) | 201 | E-AUTH; E-ROLE; E-ZOD; E-RPC |
| 108 | GET | `/test-scenarios/auth-profiles` | JWT + ADMIN (E-ROLE) | 200 | E-AUTH; E-ROLE; E-RPC |
| 109 | GET | `/test-scenarios/fixtures` | JWT + ADMIN (E-ROLE) | 200 | E-AUTH; E-ROLE; E-RPC |
| 110 | POST | `/test-scenarios/fixtures` | JWT + ADMIN (E-ROLE) | 201 | E-AUTH; E-ROLE; E-ZOD; E-RPC |
| 111 | PATCH | `/test-scenarios/fixtures/:id` | JWT + ADMIN (E-ROLE) | 200 | E-AUTH; E-ROLE; E-400 (bad UUID); E-ZOD; E-RPC |
| 112 | DELETE | `/test-scenarios/fixtures/:id` | JWT + ADMIN (E-ROLE) | 200 | E-AUTH; E-ROLE; E-400; E-RPC |
| 113 | POST | `/test-scenarios/fixtures/:id/resolve` | JWT + ADMIN (E-ROLE) | 200 | E-AUTH; E-ROLE; E-400; E-RPC |
| 114 | POST | `/test-scenarios` | JWT + ADMIN (E-ROLE) | 201 | E-AUTH; E-ROLE; E-ZOD; E-RPC |
| 115 | GET | `/test-scenarios` | JWT + ADMIN (E-ROLE) | 200 | E-AUTH; E-ROLE; E-ZOD; E-RPC |
| 116 | GET | `/test-scenarios/meta` | JWT + ADMIN (E-ROLE) | 200 | E-AUTH; E-ROLE |
| 117 | GET | `/test-scenarios/stats` | JWT + ADMIN (E-ROLE) | 200 | E-AUTH; E-ROLE; E-RPC |
| 118 | GET | `/test-scenarios/:id/runs` | JWT + ADMIN (E-ROLE) | 200 | E-AUTH; E-ROLE; E-400; E-RPC |
| 119 | PATCH | `/test-scenarios/:id` | JWT + ADMIN (E-ROLE) | 200 | E-AUTH; E-ROLE; E-400; E-ZOD; E-RPC |
| 120 | DELETE | `/test-scenarios/:id` | JWT + ADMIN (E-ROLE) | 200 | E-AUTH; E-ROLE; E-400; E-RPC |
| 121 | POST | `/test-scenarios/:id/run` | JWT + ADMIN (E-ROLE) | 200 | E-AUTH; E-ROLE; E-400; E-RPC |
| 122 | POST | `/upload` | Public (anonymous) | 201 | E-500 when no file is sent (`file` undefined dereferenced); E-RPC |
| 123 | POST | `/upload/multiple` | Public (anonymous) | 201 | E-500 when no files are sent; E-RPC. Multer's own errors (for example more than 10 files) are not mapped by the gateway. |
| 124 | GET | `/upload/download` | Public (anonymous) | 200 raw binary (`application/octet-stream`, `Content-Disposition: attachment | E-RPC; E-500 if the reply has no `buffer`; `key` is written into the header unescaped |
| 125 | DELETE | `/upload/:key` | Public (anonymous; deletes stored files with no login) | 200 | E-RPC |
| 126 | GET | `/users` | JWT + Redis session (no role check; any authenticated user) | 200 | E-AUTH; E-ZOD; E-RPC |
| 127 | GET | `/users/detail-user` | JWT + Redis session (current user only) | 200 | E-AUTH; E-RPC |
| 128 | GET | `/users/get-by-field` | JWT + Redis session (no role check) | 200 | E-AUTH; E-ZOD; E-RPC |
| 129 | POST | `/users` | JWT + Redis session (no role check; any authenticated user can create any role, see Unclear) | 201 | E-AUTH; E-ZOD; E-RPC |
| 130 | PUT | `/users` | JWT + Redis session (self-update) | 200 | E-AUTH; E-ZOD (includes unknown keys such as `password`); E-RPC |
| 131 | PUT | `/users/:id` | JWT + Redis session (no role check; the route name says admin) | 200 | E-AUTH; E-ZOD; E-RPC |
| 132 | PUT | `/users/:id/status` | JWT + Redis session (no role check) | 200 | E-AUTH; E-RPC |
| 133 | DELETE | `/users/:id` | JWT + Redis session (no role check) | 200 | E-AUTH; E-RPC |
| 134 | POST | `/users/change-password` | JWT + Redis session (self only) | 200 | E-AUTH; E-ZOD; E-RPC (wrong current password, downstream status not verified) |

## 2. Route details

## App (no controller prefix) and framework routes
> Examples assume `Accept-Language: en`; with no header the gateway answers in `vi`. Codes such as `USER_NOT_FOUND` are localized by `HttpExceptionFilter`, but raw strings such as `Unauthorized ...` and `data from user failed ...` are returned as written. `RmqProducer.send` retries every downstream error, including 4xx, twice (100 ms then 200 ms backoff, 10 s per attempt), so a downstream 400 reaches the client only after 3 deliveries. The `/kafka/*` and `/health/*` routes are unauthenticated debug endpoints; routes 6 and 7 leak data (see their notes).

#### 1. GET /
- **Source:** `app.controller.ts:23` (`getHello`)
- **Auth:** JWT + Redis session (not `@Public`)
- **Request schema:** none
- **Request (sent):** `GET /` (token: tutor), none. Case: tutor token.
- **Success (real):** HTTP 200 (case: tutor token)
  ```json
  {"statusCode":200,"message":"Success","data":"Hello World!","timestamp":"2026-10-10T11:31:00.529Z","method":"GET","path":"/","correlationId":"8573e886-4639-4aa2-b4cb-ff7372751fde"}
  ```
- **Errors (real):**
  - **HTTP 401**, no token. Sent `GET /` (token: none). Real: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/","correlationId":"999dc50e-248a-41b5-b620-0db1564ab935","timestamp":"2026-10-10T11:31:00.527Z"}`
- **Downstream:** none (the JWT guard itself sends `redis.get` to THIRD_SERVICE for uncached sessions)
- **Verdict:** OK. 401 without a token and 200 with a tutor token match the doc. The session-expired 401 was not triggered (needs an expired Redis session).

#### 2. GET /kafka/emit
- **Source:** `app.controller.ts:38` (`pingMsgFromKafkaController`)
- **Auth:** Public
- **Request schema:** none
- **Request (sent):** `GET /kafka/emit` (token: none), none. Case: public emit.
- **Success (real):** HTTP 200 (case: public emit)
  ```json
  {"statusCode":200,"message":"Success","timestamp":"2026-10-10T11:31:00.532Z","method":"GET","path":"/kafka/emit","correlationId":"9f89a678-da08-4bdf-b669-4433380b68a5"}
  ```
- **Errors (real):**
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ emit `kafka.ping` → USER_SERVICE (`user_queue`), payload `123`; USER handler `kafka.ping` is a `@MessagePattern` that only logs and returns nothing
- **Verdict:** OK. 200 envelope has no `data` key, as the doc says. Side effect: one `kafka.ping` message published to user_queue.

#### 3. GET /kafka/send
- **Source:** `app.controller.ts:72` (`sendMsgFromKafkaController`)
- **Auth:** Public
- **Request schema:** none; sends a fixed test payload `{"email":"test.kafka@example.com","firstName":"Kafka","lastName":"Test","username":"kafka_test_user","role":"STUDENT","timestamp":"<now ISO>"}`
- **Request (sent):** `GET /kafka/send` (token: none), none. Case: public send (fixed payload).
- **Success (real):** HTTP 200 (case: public send (fixed payload))
  ```json
  {"statusCode":200,"message":"Success","data":{"userId":"generated-uuid-1791631860535","email":"test.kafka@example.com","fullName":"Kafka Test","username":"kafka_test_user","role":"STUDENT","processedAt":"2026-10-10T11:31:00.535Z","receivedAt":"2026-10-10T11:31:00.534Z","requestId":"1791631860534-orowm","duration":2},"timestamp":"2026-10-10T11:31:00.537Z","method":"GET","path":"/kafka/send","correlationId":"808d9470-ca02-4714-9e0f-c40adc779274"}
  ```
- **Errors (real):**
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ send `kafka.send` → USER_SERVICE. Public endpoint that triggers a user-service call with a fixed payload; the side effect is not verified.
- **Verdict:** OK. 200 with `data` from USER_SERVICE. A `test.kafka@example.com` user was not found in `users` afterwards, so the side effect is not visible in the DB.

#### 4. GET /kafka/error
- **Source:** `app.controller.ts:136` (`testMsgError`)
- **Auth:** Public
- **Request schema:** none
- **Request (sent):** `GET /kafka/error` (token: none), none. Case: public error.
- **Success (real):** not reached: no 2xx case for this route in this run (see Errors)
- **Errors (real):**
  - **HTTP 400**, public error. Sent `GET /kafka/error` (token: none). Real: `{"success":false,"statusCode":400,"message":"data from user failed ...","path":"/kafka/error","correlationId":"ad35b82b-5b7a-4def-8453-a8d97d897e94","serviceName":"user-service","timestamp":"2026-10-10T11:31:00.848Z"}`
- **Downstream:** RMQ send `kafka.user.error` → USER_SERVICE, payload `123`
- **Verdict:** OK. 400 after 3 deliveries, message and serviceName match the doc.

#### 5. GET /kafka/tutor/error
- **Source:** `app.controller.ts:152` (`testError`)
- **Auth:** Public
- **Request schema:** none
- **Request (sent):** `GET /kafka/tutor/error` (token: none), none. Case: public tutor error.
- **Success (real):** not reached: no 2xx case for this route in this run (see Errors)
- **Errors (real):**
  - **HTTP 400**, public tutor error. Sent `GET /kafka/tutor/error` (token: none). Real: `{"success":false,"statusCode":400,"message":"data from tutor failed ...","path":"/kafka/tutor/error","correlationId":"e0b9207f-84a5-4f44-b392-a0c1c35afe97","serviceName":"tutor-service","timestamp":"2026-10-10T11:31:02.079Z"}`
- **Downstream:** RMQ send `kafka.user` → USER_SERVICE (despite the "tutor" in the path), payload `123`; USER then sends `kafka.tutor` → TUTOR_SERVICE (`tutor_queue`)
- **Verdict:** OK. 400 with `serviceName` `tutor-service`, matching the doc.

#### 6. GET /health/postgres
- **Source:** `app.controller.ts:184` (`checkPostgresConnection`)
- **Auth:** Public
- **Request schema:** none
- **Request (sent):** `GET /health/postgres` (token: none), none. Case: public postgres health.
- **Success (real):** HTTP 200 (case: public postgres health)
  ```json
  {"statusCode":200,"message":"Success","data":{"connection":"postgres","status":"connected","timestamp":"2026-10-10T11:31:02.084Z","databaseStats":{"status":"healthy","database":"PostgreSQL","connection":"connected","timestamp":"2026-10-10T11:31:02.083Z","message":"Database connection is healthy","stats":{"totalUsers":6,"byRole":{"admin":1,"tutor":2,"student":2,"parent":1}},"sampleUsers":[{"id":"fd698f7a-e348-41b1-9ef0-d5a0a5acb9f7","email":"dang04223@gmail.com","username":"admin","firstName":"Admin","lastName":"Account","role":"ADMIN","isActive":true,"createdAt":"2026-10-10T09:07:03.937Z"},{"id":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","email":"chienbinhthephai@gmail.com","username":"tutor","firstName":"Tutor","lastName":"Account","role":"TUTOR","isActive":true,"createdAt":"2026-10-10T11:24:53.335Z"}]}},"timestamp":"2026-10-10T11:31:02.084Z","method":"GET","path":"/health/postgres","correlationId":"a6a31e85-ee95-45d3-ad1b-56b2973dcf27"}
  ```
- **Errors (real):**
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ send `health.postgres` `{fetchData:true}` → USER_SERVICE
- **Verdict:** BUG (leaks data). Public 200 returns `sampleUsers` (email, username, name, role) with no authentication. Two of the sample rows are shown below. Status and envelope are otherwise as documented.

#### 7. GET /health/redis
- **Source:** `app.controller.ts:232` (`checkRedisConnection`)
- **Auth:** Public
- **Request schema:** none
- **Request (sent):** `GET /health/redis` (token: none), none. Case: public redis health.
- **Success (real):** HTTP 200 (case: public redis health)
  ```json
  {"statusCode":200,"message":"Success","data":{"connection":"redis","status":"connected","timestamp":"2026-10-10T11:31:02.087Z","cacheStats":{"status":"healthy","cache":"Redis","connection":"connected","timestamp":"2026-10-10T11:31:02.086Z","message":"Redis connection is healthy","ping":"PONG","stats":{"totalKeys":4,"info":"# Memory, used_memory:1221104, used_memory_human:1.16M, used_memory_rss:13254656, used_memory_rss_human:12.64M"},"sampleKeys":"<redacted>"}},"timestamp":"2026-10-10T11:31:02.087Z","method":"GET","path":"/health/redis","correlationId":"0cc7291f-49b6-4d3d-b972-843d4243a6b0"}
  ```
- **Errors (real):**
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ send `health.redis` `{fetchData:true}` → THIRD_SERVICE (`third_queue`)
- **Verdict:** BUG (leaks data). Public 200 returns `sampleKeys` with values from live Redis keys (session and reset-password entries) with no authentication. The values are redacted in this doc and the real response is only summarised here.

## Auth (`/auth`)

#### 8. POST /auth/register
- **Source:** `features/auth/auth.controller.ts:75` (`register`)
- **Auth:** Public
- **Request schema:** body `RegisterDto` (`registerSchema`, not strict): `email` string email required; `username` string optional; `password` string 6–25 chars, must contain lowercase, uppercase, digit and special char; `firstName` string 1–25 required; `lastName` string 1–25 required
- **Request (sent):** `POST /auth/register` (token: none), case: register success:
  ```json
  {"email":"live-a-reg-1791631860@example.com","username":"livearegu1791631860","password":"Password123!","firstName":"Live","lastName":"Areg"}
  ```
- **Success (real):** HTTP 200 (case: register success)
  ```json
  {"statusCode":200,"message":"Login successful","data":{"user":{"id":"e0495a9a-9ac5-4ba6-bc65-87dc31c40131","email":"live-a-reg-1791631860@example.com","username":"livearegu1791631860","firstName":"Live","lastName":"Areg"}},"timestamp":"2026-10-10T11:31:02.154Z","method":"POST","path":"/auth/register","correlationId":"68308237-3d5f-4154-81fd-e8cfe97fc347"}
  ```
- **Errors (real):**
  - **HTTP 422**, register 422 (no uppercase, empty firstName). Sent `POST /auth/register` (token: none), body `{"email":"bad-reg@example.com","password":"password123!","firstName":"","lastName":"X"}`. Real: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"password","message":"Password must include at least one uppercase letter (A-Z)","code":"custom"},{"field":"firstName","message":"First name is required","code":"too_small"}],"path":"/auth/register","correlationId":"7389da8d-678b-46d1-848f-a20d89019f43","timestamp":"2026-10-10T11:31:02.157Z"}`
  - **HTTP 400**, register duplicate email. Sent `POST /auth/register` (token: none), body `{"email":"live-a-reg-1791631860@example.com","username":"livearegu1791631860","password":"Password123!","firstName":"Live","lastName":"Areg"}`. Real: `{"success":false,"statusCode":400,"message":"Email already exists","path":"/auth/register","correlationId":"5e3f7d81-640b-4c14-b738-c068f1cddb6c","serviceName":"user-service","timestamp":"2026-10-10T11:31:02.467Z"}`
  - **HTTP 400**, register duplicate username (new email). Sent `POST /auth/register` (token: none), body `{"email":"live-a-reg2-1791631860@example.com","username":"livearegu1791631860","password":"Password123!","firstName":"Live","lastName":"Areg"}`. Real: `{"success":false,"statusCode":400,"message":"Username already exists","path":"/auth/register","correlationId":"f5101931-eb10-403a-a0f8-9660f468cbbb","serviceName":"user-service","timestamp":"2026-10-10T11:31:02.782Z"}`
- **Downstream:** RMQ `auth.register` → USER_SERVICE
- **Verdict:** BUG (wrong message text). 200 and 422/400 cases match the doc, but the success message is the copy-pasted `Login successful`. The account is created with role TUTOR, as the doc says.

#### 9. POST /auth/login
- **Source:** `features/auth/auth.controller.ts:121` (`login`)
- **Auth:** Public
- **Request schema:** body `LoginDto` (`loginSchema`): `email` email required; `password` string with the same 6–25 char and complexity rules as register (applied on login too)
- **Request (sent):** `POST /auth/login` (token: none), case: login success (seeded tutor):
  ```json
  {"email":"chienbinhthephai@gmail.com","password":"Tutor@123456"}
  ```
- **Success (real):** HTTP 200 (case: login success (seeded tutor))
  ```json
  {"statusCode":200,"message":"Login successful","data":{"accessToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyZWZkOGFjMS0xZWRkLTQzYjEtOTg0OC1hZjFhNDJhNDY0OGEiLCJlbWFpbCI6ImNoaWVuYml...(trimmed)","refreshToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyZWZkOGFjMS0xZWRkLTQzYjEtOTg0OC1hZjFhNDJhNDY0OGEiLCJlbWFpbCI6ImNoaWVuYml...(trimmed)","user":{"id":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","email":"chienbinhthephai@gmail.com","userCode":null,"username":"tutor"}},"timestamp":"2026-10-10T11:31:02.841Z","method":"POST","path":"/auth/login","correlationId":"8ab93d66-7ff1-4b90-995e-2359dbe00284"}
  ```
  - also HTTP 200: login of register user (for USER_NO_LONGER_EXISTS probe). Sent `POST /auth/login` body `{"email":"live-a-reg-1791631860@example.com","password":"Password123!"}`. Real: `{"statusCode":200,"message":"Login successful","data":{"accessToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMDQ5NWE5YS05YWM1LTRiYTYtYmM2NS04N2RjMzFjNDAxMzEiLCJlbWFpbCI6ImxpdmUtYS1...(trimmed)","refreshToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMDQ5NWE5YS05YWM1LTRiYTYtYmM2NS04N2RjMzFjNDAxMzEiLCJlbWFpbCI6ImxpdmUtYS1...(trimmed)","user":{"id":"e0495a9a-9ac5-4ba6-bc65-87dc31c40131","email":"live-a-reg-1791631860@example.com","userCode":"E4647E","username":"livearegu1791631860"}},"timestamp":"2026-10-10T11:31:45.757Z","method":"POST","path":"/auth/login","correlationId":"aa5081e9-47dc-451b-a7b3-7bba6360cb95"}`
- **Errors (real):**
  - **HTTP 422**, login 422. Sent `POST /auth/login` (token: none), body `{"email":"not-an-email","password":"abc"}`. Real: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"email","message":"Invalid email address","code":"invalid_format"},{"field":"password","message":"Password must be at least 6 characters long","code":"too_small"}],"path":"/auth/login","correlationId":"936353b3-ab33-4019-b650-905c814ecca1","timestamp":"2026-10-10T11:31:02.845Z"}`
  - **HTTP 400**, login unknown user. Sent `POST /auth/login` (token: none), body `{"email":"live-a-nobody-1791631860@example.com","password":"Password123!"}`. Real: `{"success":false,"statusCode":400,"message":"User not found","path":"/auth/login","correlationId":"d863f63a-7df4-4100-8589-2e83d6b19b1c","serviceName":"user-service","timestamp":"2026-10-10T11:31:03.154Z"}`
  - **HTTP 400**, login wrong password (seeded tutor). Sent `POST /auth/login` (token: none), body `{"email":"chienbinhthephai@gmail.com","password":"Wrong@123"}`. Real: `{"success":false,"statusCode":400,"message":"Invalid password","path":"/auth/login","correlationId":"3dfd807b-a95a-41f9-9b25-968ffa58470c","serviceName":"user-service","timestamp":"2026-10-10T11:31:03.638Z"}`
- **Downstream:** RMQ `auth.login` → USER_SERVICE
- **Verdict:** BUG (wrong status against Swagger). Login success and 422 match, but invalid credentials return 400 (`User not found`, `Invalid password`). Swagger documents 401. The doc's 400 correction is right.

#### 10. POST /auth/login/user-code
- **Source:** `features/auth/auth.controller.ts:168` (`loginByUserCode`)
- **Auth:** Public
- **Request schema:** body `LoginByUserCodeDto` (`loginByUserCodeSchema`): `userCode` string exactly 6 chars required; `password` same rules as login; `role` enum `PARENT` | `STUDENT` required (`TUTOR` is rejected by the schema)
- **Request (sent):** `POST /auth/login/user-code` (token: none), case: user-code login success (test student, userCode LIVEA2):
  ```json
  {"userCode":"LIVEA2","password":"Student@88","role":"STUDENT"}
  ```
- **Success (real):** HTTP 200 (case: user-code login success (test student, userCode LIVEA2))
  ```json
  {"statusCode":200,"message":"Login successful","data":{"accessToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxZDllZmUzNS0wNGQ0LTRmYmEtYmY3YS02MjhjZTE1OWEzNTMiLCJlbWFpbCI6ImxpdmUtYS1...(trimmed)","refreshToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxZDllZmUzNS0wNGQ0LTRmYmEtYmY3YS02MjhjZTE1OWEzNTMiLCJlbWFpbCI6ImxpdmUtYS1...(trimmed)","user":{"id":"1d9efe35-04d4-4fba-bf7a-628ce159a353","email":"live-a-uc-1791631860@example.com","userCode":"LIVEA2","username":"uc1791631860livea"}},"timestamp":"2026-10-10T11:31:04.151Z","method":"POST","path":"/auth/login/user-code","correlationId":"d1fc0363-0ae6-40db-a4b5-b073f317f232"}
  ```
- **Errors (real):**
  - **HTTP 400**, seeded student ABC123 (DB userCode is null, expect USER_NOT_FOUND). Sent `POST /auth/login/user-code` (token: none), body `{"userCode":"ABC123","password":"Student@123456","role":"STUDENT"}`. Real: `{"success":false,"statusCode":400,"message":"User not found","path":"/auth/login/user-code","correlationId":"88cd37fe-4aa7-4de3-bdb9-2aca4540ba3b","serviceName":"user-service","timestamp":"2026-10-10T11:31:03.950Z"}`
  - **HTTP 422**, user-code 422 (short code, TUTOR role). Sent `POST /auth/login/user-code` (token: none), body `{"userCode":"ABC","password":"Student@123456","role":"TUTOR"}`. Real: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"userCode","message":"User code must be 6 characters","code":"too_small"},{"field":"role","message":"Invalid option: expected one of \"PARENT\"|\"STUDENT\"","code":"invalid_value"}],"path":"/auth/login/user-code","correlationId":"828d1a0b-dbc9-4a97-b903-e9019ea37d12","timestamp":"2026-10-10T11:31:04.154Z"}`
  - **HTTP 400**, user-code unknown code. Sent `POST /auth/login/user-code` (token: none), body `{"userCode":"ZZZ999","password":"Student@123456","role":"STUDENT"}`. Real: `{"success":false,"statusCode":400,"message":"User not found","path":"/auth/login/user-code","correlationId":"d4d899f4-db51-4254-9827-03027a1f944a","serviceName":"user-service","timestamp":"2026-10-10T11:31:04.465Z"}`
  - **HTTP 400**, user-code wrong password. Sent `POST /auth/login/user-code` (token: none), body `{"userCode":"LIVEA2","password":"Wrong@123","role":"STUDENT"}`. Real: `{"success":false,"statusCode":400,"message":"Invalid password","path":"/auth/login/user-code","correlationId":"55f53383-cbab-490c-aaca-175e733b2181","serviceName":"user-service","timestamp":"2026-10-10T11:31:04.934Z"}`
  - **HTTP 400**, user-code role mismatch (TUTOR role for STUDENT code). Sent `POST /auth/login/user-code` (token: none), body `{"userCode":"LIVEA2","password":"Student@88","role":"PARENT"}`. Real: `{"success":false,"statusCode":400,"message":"User not found","path":"/auth/login/user-code","correlationId":"b20e58fd-d89e-4526-82a4-2888a464a475","serviceName":"user-service","timestamp":"2026-10-10T11:31:05.247Z"}`
- **Downstream:** RMQ `auth.loginByUserCode` → USER_SERVICE
- **Verdict:** BUG (wrong status against Swagger, same as route 9). Success path works with a test STUDENT that has a userCode. The seeded STUDENT `student@finance.dev` has `userCode` NULL in the DB, so `ABC123` from the seeding notes does not log in (400 `User not found`).

#### 11. POST /auth/refresh
- **Source:** `features/auth/auth.controller.ts:194` (`refresh`)
- **Auth:** Public
- **Request schema:** body `{refreshToken: string min 1 required}`
- **Request (sent):** `POST /auth/refresh` (token: none), case: refresh success:
  ```json
  {"refreshToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyZWZkOGFjMS0...(trimmed, 259 chars)"}
  ```
- **Success (real):** HTTP 200 (case: refresh success)
  ```json
  {"statusCode":200,"message":"Token refreshed","data":{"accessToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyZWZkOGFjMS0xZWRkLTQzYjEtOTg0OC1hZjFhNDJhNDY0OGEiLCJlbWFpbCI6ImNoaWVuYml...(trimmed)","refreshToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyZWZkOGFjMS0xZWRkLTQzYjEtOTg0OC1hZjFhNDJhNDY0OGEiLCJlbWFpbCI6ImNoaWVuYml...(trimmed)","user":{"id":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","email":"chienbinhthephai@gmail.com","userCode":null,"username":"tutor"}},"timestamp":"2026-10-10T11:31:05.251Z","method":"POST","path":"/auth/refresh","correlationId":"bd774038-7fc0-441f-82f1-414b8b10a77a"}
  ```
- **Errors (real):**
  - **HTTP 422**, refresh 422 (empty). Sent `POST /auth/refresh` (token: none), body `{"refreshToken":""}`. Real: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"refreshToken","message":"Refresh token is required","code":"too_small"}],"path":"/auth/refresh","correlationId":"71c4c421-0084-4fa3-a4d2-1ca9288ca6e7","timestamp":"2026-10-10T11:31:05.253Z"}`
  - **HTTP 401**, refresh invalid token. Sent `POST /auth/refresh` (token: none), body `{"refreshToken":"abc.def.ghi"}`. Real: `{"success":false,"statusCode":401,"message":"Invalid or expired refresh token","path":"/auth/refresh","correlationId":"d6286a59-d1ef-45f1-81a2-49e6ee81d8e4","serviceName":"user-service","timestamp":"2026-10-10T11:31:05.565Z"}`
  - **HTTP 401**, refresh with token of deleted user. Sent `POST /auth/refresh` (token: none), body `{"refreshToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMDQ5NWE5YS0...(trimmed, 268 chars)"}`. Real: `{"success":false,"statusCode":401,"message":"User no longer exists","path":"/auth/refresh","correlationId":"454d1277-a585-43e4-84ee-0954a4ef20b7","serviceName":"user-service","timestamp":"2026-10-10T11:31:46.076Z"}`
- **Downstream:** RMQ `auth.refresh` → USER_SERVICE
- **Verdict:** OK. 200, 422 and 401 `Invalid or expired refresh token` match. The `User no longer exists` 401 was reproduced by refreshing with the token of a deleted test user.

#### 12. POST /auth/forgot-password
- **Source:** `features/auth/auth.controller.ts:216` (`forgotPassword`)
- **Auth:** Public
- **Request schema:** body `{email: email required}`
- **Request (sent):** `POST /auth/forgot-password` (token: none), case: forgot-password 422 (invalid email):
  ```json
  {"email":"not-an-email"}
  ```
- **Success (real):** not reached: no 2xx case for this route in this run (see Errors)
- **Errors (real):**
  - **HTTP 422**, forgot-password 422 (invalid email). Sent `POST /auth/forgot-password` (token: none), body `{"email":"not-an-email"}`. Real: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"email","message":"Invalid email address","code":"invalid_format"}],"path":"/auth/forgot-password","correlationId":"14758e3c-b02d-4337-bf21-b3eceda9b597","timestamp":"2026-10-10T11:31:05.567Z"}`
  - **HTTP 400**, forgot-password unknown email (no mail sent). Sent `POST /auth/forgot-password` (token: none), body `{"email":"live-a-nobody-1791631860@example.com"}`. Real: `{"success":false,"statusCode":400,"message":"User not found","path":"/auth/forgot-password","correlationId":"94d9becf-d14e-49b1-8b9f-167db158279d","serviceName":"user-service","timestamp":"2026-10-10T11:31:05.879Z"}`
  - **NOT EXECUTED: sends external email**, success with existing email. Real: `"NOT EXECUTED: sends external email (requires a real existing email; not run)"`
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ `auth.forgotPassword` → USER_SERVICE, which then sends `redis.set` (`reset-password:{jti}`, TTL 300 s) and `email.sendForgotPasswordMail` to THIRD_SERVICE
- **Verdict:** NOT EXECUTED for the 200 path (sends external email, real existing address required). The 422 and 400 `User not found` responses were run and match the doc. The 400 response reveals whether an account exists.

#### 13. POST /auth/reset-password
- **Source:** `features/auth/auth.controller.ts:254` (`resetPassword`)
- **Auth:** JWT + Redis session (Bearer required, although the handler is not `@Public`)
- **Request schema:** body `ResetPasswordDto` (`resetPasswordSchema`): `jti` uuid string required; `password` same complexity rules; `newPassword` accepted as an alias for `password`; `confirmPassword` string 6–25 required, must equal `password` (422 on mismatch)
- **Request (sent):** `POST /auth/reset-password` (token: none), case: reset-password no token:
  ```json
  {"jti":"550e8400-e29b-41d4-a716-446655440000","password":"NewPass123!","confirmPassword":"NewPass123!"}
  ```
- **Success (real):** not reached: no 2xx case for this route in this run (see Errors)
- **Errors (real):**
  - **HTTP 401**, reset-password no token. Sent `POST /auth/reset-password` (token: none), body `{"jti":"550e8400-e29b-41d4-a716-446655440000","password":"NewPass123!","confirmPassword":"NewPass123!"}`. Real: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/auth/reset-password","correlationId":"994002e5-f87e-439a-9821-a10dcef1be6d","timestamp":"2026-10-10T11:31:05.881Z"}`
  - **HTTP 422**, reset-password mismatch. Sent `POST /auth/reset-password` (token: tutor), body `{"jti":"550e8400-e29b-41d4-a716-446655440000","password":"NewPass123!","confirmPassword":"Other123!"}`. Real: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"confirmPassword","message":"Confirm password must be the same as password","code":"custom"}],"path":"/auth/reset-password","correlationId":"67d34afa-2ca8-48d1-9bae-8a57b25863be","timestamp":"2026-10-10T11:31:05.883Z"}`
  - **HTTP 422**, reset-password invalid jti. Sent `POST /auth/reset-password` (token: tutor), body `{"jti":"not-a-uuid","password":"NewPass123!","confirmPassword":"NewPass123!"}`. Real: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"jti","message":"Invalid reset password token","code":"invalid_format"}],"path":"/auth/reset-password","correlationId":"17c39982-e5ba-43a6-99f3-0301c7d71390","timestamp":"2026-10-10T11:31:05.884Z"}`
  - **HTTP 400**, reset-password unknown token (not in Redis). Sent `POST /auth/reset-password` (token: tutor), body `{"jti":"550e8400-e29b-41d4-a716-446655440000","password":"NewPass123!","confirmPassword":"NewPass123!"}`. Real: `{"success":false,"statusCode":400,"message":"Invalid reset password token","path":"/auth/reset-password","correlationId":"00a71065-63b7-4da1-85bb-113c379390a4","serviceName":"user-service","timestamp":"2026-10-10T11:31:06.199Z"}`
  - **NOT EXECUTED: needs a real reset token from email (sends external email)**, success with a real reset token. Real: `"NOT EXECUTED: needs a real reset token from forgot-password mail"`
- **Downstream:** RMQ `auth.resetPassword` → USER_SERVICE, which calls `redis.get` on THIRD_SERVICE, then updates the password
- **Verdict:** NOT EXECUTED for the 200 path (needs a real reset token that is only sent by email). The 401, 422 mismatch, 422 invalid jti and 400 invalid-token responses were run and match the doc.

#### 14. GET /auth/google
- **Source:** `features/auth/auth.controller.ts:269` (`googleAuth`)
- **Auth:** Public
- **Request schema:** none; Passport `AuthGuard('google')` redirects
- **Request (sent):** `GET /auth/google` (token: none), none. Case: google redirect (not followed).
- **Success (real):** not reached: no 2xx case for this route in this run (see Errors)
- **Errors (real):**
  - **HTTP 302**, google redirect (not followed). Sent `GET /auth/google` (token: none). Real: `{"http_status":302,"location_host":"accounts.google.com","location_path":"/o/oauth2/v2/auth","body":""}`
- **Downstream:** Passport Google strategy (`packages/strategy/google.strategy.ts`); no RMQ call
- **Verdict:** OK. 302 to accounts.google.com `/o/oauth2/v2/auth`. Redirect not followed.

#### 15. GET /auth/google/callback
- **Source:** `features/auth/auth.controller.ts:284` (`googleAuthCallback`)
- **Auth:** Public (Passport `AuthGuard('google')` validates the OAuth code)
- **Request schema:** query params from Google (handled by Passport); `req.user` is `GoogleProfile`
- **Request (sent):** `GET /auth/google/callback` (token: none), none. Case: google callback without OAuth code.
- **Success (real):** not reached: no 2xx case for this route in this run (see Errors)
- **Errors (real):**
  - **HTTP 302**, google callback without OAuth code. Sent `GET /auth/google/callback` (token: none). Real: `{"http_status":302,"location_host":"accounts.google.com","location_path":"/o/oauth2/v2/auth","body":""}`
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ `auth.googleLogin` → USER_SERVICE (passes the profile)
- **Verdict:** NOT EXECUTED for the real OAuth success path (needs Google consent). Without a code the probe returned 302 back to Google's consent page, not a 4xx. The doc's `Passport failures (shape not verified)` note still applies.

#### 16. GET /auth/facebook
- **Source:** `features/auth/auth.controller.ts:312` (`facebookAuth`)
- **Auth:** Public
- **Request schema:** none; Passport `AuthGuard('facebook')` redirects
- **Request (sent):** `GET /auth/facebook` (token: none), none. Case: facebook redirect (not followed).
- **Success (real):** not reached: no 2xx case for this route in this run (see Errors)
- **Errors (real):**
  - **HTTP 302**, facebook redirect (not followed). Sent `GET /auth/facebook` (token: none). Real: `{"http_status":302,"location_host":"www.facebook.com","location_path":"/v3.2/dialog/oauth","body":""}`
- **Downstream:** Passport Facebook strategy (`packages/strategy/facebook.strategy.ts`); no RMQ call
- **Verdict:** OK. 302 to www.facebook.com `/v3.2/dialog/oauth`. Redirect not followed.

#### 17. GET /auth/facebook/callback
- **Source:** `features/auth/auth.controller.ts:328` (`facebookAuthCallback`)
- **Auth:** Public (Passport `AuthGuard('facebook')`)
- **Request schema:** Facebook OAuth query params (Passport); `req.user` is `FacebookProfile`
- **Request (sent):** `GET /auth/facebook/callback` (token: none), none. Case: facebook callback without OAuth code.
- **Success (real):** not reached: no 2xx case for this route in this run (see Errors)
- **Errors (real):**
  - **HTTP 302**, facebook callback without OAuth code. Sent `GET /auth/facebook/callback` (token: none). Real: `{"http_status":302,"location_host":"www.facebook.com","location_path":"/v3.2/dialog/oauth","body":""}`
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ `auth.facebookLogin` → USER_SERVICE
- **Verdict:** NOT EXECUTED for the real OAuth success path (needs Facebook consent). Without a code the probe returned 302 back to Facebook's dialog, not a 4xx.

## Admin (`/admin`, class-level `RolesGuard` + `@Roles('ADMIN')`)
_Message strings below are shown in English (`Accept-Language: en`). The gateway default language is Vietnamese (`vi`), so the same codes localize differently. Timestamps and correlation IDs are placeholders._

#### 18. POST /admin/tutors
- **Source:** `features/admin/admin.controller.ts:121` (`createTutor`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request schema:** body `CreateManagedUserDto` (`createManagedUserSchema`, `.strict()`): `email` required email; `password` string 6–20 required (complexity enforced only when length is 8–14); `firstName` trimmed 2–100 required; `lastName` trimmed 2–100 required; `username` 1–50 optional; `phone` ≤20 optional; `gender` MALE|FEMALE|OTHER optional; `dateOfBirth` coerced date optional; `school` ≤255 optional; `subjects` string[] ≤20 optional; `description` ≤5000 optional; `isActive` boolean default true. Unknown keys (including `role`) are a 422.
- **Request (sent):** `POST /admin/tutors` (token: admin), case: create success:
  ```json
  {"email":"live-a-tut-1791631860@example.com","password":"Tutor@2026","firstName":"Livea","lastName":"Tut1791631860","username":"liveatut1791631860","phone":"0912345678"}
  ```
- **Success (real):** HTTP 201 (case: create success)
  ```json
  {"statusCode":201,"message":"Success","data":{"message":"User created successfully","data":{"email":"live-a-tut-1791631860@example.com","fullName":"Livea Tut1791631860","password":"$2b$10$7iY0VAb5pQlV2Ld4zXg7OuAcSgHP2RJyLNJgLMpuiwxqnOASFfY3."}},"timestamp":"2026-10-10T11:31:06.267Z","method":"POST","path":"/admin/tutors","correlationId":"4a01bf56-8387-4fc0-b1a3-060a3a26f294"}
  ```
- **Errors (real):**
  - **HTTP 401**, 401 no token. Sent `POST /admin/tutors` (token: none), body `{"email":"live-a-tut-1791631860@example.com","password":"Tutor@2026","firstName":"Livea","lastName":"Tut1791631860","username":"liveatut1791631860","phone":"0912345678"}`. Real: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/admin/tutors","correlationId":"1bbeae69-de0c-4fb2-b1a3-2471c783908d","timestamp":"2026-10-10T11:31:06.268Z"}`
  - **HTTP 403**, 403 student token. Sent `POST /admin/tutors` (token: student), body `{"email":"live-a-tut-1791631860@example.com","password":"Tutor@2026","firstName":"Livea","lastName":"Tut1791631860","username":"liveatut1791631860","phone":"0912345678"}`. Real: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/admin/tutors","correlationId":"aecbb726-90e5-4bdf-b5f8-fa0b0bd091f4","timestamp":"2026-10-10T11:31:06.269Z"}`
  - **HTTP 422**, 422 bad email + role key. Sent `POST /admin/tutors` (token: admin), body `{"email":"not-an-email","password":"Tutor@2026","firstName":"Ab","lastName":"Cd","role":"ADMIN"}`. Real: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"email","message":"Invalid email address","code":"invalid_format"},{"field":"","message":"Unrecognized key: \"role\"","code":"unrecognized_keys"}],"path":"/admin/tutors","correlationId":"586c3bf7-8825-48fe-944a-6282c1763eab","timestamp":"2026-10-10T11:31:06.270Z"}`
  - **HTTP 400**, 400 duplicate email. Sent `POST /admin/tutors` (token: admin), body `{"email":"live-a-tut-1791631860@example.com","password":"Tutor@2026","firstName":"Livea","lastName":"Tut1791631860","username":"liveatut1791631860","phone":"0912345678"}`. Real: `{"success":false,"statusCode":400,"message":"Email already exists: live-a-tut-1791631860@example.com","path":"/admin/tutors","correlationId":"29ff663b-3f37-474c-a151-6c5b5b4eed5d","serviceName":"user-service","timestamp":"2026-10-10T11:31:06.582Z"}`
  - **HTTP 400**, 400 duplicate username (new email). Sent `POST /admin/tutors` (token: admin), body `{"email":"live-a-tut2-1791631860@example.com","password":"Tutor@2026","firstName":"Livea","lastName":"Tut","username":"liveatut1791631860"}`. Real: `{"success":false,"statusCode":400,"message":"Username already exists: liveatut1791631860","path":"/admin/tutors","correlationId":"20e62beb-6267-4227-ba9d-7ee137ecf4c9","serviceName":"user-service","timestamp":"2026-10-10T11:31:06.894Z"}`
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ `user.createUser` → USER_SERVICE (`user.rpc.controller.ts` → `createUserService`). Verified: only `email`, `username` (generated from last+first name when omitted), `firstName`, `lastName`, `password` (hashed) and `role` are persisted. `role` defaults to `STUDENT` because the gateway sends none, so this endpoint creates STUDENT accounts despite the `/admin/tutors` path. `userCode` is generated only for TUTOR, so these accounts get none. `phone`, `gender`, `dateOfBirth`, `school`, `subjects`, `description` and `isActive` pass validation but are not saved. The gateway retries 3 times and the create is not idempotent: if the first attempt commits and times out, the retry returns 400 `Email already exists`.
- **Verdict:** BUG (leaks data; wrong role). The endpoint creates the account as STUDENT (`role` STUDENT in the list row), not a tutor. The 201 response returns the bcrypt `password` hash. The 400/422/401/403 cases match the doc.

#### 19. GET /admin/tutors
- **Source:** `features/admin/admin.controller.ts:138` (`listTutors`)
- **Auth:** JWT + ADMIN
- **Request schema:** query `ListManagedUsersQueryDto`: `page` int ≥1 default 1; `limit` 1–100 default 10; `search` trimmed string optional; `isActive` `'true'|'false'` optional
- **Request (sent):** `GET /admin/tutors?page=1&limit=10&search=live-a-tut-1791631860` (token: admin), none. Case: list success.
- **Success (real):** HTTP 200 (case: list success)
  ```json
  {"statusCode":200,"message":"Success","data":{"data":[{"id":"24a9306c-d9c9-442f-88c7-546c176c55b9","email":"live-a-tut-1791631860@example.com","name":"Livea Tut1791631860","role":"STUDENT","status":"active","createdAt":"2026-10-10T11:31:06.259Z"}],"pagination":{"page":1,"pageSize":10,"total":1,"totalPages":1}},"timestamp":"2026-10-10T11:31:06.898Z","method":"GET","path":"/admin/tutors?page=1&limit=10&search=live-a-tut-1791631860","correlationId":"d4ed0fae-0981-416f-9864-7d5bc853e555"}
  ```
- **Errors (real):**
  - **HTTP 422**, 422 isActive=yes. Sent `GET /admin/tutors?isActive=yes` (token: admin). Real: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"isActive","message":"Invalid option: expected one of \"true\"|\"false\"","code":"invalid_value"}],"path":"/admin/tutors?isActive=yes","correlationId":"7fda2dfc-eab3-4343-b06f-e8c89b97f2f2","timestamp":"2026-10-10T11:31:06.900Z"}`
  - **HTTP 401**, 401 no token. Sent `GET /admin/tutors` (token: none). Real: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/admin/tutors","correlationId":"2ab37609-dad5-4b3c-8096-404ad1f51d47","timestamp":"2026-10-10T11:31:06.901Z"}`
  - **HTTP 403**, 403 student token. Sent `GET /admin/tutors` (token: student). Real: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/admin/tutors","correlationId":"69616aa9-7192-4309-b2a6-11a39076cddb","timestamp":"2026-10-10T11:31:06.901Z"}`
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ `user.getUsers` → USER_SERVICE (`getUsersService`). No role filter is sent, so the list includes every user that matches `search`/`isActive`, not only tutors (see Unclear).
- **Verdict:** BUG (scope). Shape matches the doc, but the list is not filtered to tutors: the handler sends no role filter, so it returns every role (the test row shows the STUDENT account created by route 18).

#### 20. GET /admin/tutors/:id
- **Source:** `features/admin/admin.controller.ts:151` (`getTutor`)
- **Auth:** JWT + ADMIN
- **Request schema:** path `id` (string, no UUID pipe)
- **Request (sent):** `GET /admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9` (token: admin), none. Case: get by id (bug path).
- **Success (real):** not reached: no 2xx case for this route in this run (see Errors)
- **Errors (real):**
  - **HTTP 400**, get by id (bug path). Sent `GET /admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9` (token: admin). Real: `{"success":false,"statusCode":400,"message":"Unsupported field: undefined","path":"/admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9","correlationId":"a1722d33-eba1-4852-9993-1e0f35dc0473","serviceName":"user-service","timestamp":"2026-10-10T11:31:07.257Z"}`
  - **HTTP 401**, 401 no token. Sent `GET /admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9` (token: none). Real: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9","correlationId":"e84432a3-e17c-4bee-8f4a-37206aa51864","timestamp":"2026-10-10T11:31:07.259Z"}`
  - **HTTP 403**, 403 student token. Sent `GET /admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9` (token: student). Real: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9","correlationId":"b1089361-b583-4322-9e2e-b962bf8eb442","timestamp":"2026-10-10T11:31:07.260Z"}`
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ `user.getUserByField` `{id}` → USER_SERVICE (`getUserByField`). `field` is undefined, so the handler throws `UNSUPPORTED_FIELD: undefined`. Once that is fixed, the response includes the bcrypt `password` because this path does not strip it (`getDetailUserService` does).
- **Verdict:** BUG (every call fails). 400 `Unsupported field: undefined` for every real id, because the gateway sends `{id}` but USER expects `{field, value}`. Success path never reached.

#### 21. PUT /admin/tutors/:id
- **Source:** `features/admin/admin.controller.ts:161` (`updateTutor`)
- **Auth:** JWT + ADMIN
- **Request schema:** path `id`; body `UpdateManagedUserDto` (`updateManagedUserSchema`, `.strict()`, all optional): `email`, `username` (1–50), `firstName`/`lastName` (2–100), `phone` (≤20, nullable), `gender` (nullable), `dateOfBirth` (nullable), `school` ≤255 (nullable), `subjects` string[] ≤20 (nullable), `description` ≤5000 (nullable), `avatar` URL (nullable), `isActive` boolean. Unknown keys are a 422.
- **Request (sent):** `PUT /admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9` (token: admin), case: update success:
  ```json
  {"firstName":"Livea","lastName":"Tut1791631860","phone":"0912345678","school":"Test school","description":"live test","isActive":true}
  ```
- **Success (real):** HTTP 200 (case: update success)
  ```json
  {"statusCode":200,"message":"Success","data":{"id":"24a9306c-d9c9-442f-88c7-546c176c55b9","email":"live-a-tut-1791631860@example.com","username":"liveatut1791631860","firstName":"Livea","lastName":"Tut1791631860","password":"$2b$10$7iY0VAb5pQlV2Ld4zXg7OuAcSgHP2RJyLNJgLMpuiwxqnOASFfY3.","avatar":null,"phone":"0912345678","isActive":true,"role":"STUDENT","description":"live test","userCode":null,"gender":null,"dateOfBirth":null,"address":null,"district":null,"province":null,"subjects":null,"facebookId":null,"googleId":null,"school":"Test school","relationship":null,"gradesId":[],"parentId":null,"tutorId":null,"createdAt":"2026-10-10T11:31:06.259Z","updatedAt":"2026-10-10T11:31:07.263Z"},"timestamp":"2026-10-10T11:31:07.269Z","method":"PUT","path":"/admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9","correlationId":"d86e7774-1721-4363-ba12-d99a60736ed9"}
  ```
- **Errors (real):**
  - **HTTP 422**, 422 password key. Sent `PUT /admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9` (token: admin), body `{"password":"Tutor@2026"}`. Real: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"","message":"Unrecognized key: \"password\"","code":"unrecognized_keys"}],"path":"/admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9","correlationId":"8cb2dace-f504-4b5d-b3d8-877cf4e704b5","timestamp":"2026-10-10T11:31:07.272Z"}`
  - **HTTP 400**, 400 non-uuid id. Sent `PUT /admin/tutors/abc` (token: admin), body `{"firstName":"Livea"}`. Real: `{"success":false,"statusCode":400,"message":"User Id must be uuid","path":"/admin/tutors/abc","correlationId":"3bf3c0a4-9698-4be3-b85c-100e7a805171","serviceName":"user-service","timestamp":"2026-10-10T11:31:07.580Z"}`
  - **HTTP 400**, 400 unknown uuid. Sent `PUT /admin/tutors/00000000-0000-4000-8000-000000000000` (token: admin), body `{"firstName":"Livea"}`. Real: `{"success":false,"statusCode":400,"message":"User not found","path":"/admin/tutors/00000000-0000-4000-8000-000000000000","correlationId":"984b2717-7767-4997-b88e-1d2617558ab6","serviceName":"user-service","timestamp":"2026-10-10T11:31:07.891Z"}`
  - **HTTP 401**, 401 no token. Sent `PUT /admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9` (token: none), body `{"firstName":"Livea"}`. Real: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9","correlationId":"4575700c-eb0d-4782-91f9-fd305707e4bf","timestamp":"2026-10-10T11:31:07.893Z"}`
  - **HTTP 403**, 403 student token. Sent `PUT /admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9` (token: student), body `{"firstName":"Livea"}`. Real: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9","correlationId":"8009532c-cc10-4dec-a118-fb6c8733a49c","timestamp":"2026-10-10T11:31:07.894Z"}`
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ `user.updateUserByAdmin` `{id, ...dto}` → USER_SERVICE (`updateUserService`). It checks existence first (400 `User not found`), then `UPDATE ... RETURNING *`, so the password hash is returned. `subjects` is `string[]` in the DTO but `users.subjects` is `varchar(255)` in the USER schema. An array value will likely fail at the DB with a 500 (not run).
- **Verdict:** BUG (leaks data). 200 returns the full `users` row including the bcrypt `password` hash. The 422 message for an extra `password` key is `Unrecognized key: "password"`, which differs from the doc text. Missing-user and non-uuid 400s match.

#### 22. DELETE /admin/tutors/:id
- **Source:** `features/admin/admin.controller.ts:173` (`deleteTutor`)
- **Auth:** JWT + ADMIN
- **Request schema:** path `id` (none in body)
- **Request (sent):** `DELETE /admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9` (token: admin), none. Case: delete success.
- **Success (real):** HTTP 200 (case: delete success)
  ```json
  {"statusCode":200,"message":"Success","data":{"id":"24a9306c-d9c9-442f-88c7-546c176c55b9"},"timestamp":"2026-10-10T11:31:07.908Z","method":"DELETE","path":"/admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9","correlationId":"ffdc6eaa-19bf-4f76-a08f-ce6c24bf74ba"}
  ```
  - also HTTP 200: cleanup: delete register-test user via admin (test account). Sent `DELETE /admin/tutors/e0495a9a-9ac5-4ba6-bc65-87dc31c40131` body `none`. Real: `{"statusCode":200,"message":"Success","data":{"id":"e0495a9a-9ac5-4ba6-bc65-87dc31c40131"},"timestamp":"2026-10-10T11:31:45.763Z","method":"DELETE","path":"/admin/tutors/e0495a9a-9ac5-4ba6-bc65-87dc31c40131","correlationId":"59ab9219-135d-4917-85b6-fbdb253d117f"}`
- **Errors (real):**
  - **HTTP 403**, 403 student token (before delete). Sent `DELETE /admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9` (token: student). Real: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9","correlationId":"41f9a8dd-ae27-40ee-bc40-c080cb654486","timestamp":"2026-10-10T11:31:07.895Z"}`
  - **HTTP 401**, 401 no token. Sent `DELETE /admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9` (token: none). Real: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9","correlationId":"ee416713-5b22-46e3-bb90-f4070bb387fa","timestamp":"2026-10-10T11:31:07.896Z"}`
  - **HTTP 400**, delete again (already deleted). Sent `DELETE /admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9` (token: admin). Real: `{"success":false,"statusCode":400,"message":"User not found","path":"/admin/tutors/24a9306c-d9c9-442f-88c7-546c176c55b9","correlationId":"a28a3c05-ee0d-4ca7-868e-e8d145452a5d","serviceName":"user-service","timestamp":"2026-10-10T11:31:08.220Z"}`
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ `user.deleteUserByAdmin` `{id}` → USER_SERVICE (`deleteUserByAdminService`). Hard delete. The `users.tutorId` and `users.parentId` foreign keys are `onDelete: cascade`, so deleting a tutor also deletes every student whose `tutorId` points to it. Attendance rows are also removed through their student FK. Retries are not idempotent: a retry after a successful delete returns 400 `User not found`.
- **Verdict:** OK. 200 `{id}`, second delete 400 `User not found`, 401 and 403 match the doc.

#### 23. POST /admin/students
- **Source:** `features/admin/admin.controller.ts:186` (`createStudent`)
- **Auth:** JWT + ADMIN
- **Request schema:** same body as #18 (`createManagedUserSchema`, strict). The gateway sends no role.
- **Request (sent):** `POST /admin/students` (token: admin), case: create success:
  ```json
  {"email":"live-a-stu-1791631860@example.com","password":"Student@88","firstName":"Livea","lastName":"Stu1791631860","username":"liveastu1791631860"}
  ```
- **Success (real):** HTTP 201 (case: create success)
  ```json
  {"statusCode":201,"message":"Success","data":{"message":"User created successfully","data":{"email":"live-a-stu-1791631860@example.com","fullName":"Livea Stu1791631860","password":"$2b$10$CrBan5Ez9MQf6ecKn70CS.QPsYrhc0lUns7KqkyICXBGS3MMuaYJ6"}},"timestamp":"2026-10-10T11:31:08.283Z","method":"POST","path":"/admin/students","correlationId":"ead6a29c-ee2f-4f49-99a3-8d8e70252fa6"}
  ```
- **Errors (real):**
  - **HTTP 401**, 401 no token. Sent `POST /admin/students` (token: none), body `{"email":"live-a-stu-1791631860@example.com","password":"Student@88","firstName":"Livea","lastName":"Stu1791631860","username":"liveastu1791631860"}`. Real: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/admin/students","correlationId":"7cb0783b-6d80-4585-964d-d64de141fe1c","timestamp":"2026-10-10T11:31:08.284Z"}`
  - **HTTP 403**, 403 student token. Sent `POST /admin/students` (token: student), body `{"email":"live-a-stu-1791631860@example.com","password":"Student@88","firstName":"Livea","lastName":"Stu1791631860","username":"liveastu1791631860"}`. Real: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/admin/students","correlationId":"7dd5a8e0-2b55-4d33-a18b-33f2808ce33c","timestamp":"2026-10-10T11:31:08.285Z"}`
  - **HTTP 422**, 422 password 8-14 chars without special. Sent `POST /admin/students` (token: admin), body `{"email":"live-a-stu2-1791631860@example.com","password":"Student88","firstName":"Livea","lastName":"Stu"}`. Real: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"password","message":"Password must include at least one special character","code":"custom"}],"path":"/admin/students","correlationId":"1a7d5006-4d96-4728-8138-a3ed52bfab50","timestamp":"2026-10-10T11:31:08.287Z"}`
  - **HTTP 400**, 400 duplicate email. Sent `POST /admin/students` (token: admin), body `{"email":"live-a-stu-1791631860@example.com","password":"Student@88","firstName":"Livea","lastName":"Stu1791631860","username":"liveastu1791631860"}`. Real: `{"success":false,"statusCode":400,"message":"Email already exists: live-a-stu-1791631860@example.com","path":"/admin/students","correlationId":"45522ea4-839a-404b-92c1-4998431033f3","serviceName":"user-service","timestamp":"2026-10-10T11:31:08.599Z"}`
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ `user.createUser` → USER_SERVICE (same persistence rules as #18). The `STUDENT` default matches this endpoint. `phone`, `gender`, `dateOfBirth`, `school`, `subjects`, `description` and `isActive` are validated but not saved. The retry hazard on duplicate create is the same as #18.
- **Verdict:** BUG (leaks data). 201 returns the bcrypt `password` hash (same as route 18). Other cases match the doc.

#### 24. GET /admin/students
- **Source:** `features/admin/admin.controller.ts:206` (`listStudents`)
- **Auth:** JWT + ADMIN
- **Request schema:** query same as #19
- **Request (sent):** `GET /admin/students?page=1&limit=20&search=live-a-stu-1791631860` (token: admin), none. Case: list success.
- **Success (real):** HTTP 200 (case: list success)
  ```json
  {"statusCode":200,"message":"Success","data":{"data":[{"id":"034c0f83-ac79-4778-bcd9-abca7b0a923e","email":"live-a-stu-1791631860@example.com","name":"Livea Stu1791631860","role":"STUDENT","status":"active","createdAt":"2026-10-10T11:31:08.276Z"}],"pagination":{"page":1,"pageSize":20,"total":1,"totalPages":1}},"timestamp":"2026-10-10T11:31:08.603Z","method":"GET","path":"/admin/students?page=1&limit=20&search=live-a-stu-1791631860","correlationId":"87d99343-a08e-40ec-a2ea-a1969bb1e9b6"}
  ```
- **Errors (real):**
  - **HTTP 422**, 422 limit=0. Sent `GET /admin/students?limit=0` (token: admin). Real: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"limit","message":"Too small: expected number to be >=1","code":"too_small"}],"path":"/admin/students?limit=0","correlationId":"709f60b6-60f7-4414-b34b-5fd248e163c3","timestamp":"2026-10-10T11:31:08.605Z"}`
  - **HTTP 401**, 401 no token. Sent `GET /admin/students` (token: none). Real: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/admin/students","correlationId":"8c85b0ca-e69e-494a-bccd-75b98830054e","timestamp":"2026-10-10T11:31:08.606Z"}`
  - **HTTP 403**, 403 student token. Sent `GET /admin/students` (token: student). Real: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/admin/students","correlationId":"efc448ca-e3be-4b66-8074-941dc4e02390","timestamp":"2026-10-10T11:31:08.607Z"}`
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ `user.getUsers` → USER_SERVICE (no role filter sent, so the list includes tutors and other roles too)
- **Verdict:** OK. Shape and pagination match the doc. The 422 for `limit=0` matches. Like route 19, the list is not filtered by role.

#### 25. GET /admin/students/:id
- **Source:** `features/admin/admin.controller.ts:219` (`getStudent`)
- **Auth:** JWT + ADMIN
- **Request schema:** path `id`
- **Request (sent):** `GET /admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e` (token: admin), none. Case: get by id (bug path).
- **Success (real):** not reached: no 2xx case for this route in this run (see Errors)
- **Errors (real):**
  - **HTTP 400**, get by id (bug path). Sent `GET /admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e` (token: admin). Real: `{"success":false,"statusCode":400,"message":"Unsupported field: undefined","path":"/admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e","correlationId":"44b1f025-6729-4239-91d8-b43f6b7c6c03","serviceName":"user-service","timestamp":"2026-10-10T11:31:08.964Z"}`
  - **HTTP 401**, 401 no token. Sent `GET /admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e` (token: none). Real: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e","correlationId":"5b3eb8cd-0ffa-46e7-9edc-0eb59dcc177b","timestamp":"2026-10-10T11:31:08.966Z"}`
  - **HTTP 403**, 403 student token. Sent `GET /admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e` (token: student). Real: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e","correlationId":"8f2ad383-c93e-449e-912b-e4559219efff","timestamp":"2026-10-10T11:31:08.966Z"}`
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ `user.getUserByField` `{id}` → USER_SERVICE. See #20 for the cause and the password exposure once fixed.
- **Verdict:** BUG (every call fails). Same 400 `Unsupported field: undefined` as route 20.

#### 26. PUT /admin/students/:id
- **Source:** `features/admin/admin.controller.ts:232` (`updateStudent`)
- **Auth:** JWT + ADMIN
- **Request schema:** path `id`; body `UpdateManagedStudentDto` (`updateManagedStudentSchema` = tutor update fields plus): `userCode` ≤6; `address` string nullable; `district` ≤30 nullable; `province` ≤30 nullable; `parentId` uuid nullable; `tutorId` uuid nullable. All optional.
- **Request (sent):** `POST /admin/students` (token: admin), case: fixture: set userCode on a test student (route 26 success):
  ```json
  {"email":"live-a-uc-1791631860@example.com","password":"Student@88","firstName":"Livea","lastName":"Uc1791631860"}
  ```
- **Success (real):** HTTP 201 (case: fixture: set userCode on a test student (route 26 success))
  ```json
  {"statusCode":201,"message":"Success","data":{"message":"User created successfully","data":{"email":"live-a-uc-1791631860@example.com","fullName":"Livea Uc1791631860","password":"$2b$10$CU3vvU/IIAnaOnHZv7u3R.P8PbMfYBpCTToNRTWoXcrqdJJMKlL/O"}},"timestamp":"2026-10-10T11:31:04.013Z","method":"POST","path":"/admin/students","correlationId":"c6f82153-4768-4953-a437-6455abdd3af5"}
  ```
  - also HTTP 200: set userCode LIVEA2 on test student. Sent `PUT /admin/students/1d9efe35-04d4-4fba-bf7a-628ce159a353` body `{"userCode":"LIVEA2"}`. Real: `{"statusCode":200,"message":"Success","data":{"id":"1d9efe35-04d4-4fba-bf7a-628ce159a353","email":"live-a-uc-1791631860@example.com","username":"uc1791631860livea","firstName":"Livea","lastName":"Uc1791631860","password":"$2b$10$CU3vvU/IIAnaOnHZv7u3R.P8PbMfYBpCTToNRTWoXcrqdJJMKlL/O","avatar":null,"phone":null,"isActive":true,"role":"STUDENT","description":null,"userCode":"LIVEA2","gender":null,"dateOfBirth":null,"address":null,"district":null,"province":null,"subjects":null,"facebookId":null,"googleId":null,"school":null,"relationship":null,"gradesId":[],"parentId":null,"tutorId":null,"createdAt":"2026-10-10T11:31:04.007Z","updatedAt":"2026-10-10T11:31:04.061Z"},"timestamp":"2026-10-10T11:31:04.094Z","method":"PUT","path":"/admin/students/1d9efe35-04d4-4fba-bf7a-628ce159a353","correlationId":"7b33cc1f-e3fe-4104-96b8-08c898ebcb4c"}`
  - also HTTP 200: update success. Sent `PUT /admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e` body `{"address":"12 Test St","district":"Q5","province":"HCM","tutorId":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","userCode":"LIVEA1"}`. Real: `{"statusCode":200,"message":"Success","data":{"id":"034c0f83-ac79-4778-bcd9-abca7b0a923e","email":"live-a-stu-1791631860@example.com","username":"liveastu1791631860","firstName":"Livea","lastName":"Stu1791631860","password":"$2b$10$CrBan5Ez9MQf6ecKn70CS.QPsYrhc0lUns7KqkyICXBGS3MMuaYJ6","avatar":null,"phone":null,"isActive":true,"role":"STUDENT","description":null,"userCode":"LIVEA1","gender":null,"dateOfBirth":null,"address":"12 Test St","district":"Q5","province":"HCM","subjects":null,"facebookId":null,"googleId":null,"school":null,"relationship":null,"gradesId":[],"parentId":null,"tutorId":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","createdAt":"2026-10-10T11:31:08.276Z","updatedAt":"2026-10-10T11:31:08.969Z"},"timestamp":"2026-10-10T11:31:08.976Z","method":"PUT","path":"/admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e","correlationId":"4a62664f-f898-49f6-a988-8e63909ba8bc"}`
- **Errors (real):**
  - **HTTP 500**, 500 unknown parentId (FK). Sent `PUT /admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e` (token: admin), body `{"parentId":"00000000-0000-4000-8000-000000000000"}`. Real: `{"success":false,"statusCode":500,"message":"Failed query: update \"users\" set \"parent_id\" = $1, \"updated_at\" = $2 where \"users\".\"id\" = $3 returning \"id\", \"email\", \"u...(trimmed)","path":"/admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e","correlationId":"9d094425-9814-4bd2-bd6c-e75518c0275e","serviceName":"user-service","trace":"HttpException: Failed query: update \"users\" set \"parent_id\" = $1, \"updated_at\" = $2 where \"users\".\"id\" = $3 returning \"i...(trimmed)","timestamp":"2026-10-10T11:31:09.292Z"}`
  - **HTTP 400**, 400 unknown uuid. Sent `PUT /admin/students/00000000-0000-4000-8000-000000000000` (token: admin), body `{"address":"x"}`. Real: `{"success":false,"statusCode":400,"message":"User not found","path":"/admin/students/00000000-0000-4000-8000-000000000000","correlationId":"6409571f-22d1-474f-9069-e9ea3e3000dc","serviceName":"user-service","timestamp":"2026-10-10T11:31:09.602Z"}`
  - **HTTP 400**, 400 non-uuid id. Sent `PUT /admin/students/abc` (token: admin), body `{"address":"x"}`. Real: `{"success":false,"statusCode":400,"message":"User Id must be uuid","path":"/admin/students/abc","correlationId":"7067f143-7ffc-4dca-94b0-50b579c711dc","serviceName":"user-service","timestamp":"2026-10-10T11:31:09.912Z"}`
  - **HTTP 401**, 401 no token. Sent `PUT /admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e` (token: none), body `{"address":"x"}`. Real: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e","correlationId":"22c058c5-0e94-4ffe-b825-cc0eac9db98e","timestamp":"2026-10-10T11:31:09.914Z"}`
  - **HTTP 403**, 403 student token. Sent `PUT /admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e` (token: student), body `{"address":"x"}`. Real: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e","correlationId":"1254fff5-531e-49fe-8047-43c8344791c5","timestamp":"2026-10-10T11:31:09.915Z"}`
- **Downstream:** RMQ `user.updateUserByAdmin` `{id, ...dto}` → USER_SERVICE (same as #21). `parentId` and `tutorId` are foreign keys to `users.id`. A UUID that does not exist there fails the DB constraint, which surfaces as a 500 with the raw Postgres error text (inferred from schema, not run). The response also returns the password hash.
- **Verdict:** BUG (500 with raw SQL in the message; leaks data). An unknown `parentId` gives 500 with `Failed query: update "users" set ...` text. Success returns the bcrypt `password` hash. The 400 cases match the doc.

#### 27. DELETE /admin/students/:id
- **Source:** `features/admin/admin.controller.ts:244` (`deleteStudent`)
- **Auth:** JWT + ADMIN
- **Request schema:** path `id`
- **Request (sent):** `DELETE /admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e` (token: admin), none. Case: delete success.
- **Success (real):** HTTP 200 (case: delete success)
  ```json
  {"statusCode":200,"message":"Success","data":{"id":"034c0f83-ac79-4778-bcd9-abca7b0a923e"},"timestamp":"2026-10-10T11:31:09.925Z","method":"DELETE","path":"/admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e","correlationId":"9481ccb5-43de-47ce-8286-cb0abed8d693"}
  ```
  - also HTTP 200: cleanup: delete userCode test student. Sent `DELETE /admin/students/1d9efe35-04d4-4fba-bf7a-628ce159a353` body `none`. Real: `{"statusCode":200,"message":"Success","data":{"id":"1d9efe35-04d4-4fba-bf7a-628ce159a353"},"timestamp":"2026-10-10T11:31:46.085Z","method":"DELETE","path":"/admin/students/1d9efe35-04d4-4fba-bf7a-628ce159a353","correlationId":"04ba551a-3fb9-40b8-bf3d-7fb9c1559243"}`
- **Errors (real):**
  - **HTTP 403**, 403 student token. Sent `DELETE /admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e` (token: student). Real: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e","correlationId":"a0d3780e-e5a6-4834-8ccf-6741b84165c1","timestamp":"2026-10-10T11:31:09.916Z"}`
  - **HTTP 401**, 401 no token. Sent `DELETE /admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e` (token: none). Real: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e","correlationId":"9a18b6a4-8a0f-4227-b3f5-6aecd79184b9","timestamp":"2026-10-10T11:31:09.916Z"}`
  - **HTTP 400**, delete again (already deleted). Sent `DELETE /admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e` (token: admin). Real: `{"success":false,"statusCode":400,"message":"User not found","path":"/admin/students/034c0f83-ac79-4778-bcd9-abca7b0a923e","correlationId":"a7644b7d-0111-4a92-97ff-d2b8abd656cf","serviceName":"user-service","timestamp":"2026-10-10T11:31:10.235Z"}`
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ `user.deleteUserByAdmin` `{id}` → USER_SERVICE (same as #22). Deleting a parent cascades to its children (`parentId`). Attendance rows are removed through the student FK.
- **Verdict:** OK. 200 `{id}`, second delete 400, 401 and 403 match the doc.

## AI chat (`/ai-chat`)

#### 28. POST /ai-chat/chat
- **Source:** `features/ai-chat/ai-chat.controller.ts:37` (`chat`)
- **Auth:** JWT + Redis session (any role)
- **Request schema:** body `ChatDto` (`chatSchema`): `message` string 1–4000 required
- **Request (sent):** `POST /ai-chat/chat` (token: student), case: chat success (student):
  ```json
  {"message":"Giải thích giúp em định lý Pythagoras"}
  ```
- **Success (real):** not reached: no 2xx case for this route in this run (see Errors)
- **Errors (real):**
  - **HTTP 504**, chat success (student). Sent `POST /ai-chat/chat` (token: student), body `{"message":"Giải thích giúp em định lý Pythagoras"}`. Real: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/ai-chat/chat","correlationId":"a74a3ff2-7324-4222-bd9d-267d1d75d4c5","trace":"HttpException: Timeout has occurred\n    at RmqProducer.send (/home/haidangphan/Documents/tutor/gateway/src/features/rabb...(trimmed)","timestamp":"2026-10-10T11:31:40.540Z"}`
  - **HTTP 422**, 422 empty message. Sent `POST /ai-chat/chat` (token: student), body `{"message":""}`. Real: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"message","message":"Message is required","code":"too_small"}],"path":"/ai-chat/chat","correlationId":"6b99abbb-af24-444d-a633-cc02adae8147","timestamp":"2026-10-10T11:31:40.542Z"}`
  - **HTTP 422**, 422 message 4001 chars. Sent `POST /ai-chat/chat` (token: student), body `{"message":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa...(trimmed, 4001 chars)"}`. Real: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"message","message":"Message too long","code":"too_big"}],"path":"/ai-chat/chat","correlationId":"5f5b7c3d-86b1-4070-8dbd-f9ada9ae5ff9","timestamp":"2026-10-10T11:31:40.544Z"}`
  - **HTTP 401**, 401 no token. Sent `POST /ai-chat/chat` (token: none), body `{"message":"hi"}`. Real: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/ai-chat/chat","correlationId":"22eab83c-34a1-4148-8c5d-2c71f5bd4fb1","timestamp":"2026-10-10T11:31:40.545Z"}`
- **Downstream:** RMQ `ai.chat` `{userId, data}` → TUTOR_SERVICE (`tutor_queue`). `AgentsService.chat` calls the Claude Agent SDK `query()` and joins every SDK message that has a `text` property. Verified in the SDK types: only `SDKNotificationMessage` has `text`, and assistant messages do not. So `content` is most likely always the fallback `Không có phản hồi từ trợ lý.` ("No response from the assistant."). Not run. Each call takes one SDK round-trip, so it can exceed the 10 s per-attempt timeout. History is appended only on success, so a timed-out attempt can still finish later, and a retry can append the message twice.
- **Verdict:** BUG (504 on every call in this environment). The gateway waited 30.3 s (3 attempts of 10 s) and returned 504 `Timeout has occurred`, so no reply was ever received. The reply content (`Không có phản hồi từ trợ lý.` fallback) was not observed. The 422 and 401 cases match. This run used the real agent (external AI); not verified against a mock.

#### 29. GET /ai-chat/history
- **Source:** `features/ai-chat/ai-chat.controller.ts:49` (`getHistory`)
- **Auth:** JWT + Redis session
- **Request schema:** query `limit` int 1–200 default 50
- **Request (sent):** `GET /ai-chat/history?limit=2` (token: student), none. Case: history limit=2.
- **Success (real):** HTTP 200 (case: history limit=2)
  ```json
  {"statusCode":200,"message":"Success","data":[{"role":"user","content":"Giải thích giúp em định lý Pythagoras","createdAt":"2026-10-10T11:31:34.945Z"},{"role":"assistant","content":"Không có phản hồi từ trợ lý.","createdAt":"2026-10-10T11:31:34.945Z"}],"timestamp":"2026-10-10T11:31:40.547Z","method":"GET","path":"/ai-chat/history?limit=2","correlationId":"a8a348f3-11f6-45a9-a3ad-7d42dd84f265"}
  ```
  - also HTTP 200: history after clear. Sent `GET /ai-chat/history?limit=2` body `none`. Real: `{"statusCode":200,"message":"Success","data":[],"timestamp":"2026-10-10T11:31:40.556Z","method":"GET","path":"/ai-chat/history?limit=2","correlationId":"6671b076-0b5d-4ddd-a380-1e555d5dc38c"}`
- **Errors (real):**
  - **HTTP 422**, 422 limit=0. Sent `GET /ai-chat/history?limit=0` (token: student). Real: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"limit","message":"Too small: expected number to be >=1","code":"too_small"}],"path":"/ai-chat/history?limit=0","correlationId":"dcf0b22e-fe51-4e38-a402-1d9b14971abc","timestamp":"2026-10-10T11:31:40.548Z"}`
  - **HTTP 401**, 401 no token. Sent `GET /ai-chat/history?limit=2` (token: none). Real: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/ai-chat/history?limit=2","correlationId":"c768a644-202e-415b-9937-4c82396ba2cf","timestamp":"2026-10-10T11:31:40.549Z"}`
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ `ai.history` `{userId, query}` → TUTOR_SERVICE (`slice(-limit)` on the in-memory history, which resets on tutor-service restart and is per process)
- **Verdict:** OK. 200 returns the history entries (oldest first) and the history is empty after the clear. The 422 for `limit=0` and the 401 match.

#### 30. DELETE /ai-chat/history
- **Source:** `features/ai-chat/ai-chat.controller.ts:61` (`clearHistory`)
- **Auth:** JWT + Redis session
- **Request schema:** none
- **Request (sent):** `DELETE /ai-chat/history` (token: student), none. Case: clear history.
- **Success (real):** HTTP 200 (case: clear history)
  ```json
  {"statusCode":200,"message":"Success","data":{"success":true},"timestamp":"2026-10-10T11:31:40.551Z","method":"DELETE","path":"/ai-chat/history","correlationId":"df8e7955-1a38-4cdf-a3ce-54d9902605de"}
  ```
- **Errors (real):**
  - **HTTP 401**, 401 no token. Sent `DELETE /ai-chat/history` (token: none). Real: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/ai-chat/history","correlationId":"9243c262-00fa-44be-879e-4d29ef2efc3f","timestamp":"2026-10-10T11:31:40.552Z"}`
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ `ai.clearHistory` `{userId}` → TUTOR_SERVICE (deletes the in-memory entry for the user)
- **Verdict:** OK. 200 with `{success: true}` and the 401 matches. The history is cleared for the test student.

## Attendance (`/attendances`)

#### 31. GET /attendances/session/:sessionId
- **Source:** `features/attendance/attendance.controller.ts:37` (`getBySession`)
- **Auth:** JWT + Redis session
- **Request schema:** path `sessionId` (string, no UUID pipe)
- **Request (sent):** `GET /attendances/session/0423da1b-53a2-45fd-954b-e12ae7d8b87d` (token: student), none. Case: by session (enrolled student).
- **Success (real):** HTTP 200 (case: by session (enrolled student))
  ```json
  {"statusCode":200,"message":"Success","data":[{"studentId":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","firstName":"Student","lastName":"Account","avatar":null,"userCode":null,"present":false,"note":null,"markedAt":null}],"timestamp":"2026-10-10T11:31:40.564Z","method":"GET","path":"/attendances/session/0423da1b-53a2-45fd-954b-e12ae7d8b87d","correlationId":"cb51e43b-e400-4af5-9ea9-e24185164ba3"}
  ```
  - also HTTP 200: by session (owner tutor). Sent `GET /attendances/session/0423da1b-53a2-45fd-954b-e12ae7d8b87d` body `none`. Real: `{"statusCode":200,"message":"Success","data":[{"studentId":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","firstName":"Student","lastName":"Account","avatar":null,"userCode":null,"present":false,"note":null,"markedAt":null}],"timestamp":"2026-10-10T11:31:40.571Z","method":"GET","path":"/attendances/session/0423da1b-53a2-45fd-954b-e12ae7d8b87d","correlationId":"5b221b5a-b421-49ad-a6da-97154588cb32"}`
- **Errors (real):**
  - **HTTP 400**, 400 non-uuid sessionId. Sent `GET /attendances/session/abc` (token: tutor). Real: `{"success":false,"statusCode":400,"message":"id must be uuid: Session Id","path":"/attendances/session/abc","correlationId":"0f188eeb-5b0f-4cdf-95f5-dbcb47077fe1","serviceName":"tutor-service","timestamp":"2026-10-10T11:31:40.881Z"}`
  - **HTTP 404**, 404 unknown session. Sent `GET /attendances/session/00000000-0000-4000-8000-000000000000` (token: tutor). Real: `{"success":false,"statusCode":404,"message":"Session not found","path":"/attendances/session/00000000-0000-4000-8000-000000000000","correlationId":"2c0ad2e9-4ea1-41ec-a430-fb8bba810275","serviceName":"tutor-service","timestamp":"2026-10-10T11:31:41.196Z"}`
  - **HTTP 404**, 404 admin not owner/enrolled. Sent `GET /attendances/session/0423da1b-53a2-45fd-954b-e12ae7d8b87d` (token: admin). Real: `{"success":false,"statusCode":404,"message":"Session not found","path":"/attendances/session/0423da1b-53a2-45fd-954b-e12ae7d8b87d","correlationId":"89342377-e1bd-46a1-91d7-ec732ef23af5","serviceName":"tutor-service","timestamp":"2026-10-10T11:31:41.519Z"}`
  - **HTTP 401**, 401 no token. Sent `GET /attendances/session/0423da1b-53a2-45fd-954b-e12ae7d8b87d` (token: none). Real: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/attendances/session/0423da1b-53a2-45fd-954b-e12ae7d8b87d","correlationId":"288742de-a231-4806-9e2f-61311c5fa5fc","timestamp":"2026-10-10T11:31:41.521Z"}`
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ `attendance.getBySession` `{userId, sessionId}` → TUTOR_SERVICE (`getBySessionService`). The session is checked first with `getSessionService`, which applies the owner/enrolled/parent access rule.
- **Verdict:** OK. 200 for enrolled student and owner tutor with the documented row shape. 400 `id must be uuid: Session Id`, 404 `Session not found` (unknown session and admin who is not owner or enrolled) and 401 match the doc.

#### 32. PUT /attendances
- **Source:** `features/attendance/attendance.controller.ts:48` (`upsert`)
- **Auth:** JWT + Redis session
- **Request schema:** body `UpsertAttendanceDto` (`upsertAttendanceSchema`): `sessionId` uuid required; `studentId` uuid required; `present` boolean required; `note` string ≤500 optional/nullable
- **Request (sent):** `PUT /attendances` (token: tutor), case: upsert present (owner tutor):
  ```json
  {"sessionId":"0423da1b-53a2-45fd-954b-e12ae7d8b87d","studentId":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","present":true,"note":"live-A test"}
  ```
- **Success (real):** not reached: no 2xx case for this route in this run (see Errors)
- **Errors (real):**
  - **HTTP 500**, upsert present (owner tutor). Sent `PUT /attendances` (token: tutor), body `{"sessionId":"0423da1b-53a2-45fd-954b-e12ae7d8b87d","studentId":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","present":true,"note":"live-A test"}`. Real: `{"success":false,"statusCode":500,"message":"Cannot read properties of undefined (reading 'sessionId')","path":"/attendances","correlationId":"c135e204-6d38-4f1e-8dcc-48d5451e5689","serviceName":"tutor-service","trace":"HttpException: Cannot read properties of undefined (reading 'sessionId')\n    at RmqProducer.send (/home/haidangphan/Docu...(trimmed)","timestamp":"2026-10-10T11:31:41.829Z"}`
  - **HTTP 500**, upsert again (idempotent, present false). Sent `PUT /attendances` (token: tutor), body `{"sessionId":"0423da1b-53a2-45fd-954b-e12ae7d8b87d","studentId":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","present":false,"note":null}`. Real: `{"success":false,"statusCode":500,"message":"Cannot read properties of undefined (reading 'sessionId')","path":"/attendances","correlationId":"26dc513a-2c02-4d8d-a3ad-5b0875f233eb","serviceName":"tutor-service","trace":"HttpException: Cannot read properties of undefined (reading 'sessionId')\n    at RmqProducer.send (/home/haidangphan/Docu...(trimmed)","timestamp":"2026-10-10T11:31:42.137Z"}`
  - **HTTP 422**, 422 present as string. Sent `PUT /attendances` (token: tutor), body `{"sessionId":"0423da1b-53a2-45fd-954b-e12ae7d8b87d","studentId":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","present":"yes"}`. Real: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"present","message":"present must be boolean","code":"invalid_type"}],"path":"/attendances","correlationId":"973c0e90-6c05-4670-94b5-816326fc4eb6","timestamp":"2026-10-10T11:31:42.140Z"}`
  - **HTTP 500**, 403 enrolled student (not tutor). Sent `PUT /attendances` (token: student), body `{"sessionId":"0423da1b-53a2-45fd-954b-e12ae7d8b87d","studentId":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","present":true}`. Real: `{"success":false,"statusCode":500,"message":"Cannot read properties of undefined (reading 'sessionId')","path":"/attendances","correlationId":"7aa761d9-6a28-4144-b6eb-64c8eff7a624","serviceName":"tutor-service","trace":"HttpException: Cannot read properties of undefined (reading 'sessionId')\n    at RmqProducer.send (/home/haidangphan/Docu...(trimmed)","timestamp":"2026-10-10T11:31:42.446Z"}`
  - **HTTP 500**, 404 student not in roster. Sent `PUT /attendances` (token: tutor), body `{"sessionId":"0423da1b-53a2-45fd-954b-e12ae7d8b87d","studentId":"09a7e254-21cf-4415-87e2-6237b90726b9","present":true}`. Real: `{"success":false,"statusCode":500,"message":"Cannot read properties of undefined (reading 'sessionId')","path":"/attendances","correlationId":"3805dab4-7544-4deb-aae0-4ce8c833c920","serviceName":"tutor-service","trace":"HttpException: Cannot read properties of undefined (reading 'sessionId')\n    at RmqProducer.send (/home/haidangphan/Docu...(trimmed)","timestamp":"2026-10-10T11:31:42.753Z"}`
  - **HTTP 500**, 404 unknown session. Sent `PUT /attendances` (token: tutor), body `{"sessionId":"00000000-0000-4000-8000-000000000000","studentId":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","present":true}`. Real: `{"success":false,"statusCode":500,"message":"Cannot read properties of undefined (reading 'sessionId')","path":"/attendances","correlationId":"04f2e933-910d-4cb9-80c3-12728fcbea7b","serviceName":"tutor-service","trace":"HttpException: Cannot read properties of undefined (reading 'sessionId')\n    at RmqProducer.send (/home/haidangphan/Docu...(trimmed)","timestamp":"2026-10-10T11:31:43.061Z"}`
  - **HTTP 401**, 401 no token. Sent `PUT /attendances` (token: none), body `{"sessionId":"0423da1b-53a2-45fd-954b-e12ae7d8b87d","studentId":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","present":true}`. Real: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/attendances","correlationId":"9a4a9170-7a71-4d93-a7c6-9516a572abe7","timestamp":"2026-10-10T11:31:43.063Z"}`
- **Downstream:** RMQ `attendance.upsert` `{userId, ...dto}` → TUTOR_SERVICE (`upsertAttendanceService`). Order of checks: session visible to the caller (404 `Session not found`), caller is the class tutor (403), student in the class roster (404 `Student not found`), then the upsert. The upsert is idempotent for the same `(sessionId, studentId)`, so retries are safe.
- **Verdict:** BUG (500 on every request that passes validation). Gateway sends `{userId, ...dto}` (gateway attendance.controller.ts:53) but TUTOR's `attendance.upsert` handler reads `payload.data` (tutor-service attendance.rpc.controller.ts:21), so `Cannot read properties of undefined (reading 'sessionId')`. The 403, 404 and 404 student cases in the doc are unreachable until fixed. Only 422 and 401 match.

## Chapter (`/chapter`)

#### 33. POST /chapter/:curriculumId
- **Source:** `features/chapter/chapter.controller.ts:39` (`create`)
- **Auth:** JWT + Redis session
- **Request schema:** path `curriculumId` (no UUID pipe); body `CreateChapterDto`: `title` string 1–255 required; `description` string optional; `order` int default 0 optional
- **Request (sent):** `POST /chapter/776c41e3-b021-4137-9095-14baa9fe1baa` (token: tutor), case: create success (tutor):
  ```json
  {"title":"LIVE-A Chuong 1","description":"live test","order":1}
  ```
- **Success (real):** HTTP 201 (case: create success (tutor))
  ```json
  {"statusCode":201,"message":"Success","data":{"id":"8596be10-5bc4-47d8-9a63-98973b4c06eb","curriculumId":"776c41e3-b021-4137-9095-14baa9fe1baa","title":"LIVE-A Chuong 1","description":"live test","order":1,"createdAt":"2026-10-10T11:31:43.422Z","updatedAt":"2026-10-10T11:31:43.422Z"},"timestamp":"2026-10-10T11:31:43.424Z","method":"POST","path":"/chapter/776c41e3-b021-4137-9095-14baa9fe1baa","correlationId":"49d37401-e757-4c69-99ef-0562848011e4"}
  ```
  - also HTTP 201: create by student token (any role allowed?). Sent `POST /chapter/776c41e3-b021-4137-9095-14baa9fe1baa` body `{"title":"LIVE-A by student","order":9}`. Real: `{"statusCode":201,"message":"Success","data":{"id":"da7175b4-6ab3-46f9-96d4-ccc76d280eef","curriculumId":"776c41e3-b021-4137-9095-14baa9fe1baa","title":"LIVE-A by student","description":null,"order":9,"createdAt":"2026-10-10T11:31:43.427Z","updatedAt":"2026-10-10T11:31:43.427Z"},"timestamp":"2026-10-10T11:31:43.429Z","method":"POST","path":"/chapter/776c41e3-b021-4137-9095-14baa9fe1baa","correlationId":"00d449dc-2da8-4332-8b74-3fcc6d030587"}`
- **Errors (real):**
  - **HTTP 422**, 422 empty title. Sent `POST /chapter/776c41e3-b021-4137-9095-14baa9fe1baa` (token: tutor), body `{"title":""}`. Real: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"title","message":"Title is required","code":"too_small"}],"path":"/chapter/776c41e3-b021-4137-9095-14baa9fe1baa","correlationId":"f96ac502-e44b-4c69-b849-5f28154f99c3","timestamp":"2026-10-10T11:31:43.431Z"}`
  - **HTTP 400**, 400 non-uuid curriculumId. Sent `POST /chapter/abc` (token: tutor), body `{"title":"x"}`. Real: `{"success":false,"statusCode":400,"message":"curriculumId must be a valid UUID","path":"/chapter/abc","correlationId":"fdd77016-ddcc-4de0-aaa1-022d733054f4","serviceName":"tutor-service","timestamp":"2026-10-10T11:31:43.738Z"}`
  - **HTTP 500**, 500 unknown curriculumId (FK). Sent `POST /chapter/00000000-0000-4000-8000-000000000000` (token: tutor), body `{"title":"x"}`. Real: `{"success":false,"statusCode":500,"message":"Failed query: insert into \"chapters\" (\"id\", \"curriculum_id\", \"title\", \"description\", \"order\", \"created_at\", \"updated_at\"...(trimmed)","path":"/chapter/00000000-0000-4000-8000-000000000000","correlationId":"2bd24e6c-929d-4d5e-bfd7-e7b541445ad4","serviceName":"tutor-service","trace":"HttpException: Failed query: insert into \"chapters\" (\"id\", \"curriculum_id\", \"title\", \"description\", \"order\", \"created_at...(trimmed)","timestamp":"2026-10-10T11:31:44.052Z"}`
  - **HTTP 401**, 401 no token. Sent `POST /chapter/776c41e3-b021-4137-9095-14baa9fe1baa` (token: none), body `{"title":"x"}`. Real: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/chapter/776c41e3-b021-4137-9095-14baa9fe1baa","correlationId":"7213b0f2-7210-4d34-94b5-11e56576a1fb","timestamp":"2026-10-10T11:31:44.054Z"}`
- **Downstream:** RMQ `chapter.create` `{curriculumId, data}` → TUTOR_SERVICE (`createChapterService`). Only checks that `curriculumId` is a UUID. There is no existence or ownership check, so any authenticated user (any role) can add a chapter to any curriculum. A non-existent curriculum fails the FK on insert. The insert is not idempotent, so a retry after a timeout creates a duplicate chapter.
- **Verdict:** BUG (500 for unknown curriculum; any role can create). 201 success works, but a STUDENT token also created a chapter (201), so there is no owner check. An unknown curriculumId returns 500 with the raw FK insert text instead of 404. The 422 and 400 cases match.

#### 34. GET /chapter
- **Source:** `features/chapter/chapter.controller.ts:54` (`getAll`)
- **Auth:** JWT + Redis session
- **Request schema:** query `curriculumId` uuid required; `page` int ≥1 default 1; `limit` 1–100 default 10
- **Request (sent):** `GET /chapter?curriculumId=776c41e3-b021-4137-9095-14baa9fe1baa&page=1&limit=10` (token: tutor), none. Case: list success.
- **Success (real):** HTTP 200 (case: list success)
  ```json
  {"statusCode":200,"message":"Success","data":{"chapters":[{"id":"8596be10-5bc4-47d8-9a63-98973b4c06eb","curriculumId":"776c41e3-b021-4137-9095-14baa9fe1baa","title":"LIVE-A Chuong 1","description":"live test","order":1,"createdAt":"2026-10-10T11:31:43.422Z","updatedAt":"2026-10-10T11:31:43.422Z"},{"id":"da7175b4-6ab3-46f9-96d4-ccc76d280eef","curriculumId":"776c41e3-b021-4137-9095-14baa9fe1baa","title":"LIVE-A by student","description":null,"order":9,"createdAt":"2026-10-10T11:31:43.427Z","updatedAt":"2026-10-10T11:31:43.427Z"}],"pagination":{"total":2,"page":1,"limit":10,"totalPages":1}},"timestamp":"2026-10-10T11:31:44.059Z","method":"GET","path":"/chapter?curriculumId=776c41e3-b021-4137-9095-14baa9fe1baa&page=1&limit=10","correlationId":"e82f3507-7cd4-4cc1-909c-a6e69c292f33"}
  ```
- **Errors (real):**
  - **HTTP 422**, 422 curriculumId not uuid. Sent `GET /chapter?curriculumId=abc` (token: tutor). Real: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"curriculumId","message":"Invalid curriculum ID","code":"invalid_format"}],"path":"/chapter?curriculumId=abc","correlationId":"adab347f-a4df-4754-9ad1-d04e53dcf636","timestamp":"2026-10-10T11:31:44.062Z"}`
  - **HTTP 422**, 422 limit=0. Sent `GET /chapter?curriculumId=776c41e3-b021-4137-9095-14baa9fe1baa&limit=0` (token: tutor). Real: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"limit","message":"Too small: expected number to be >=1","code":"too_small"}],"path":"/chapter?curriculumId=776c41e3-b021-4137-9095-14baa9fe1baa&limit=0","correlationId":"ea5f8211-8c1d-4d89-8da1-0ee9ff275669","timestamp":"2026-10-10T11:31:44.063Z"}`
  - **HTTP 401**, 401 no token. Sent `GET /chapter?curriculumId=776c41e3-b021-4137-9095-14baa9fe1baa` (token: none). Real: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/chapter?curriculumId=776c41e3-b021-4137-9095-14baa9fe1baa","correlationId":"96e5d830-6dbe-4ba5-b688-3859e40526a9","timestamp":"2026-10-10T11:31:44.064Z"}`
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ `chapter.getAll` `{query}` → TUTOR_SERVICE (`getAllChaptersService`, OFFSET pagination). No access check on the curriculum.
- **Verdict:** OK. Shape and pagination match. The 422 cases match the doc.

#### 35. GET /chapter/:id
- **Source:** `features/chapter/chapter.controller.ts:66` (`getById`)
- **Auth:** JWT + Redis session
- **Request schema:** path `id` (no UUID pipe)
- **Request (sent):** `GET /chapter/8596be10-5bc4-47d8-9a63-98973b4c06eb` (token: tutor), none. Case: get by id success.
- **Success (real):** HTTP 200 (case: get by id success)
  ```json
  {"statusCode":200,"message":"Success","data":{"id":"8596be10-5bc4-47d8-9a63-98973b4c06eb","curriculumId":"776c41e3-b021-4137-9095-14baa9fe1baa","title":"LIVE-A Chuong 1","description":"live test","order":1,"createdAt":"2026-10-10T11:31:43.422Z","updatedAt":"2026-10-10T11:31:43.422Z"},"timestamp":"2026-10-10T11:31:44.067Z","method":"GET","path":"/chapter/8596be10-5bc4-47d8-9a63-98973b4c06eb","correlationId":"6ae0686d-4d66-4b41-bfec-11853d4c9308"}
  ```
  - also HTTP 200: unknown id (200, data null). Sent `GET /chapter/00000000-0000-4000-8000-000000000000` body `none`. Real: `{"statusCode":200,"message":"Success","data":null,"timestamp":"2026-10-10T11:31:44.070Z","method":"GET","path":"/chapter/00000000-0000-4000-8000-000000000000","correlationId":"ab685978-00c7-42bb-bc1c-d5f0958764ce"}`
- **Errors (real):**
  - **HTTP 400**, 400 non-uuid id. Sent `GET /chapter/abc` (token: tutor). Real: `{"success":false,"statusCode":400,"message":"Invalid chapter id","path":"/chapter/abc","correlationId":"05e81be9-8617-431b-aa89-a96c129d2b24","serviceName":"tutor-service","timestamp":"2026-10-10T11:31:44.381Z"}`
  - **HTTP 401**, 401 no token. Sent `GET /chapter/8596be10-5bc4-47d8-9a63-98973b4c06eb` (token: none). Real: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/chapter/8596be10-5bc4-47d8-9a63-98973b4c06eb","correlationId":"20159a30-543c-4c38-ba7c-d6436ed1e6b7","timestamp":"2026-10-10T11:31:44.383Z"}`
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ `chapter.getById` `{id}` → TUTOR_SERVICE (`getChapterByIdService`). Non-UUID ids are rejected with 400.
- **Verdict:** OK per doc. 200 with `data: null` for an unknown id (documented as not-found 200). 400 `Invalid chapter id` matches.

#### 36. PUT /chapter/:id
- **Source:** `features/chapter/chapter.controller.ts:75` (`update`)
- **Auth:** JWT + Redis session
- **Request schema:** path `id`; body `UpdateChapterDto` (`createChapterSchema.partial()`): `title`, `description`, `order`
- **Request (sent):** `PUT /chapter/8596be10-5bc4-47d8-9a63-98973b4c06eb` (token: tutor), case: update success:
  ```json
  {"title":"LIVE-A Chuong 1 (cap nhat)","order":2}
  ```
- **Success (real):** HTTP 200 (case: update success)
  ```json
  {"statusCode":200,"message":"Success","data":{"id":"8596be10-5bc4-47d8-9a63-98973b4c06eb","curriculumId":"776c41e3-b021-4137-9095-14baa9fe1baa","title":"LIVE-A Chuong 1 (cap nhat)","description":"live test","order":2,"createdAt":"2026-10-10T11:31:43.422Z","updatedAt":"2026-10-10T11:31:43.422Z"},"timestamp":"2026-10-10T11:31:44.392Z","method":"PUT","path":"/chapter/8596be10-5bc4-47d8-9a63-98973b4c06eb","correlationId":"c879f242-c9bc-4250-b32a-98c78819d316"}
  ```
- **Errors (real):**
  - **HTTP 422**, 422 empty title. Sent `PUT /chapter/8596be10-5bc4-47d8-9a63-98973b4c06eb` (token: tutor), body `{"title":""}`. Real: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"title","message":"Title is required","code":"too_small"}],"path":"/chapter/8596be10-5bc4-47d8-9a63-98973b4c06eb","correlationId":"d929d3d9-b7de-4fe2-afa6-79002e219b7d","timestamp":"2026-10-10T11:31:44.394Z"}`
  - **HTTP 400**, 400 non-uuid id. Sent `PUT /chapter/abc` (token: tutor), body `{"title":"x"}`. Real: `{"success":false,"statusCode":400,"message":"Invalid chapter id","path":"/chapter/abc","correlationId":"ff17b61c-5083-43c4-b95d-a74636773616","serviceName":"tutor-service","timestamp":"2026-10-10T11:31:44.700Z"}`
  - **HTTP 404**, 404 unknown id. Sent `PUT /chapter/00000000-0000-4000-8000-000000000000` (token: tutor), body `{"title":"x"}`. Real: `{"success":false,"statusCode":404,"message":"Chapter not found","path":"/chapter/00000000-0000-4000-8000-000000000000","correlationId":"67ed8a68-3a9f-46b7-ab35-a23d1c9c8ea1","serviceName":"tutor-service","timestamp":"2026-10-10T11:31:45.014Z"}`
  - **HTTP 401**, 401 no token. Sent `PUT /chapter/8596be10-5bc4-47d8-9a63-98973b4c06eb` (token: none), body `{"title":"x"}`. Real: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/chapter/8596be10-5bc4-47d8-9a63-98973b4c06eb","correlationId":"e3b6653a-e987-464d-94fa-ccfe902a06f9","timestamp":"2026-10-10T11:31:45.016Z"}`
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ `chapter.update` `{id, data}` → TUTOR_SERVICE (`updateChapterService`). Checks the id is a UUID (400), then that the chapter exists (404), then runs `UPDATE ... SET data`. An empty body `{}` passes the schema and gives an empty SET, which is likely a DB error and a 500 (inferred, not run).
- **Verdict:** OK. 200 updated row, 404 `Chapter not found`, 422 and 400 match.

#### 37. DELETE /chapter/:id
- **Source:** `features/chapter/chapter.controller.ts:88` (`delete`)
- **Auth:** JWT + Redis session
- **Request schema:** path `id`
- **Request (sent):** `DELETE /chapter/8596be10-5bc4-47d8-9a63-98973b4c06eb` (token: tutor), none. Case: delete success.
- **Success (real):** HTTP 200 (case: delete success)
  ```json
  {"statusCode":200,"message":"Success","data":true,"timestamp":"2026-10-10T11:31:45.025Z","method":"DELETE","path":"/chapter/8596be10-5bc4-47d8-9a63-98973b4c06eb","correlationId":"ffbf81fc-4887-49e8-9864-9352443f00c6"}
  ```
  - also HTTP 200: cleanup: delete chapter created by student token. Sent `DELETE /chapter/da7175b4-6ab3-46f9-96d4-ccc76d280eef` body `none`. Real: `{"statusCode":200,"message":"Success","data":true,"timestamp":"2026-10-10T11:31:45.656Z","method":"DELETE","path":"/chapter/da7175b4-6ab3-46f9-96d4-ccc76d280eef","correlationId":"43c848dd-21aa-4b70-b3c4-abe9f3b77a0a"}`
- **Errors (real):**
  - **HTTP 404**, delete again (already deleted). Sent `DELETE /chapter/8596be10-5bc4-47d8-9a63-98973b4c06eb` (token: tutor). Real: `{"success":false,"statusCode":404,"message":"Chapter not found","path":"/chapter/8596be10-5bc4-47d8-9a63-98973b4c06eb","correlationId":"cbba2057-ca56-4c1f-a363-564ef3ea3bfb","serviceName":"tutor-service","timestamp":"2026-10-10T11:31:45.337Z"}`
  - **HTTP 400**, 400 non-uuid id. Sent `DELETE /chapter/abc` (token: tutor). Real: `{"success":false,"statusCode":400,"message":"Invalid chapter id","path":"/chapter/abc","correlationId":"831940cf-e6da-41fa-bcd6-9f1dd2cb341a","serviceName":"tutor-service","timestamp":"2026-10-10T11:31:45.646Z"}`
  - **HTTP 401**, 401 no token. Sent `DELETE /chapter/8596be10-5bc4-47d8-9a63-98973b4c06eb` (token: none). Real: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/chapter/8596be10-5bc4-47d8-9a63-98973b4c06eb","correlationId":"641b14cd-0235-4043-a9cb-d29f48a4d3a7","timestamp":"2026-10-10T11:31:45.648Z"}`
  - not triggered: 500/504 from a broker or downstream outage needs a service or RabbitMQ to be stopped, which the run rules forbid. The doc's 500 example is not reproduced here.
- **Downstream:** RMQ `chapter.delete` `{id}` → TUTOR_SERVICE (`deleteChapterService`). Checks the id is a UUID (400), then that the chapter exists (404), then deletes. A retry after a successful delete returns 404 `Chapter not found`.
- **Verdict:** OK. 200 with `data: true`. Second delete 404 `Chapter not found`, 400 and 401 match the doc.

## Classes (`/classes`)

Method notes for this part: every example below is a real response from the running gateway (scripts and raw JSON in `scratchpad/live-B/`). Response bodies are trimmed to 2 array items and 120-character strings; the `trace` key on 5xx bodies is dropped. Fixtures were inserted and deleted for this run (B-tagged rows only, cleanup verified). Summary: 26 routes, 12 OK, 14 BUG, 0 NOT EXECUTED. No route in this range sends email or redirects.


Notes for this group: example messages are the default `vi` text (no `Accept-Language` header). 5xx bodies also carry `trace` outside production; it is omitted below. Ids used in examples: tutor `b7e1c2d4-3f5a-4e6b-9c8d-1a2b3c4d5e6f`, class `5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f`, student `d4c3b2a1-9f8e-4d7c-8b6a-5f4e3d2c1b0a`.

#### 38. POST /classes
- **Source:** `features/class/class.controller.ts:42` (`create`)
- **Auth:** JWT + Redis session
- **Request:** body `CreateClassDto` (`createClassSchema`): `name` string 1–255 required; `code` string 1–50 required; `subject` string 1–255 required; `tuition` number ≥0 default 0 optional; `description` optional; `status` OPEN|CLOSED|UPCOMING default OPEN; `format` ONLINE|OFFLINE default OFFLINE; `startTime` date required; `endTime` date required; `location` optional; `curriculumId` uuid optional nullable; `tutorId` uuid required; `schedulesId` uuid[] default []
- **Success:** 201; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `class.create` `{userId, ...dto}` → TUTOR_SERVICE
- **Known mismatch:** the handler (`class.rpc.controller.ts`) passes the payload to `ClassService.createClassService({userId, data})`, which destructures `data`. The gateway sends the DTO flat, so every valid request fails before the insert. The downstream 400s (`CLASS_NAME_EXISTS`, `CLASS_CODE_EXISTS`, `TUTOR_NOT_FOUND`) are unreachable until this is fixed.
- **Request (sent):**
  - owner, valid body (token: tutor): `POST /classes` body `{"name":"B-test class new 631743","code":"BX631743OE","subject":"Toan hoc","tuition":1500000,"description":"fixture B","status":"OPEN","format":"OFFLINE","startTime":"2026-11-02T11:00:00.000Z","endTime":"2026-11-02T12:30:00.000Z","location":"Phong 201","tutorId":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","schedulesId":[]}`
  - no token (token: none): `POST /classes` body `{"name":"B-test class new 631743","code":"BX631743OE","subject":"Toan hoc","tuition":1500000,"description":"fixture B","status":"OPEN","format":"OFFLINE","startTime":"2026-11-02T11:00:00.000Z","endTime":"2026-11-02T12:30:00.000Z","location":"Phong 201","tutorId":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","schedulesId":[]}`
  - tutorId abc (token: tutor): `POST /classes` body `{"name":"B-test class new 631743","code":"BX631743OE","subject":"Toan hoc","tuition":1500000,"description":"fixture B","status":"OPEN","format":"OFFLINE","startTime":"2026-11-02T11:00:00.000Z","endTime":"2026-11-02T12:30:00.000Z","location":"Phong 201","tutorId":"abc","schedulesId":[]}`
  - student token, valid body (token: student): `POST /classes` body `{"name":"B-test class new 631743","code":"BX631743OE","subject":"Toan hoc","tuition":1500000,"description":"fixture B","status":"OPEN","format":"OFFLINE","startTime":"2026-11-02T11:00:00.000Z","endTime":"2026-11-02T12:30:00.000Z","location":"Phong 201","tutorId":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","schedulesId":[]}`
- **Success (real):**
  - not reached: the valid body hits the `data` destructuring TypeError in tutor-service before the insert
- **Errors (real):**
  - `500` owner, valid body: `{"success":false,"statusCode":500,"message":"Cannot destructure property 'name' of 'data' as it is undefined.","path":"/classes","correlationId":"e533529a-20a6-4d10-a230-df9863e66e2b","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:03.582Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/classes","correlationId":"79f36cfb-6877-4a58-9628-b0b551dbb62c","timestamp":"2026-10-10T11:29:03.584Z"}`
  - `422` tutorId abc: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"tutorId","message":"Invalid tutor ID","code":"invalid_format"}],"path":"/classes","correlationId":"22f2d1a7-4799-4a29-ac7f-37dd4a59c2de","timestamp":"2026-10-10T11:29:03.586Z"}`
  - `500` student token, valid body: `{"success":false,"statusCode":500,"message":"Cannot destructure property 'name' of 'data' as it is undefined.","path":"/classes","correlationId":"0a93b123-d2fc-434e-b079-92d72c4de6dd","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:03.897Z"}`
  - not triggered: 409 `CLASS_NAME_EXISTS`, `CLASS_CODE_EXISTS`, 400 `TUTOR_NOT_FOUND`: unreachable until the payload mismatch is fixed
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** BUG: every valid body returns 500 (`tutor-service` destructures `data`, which the gateway does not send). The 422 and 401 paths behave as documented. The 201 path, and the 400/409/404 downstream codes, are unreachable until the payload mismatch is fixed.

#### 39. PUT /classes/:id
- **Source:** `features/class/class.controller.ts:58` (`update`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; body `UpdateClassDto` (`updateClassSchema` = create fields partial, without `tutorId`, plus `studentIds` uuid[] ≤100 optional)
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `class.update` `{userId, id, ...dto}` → TUTOR_SERVICE
- **Known mismatch:** `ClassService.updateClassService` reads `data` (`{userId, id, data}`), but the gateway sends the DTO flat. A non-owner gets 404. The owner hits a TypeError because `data.name` is read on `undefined`.
- **Request (sent):**
  - owner, valid body (token: tutor): `PUT /classes/0023a7d8-44dc-43cb-80a7-106f6432d509` body `{"status":"CLOSED","location":"Phong 305","studentIds":["7fcca22a-c9f8-4b8a-98e1-642b2c91d995"]}`
  - non-owner student (token: student): `PUT /classes/0023a7d8-44dc-43cb-80a7-106f6432d509` body `{"status":"CLOSED"}`
  - status ARCHIVED (token: tutor): `PUT /classes/0023a7d8-44dc-43cb-80a7-106f6432d509` body `{"status":"ARCHIVED"}`
  - no token (token: none): `PUT /classes/0023a7d8-44dc-43cb-80a7-106f6432d509` body `{"status":"CLOSED"}`
  - unknown id (token: tutor): `PUT /classes/00000000-0000-4000-8000-0000000000b1` body `{"status":"CLOSED"}`
- **Success (real):**
  - not reached: owner call hits the `data` TypeError in tutor-service
- **Errors (real):**
  - `500` owner, valid body: `{"success":false,"statusCode":500,"message":"Cannot read properties of undefined (reading 'name')","path":"/classes/0023a7d8-44dc-43cb-80a7-106f6432d509","correlationId":"157f0290-74c2-4922-8ad9-60c0046ff7ae","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:04.213Z"}`
  - `404` non-owner student: `{"success":false,"statusCode":404,"message":"Không tìm thấy lớp học","path":"/classes/0023a7d8-44dc-43cb-80a7-106f6432d509","correlationId":"9f3bcc62-3bc0-4814-a397-fcde662fa17b","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:04.527Z"}`
  - `422` status ARCHIVED: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"status","message":"Invalid option: expected one of \"OPEN\"|\"CLOSED\"|\"UPCOMING\"","code":"invalid_value"}],"path":"/classes/0023a7d8-44dc-43cb-80a7-106f6432d509","correlationId":"a1182b0e-5f96-4213-8070-80de0ca11edc","timestamp":"2026-10-10T11:29:04.530Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/classes/0023a7d8-44dc-43cb-80a7-106f6432d509","correlationId":"10aa602f-5b0a-4460-b9fc-aecdb1733acf","timestamp":"2026-10-10T11:29:04.532Z"}`
  - `404` unknown id: `{"success":false,"statusCode":404,"message":"Không tìm thấy lớp học","path":"/classes/00000000-0000-4000-8000-0000000000b1","correlationId":"acc025ae-f9d3-4830-a42a-d53b40770437","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:04.846Z"}`
  - not triggered: owner-side success path (200): blocked by the owner 500
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** BUG: the owner's valid update returns 500 (payload mismatch). Non-owner returns 404 as documented, 422 and 401 OK.

#### 40. GET /classes/generate-code
- **Source:** `features/class/class.controller.ts:71` (`generateCode`)
- **Auth:** JWT + Redis session
- **Request:** none
- **Success:** 200; data = TUTOR_SERVICE reply (generated code)
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `class.generateCode` `{}` → TUTOR_SERVICE
- **Request (sent):**
  - owner (token: tutor): `GET /classes/generate-code`
  - no token (token: none): `GET /classes/generate-code`
- **Success (real):**
  - `200` owner: `{"statusCode":200,"message":"Thành công","data":{"code":"K4AC6Y"},"timestamp":"2026-10-10T11:29:04.851Z","method":"GET","path":"/classes/generate-code","correlationId":"c52eb1f1-3d63-4191-8faf-1ca4f12fa570"}`
- **Errors (real):**
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/classes/generate-code","correlationId":"45893151-f331-4a2f-8189-a42e48bcd77f","timestamp":"2026-10-10T11:29:04.852Z"}`
  - not triggered: 409 `UNABLE_TO_GENERATE_UNIQUE_CODE`: needs 5 colliding codes, not forced
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** OK: 200 with `{code}` (6 uppercase alphanumerics). 409 not triggered (see below).

#### 41. GET /classes
- **Source:** `features/class/class.controller.ts:85` (`getAll`)
- **Auth:** JWT + Redis session
- **Request:** query `GetClassesQueryDto` (`getClassesQuerySchema`): `page` default 1; `limit` 1–100 default 10; `search` trimmed optional; `status` OPEN|CLOSED|UPCOMING optional; `subject` string optional; `studentsId` uuid optional
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `class.getAll` `{userId, ...query}` → TUTOR_SERVICE
- **Known mismatch:** the handler reads `query` from `{userId, query}`. The gateway sends the query flat, so `query` is `undefined`. `getClassesService` spreads it into `{}`, so the request succeeds with defaults (page 1, limit 10, no filters). `search`, `status`, `subject`, `studentsId`, `page` and `limit` are all silently ignored.
- **Request (sent):**
  - filters (page,limit,status,search) (token: tutor): `GET /classes?page=1&limit=5&status=OPEN&search=To%C3%A1n`
  - limit=500 (token: tutor): `GET /classes?limit=500`
  - no token (token: none): `GET /classes?page=1`
- **Success (real):**
  - `200` filters (page,limit,status,search): `{"statusCode":200,"message":"Thành công","data":{"classes":[{"id":"fe4d599e-324f-4d64-ae01-4fe2d95df3a6","name":"LIVE-A Test Class 1791631704","code":"LIVEA704","subject":"Toan","tuition":"0.00","description":null,"status":"OPEN","format":"ONLINE","startTime":"2026-10-10T11:28:24.791Z","endTime":"2026-10-10T12:28:24.791Z","location":null,"curriculumId":null,"tutorId":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","createdAt":"2026-10-10T11:28:24.791Z","updatedAt":"2026-10-10T11:28:24.791Z","students":[{"classId":"fe4d599e-324f-4d64-ae01-4fe2d95df3a6","id":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","firstName":"Student","lastName":"Account","email":"student@finance.dev","phone":null,"avatar":null,"userCode":null,"gender":null,"school":null,"enrolledAt":"2026-10-10T11:28:35.601Z"}],"schedules":[]},{"id":"0023a7d8-44dc-43cb-80a7-106f6432d509","name":"B-test class K","code":"BK6317431","subject":"Toan","tuition":"0.00","description":null,"status":"OPEN","format":"OFFLINE","startTime":"2026-10-10T11:29:03.256Z","endTime":"2026-10-10T12:29:03.256Z","location":null,"curriculumId":"51875e2a-10b0-4d60-8873-3ac8737390c9","tutorId":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","createdAt":"2026-10-10T11:29:03.256Z","updatedAt":"2026-10-10T11:29:03.256Z","students":[{"classId":"0023a7d8-44dc-43cb-80a7-106f6432d509","id":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","firstName":"Student","lastName":"Account","email":"student@finance.dev","phone":null,"avatar":null,"userCode":null,"gender":null,"school":null,"enrolledAt":"2026-10-10T11:29:03.257Z"}],"schedules":[]}],"pagination":{"total":3,"page":1,"limit":10,"totalPages":1}},"timestamp":"2026-10-10T11:29:04.908Z","method":"GET","path":"/classes?page=1&limit=5&status=OPEN&search=To%25C3%25A1n","correlationId":"5cdae209-d37d-4a69-b168-7a1bc5d50c5c"}`
- **Errors (real):**
  - `422` limit=500: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"limit","message":"Too big: expected number to be <=100","code":"too_big"}],"path":"/classes?limit=500","correlationId":"0b24ccc2-c01f-4ed8-a897-d1398385bded","timestamp":"2026-10-10T11:29:04.912Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/classes?page=1","correlationId":"fce4b34c-a87d-4aea-a7b9-de267db79c77","timestamp":"2026-10-10T11:29:04.914Z"}`
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** BUG: `limit=5` came back as `pagination.limit: 10`, so the query is ignored (planned mismatch confirmed). The filter values could not be shown to be applied, because every class of this tutor matched the request.

#### 42. GET /classes/:id
- **Source:** `features/class/class.controller.ts:98` (`getById`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `class.getById` `{userId, id}` → TUTOR_SERVICE
- **Request (sent):**
  - owner tutor (token: tutor): `GET /classes/0023a7d8-44dc-43cb-80a7-106f6432d509`
  - enrolled student (token: student): `GET /classes/0023a7d8-44dc-43cb-80a7-106f6432d509`
  - admin (not tutor/student) (token: admin): `GET /classes/0023a7d8-44dc-43cb-80a7-106f6432d509`
  - id abc (token: tutor): `GET /classes/abc`
  - no token (token: none): `GET /classes/0023a7d8-44dc-43cb-80a7-106f6432d509`
- **Success (real):**
  - `200` owner tutor: `{"statusCode":200,"message":"Thành công","data":{"id":"0023a7d8-44dc-43cb-80a7-106f6432d509","name":"B-test class K","code":"BK6317431","subject":"Toan","tuition":"0.00","description":null,"status":"OPEN","format":"OFFLINE","startTime":"2026-10-10T11:29:03.256Z","endTime":"2026-10-10T12:29:03.256Z","location":null,"curriculumId":"51875e2a-10b0-4d60-8873-3ac8737390c9","tutorId":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","createdAt":"2026-10-10T11:29:03.256Z","updatedAt":"2026-10-10T11:29:03.256Z","students":[{"id":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","firstName":"Student","lastName":"Account","email":"student@finance.dev","phone":null,"avatar":null,"userCode":null,"gender":null,"school":null,"enrolledAt":"2026-10-10T11:29:03.257Z"}]},"timestamp":"2026-10-10T11:29:04.920Z","method":"GET","path":"/classes/0023a7d8-44dc-43cb-80a7-106f6432d509","correlationId":"b47dfa06-5027-456c-8ce3-27f1d01e68fc"}`
  - `200` enrolled student: `{"statusCode":200,"message":"Thành công","data":{"id":"0023a7d8-44dc-43cb-80a7-106f6432d509","name":"B-test class K","code":"BK6317431","subject":"Toan","tuition":"0.00","description":null,"status":"OPEN","format":"OFFLINE","startTime":"2026-10-10T11:29:03.256Z","endTime":"2026-10-10T12:29:03.256Z","location":null,"curriculumId":"51875e2a-10b0-4d60-8873-3ac8737390c9","tutorId":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","createdAt":"2026-10-10T11:29:03.256Z","updatedAt":"2026-10-10T11:29:03.256Z","students":[{"id":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","firstName":"Student","lastName":"Account","email":"student@finance.dev","phone":null,"avatar":null,"userCode":null,"gender":null,"school":null,"enrolledAt":"2026-10-10T11:29:03.257Z"}]},"timestamp":"2026-10-10T11:29:04.929Z","method":"GET","path":"/classes/0023a7d8-44dc-43cb-80a7-106f6432d509","correlationId":"1b54c298-2c71-4b84-8787-37b2e7130b0d"}`
- **Errors (real):**
  - `404` admin (not tutor/student): `{"success":false,"statusCode":404,"message":"Không tìm thấy lớp học","path":"/classes/0023a7d8-44dc-43cb-80a7-106f6432d509","correlationId":"0602e270-8858-4ccc-8c24-a0c82fb53630","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:05.251Z"}`
  - `400` id abc: `{"success":false,"statusCode":400,"message":"ID lớp học phải là UUID","path":"/classes/abc","correlationId":"f0dc4242-061d-4cdf-9200-6db621edac57","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:05.560Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/classes/0023a7d8-44dc-43cb-80a7-106f6432d509","correlationId":"aee687fb-a044-49fb-8015-f34a313e678e","timestamp":"2026-10-10T11:29:05.562Z"}`
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** OK: 200 for the owner tutor and for an enrolled student (the `students` array is present). Admin and unknown callers get 404, `abc` gets 400, and no token gets 401, all as documented.

#### 43. POST /classes/:id/students
- **Source:** `features/class/class.controller.ts:107` (`addStudents`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; body `AddStudentsDto` (`addStudentsSchema`): `studentIds` uuid[] 1–100 required
- **Success:** 200 (`HttpCode OK`, not 201); data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `class.addStudents` `{userId, classId, studentIds}` → TUTOR_SERVICE
- **Known mismatch:** `ClassService.addStudentsService` reads `data.studentIds`, but the gateway sends `studentIds` at the top level. A non-owner gets 404. The owner hits a TypeError.
- **Request (sent):**
  - owner, valid body (token: tutor): `POST /classes/0023a7d8-44dc-43cb-80a7-106f6432d509/students` body `{"studentIds":["7fcca22a-c9f8-4b8a-98e1-642b2c91d995"]}`
  - studentIds empty (token: tutor): `POST /classes/0023a7d8-44dc-43cb-80a7-106f6432d509/students` body `{"studentIds":[]}`
  - non-owner student (token: student): `POST /classes/0023a7d8-44dc-43cb-80a7-106f6432d509/students` body `{"studentIds":["7fcca22a-c9f8-4b8a-98e1-642b2c91d995"]}`
  - no token (token: none): `POST /classes/0023a7d8-44dc-43cb-80a7-106f6432d509/students` body `{"studentIds":["7fcca22a-c9f8-4b8a-98e1-642b2c91d995"]}`
- **Success (real):**
  - not reached: owner call hits the `data.studentIds` TypeError in tutor-service
- **Errors (real):**
  - `500` owner, valid body: `{"success":false,"statusCode":500,"message":"Cannot read properties of undefined (reading 'studentIds')","path":"/classes/0023a7d8-44dc-43cb-80a7-106f6432d509/students","correlationId":"b6eec21b-9bd5-4f16-8846-58ba66444493","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:05.877Z"}`
  - `422` studentIds empty: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"studentIds","message":"At least 1 student is required","code":"too_small"}],"path":"/classes/0023a7d8-44dc-43cb-80a7-106f6432d509/students","correlationId":"ccd5ade2-1460-4eeb-8676-f6d0028cdd2f","timestamp":"2026-10-10T11:29:05.880Z"}`
  - `404` non-owner student: `{"success":false,"statusCode":404,"message":"Không tìm thấy lớp học","path":"/classes/0023a7d8-44dc-43cb-80a7-106f6432d509/students","correlationId":"8c382172-eeca-41b5-ab9e-65509b8fd38e","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:06.190Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/classes/0023a7d8-44dc-43cb-80a7-106f6432d509/students","correlationId":"6de890a6-9b6e-423c-9783-a7cbbe01c1f7","timestamp":"2026-10-10T11:29:06.192Z"}`
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** BUG: owner's valid body returns 500 (`studentIds` read from `data`, which is not sent). Non-owner 404, empty list 422 and no token 401 are as documented.

#### 44. GET /classes/:id/students
- **Source:** `features/class/class.controller.ts:121` (`getStudents`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `class.getStudents` `{userId, classId}` → TUTOR_SERVICE
- **Known mismatch:** the handler reads `id`, but the gateway sends `classId`. The service therefore sees an empty id and always returns 400 `CLASS_ID_MUST_BE_UUID`. The route never succeeds today.
- **Request (sent):**
  - owner tutor (token: tutor): `GET /classes/0023a7d8-44dc-43cb-80a7-106f6432d509/students`
  - no token (token: none): `GET /classes/0023a7d8-44dc-43cb-80a7-106f6432d509/students`
- **Success (real):**
  - not reached: `classId`/`id` mismatch makes the service return 400 for every call
- **Errors (real):**
  - `400` owner tutor: `{"success":false,"statusCode":400,"message":"ID lớp học phải là UUID","path":"/classes/0023a7d8-44dc-43cb-80a7-106f6432d509/students","correlationId":"4b2e2f3b-b111-406d-858b-b54fe029ec7d","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:06.502Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/classes/0023a7d8-44dc-43cb-80a7-106f6432d509/students","correlationId":"e7263ed4-1feb-4a98-a2a5-252d3ee665c8","timestamp":"2026-10-10T11:29:06.504Z"}`
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** BUG: always 400 `CLASS_ID_MUST_BE_UUID` for the owner tutor (`classId` vs `id` mismatch). The 401 path is OK.

#### 45. GET /classes/:id/materials
- **Source:** `features/class/class.controller.ts:130` (`getMaterials`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `class.getMaterials` `{userId, classId}` → TUTOR_SERVICE
- **Known mismatch:** same `classId`/`id` mismatch as route 44. Always 400 `CLASS_ID_MUST_BE_UUID` today.
- **Request (sent):**
  - owner tutor (token: tutor): `GET /classes/0023a7d8-44dc-43cb-80a7-106f6432d509/materials`
  - no token (token: none): `GET /classes/0023a7d8-44dc-43cb-80a7-106f6432d509/materials`
- **Success (real):**
  - not reached: `classId`/`id` mismatch makes the service return 400 for every call
- **Errors (real):**
  - `400` owner tutor: `{"success":false,"statusCode":400,"message":"ID lớp học phải là UUID","path":"/classes/0023a7d8-44dc-43cb-80a7-106f6432d509/materials","correlationId":"9020ce72-2265-4ff8-a994-358283bc8343","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:06.815Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/classes/0023a7d8-44dc-43cb-80a7-106f6432d509/materials","correlationId":"a66f1080-f033-4d8a-b133-ef31aee8c1f6","timestamp":"2026-10-10T11:29:06.817Z"}`
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** BUG: always 400 `CLASS_ID_MUST_BE_UUID` for the owner tutor (same `classId`/`id` mismatch as route 44). The 401 path is OK.

#### 46. GET /classes/:id/watches
- **Source:** `features/class/class.controller.ts:142` (`getWatch`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `class.getWatch` `{userId, classId}` → TUTOR_SERVICE
- **Known mismatch:** same `classId`/`id` mismatch as route 44. Always 400 `CLASS_ID_MUST_BE_UUID` today.
- **Request (sent):**
  - owner tutor (token: tutor): `GET /classes/0023a7d8-44dc-43cb-80a7-106f6432d509/watches`
  - no token (token: none): `GET /classes/0023a7d8-44dc-43cb-80a7-106f6432d509/watches`
- **Success (real):**
  - not reached: `classId`/`id` mismatch makes the service return 400 for every call
- **Errors (real):**
  - `400` owner tutor: `{"success":false,"statusCode":400,"message":"ID lớp học phải là UUID","path":"/classes/0023a7d8-44dc-43cb-80a7-106f6432d509/watches","correlationId":"44088fda-3237-43e7-a793-af15772380e5","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:07.125Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/classes/0023a7d8-44dc-43cb-80a7-106f6432d509/watches","correlationId":"2f25bdb0-a87d-48d0-8c37-d455befceb3a","timestamp":"2026-10-10T11:29:07.129Z"}`
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** BUG: always 400 `CLASS_ID_MUST_BE_UUID` for the owner tutor (same `classId`/`id` mismatch as route 44). The 401 path is OK.

#### 47. DELETE /classes/:id
- **Source:** `features/class/class.controller.ts:151` (`del`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `class.delete` `{userId, id}` → TUTOR_SERVICE
- **Request (sent):**
  - non-owner student (token: student): `DELETE /classes/ab57df4e-dee0-4493-b8af-c4f93be422f9`
  - owner tutor (token: tutor): `DELETE /classes/ab57df4e-dee0-4493-b8af-c4f93be422f9`
  - same id again (token: tutor): `DELETE /classes/ab57df4e-dee0-4493-b8af-c4f93be422f9`
  - no token (token: none): `DELETE /classes/ab57df4e-dee0-4493-b8af-c4f93be422f9`
- **Success (real):**
  - `200` owner tutor: `{"statusCode":200,"message":"Thành công","data":{"id":"ab57df4e-dee0-4493-b8af-c4f93be422f9"},"timestamp":"2026-10-10T11:29:07.455Z","method":"DELETE","path":"/classes/ab57df4e-dee0-4493-b8af-c4f93be422f9","correlationId":"ea677792-30c4-4c6d-a509-0117d2fb7f0a"}`
- **Errors (real):**
  - `404` non-owner student: `{"success":false,"statusCode":404,"message":"Không tìm thấy lớp học","path":"/classes/ab57df4e-dee0-4493-b8af-c4f93be422f9","correlationId":"7aa6a28f-c4ff-4a24-b3cd-b6cd549d6587","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:07.443Z"}`
  - `404` same id again: `{"success":false,"statusCode":404,"message":"Không tìm thấy lớp học","path":"/classes/ab57df4e-dee0-4493-b8af-c4f93be422f9","correlationId":"f7e13c4e-b473-4c87-a645-b94b949700dc","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:07.768Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/classes/ab57df4e-dee0-4493-b8af-c4f93be422f9","correlationId":"b2b2ce39-ee3c-4bba-b86d-20ab863d988f","timestamp":"2026-10-10T11:29:07.769Z"}`
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** OK: owner 200 `{id}`; non-owner student 404; second delete 404; no token 401. (Cascade of enrolments was not checked.)

## Curriculum (`/curriculum`)

#### 48. GET /curriculum/generate-code
- **Source:** `features/curriculum/curriculum.controller.ts:39` (`generateCode`)
- **Auth:** JWT + Redis session
- **Request:** none
- **Success:** 201 (`HttpCode CREATED` on a GET); data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `curriculum.generateCode` `{}` → TUTOR_SERVICE
- **Request (sent):**
  - owner (token: tutor): `GET /curriculum/generate-code`
  - no token (token: none): `GET /curriculum/generate-code`
- **Success (real):**
  - `201` owner: `{"statusCode":201,"message":"Thành công","data":{"code":"FQHOEL"},"timestamp":"2026-10-10T11:29:07.774Z","method":"GET","path":"/curriculum/generate-code","correlationId":"b111cc87-005c-4e42-bd96-23f42d5acd7b"}`
- **Errors (real):**
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/curriculum/generate-code","correlationId":"569495fe-80e7-4ef4-b88c-b2b530c1f70d","timestamp":"2026-10-10T11:29:07.775Z"}`
  - not triggered: 409 `UNABLE_TO_GENERATE_UNIQUE_CODE`: needs 5 colliding codes, not forced
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** OK: 201 with `{code}`, which matches the doc bullet. Note the status differs from route 40 (GET generate-code returns 200); both are real. The 409 path is not triggered.

#### 49. POST /curriculum
- **Source:** `features/curriculum/curriculum.controller.ts:61` (`create`)
- **Auth:** JWT + Redis session
- **Request:** body `CreateCurriculumDto` (`createCurriculumSchema`): `subject` string 1–255 required; `code` string 1–6 required; `grade` string or number, coerced to number, required; `courseTime` string required; `description` optional; `gradesId` uuid required
- **Success:** 201; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `curriculum.create` `{userId, ...dto}` → TUTOR_SERVICE
- **Known mismatch:** the handler reads `createCurriculum` from `{userId, createCurriculum}`, but the gateway sends the DTO flat. Every valid request fails with a TypeError. Also, even once fixed, `CurriculumRepository.create` inserts `gradesId: null`, so the `gradesId` the client sends is discarded.
- **Request (sent):**
  - owner, valid body (token: tutor): `POST /curriculum` body `{"subject":"B-test Dai So","code":"DSA631","grade":"12","courseTime":"12 buoi","description":"fixture B","gradesId":"2f91664f-5bdd-4a10-aeda-c64223c73fdd"}`
  - code 7 chars (token: tutor): `POST /curriculum` body `{"subject":"B-test Dai So","code":"DSA1234","grade":"12","courseTime":"12 buoi","description":"fixture B","gradesId":"2f91664f-5bdd-4a10-aeda-c64223c73fdd"}`
  - no token (token: none): `POST /curriculum` body `{"subject":"B-test Dai So","code":"DSA631","grade":"12","courseTime":"12 buoi","description":"fixture B","gradesId":"2f91664f-5bdd-4a10-aeda-c64223c73fdd"}`
- **Success (real):**
  - not reached: `createCurriculum` is undefined in tutor-service, so every valid body fails
- **Errors (real):**
  - `500` owner, valid body: `{"success":false,"statusCode":500,"message":"Cannot destructure property 'subject' of 'data' as it is undefined.","path":"/curriculum","correlationId":"95b0147c-1344-477c-afe6-5e3321bebbe5","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:08.089Z"}`
  - `422` code 7 chars: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"code","message":"Code curriculum must me 6 character ...","code":"too_big"}],"path":"/curriculum","correlationId":"ad3fb8e6-1718-454f-bea6-20ef2fc9d7eb","timestamp":"2026-10-10T11:29:08.091Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/curriculum","correlationId":"3769dce6-5d35-43ef-8848-6654bb1ad2ab","timestamp":"2026-10-10T11:29:08.093Z"}`
  - not triggered: service-side duplicate/validation errors beyond 422: not reachable behind the 500
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** BUG: valid body returns 500 (`curriculum.create` reads `createCurriculum`, which is not sent). 422 and 401 OK.

#### 50. GET /curriculum
- **Source:** `features/curriculum/curriculum.controller.ts:76` (`getAll`)
- **Auth:** JWT + Redis session
- **Request:** query `page` default 1; `limit` 1–100 default 10; `search` trimmed optional
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `curriculum.getAll` `{userId, ...query}` → TUTOR_SERVICE
- **Known mismatch:** the handler reads `query` from `{userId, query}`, but the gateway sends it flat. `query.page` then throws. The route fails for every valid request.
- **Request (sent):**
  - page,limit,search (token: tutor): `GET /curriculum?page=1&limit=10&search=%C4%90%E1%BA%A1i`
  - limit=0 (token: tutor): `GET /curriculum?limit=0`
  - no token (token: none): `GET /curriculum?page=1`
- **Success (real):**
  - not reached: `query` is undefined in tutor-service, so every valid query fails
- **Errors (real):**
  - `500` page,limit,search: `{"success":false,"statusCode":500,"message":"Cannot read properties of undefined (reading 'page')","path":"/curriculum?page=1&limit=10&search=%25C4%2590%25E1%25BA%25A1i","correlationId":"0316a677-1b1b-4a54-9642-a678265c700d","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:08.407Z"}`
  - `422` limit=0: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"limit","message":"Too small: expected number to be >=1","code":"too_small"}],"path":"/curriculum?limit=0","correlationId":"f3b31fd6-96f3-4f27-a829-888eab0d0a82","timestamp":"2026-10-10T11:29:08.410Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/curriculum?page=1","correlationId":"3ed04628-e3e3-4884-85e2-9966a729e31a","timestamp":"2026-10-10T11:29:08.412Z"}`
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** BUG: every valid query returns 500 `Cannot read properties of undefined (reading 'page')`. 422 and 401 OK.

#### 51. GET /curriculum/:id
- **Source:** `features/curriculum/curriculum.controller.ts:89` (`getById`)
- **Auth:** JWT + Redis session
- **Request:** path `id` (no UUID pipe)
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `curriculum.getById` `{userId, id}` → TUTOR_SERVICE
- **Notes:** an id that is not in the database returns 200 with `data: null`, because the service does not throw. An invalid UUID returns 400.
- **Request (sent):**
  - owner (token: tutor): `GET /curriculum/51875e2a-10b0-4d60-8873-3ac8737390c9`
  - unknown id (token: tutor): `GET /curriculum/00000000-0000-4000-8000-0000000000b1`
  - id abc (token: tutor): `GET /curriculum/abc`
  - no token (token: none): `GET /curriculum/51875e2a-10b0-4d60-8873-3ac8737390c9`
- **Success (real):**
  - `200` owner: `{"statusCode":200,"message":"Thành công","data":{"id":"51875e2a-10b0-4d60-8873-3ac8737390c9","userId":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","gradesId":null,"subject":"B-test curriculum A","code":"BTIL7F","grade":"12","courseTime":"12 buoi","description":"fixture B","createdAt":"2026-10-10T11:29:03.171Z","updatedAt":"2026-10-10T11:29:03.171Z","chapterCount":1,"lessonCount":1,"chapters":[{"id":"4864d113-2136-4359-8af4-a305bb1f2035","curriculumId":"51875e2a-10b0-4d60-8873-3ac8737390c9","title":"B-test chapter 1","description":null,"order":1,"createdAt":"2026-10-10T11:29:03.254Z","updatedAt":"2026-10-10T11:29:03.254Z","lessons":[{"id":"9ad3bc5b-18ad-49fe-a662-98b8df8ba13d","curriculumId":"51875e2a-10b0-4d60-8873-3ac8737390c9","chapterId":"4864d113-2136-4359-8af4-a305bb1f2035","title":"B-test lesson fixture","description":null,"theoryUrls":[],"exerciseUrls":[],"order":1,"createdAt":"2026-10-10T11:29:03.255Z","updatedAt":"2026-10-10T11:29:03.255Z"}]}],"lessons":[]},"timestamp":"2026-10-10T11:29:08.419Z","method":"GET","path":"/curriculum/51875e2a-10b0-4d60-8873-3ac8737390c9","correlationId":"8553f861-a98d-4fc3-ab67-a31b6a356f93"}`
  - `200` unknown id: `{"statusCode":200,"message":"Thành công","data":null,"timestamp":"2026-10-10T11:29:08.425Z","method":"GET","path":"/curriculum/00000000-0000-4000-8000-0000000000b1","correlationId":"aa9ba85f-e59c-4a89-92b0-0a2672861cb6"}`
- **Errors (real):**
  - `400` id abc: `{"success":false,"statusCode":400,"message":"ID chương trình học không hợp lệ","path":"/curriculum/abc","correlationId":"bcb1253e-711a-4669-84b9-91f62601c4d8","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:08.735Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/curriculum/51875e2a-10b0-4d60-8873-3ac8737390c9","correlationId":"25c40f86-8d9d-4d58-be95-44ead207da56","timestamp":"2026-10-10T11:29:08.736Z"}`
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** OK: owner 200 with curriculum, chapters and lessons. Unknown id returns 200 with `data: null` (as the doc notes). `abc` gets 400, no token 401.

#### 52. PUT /curriculum/:id
- **Source:** `features/curriculum/curriculum.controller.ts:109` (`update`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; body `UpdateCurriculumDto` (`createCurriculumSchema.partial()`)
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `curriculum.update` `{userId, id, data}` → TUTOR_SERVICE
- **Request (sent):**
  - owner, valid body (token: tutor): `PUT /curriculum/51875e2a-10b0-4d60-8873-3ac8737390c9` body `{"courseTime":"15 buoi","description":"Cap nhat so buoi hoc"}`
  - code empty (token: tutor): `PUT /curriculum/51875e2a-10b0-4d60-8873-3ac8737390c9` body `{"code":""}`
  - unknown id (token: tutor): `PUT /curriculum/00000000-0000-4000-8000-0000000000b1` body `{"courseTime":"15 buoi"}`
  - no token (token: none): `PUT /curriculum/51875e2a-10b0-4d60-8873-3ac8737390c9` body `{"courseTime":"15 buoi"}`
  - non-owner student (fresh fixture) (token: student): `PUT /curriculum/f29a5478-1fb1-4287-98c9-49d12cf2c5e8` body `{"courseTime":"99 buoi"}`
- **Success (real):**
  - `200` owner, valid body: `{"statusCode":200,"message":"Thành công","data":{"id":"51875e2a-10b0-4d60-8873-3ac8737390c9","userId":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","gradesId":null,"subject":"B-test curriculum A","code":"BTIL7F","grade":"12","courseTime":"15 buoi","description":"Cap nhat so buoi hoc","createdAt":"2026-10-10T11:29:03.171Z","updatedAt":"2026-10-10T11:29:03.171Z"},"timestamp":"2026-10-10T11:29:08.746Z","method":"PUT","path":"/curriculum/51875e2a-10b0-4d60-8873-3ac8737390c9","correlationId":"2241665e-829f-4e0d-b71d-81b7de69d3db"}`
  - `200` non-owner student (fresh fixture): `{"statusCode":200,"message":"Thành công","data":{"id":"f29a5478-1fb1-4287-98c9-49d12cf2c5e8","userId":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","gradesId":null,"subject":"B-test curriculum F","code":"BF0001","grade":"12","courseTime":"99 buoi","description":null,"createdAt":"2026-10-10T11:29:50.015Z","updatedAt":"2026-10-10T11:29:50.015Z"},"timestamp":"2026-10-10T11:29:50.035Z","method":"PUT","path":"/curriculum/f29a5478-1fb1-4287-98c9-49d12cf2c5e8","correlationId":"fa769a7a-ac0c-4970-8075-6dfc2bbb42fd"}`
- **Errors (real):**
  - `422` code empty: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"code","message":"Code curriculum must me 6 character ...","code":"too_small"}],"path":"/curriculum/51875e2a-10b0-4d60-8873-3ac8737390c9","correlationId":"9fea42c2-590d-43d3-8d35-a8be7f8bb893","timestamp":"2026-10-10T11:29:08.748Z"}`
  - `404` unknown id: `{"success":false,"statusCode":404,"message":"Không tìm thấy chương trình học","path":"/curriculum/00000000-0000-4000-8000-0000000000b1","correlationId":"59332304-e46f-4521-b584-b0f669095ab5","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:09.064Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/curriculum/51875e2a-10b0-4d60-8873-3ac8737390c9","correlationId":"4891cb65-df14-48da-bb4a-2ae2c40544fb","timestamp":"2026-10-10T11:29:09.065Z"}`
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** BUG (authorization): the owner update returns 200 (OK), but a **student** token also updates another tutor's curriculum and gets 200 (no ownership check on update). 422, 404 and 401 are as documented.

#### 53. DELETE /curriculum/:id
- **Source:** `features/curriculum/curriculum.controller.ts:123` (`delete`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `curriculum.delete` `{userId, id}` → TUTOR_SERVICE
- **Request (sent):**
  - non-owner student (token: student): `DELETE /curriculum/25197bdd-a533-48f7-af4d-c10a0c771854`
  - owner tutor (token: tutor): `DELETE /curriculum/25197bdd-a533-48f7-af4d-c10a0c771854`
  - same id again (token: tutor): `DELETE /curriculum/25197bdd-a533-48f7-af4d-c10a0c771854`
  - no token (token: none): `DELETE /curriculum/25197bdd-a533-48f7-af4d-c10a0c771854`
  - owner tutor (fresh fixture) (token: tutor): `DELETE /curriculum/f29a5478-1fb1-4287-98c9-49d12cf2c5e8`
  - same id again (token: tutor): `DELETE /curriculum/f29a5478-1fb1-4287-98c9-49d12cf2c5e8`
- **Success (real):**
  - `200` non-owner student: `{"statusCode":200,"message":"Thành công","data":true,"timestamp":"2026-10-10T11:29:09.076Z","method":"DELETE","path":"/curriculum/25197bdd-a533-48f7-af4d-c10a0c771854","correlationId":"0993bbb4-a6b7-496e-8e1b-11e5dec77c65"}`
  - `200` owner tutor (fresh fixture): `{"statusCode":200,"message":"Thành công","data":true,"timestamp":"2026-10-10T11:29:50.040Z","method":"DELETE","path":"/curriculum/f29a5478-1fb1-4287-98c9-49d12cf2c5e8","correlationId":"7399a79b-db6a-48e4-8c9c-ea54df9be33c"}`
- **Errors (real):**
  - `404` owner tutor: `{"success":false,"statusCode":404,"message":"Không tìm thấy chương trình học","path":"/curriculum/25197bdd-a533-48f7-af4d-c10a0c771854","correlationId":"da9b4f69-cab1-4cf6-ab2d-ed5d2b2f12aa","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:09.392Z"}`
  - `404` same id again: `{"success":false,"statusCode":404,"message":"Không tìm thấy chương trình học","path":"/curriculum/25197bdd-a533-48f7-af4d-c10a0c771854","correlationId":"bde2835a-cb6b-4c9e-80cf-e5238a14e807","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:09.707Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/curriculum/25197bdd-a533-48f7-af4d-c10a0c771854","correlationId":"276ec610-c5cd-4b48-bbb4-3964ef34512b","timestamp":"2026-10-10T11:29:09.709Z"}`
  - `404` same id again: `{"success":false,"statusCode":404,"message":"Không tìm thấy chương trình học","path":"/curriculum/f29a5478-1fb1-4287-98c9-49d12cf2c5e8","correlationId":"70f3336b-9485-45a8-8fe9-8e61611bec41","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:50.353Z"}`
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** BUG (authorization): a **student** token deleted the tutor's curriculum and got 200 `data: true`. No ownership check. The owner's delete was verified on a fresh fixture (200 `true`), and a second delete returns 404. No token 401.

## Lessons (`/curriculum/lessons`)

#### 54. POST /curriculum/lessons
- **Source:** `features/lesson/lesson.controller.ts:40` (`create`)
- **Auth:** JWT + Redis session
- **Request:** query `curriculumId` and `chapterId` read as raw strings with no validation (neither is checked at the gateway); body `CreateLessonBodyDto` (`createLessonBodySchema`): `title` string 1–255 required; `description` optional; `theoryUrls` and `exerciseUrls` arrays of `{name, url (valid URL), key}` optional; `order` int default 0 optional
- **Success:** 201; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD (body only); E-RPC (query problems surface downstream)
- **Downstream:** RMQ `lesson.create` `{curriculumId, chapterId, data}` → TUTOR_SERVICE
- **Request (sent):**
  - owner, valid body (token: tutor): `POST /curriculum/lessons?curriculumId=51875e2a-10b0-4d60-8873-3ac8737390c9&chapterId=4864d113-2136-4359-8af4-a305bb1f2035` body `{"title":"B-test lesson new","description":"fixture B","theoryUrls":[{"name":"ly-thuyet.pdf","url":"https://cdn.example.com/files/ly-thuyet.pdf","key":"lesson/b/ly-thuyet.pdf"}],"exerciseUrls":[],"order":1}`
  - title empty (token: tutor): `POST /curriculum/lessons?curriculumId=51875e2a-10b0-4d60-8873-3ac8737390c9&chapterId=4864d113-2136-4359-8af4-a305bb1f2035` body `{"title":"","description":"fixture B","theoryUrls":[{"name":"ly-thuyet.pdf","url":"https://cdn.example.com/files/ly-thuyet.pdf","key":"lesson/b/ly-thuyet.pdf"}],"exerciseUrls":[],"order":1}`
  - curriculumId query missing (token: tutor): `POST /curriculum/lessons` body `{"title":"B-test lesson new","description":"fixture B","theoryUrls":[{"name":"ly-thuyet.pdf","url":"https://cdn.example.com/files/ly-thuyet.pdf","key":"lesson/b/ly-thuyet.pdf"}],"exerciseUrls":[],"order":1}`
  - no token (token: none): `POST /curriculum/lessons?curriculumId=51875e2a-10b0-4d60-8873-3ac8737390c9&chapterId=4864d113-2136-4359-8af4-a305bb1f2035` body `{"title":"B-test lesson new","description":"fixture B","theoryUrls":[{"name":"ly-thuyet.pdf","url":"https://cdn.example.com/files/ly-thuyet.pdf","key":"lesson/b/ly-thuyet.pdf"}],"exerciseUrls":[],"order":1}`
- **Success (real):**
  - `201` owner, valid body: `{"statusCode":201,"message":"Thành công","data":{"id":"461cd4ee-6ebf-4438-b0c5-7f5f2a8850cb","curriculumId":"51875e2a-10b0-4d60-8873-3ac8737390c9","chapterId":"4864d113-2136-4359-8af4-a305bb1f2035","title":"B-test lesson new","description":"fixture B","theoryUrls":[{"key":"lesson/b/ly-thuyet.pdf","url":"https://cdn.example.com/files/ly-thuyet.pdf","name":"ly-thuyet.pdf"}],"exerciseUrls":[],"order":1,"createdAt":"2026-10-10T11:29:09.714Z","updatedAt":"2026-10-10T11:29:09.714Z"},"timestamp":"2026-10-10T11:29:09.721Z","method":"POST","path":"/curriculum/lessons?curriculumId=51875e2a-10b0-4d60-8873-3ac8737390c9&chapterId=4864d113-2136-4359-8af4-a305bb1f2035","correlationId":"8c69afc9-263f-4edf-a580-948882a6617c"}`
- **Errors (real):**
  - `422` title empty: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"title","message":"Title is required","code":"too_small"}],"path":"/curriculum/lessons?curriculumId=51875e2a-10b0-4d60-8873-3ac8737390c9&chapterId=4864d113-2136-4359-8af4-a305bb1f2035","correlationId":"96b0586e-e4ff-40c8-9750-bde067ca1794","timestamp":"2026-10-10T11:29:09.724Z"}`
  - `400` curriculumId query missing: `{"success":false,"statusCode":400,"message":"curriculumId phải là UUID hợp lệ","path":"/curriculum/lessons","correlationId":"5f4592f2-9f10-4ffc-8682-d1879bbea0fc","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:10.034Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/curriculum/lessons?curriculumId=51875e2a-10b0-4d60-8873-3ac8737390c9&chapterId=4864d113-2136-4359-8af4-a305bb1f2035","correlationId":"b6d44eec-227b-4d2b-aa90-c5c57b326650","timestamp":"2026-10-10T11:29:10.036Z"}`
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** OK: 201 with the inserted lesson row. Empty title 422; missing `curriculumId` query 400 `curriculumId phải là UUID hợp lệ` (downstream, as the doc says); no token 401.

#### 55. GET /curriculum/lessons
- **Source:** `features/lesson/lesson.controller.ts:56` (`getAll`)
- **Auth:** JWT + Redis session
- **Request:** query `curriculumId` uuid required; `chapterId` uuid optional; `page` default 1; `limit` 1–100 default 10
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `lesson.getAll` `{query}` → TUTOR_SERVICE
- **Routing risk:** `CurriculumController` (`@Controller('curriculum')`, `GET /:id`) is registered before `LessonController` (`CurriculumModule` is imported before `LessonModule` in `app.module.ts`). Express matches in registration order, so `GET /curriculum/lessons` is probably caught by `curriculum.getById` with id `lessons`. Not verified at runtime. If so, the response is the 400 below and the 422 never occurs.
- **Request (sent):**
  - valid query (token: tutor): `GET /curriculum/lessons?curriculumId=51875e2a-10b0-4d60-8873-3ac8737390c9&chapterId=4864d113-2136-4359-8af4-a305bb1f2035&page=1&limit=10`
  - curriculumId abc (token: tutor): `GET /curriculum/lessons?curriculumId=abc`
  - no token (token: none): `GET /curriculum/lessons?curriculumId=51875e2a-10b0-4d60-8873-3ac8737390c9`
- **Success (real):**
  - not reached: route shadowed by `GET /curriculum/:id` (route 51), see Verdict
- **Errors (real):**
  - `400` valid query: `{"success":false,"statusCode":400,"message":"ID chương trình học không hợp lệ","path":"/curriculum/lessons?curriculumId=51875e2a-10b0-4d60-8873-3ac8737390c9&chapterId=4864d113-2136-4359-8af4-a305bb1f2035&pag ...","correlationId":"74133bec-40eb-44a8-a848-87f9dd81ea73","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:10.346Z"}`
  - `400` curriculumId abc: `{"success":false,"statusCode":400,"message":"ID chương trình học không hợp lệ","path":"/curriculum/lessons?curriculumId=abc","correlationId":"c2aeb5bb-65de-448f-aee6-dc45255022a8","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:10.656Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/curriculum/lessons?curriculumId=51875e2a-10b0-4d60-8873-3ac8737390c9","correlationId":"d5e4dcff-ca37-43e0-a848-61c59ee3dec7","timestamp":"2026-10-10T11:29:10.658Z"}`
  - not triggered: 422 `Invalid curriculum ID`: only reachable if not shadowed by route 51
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** BUG (routing): every call returns 400 `ID chương trình học không hợp lệ`, even with a valid `curriculumId`. `GET /curriculum/:id` (route 51) matches `lessons` first, so this route is unreachable. The 422 path is not reached, as the doc predicted.

#### 56. GET /curriculum/lessons/:id
- **Source:** `features/lesson/lesson.controller.ts:68` (`getById`)
- **Auth:** JWT + Redis session
- **Request:** path `id` (no UUID pipe)
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `lesson.getById` `{id}` → TUTOR_SERVICE
- **Notes:** an id that is not in the database returns 200 with `data: null`, because the service does not throw. An invalid UUID returns 400.
- **Request (sent):**
  - owner, fixture lesson (token: tutor): `GET /curriculum/lessons/9ad3bc5b-18ad-49fe-a662-98b8df8ba13d`
  - unknown id (token: tutor): `GET /curriculum/lessons/00000000-0000-4000-8000-0000000000b1`
  - id abc (token: tutor): `GET /curriculum/lessons/abc`
  - no token (token: none): `GET /curriculum/lessons/9ad3bc5b-18ad-49fe-a662-98b8df8ba13d`
- **Success (real):**
  - `200` owner, fixture lesson: `{"statusCode":200,"message":"Thành công","data":{"id":"9ad3bc5b-18ad-49fe-a662-98b8df8ba13d","curriculumId":"51875e2a-10b0-4d60-8873-3ac8737390c9","chapterId":"4864d113-2136-4359-8af4-a305bb1f2035","title":"B-test lesson fixture","description":null,"theoryUrls":[],"exerciseUrls":[],"order":1,"createdAt":"2026-10-10T11:29:03.255Z","updatedAt":"2026-10-10T11:29:03.255Z"},"timestamp":"2026-10-10T11:29:10.664Z","method":"GET","path":"/curriculum/lessons/9ad3bc5b-18ad-49fe-a662-98b8df8ba13d","correlationId":"e12ffac4-8391-45df-886d-d65bb11a2170"}`
  - `200` unknown id: `{"statusCode":200,"message":"Thành công","data":null,"timestamp":"2026-10-10T11:29:10.668Z","method":"GET","path":"/curriculum/lessons/00000000-0000-4000-8000-0000000000b1","correlationId":"7a5c62fc-736e-46c1-a935-2c53db1b2428"}`
- **Errors (real):**
  - `400` id abc: `{"success":false,"statusCode":400,"message":"ID bài học không hợp lệ","path":"/curriculum/lessons/abc","correlationId":"bc98597c-16f4-45c7-a278-c135d22d3af0","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:10.976Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/curriculum/lessons/9ad3bc5b-18ad-49fe-a662-98b8df8ba13d","correlationId":"d6492960-a649-4943-aeb5-f02506071b0d","timestamp":"2026-10-10T11:29:10.979Z"}`
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** OK: 200 with the lesson row. Unknown id returns 200 with `data: null` (as the doc notes). `abc` 400, no token 401.

#### 57. PUT /curriculum/lessons/:id
- **Source:** `features/lesson/lesson.controller.ts:77` (`update`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; body `UpdateLessonDto` (`updateLessonSchema` = `createLessonSchema.partial()`, so it also accepts `curriculumId`, `chapterId`, `theoryUrls`, `exerciseUrls`, `order`)
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `lesson.update` `{id, data}` → TUTOR_SERVICE
- **Request (sent):**
  - owner, valid body (token: tutor): `PUT /curriculum/lessons/461cd4ee-6ebf-4438-b0c5-7f5f2a8850cb` body `{"title":"B-test lesson new (cap nhat)","order":2}`
  - theoryUrls url not-a-url (token: tutor): `PUT /curriculum/lessons/461cd4ee-6ebf-4438-b0c5-7f5f2a8850cb` body `{"theoryUrls":[{"name":"x.pdf","url":"not-a-url","key":"k"}]}`
  - unknown id (token: tutor): `PUT /curriculum/lessons/00000000-0000-4000-8000-0000000000b1` body `{"title":"x"}`
  - no token (token: none): `PUT /curriculum/lessons/461cd4ee-6ebf-4438-b0c5-7f5f2a8850cb` body `{"title":"x"}`
- **Success (real):**
  - `200` owner, valid body: `{"statusCode":200,"message":"Thành công","data":{"id":"461cd4ee-6ebf-4438-b0c5-7f5f2a8850cb","curriculumId":"51875e2a-10b0-4d60-8873-3ac8737390c9","chapterId":"4864d113-2136-4359-8af4-a305bb1f2035","title":"B-test lesson new (cap nhat)","description":"fixture B","theoryUrls":[{"key":"lesson/b/ly-thuyet.pdf","url":"https://cdn.example.com/files/ly-thuyet.pdf","name":"ly-thuyet.pdf"}],"exerciseUrls":[],"order":2,"createdAt":"2026-10-10T11:29:09.714Z","updatedAt":"2026-10-10T11:29:09.714Z"},"timestamp":"2026-10-10T11:29:10.987Z","method":"PUT","path":"/curriculum/lessons/461cd4ee-6ebf-4438-b0c5-7f5f2a8850cb","correlationId":"f933c234-e3cf-40b4-9e0d-baf344fc40bc"}`
- **Errors (real):**
  - `422` theoryUrls url not-a-url: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"theoryUrls.0.url","message":"Invalid URL","code":"invalid_format"}],"path":"/curriculum/lessons/461cd4ee-6ebf-4438-b0c5-7f5f2a8850cb","correlationId":"7f574711-0aa4-4496-99f7-fd8a02dfba68","timestamp":"2026-10-10T11:29:10.990Z"}`
  - `404` unknown id: `{"success":false,"statusCode":404,"message":"Không tìm thấy bài học","path":"/curriculum/lessons/00000000-0000-4000-8000-0000000000b1","correlationId":"011e16bb-5358-409a-a992-14e0b2a6972f","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:11.304Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/curriculum/lessons/461cd4ee-6ebf-4438-b0c5-7f5f2a8850cb","correlationId":"aee744ae-7e4b-420b-99d7-50d5f27b6076","timestamp":"2026-10-10T11:29:11.305Z"}`
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** OK: owner update 200; invalid theory URL 422 (`theoryUrls.0.url`); unknown id 404 `Không tìm thấy bài học`; no token 401.

#### 58. DELETE /curriculum/lessons/:id
- **Source:** `features/lesson/lesson.controller.ts:90` (`delete`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `lesson.delete` `{id}` → TUTOR_SERVICE
- **Request (sent):**
  - owner tutor (token: tutor): `DELETE /curriculum/lessons/461cd4ee-6ebf-4438-b0c5-7f5f2a8850cb`
  - same id again (token: tutor): `DELETE /curriculum/lessons/461cd4ee-6ebf-4438-b0c5-7f5f2a8850cb`
  - no token (token: none): `DELETE /curriculum/lessons/461cd4ee-6ebf-4438-b0c5-7f5f2a8850cb`
- **Success (real):**
  - `200` owner tutor: `{"statusCode":200,"message":"Thành công","data":true,"timestamp":"2026-10-10T11:29:11.366Z","method":"DELETE","path":"/curriculum/lessons/461cd4ee-6ebf-4438-b0c5-7f5f2a8850cb","correlationId":"ea62736c-3f4d-4e3b-bcb2-4321fd519e5d"}`
- **Errors (real):**
  - `404` same id again: `{"success":false,"statusCode":404,"message":"Không tìm thấy bài học","path":"/curriculum/lessons/461cd4ee-6ebf-4438-b0c5-7f5f2a8850cb","correlationId":"f7389dde-1395-4237-abf7-a630aa7abf4b","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:11.679Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/curriculum/lessons/461cd4ee-6ebf-4438-b0c5-7f5f2a8850cb","correlationId":"3d5471b4-fc0c-4233-8af8-ebb59aa60ee8","timestamp":"2026-10-10T11:29:11.681Z"}`
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** OK: 200 `data: true`; second delete 404; no token 401.

## Exercises (`/exercises`)

#### 59. POST /exercises
- **Source:** `features/exercise/exercise.controller.ts:40` (`create`)
- **Auth:** JWT + Redis session (no role check)
- **Request:** body `CreateExerciseDto` (`createExerciseSchema`): `tutorId` uuid required; `studentId` uuid required; `sessionId` uuid optional nullable; `lessonId` uuid optional nullable; `issueUrls` and `exerciseUrls` arrays of `{name, url, key}` optional nullable; `status` SUBMITTED|GRADED|RESUBMIT optional
- **Success:** 201; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `exercise.create` `{userId, ...dto}` → TUTOR_SERVICE
- **Known mismatch:** the handler reads `data` from `{userId, data}`, but the gateway sends the DTO flat. `data.studentId` throws on every valid request. The 403, 404 and 409 branches (`EXERCISE_SUBMIT_NOT_ALLOWED`, `USER_NOT_FOUND`, `EXERCISE_ALREADY_SUBMITTED`) cannot be reached until this is fixed.
- **Request (sent):**
  - owner tutor, valid body (token: tutor): `POST /exercises` body `{"tutorId":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","studentId":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","lessonId":"9ad3bc5b-18ad-49fe-a662-98b8df8ba13d","exerciseUrls":[{"name":"bai-lam-v2.pdf","url":"https://cdn.example.com/files/bai-lam-v2.pdf","key":"exercise/b/bai-lam-v2.pdf"}],"status":"SUBMITTED"}`
  - student token, valid body (token: student): `POST /exercises` body `{"tutorId":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","studentId":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","lessonId":"9ad3bc5b-18ad-49fe-a662-98b8df8ba13d","exerciseUrls":[{"name":"bai-lam-v2.pdf","url":"https://cdn.example.com/files/bai-lam-v2.pdf","key":"exercise/b/bai-lam-v2.pdf"}],"status":"SUBMITTED"}`
  - tutorId abc (token: tutor): `POST /exercises` body `{"tutorId":"abc","studentId":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","lessonId":"9ad3bc5b-18ad-49fe-a662-98b8df8ba13d","exerciseUrls":[{"name":"bai-lam-v2.pdf","url":"https://cdn.example.com/files/bai-lam-v2.pdf","key":"exercise/b/bai-lam-v2.pdf"}],"status":"SUBMITTED"}`
  - no token (token: none): `POST /exercises` body `{"tutorId":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","studentId":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","lessonId":"9ad3bc5b-18ad-49fe-a662-98b8df8ba13d","exerciseUrls":[{"name":"bai-lam-v2.pdf","url":"https://cdn.example.com/files/bai-lam-v2.pdf","key":"exercise/b/bai-lam-v2.pdf"}],"status":"SUBMITTED"}`
- **Success (real):**
  - not reached: `data` is undefined in tutor-service, so every valid body fails before the duplicate check
- **Errors (real):**
  - `500` owner tutor, valid body: `{"success":false,"statusCode":500,"message":"Cannot read properties of undefined (reading 'studentId')","path":"/exercises","correlationId":"d4f48b79-9d9c-4688-97a0-c4c17f274960","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:11.993Z"}`
  - `500` student token, valid body: `{"success":false,"statusCode":500,"message":"Cannot read properties of undefined (reading 'studentId')","path":"/exercises","correlationId":"20659f6c-82df-47c7-9fb5-75b61baba8ec","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:12.304Z"}`
  - `422` tutorId abc: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"tutorId","message":"tutorId must be uuid ...","code":"invalid_format"}],"path":"/exercises","correlationId":"f50b0c05-2e1c-4f09-a905-6adf7e8a0d7b","timestamp":"2026-10-10T11:29:12.307Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/exercises","correlationId":"8c5a5bd0-ff81-4312-a648-255afbc8df3c","timestamp":"2026-10-10T11:29:12.308Z"}`
  - not triggered: 403 `EXERCISE_SUBMIT_NOT_ALLOWED`, 404 `USER_NOT_FOUND`, 409 `EXERCISE_ALREADY_SUBMITTED`: blocked by the 500
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** BUG: valid body returns 500 `Cannot read properties of undefined (reading 'studentId')` for both the tutor and the student token. 422 and 401 OK. The 403/404/409 branches are unreachable behind the mismatch.

#### 60. GET /exercises
- **Source:** `features/exercise/exercise.controller.ts:61` (`getAll`)
- **Auth:** JWT + Redis session
- **Request:** query `page` default 1; `limit` 1–100 default 10; `sessionId`, `studentId`, `classId`, `tutorId` uuid optional
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `exercise.getAll` `{userId, ...query}` → TUTOR_SERVICE
- **Known mismatch:** the handler reads `query` from `{userId, query}`, but the gateway sends it flat. `ExerciseRepository.findAll` destructures `query` and throws for every valid request.
- **Request (sent):**
  - classId, studentId (token: tutor): `GET /exercises?page=1&limit=10&classId=0023a7d8-44dc-43cb-80a7-106f6432d509&studentId=7fcca22a-c9f8-4b8a-98e1-642b2c91d995`
  - classId abc (token: tutor): `GET /exercises?classId=abc`
  - no token (token: none): `GET /exercises?page=1`
- **Success (real):**
  - not reached: `query` is undefined in tutor-service, so every valid query fails
- **Errors (real):**
  - `500` classId, studentId: `{"success":false,"statusCode":500,"message":"Cannot destructure property 'page' of 'query' as it is undefined.","path":"/exercises?page=1&limit=10&classId=0023a7d8-44dc-43cb-80a7-106f6432d509&studentId=7fcca22a-c9f8-4b8a-98e1-642b2c91d995","correlationId":"d7b2ce31-4d98-4e49-82cb-24b8b487f8a1","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:12.618Z"}`
  - `422` classId abc: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"classId","message":"Invalid UUID","code":"invalid_format"}],"path":"/exercises?classId=abc","correlationId":"b301a5fe-ca75-44e9-af13-b3cbb765d775","timestamp":"2026-10-10T11:29:12.621Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/exercises?page=1","correlationId":"90b1509a-04d0-4531-9523-8754d5265138","timestamp":"2026-10-10T11:29:12.621Z"}`
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** BUG: every valid query returns 500 `Cannot destructure property 'page' of 'query' as it is undefined.`. 422 and 401 OK.

#### 61. GET /exercises/:id
- **Source:** `features/exercise/exercise.controller.ts:74` (`getById`)
- **Auth:** JWT + Redis session
- **Request:** path `id` (no UUID pipe)
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `exercise.getById` `{userId, id}` → TUTOR_SERVICE
- **Request (sent):**
  - tutor of row (token: tutor): `GET /exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537`
  - student of row (token: student): `GET /exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537`
  - admin (not tutor/student) (token: admin): `GET /exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537`
  - id abc (token: tutor): `GET /exercises/abc`
  - unknown id (token: tutor): `GET /exercises/00000000-0000-4000-8000-0000000000b1`
  - no token (token: none): `GET /exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537`
- **Success (real):**
  - `200` tutor of row: `{"statusCode":200,"message":"Thành công","data":{"id":"f4b0b612-cba8-4b1c-9b3b-1e2b13284537","lessonId":"9ad3bc5b-18ad-49fe-a662-98b8df8ba13d","sessionId":null,"tutorId":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","studentId":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","issueUrls":[],"exerciseUrls":[{"key":"exercise/b/bai-lam.pdf","url":"https://cdn.example.com/files/bai-lam.pdf","name":"bai-lam.pdf"}],"status":"SUBMITTED","score":null,"comment":null,"gradedAt":null,"createdAt":"2026-10-10T11:29:03.258Z","updatedAt":"2026-10-10T11:29:03.258Z"},"timestamp":"2026-10-10T11:29:12.626Z","method":"GET","path":"/exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537","correlationId":"6408b82f-9695-474a-90fe-e4152acb53d3"}`
  - `200` student of row: `{"statusCode":200,"message":"Thành công","data":{"id":"f4b0b612-cba8-4b1c-9b3b-1e2b13284537","lessonId":"9ad3bc5b-18ad-49fe-a662-98b8df8ba13d","sessionId":null,"tutorId":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","studentId":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","issueUrls":[],"exerciseUrls":[{"key":"exercise/b/bai-lam.pdf","url":"https://cdn.example.com/files/bai-lam.pdf","name":"bai-lam.pdf"}],"status":"SUBMITTED","score":null,"comment":null,"gradedAt":null,"createdAt":"2026-10-10T11:29:03.258Z","updatedAt":"2026-10-10T11:29:03.258Z"},"timestamp":"2026-10-10T11:29:12.632Z","method":"GET","path":"/exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537","correlationId":"7cb36edd-128a-45e9-92a7-6914df365a8c"}`
- **Errors (real):**
  - `404` admin (not tutor/student): `{"success":false,"statusCode":404,"message":"Không tìm thấy bài tập","path":"/exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537","correlationId":"baba8e2f-17f0-4d6f-ab87-dc78134e825a","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:12.946Z"}`
  - `400` id abc: `{"success":false,"statusCode":400,"message":"ID phải là UUID: Exercise Id","path":"/exercises/abc","correlationId":"2f6279bf-eb0d-4811-9642-7d6cc3f6e0fd","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:13.254Z"}`
  - `404` unknown id: `{"success":false,"statusCode":404,"message":"Không tìm thấy bài tập","path":"/exercises/00000000-0000-4000-8000-0000000000b1","correlationId":"fb080bab-363f-4b1f-9b24-b89c6d45c982","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:13.571Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537","correlationId":"d50e016d-f04e-4aac-9534-bf03a799a9c5","timestamp":"2026-10-10T11:29:13.573Z"}`
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** OK: 200 for the tutor of the row and for its student. Admin 404, unknown id 404, `abc` 400 `ID phải là UUID: Exercise Id`, no token 401.

#### 62. PATCH /exercises/:id/submit
- **Source:** `features/exercise/exercise.controller.ts:83` (`submit`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; body `SubmitExerciseDto` (`submitExerciseSchema`): `exerciseUrls` array of `{name, url, key}` min 1 required
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `exercise.submit` `{userId, id, data}` → TUTOR_SERVICE
- **Request (sent):**
  - tutor (not the student) (token: tutor): `PATCH /exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537/submit` body `{"exerciseUrls":[{"name":"bai-lam-v2.pdf","url":"https://cdn.example.com/files/bai-lam-v2.pdf","key":"exercise/b/bai-lam-v2.pdf"}]}`
  - exerciseUrls empty (token: student): `PATCH /exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537/submit` body `{"exerciseUrls":[]}`
  - no token (token: none): `PATCH /exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537/submit` body `{"exerciseUrls":[{"name":"bai-lam-v2.pdf","url":"https://cdn.example.com/files/bai-lam-v2.pdf","key":"exercise/b/bai-lam-v2.pdf"}]}`
  - student of row, valid body (token: student): `PATCH /exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537/submit` body `{"exerciseUrls":[{"name":"bai-lam-v2.pdf","url":"https://cdn.example.com/files/bai-lam-v2.pdf","key":"exercise/b/bai-lam-v2.pdf"}]}`
  - after grading (token: student): `PATCH /exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537/submit` body `{"exerciseUrls":[{"name":"bai-lam-v2.pdf","url":"https://cdn.example.com/files/bai-lam-v2.pdf","key":"exercise/b/bai-lam-v2.pdf"}]}`
- **Success (real):**
  - `200` student of row, valid body: `{"statusCode":200,"message":"Thành công","data":{"id":"f4b0b612-cba8-4b1c-9b3b-1e2b13284537","lessonId":"9ad3bc5b-18ad-49fe-a662-98b8df8ba13d","sessionId":null,"tutorId":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","studentId":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","issueUrls":[],"exerciseUrls":[{"key":"exercise/b/bai-lam-v2.pdf","url":"https://cdn.example.com/files/bai-lam-v2.pdf","name":"bai-lam-v2.pdf"}],"status":"SUBMITTED","score":null,"comment":null,"gradedAt":null,"createdAt":"2026-10-10T11:29:03.258Z","updatedAt":"2026-10-10T11:29:13.895Z"},"timestamp":"2026-10-10T11:29:13.903Z","method":"PATCH","path":"/exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537/submit","correlationId":"d9227917-79ed-4cf0-adf3-98ae0cd607ef"}`
- **Errors (real):**
  - `403` tutor (not the student): `{"success":false,"statusCode":403,"message":"Bạn chỉ có thể nộp lại bài tập của chính mình","path":"/exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537/submit","correlationId":"6e91b085-23b5-4546-898c-35aae76620fa","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:13.887Z"}`
  - `422` exerciseUrls empty: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"exerciseUrls","message":"Cần ít nhất một tệp bài làm","code":"too_small"}],"path":"/exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537/submit","correlationId":"865e5aad-79ce-407c-bcbe-348ffa5c8ad1","timestamp":"2026-10-10T11:29:13.889Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537/submit","correlationId":"c834f0d9-b85f-46bc-b2d7-e1a660f5456c","timestamp":"2026-10-10T11:29:13.891Z"}`
  - `400` after grading: `{"success":false,"statusCode":400,"message":"Bài tập đã được chấm — không thể nộp lại","path":"/exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537/submit","correlationId":"0c8a0943-577b-4ee9-9780-d5b0cde31c29","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:14.863Z"}`
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** OK: student of the row gets 200 (status reset to SUBMITTED). Tutor gets 403 `Bạn chỉ có thể nộp lại bài tập của chính mình`, empty list 422, after grading 400 `Bài tập đã được chấm — không thể nộp lại`, no token 401.

#### 63. PATCH /exercises/:id/grade
- **Source:** `features/exercise/exercise.controller.ts:97` (`grade`)
- **Auth:** JWT + Redis session (no role check; any authenticated user can call it)
- **Request:** path `id`; body `GradeExerciseDto` (`gradeExerciseSchema`): `score` number 0–10 required (coerced); `comment` string ≤2000 optional nullable
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `exercise.grade` `{userId, id, data}` → TUTOR_SERVICE
- **Notes:** the gateway does not check the role, but `ExerciseService.gradeExerciseService` allows only the row's `tutorId` (403 otherwise).
- **Request (sent):**
  - student (not assigned tutor) (token: student): `PATCH /exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537/grade` body `{"score":8.5}`
  - score 11 (token: tutor): `PATCH /exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537/grade` body `{"score":11}`
  - no token (token: none): `PATCH /exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537/grade` body `{"score":8.5}`
  - unknown id (token: tutor): `PATCH /exercises/00000000-0000-4000-8000-0000000000b1/grade` body `{"score":8.5}`
  - assigned tutor, valid body (token: tutor): `PATCH /exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537/grade` body `{"score":8.5,"comment":"Lam dung phan lon, can trinh bay ro buoc 3."}`
- **Success (real):**
  - `200` assigned tutor, valid body: `{"statusCode":200,"message":"Thành công","data":{"id":"f4b0b612-cba8-4b1c-9b3b-1e2b13284537","lessonId":"9ad3bc5b-18ad-49fe-a662-98b8df8ba13d","sessionId":null,"tutorId":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","studentId":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","issueUrls":[],"exerciseUrls":[{"key":"exercise/b/bai-lam-v2.pdf","url":"https://cdn.example.com/files/bai-lam-v2.pdf","name":"bai-lam-v2.pdf"}],"status":"GRADED","score":8.5,"comment":"Lam dung phan lon, can trinh bay ro buoc 3.","gradedAt":"2026-10-10T11:29:14.541Z","createdAt":"2026-10-10T11:29:03.258Z","updatedAt":"2026-10-10T11:29:14.541Z"},"timestamp":"2026-10-10T11:29:14.549Z","method":"PATCH","path":"/exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537/grade","correlationId":"680d0ed6-2cf9-4115-b491-ec413173f4f2"}`
- **Errors (real):**
  - `403` student (not assigned tutor): `{"success":false,"statusCode":403,"message":"Chỉ gia sư phụ trách mới được chấm bài tập này","path":"/exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537/grade","correlationId":"8d229016-69b6-4f57-b75d-fb02fb8555b6","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:14.220Z"}`
  - `422` score 11: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"score","message":"Điểm tối đa là 10","code":"too_big"}],"path":"/exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537/grade","correlationId":"022f4ce7-5664-4cad-a7c0-11e3667168aa","timestamp":"2026-10-10T11:29:14.223Z"}`
  - `401` no token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/exercises/f4b0b612-cba8-4b1c-9b3b-1e2b13284537/grade","correlationId":"d45ef43b-e7b3-40bf-98bb-27bdb25d1507","timestamp":"2026-10-10T11:29:14.224Z"}`
  - `404` unknown id: `{"success":false,"statusCode":404,"message":"Không tìm thấy bài tập","path":"/exercises/00000000-0000-4000-8000-0000000000b1/grade","correlationId":"b362ee54-6d4d-4f60-8f2f-a31c37568be7","serviceName":"tutor-service","timestamp":"2026-10-10T11:29:14.537Z"}`
  - not triggered: 504 `Timeout has occurred`: needs tutor-service stopped; service stops are not allowed on this dev box
- **Verdict:** OK: assigned tutor gets 200 (status GRADED, score is a number). The student gets 403 `Chỉ gia sư phụ trách mới được chấm bài tập này` (the service enforces the tutor rule even though the gateway has no role check). Score 11 is 422, unknown id 404, no token 401.

## Notifications (`/notifications`)

> Live run against the dev gateway (localhost:8888), tutor/student/admin role tokens. `trace` is removed from the 5xx bodies below. A test class could not be created, so the notification rows have `classId` null. Ownership probes used the STUDENT token on rows owned by the TUTOR. Those rows were deleted in the same run.

#### 64. POST /notifications
- **Source:** `features/notification/notification.controller.ts:52` (`create`)
- **Auth:** JWT + Redis session (no role check)
- **Request:** body `CreateNotificationDto` (`createNotificationSchema`): `type` SYSTEM|TUITION|STUDENT|TUTOR required; `title` string 1–255 required; `content` string required; `subContent` ≤255 optional; `senderId`, `userId`, `classId`, `studentId` uuid optional nullable; `redirectUrl` ≤500 optional; `actionLabel` ≤100 optional; `actionType` VIEW|CONTACT|PAYMENT|UPDATE optional; `metadata` record optional
- **Request (sent):** `POST /notifications`, body:
  ```json
  {"type":"TUITION","title":"Tuition reminder C 1791631856","content":"October tuition is due on 15/10/2026.","subContent":"Math 10A","senderId":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","userId":"2efd8ac1-1edd-43b1-9848-af1a42a4648a","actionLabel":"Pay now","actionType":"PAYMENT","redirectUrl":"/tuitions","metadata":{"amount":1500000}}
  ```
- **Success (real):** HTTP 201 (`success`), body:
  ```json
  {"statusCode": 201, "message": "Thành công", "data": {"id": "af293dec-27de-4fb9-b410-1d3a5f8d534f", "userId": "2efd8ac1-1edd-43b1-9848-af1a42a4648a", "senderId": "2efd8ac1-1edd-43b1-9848-af1a42a4648a", "classId": null, "studentId": null, "type": "TUITION", "title": "Tuition reminder C 1791631856", "content": "October tuition is due on 15/10/2026.", "subContent": "Math 10A", "redirectUrl": "/tuitions", "actionLabel": "Pay now", "actionType": "PAYMENT", "isRead": false, "readAt": null, "metadata": {"amount": 1500000}, "createdAt": "2026-10-10T11:30:57.171Z", "updatedAt": "2026-10-10T11:30:57.171Z"}, "timestamp": "2026-10-10T11:30:57.178Z", "method": "POST", "path": "/notifications", "correlationId": "d8be44c0-1f07-4b88-93d0-67218dde2354"}
  ```
- **Errors (real):**
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/notifications", "correlationId": "ac5d4f17-0a41-45a2-8cdb-54393f9f36f6", "timestamp": "2026-10-10T11:30:57.180Z"}`
  - `422` missing title: `{"success": false, "statusCode": 422, "message": "Dữ liệu không hợp lệ", "errors": [{"field": "title", "message": "Title is required", "code": "invalid_type"}], "path": "/notifications", "correlationId": "f0dbbe82-7640-4b1a-96c8-6951b67e7e2b", "timestamp": "2026-10-10T11:30:57.182Z"}`
  - `400` no senderId: `{"success": false, "statusCode": 400, "message": "userId không hợp lệ", "path": "/notifications", "correlationId": "8ef42302-8715-4f9b-8b2e-6566d933275e", "serviceName": "third-service", "timestamp": "2026-10-10T11:30:57.490Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `notification.create` `{userId: caller, ...dto}` → THIRD_SERVICE. If the body has no `userId`, the caller becomes the recipient. A body `userId: null` overrides that and stores no recipient.
- **Verdict:** BUG (minor, validation mismatch). Happy path returns 201 and error codes match. `senderId` is optional in the gateway schema, but a body without it returns 400 with `userId không hợp lệ`, which names the wrong field. The success row here has `classId: null` because no test class could be created (see the section intro).

#### 65. GET /notifications
- **Source:** `features/notification/notification.controller.ts:69` (`getAll`)
- **Auth:** JWT + Redis session
- **Request:** query `page` default 1; `limit` 1–100 default 10; `search` trimmed optional; `type` optional (same enum as #64); `isRead` `z.coerce.boolean()` optional (any non-empty string coerces to true, so `isRead=false` is read as true)
- **Request (sent):** query only, `GET /notifications?page=1&limit=20&type=TUITION&search=tuition`, no body
- **Success (real):** not reached: returns 500 for the happy path (see Errors).
- **Errors (real):**
  - `500` happy-path request (valid body/query): `{"success": false, "statusCode": 500, "message": "Cannot destructure property 'page' of 'query' as it is undefined.", "path": "/notifications?page=1&limit=20&type=TUITION&search=tuition", "correlationId": "14be7e9d-223d-4d63-89b6-ba9aa3fd9f6d", "serviceName": "third-service", "timestamp": "2026-10-10T11:30:57.801Z"}`
  - `500` isRead=false (coercion probe): `{"success": false, "statusCode": 500, "message": "Cannot destructure property 'page' of 'query' as it is undefined.", "path": "/notifications?page=1&limit=20&type=TUITION&isRead=false", "correlationId": "f0a77bbd-1057-4e27-b7a3-cdd8aadb0267", "serviceName": "third-service", "timestamp": "2026-10-10T11:30:58.113Z"}`
  - `422` limit=500: `{"success": false, "statusCode": 422, "message": "Dữ liệu không hợp lệ", "errors": [{"field": "limit", "message": "Too big: expected number to be <=100", "code": "too_big"}], "path": "/notifications?limit=500", "correlationId": "c3379c6b-bb5e-45d5-a141-d386f367d0e6", "timestamp": "2026-10-10T11:30:58.115Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/notifications", "correlationId": "ee1fcbbd-144d-4d74-a6fe-ad70f4f111cf", "timestamp": "2026-10-10T11:30:58.116Z"}`
  - `isRead=true|false` coercion: not verified (every list request returns 500 before the filter runs).
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `notification.getAll` `{userId, ...query}` → THIRD_SERVICE
- **Verdict:** BUG (500). The list route fails in THIRD_SERVICE with `Cannot destructure property 'page' of 'query' as it is undefined.` The doc claims 200. The `isRead` coercion probe also returns 500, so it could not be checked.

#### 66. PATCH /notifications/read-all
- **Source:** `features/notification/notification.controller.ts:81` (`markAllAsRead`)
- **Auth:** JWT + Redis session
- **Request:** none
- **Request (sent):** none (`PATCH /notifications/read-all`)
- **Success (real):** HTTP 200 (`success`), body:
  ```json
  {"statusCode": 200, "message": "Thành công", "data": [], "timestamp": "2026-10-10T11:30:58.125Z", "method": "PATCH", "path": "/notifications/read-all", "correlationId": "3865f06a-b3db-4aab-9dfe-88ead32ff739"}
  ```
- **Errors (real):**
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/notifications/read-all", "correlationId": "b9286ab6-cc5d-479b-8f3d-55ba0b80f413", "timestamp": "2026-10-10T11:30:58.127Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `notification.markAllAsRead` `{userId}` → THIRD_SERVICE
- **Verdict:** OK. Returns 200 with `data: []` (the doc's empty array, row count not returned). It marks every notification of the caller as read; the tutor had none at the time, so no existing data changed.

#### 67. GET /notifications/:id
- **Source:** `features/notification/notification.controller.ts:90` (`getById`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; the caller id is not sent, so ownership is not checked here
- **Request (sent):** none (`GET /notifications/af293dec-27de-4fb9-b410-1d3a5f8d534f`)
- **Success (real):** HTTP 200 (`success`), body:
  ```json
  {"statusCode": 200, "message": "Thành công", "data": {"id": "af293dec-27de-4fb9-b410-1d3a5f8d534f", "userId": "2efd8ac1-1edd-43b1-9848-af1a42a4648a", "senderId": "2efd8ac1-1edd-43b1-9848-af1a42a4648a", "classId": null, "studentId": null, "type": "TUITION", "title": "Tuition reminder C 1791631856", "content": "October tuition is due on 15/10/2026.", "subContent": "Math 10A", "redirectUrl": "/tuitions", "actionLabel": "Pay now", "actionType": "PAYMENT", "isRead": true, "readAt": null, "metadata": {"amount": 1500000}, "createdAt": "2026-10-10T11:30:57.171Z", "updatedAt": "2026-10-10T11:30:58.118Z"}, "timestamp": "2026-10-10T11:30:58.131Z", "method": "GET", "path": "/notifications/af293dec-27de-4fb9-b410-1d3a5f8d534f", "correlationId": "c4b729c5-c325-41fb-81ee-f4c3dfece327"}
  ```
  - student token on tutor's row (ownership probe): HTTP 200; `{"statusCode": 200, "message": "Thành công", "data": {"id": "af293dec-27de-4fb9-b410-1d3a5f8d534f", "userId": "2efd8ac1-1edd-43b1-9848-af1a42a4648a", "senderId": "2efd8ac1-1edd-43b1-9848-af1a42a4648a", "classId": null, "studentId": null, "type": "TUITION", "title": "Tuition reminder C 1791631856", "content": "October tuition is due on 15/10/2026.", "subContent": "Math 10A", "redirectUrl": "/tuitio`
- **Errors (real):**
  - `404` unknown id: `{"success": false, "statusCode": 404, "message": "Không tìm thấy thông báo", "path": "/notifications/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "e0a32820-eeb0-4111-9918-b4ceeb24773a", "serviceName": "third-service", "timestamp": "2026-10-10T11:30:58.449Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/notifications/af293dec-27de-4fb9-b410-1d3a5f8d534f", "correlationId": "e8ea7121-705c-4748-894c-315378eb3345", "timestamp": "2026-10-10T11:30:58.450Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `notification.getById` `{id}` → THIRD_SERVICE
- **Verdict:** BUG (data exposure). The happy path and the 404 and 401 cases are correct, but there is no ownership check: a STUDENT token gets 200 with the TUTOR's notification row.

#### 68. PATCH /notifications/:id/read
- **Source:** `features/notification/notification.controller.ts:99` (`markAsRead`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; no ownership check at the gateway
- **Request (sent):** none (`PATCH /notifications/af293dec-27de-4fb9-b410-1d3a5f8d534f/read`)
- **Success (real):** HTTP 200 (`success`), body:
  ```json
  {"statusCode": 200, "message": "Thành công", "data": {"id": "af293dec-27de-4fb9-b410-1d3a5f8d534f", "userId": "2efd8ac1-1edd-43b1-9848-af1a42a4648a", "senderId": "2efd8ac1-1edd-43b1-9848-af1a42a4648a", "classId": null, "studentId": null, "type": "TUITION", "title": "Tuition reminder C 1791631856", "content": "October tuition is due on 15/10/2026.", "subContent": "Math 10A", "redirectUrl": "/tuitions", "actionLabel": "Pay now", "actionType": "PAYMENT", "isRead": true, "readAt": null, "metadata": {"amount": 1500000}, "createdAt": "2026-10-10T11:30:57.171Z", "updatedAt": "2026-10-10T11:30:58.452Z"}, "timestamp": "2026-10-10T11:30:58.459Z", "method": "PATCH", "path": "/notifications/af293dec-27de-4fb9-b410-1d3a5f8d534f/read", "correlationId": "fd43f8d0-a1f1-4566-b0c3-8aa0af1ce611"}
  ```
  - student token on tutor's row (ownership probe): HTTP 200; `{"statusCode": 200, "message": "Thành công", "data": {"id": "af293dec-27de-4fb9-b410-1d3a5f8d534f", "userId": "2efd8ac1-1edd-43b1-9848-af1a42a4648a", "senderId": "2efd8ac1-1edd-43b1-9848-af1a42a4648a", "classId": null, "studentId": null, "type": "TUITION", "title": "Tuition reminder C 1791631856", "content": "October tuition is due on 15/10/2026.", "subContent": "Math 10A", "redirectUrl": "/tuitio`
- **Errors (real):**
  - `404` unknown id: `{"success": false, "statusCode": 404, "message": "Không tìm thấy thông báo", "path": "/notifications/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d/read", "correlationId": "99338238-9437-4690-ad00-1683eefeaad3", "serviceName": "third-service", "timestamp": "2026-10-10T11:30:58.776Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/notifications/af293dec-27de-4fb9-b410-1d3a5f8d534f/read", "correlationId": "2b2e1e88-bf82-4970-ac5b-708abee1bc17", "timestamp": "2026-10-10T11:30:58.777Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `notification.markAsRead` `{id}` → THIRD_SERVICE
- **Verdict:** BUG (security). The happy path is correct (`isRead` true, `readAt` stays null, matching the doc), but a STUDENT token can mark the TUTOR's notification read (200) because there is no ownership check.

#### 69. DELETE /notifications/:id
- **Source:** `features/notification/notification.controller.ts:108` (`delete`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; no ownership check at the gateway
- **Request (sent):** none (`DELETE /notifications/af293dec-27de-4fb9-b410-1d3a5f8d534f`)
- **Success (real):** HTTP 200 (`success`), body:
  ```json
  {"statusCode": 200, "message": "Thành công", "data": {"id": "af293dec-27de-4fb9-b410-1d3a5f8d534f"}, "timestamp": "2026-10-10T11:30:59.124Z", "method": "DELETE", "path": "/notifications/af293dec-27de-4fb9-b410-1d3a5f8d534f", "correlationId": "2131a4ef-60d7-4d39-9664-d3ca6f6a0ef0"}
  ```
  - student token on tutor's row (ownership probe): HTTP 200; `{"statusCode": 200, "message": "Thành công", "data": {"id": "6c6979c6-a694-4ab9-a07b-e1217395f931"}, "timestamp": "2026-10-10T11:30:58.796Z", "method": "DELETE", "path": "/notifications/6c6979c6-a694-4ab9-a07b-e1217395f931", "correlationId": "c6c12eb8-314e-4a15-a692-076ad452896b"}`
- **Errors (real):**
  - `404` re-delete same id: `{"success": false, "statusCode": 404, "message": "Không tìm thấy thông báo", "path": "/notifications/af293dec-27de-4fb9-b410-1d3a5f8d534f", "correlationId": "8379ac56-aaae-4722-8831-4fc121eef470", "serviceName": "third-service", "timestamp": "2026-10-10T11:30:59.436Z"}`
  - `404` unknown id: `{"success": false, "statusCode": 404, "message": "Không tìm thấy thông báo", "path": "/notifications/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "dbf82d88-7433-42e7-ad9d-b688d478c979", "serviceName": "third-service", "timestamp": "2026-10-10T11:30:59.748Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/notifications/af293dec-27de-4fb9-b410-1d3a5f8d534f", "correlationId": "85b0b717-10a8-4253-970b-9ee245080f22", "timestamp": "2026-10-10T11:30:59.750Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `notification.delete` `{id}` → THIRD_SERVICE
- **Verdict:** BUG (security). The happy path is correct (200 with `{id}`), but a STUDENT token deleted the TUTOR's notification (200), so there is no ownership check.


## Schedules (`/schedules`)

> Live run. No owned class and no schedule row exist (POST /classes returns 500, and schedule creation always returns 500), so the owned-schedule success paths are not reached. The class and schedule routes below show the real error responses.

#### 70. POST /schedules
- **Source:** `features/schedule/schedule.controller.ts:42` (`create`)
- **Auth:** JWT + Redis session
- **Request:** body `CreateScheduleDto` (`createScheduleSchema`): `classId` uuid required; `dayOfWeek` MONDAY…SUNDAY required; `startTime` and `endTime` `HH:mm` strings required; `format` ONLINE|OFFLINE default ONLINE; `location` optional
- **Request (sent):** `POST /schedules`, body:
  ```json
  {"classId":"0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d","dayOfWeek":"MONDAY","startTime":"18:00","endTime":"19:30","format":"OFFLINE","location":"Room 3B"}
  ```
- **Success (real):** not reached: always 500 (see Errors).
- **Errors (real):**
  - `500` happy-path request (valid body/query): `{"success": false, "statusCode": 500, "message": "Cannot read properties of undefined (reading 'classId')", "path": "/schedules", "correlationId": "9da39709-83bc-4bd9-b7d3-cb18846368f8", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:00.061Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/schedules", "correlationId": "00ddb18a-7681-4679-b281-25ab2dba274c", "timestamp": "2026-10-10T11:31:00.063Z"}`
  - `422` startTime 6pm: `{"success": false, "statusCode": 422, "message": "Dữ liệu không hợp lệ", "errors": [{"field": "startTime", "message": "Invalid time format (HH:mm)", "code": "invalid_format"}], "path": "/schedules", "correlationId": "9c5bf179-da8b-4372-a095-0679297c6000", "timestamp": "2026-10-10T11:31:00.065Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `schedule.create` `{userId, ...dto}` → TUTOR_SERVICE. Handler expects `{userId, data}` (`schedule.rpc.controller.ts`), so it fails.
- **Verdict:** BUG (always 500). Matches the doc: the handler reads `classId` from `undefined`.

#### 71. POST /schedules/bulk
- **Source:** `features/schedule/schedule.controller.ts:54` (`createBulk`)
- **Auth:** JWT + Redis session
- **Request:** body `CreateSchedulesDto` (`createSchedulesSchema`): `classId` uuid required; `schedules` array of 1–7 items, each with `dayOfWeek`, `startTime`, `endTime`, `format` (default ONLINE), `location` optional
- **Request (sent):** `POST /schedules/bulk`, body:
  ```json
  {"classId":"0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d","schedules":[{"dayOfWeek":"TUESDAY","startTime":"18:00","endTime":"19:30","format":"ONLINE"},{"dayOfWeek":"THURSDAY","startTime":"18:00","endTime":"19:30","format":"OFFLINE","location":"Room 3B"}]}
  ```
- **Success (real):** not reached: always 500 (see Errors).
- **Errors (real):**
  - `500` happy-path request (valid body/query): `{"success": false, "statusCode": 500, "message": "Cannot read properties of undefined (reading 'classId')", "path": "/schedules/bulk", "correlationId": "c0c286b1-b3f4-43d0-abe6-19e568b0cbaa", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:00.375Z"}`
  - `422` schedules []: `{"success": false, "statusCode": 422, "message": "Dữ liệu không hợp lệ", "errors": [{"field": "schedules", "message": "At least 1 schedule is required", "code": "too_small"}], "path": "/schedules/bulk", "correlationId": "55dc1f22-a30e-4a01-9a5b-c40c5f433d12", "timestamp": "2026-10-10T11:31:00.377Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/schedules/bulk", "correlationId": "0503fb92-4897-4c96-a50b-5134a6e255a7", "timestamp": "2026-10-10T11:31:00.378Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `schedule.createBulk` `{userId, ...dto}` → TUTOR_SERVICE. Handler expects `data`, so it fails.
- **Verdict:** BUG (always 500). Matches the doc.

#### 72. GET /schedules
- **Source:** `features/schedule/schedule.controller.ts:73` (`getAll`)
- **Auth:** JWT + Redis session
- **Request:** query `page` default 1; `limit` 1–100 default 10; `search` optional; `classId` uuid optional
- **Request (sent):** query only, `GET /schedules?page=1&limit=10&classId=0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d`, no body
- **Success (real):** not reached: always 500 (see Errors).
- **Errors (real):**
  - `500` happy-path request (valid body/query): `{"success": false, "statusCode": 500, "message": "Cannot read properties of undefined (reading 'page')", "path": "/schedules?page=1&limit=10&classId=0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "98d6e770-c252-4067-994d-505c449bb2e6", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:00.687Z"}`
  - `422` limit=0: `{"success": false, "statusCode": 422, "message": "Dữ liệu không hợp lệ", "errors": [{"field": "limit", "message": "Too small: expected number to be >=1", "code": "too_small"}], "path": "/schedules?limit=0", "correlationId": "97dd3616-7db7-4bbc-b28d-ee44f910a1d4", "timestamp": "2026-10-10T11:31:00.691Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/schedules", "correlationId": "d74e3d82-aa8a-4070-bd89-8c38b28179f8", "timestamp": "2026-10-10T11:31:00.692Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `schedule.getAll` `{userId, ...query}` → TUTOR_SERVICE. Handler expects `query`, so it fails.
- **Verdict:** BUG (always 500). Matches the doc in status. The message differs: the real text is `Cannot read properties of undefined (reading 'page')`, not the destructuring text the doc gives.

#### 73. GET /schedules/class/:classId
- **Source:** `features/schedule/schedule.controller.ts:86` (`getByClass`)
- **Auth:** JWT + Redis session
- **Request:** path `classId` (no UUID pipe; the handler validates it)
- **Request (sent):** none (`GET /schedules/class/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d`)
- **Success (real):** not reached: no owned class exists. POST /classes returns 500 (outside this range, route #38), and a direct DB insert was denied. The 404 below is the unknown or non-owned class response.
- **Errors (real):**
  - `404` unknown class id (no test class exists): `{"success": false, "statusCode": 404, "message": "Không tìm thấy lớp học", "path": "/schedules/class/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "2a06aa2f-c3d4-4be0-a03a-aa4d4db77674", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:01.003Z"}`
  - `400` non-uuid classId: `{"success": false, "statusCode": 400, "message": "ID lớp học phải là UUID", "path": "/schedules/class/abc", "correlationId": "6863b35a-4f18-4956-9061-2c0003090f53", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:01.312Z"}`
  - `404` student token (not owner): `{"success": false, "statusCode": 404, "message": "Không tìm thấy lớp học", "path": "/schedules/class/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "0394b10e-f16a-48fe-8831-d103c6a6da70", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:01.626Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/schedules/class/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "bf681ab6-ea6c-422f-9938-1cc97c6aee3b", "timestamp": "2026-10-10T11:31:01.627Z"}`
  - `200` owned class: not triggered: no owned class.
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `schedule.getByClass` `{userId, classId}` → TUTOR_SERVICE
- **Verdict:** NOT EXECUTED (success path). No owned class exists, so the 200 path was not reached. The 400 (non-UUID) and 404 (unknown or non-owner class) responses match the doc.

#### 74. GET /schedules/:id
- **Source:** `features/schedule/schedule.controller.ts:95` (`getById`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Request (sent):** none (`GET /schedules/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d`)
- **Success (real):** not reached: no schedule row exists. Schedule creation (#70, #71) always returns 500.
- **Errors (real):**
  - `404` unknown id: `{"success": false, "statusCode": 404, "message": "Không tìm thấy lịch học", "path": "/schedules/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "0b63d71a-c27a-4d1c-a1a9-9b0eccdf8eac", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:01.936Z"}`
  - `400` non-uuid id: `{"success": false, "statusCode": 400, "message": "ID lịch học phải là UUID", "path": "/schedules/abc", "correlationId": "8d126656-07aa-4c9a-b57e-24b29b1d951e", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:02.247Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/schedules/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "346343b4-c81f-4316-9196-3249393d9958", "timestamp": "2026-10-10T11:31:02.249Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `schedule.getById` `{userId, id}` → TUTOR_SERVICE
- **Verdict:** NOT EXECUTED (success path). No schedule row exists, and creation (#70, #71) always returns 500. The 404 and 400 responses match the doc.

#### 75. PATCH /schedules/:id
- **Source:** `features/schedule/schedule.controller.ts:104` (`update`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; body `UpdateScheduleDto` (`createScheduleSchema.partial().omit({classId})`)
- **Request (sent):** `PATCH /schedules/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d`, body:
  ```json
  {"startTime":"19:00","endTime":"20:30","location":"Room 4A"}
  ```
- **Success (real):** not reached: no owned schedule row exists (see #70, #71).
- **Errors (real):**
  - `404` unknown schedule id: `{"success": false, "statusCode": 404, "message": "Không tìm thấy lịch học", "path": "/schedules/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "c0fe5270-db49-4a09-bbbf-e73a575be471", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:02.563Z"}`
  - `422` startTime 19h: `{"success": false, "statusCode": 422, "message": "Dữ liệu không hợp lệ", "errors": [{"field": "startTime", "message": "Invalid time format (HH:mm)", "code": "invalid_format"}], "path": "/schedules/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "562542b3-6bbd-4e77-9491-b0e4b1dfa480", "timestamp": "2026-10-10T11:31:02.565Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/schedules/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "d492169e-4d6b-4463-b4f1-3f55a6d1c51f", "timestamp": "2026-10-10T11:31:02.566Z"}`
  - `500` for an owned schedule: not triggered: no owned schedule row exists.
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `schedule.update` `{userId, id, ...dto}` → TUTOR_SERVICE. Handler expects `data`, so it fails after the owner check.
- **Verdict:** NOT EXECUTED (owned-schedule path). Could not reach the owner path that the doc says returns 500, so that claim is unverified. The 404 and 422 responses match the doc.

#### 76. DELETE /schedules/:id
- **Source:** `features/schedule/schedule.controller.ts:118` (`del`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Request (sent):** none (`DELETE /schedules/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d`)
- **Success (real):** not reached: no owned schedule row exists (see #70, #71).
- **Errors (real):**
  - `404` unknown id: `{"success": false, "statusCode": 404, "message": "Không tìm thấy lịch học", "path": "/schedules/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "0150eb58-a254-4177-9c4b-ffbc52a87a59", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:02.881Z"}`
  - `400` non-uuid id: `{"success": false, "statusCode": 400, "message": "ID lịch học phải là UUID", "path": "/schedules/abc", "correlationId": "2043f7cf-0dc4-4351-bc92-58fb3e84c275", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:03.188Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/schedules/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "9e53ddd7-f52a-4e83-ad3f-8eb0edb15261", "timestamp": "2026-10-10T11:31:03.191Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `schedule.delete` `{userId, id}` → TUTOR_SERVICE
- **Verdict:** NOT EXECUTED (owned-schedule path). No owned schedule row exists. The 404 and 400 responses match the doc.


## Sessions (`/sessions`)

> Live run. No owned class and no session row exist, so the owned-session success paths are not reached. Create routes always return 500.

#### 77. POST /sessions
- **Source:** `features/session/session.controller.ts:42` (`create`)
- **Auth:** JWT + Redis session
- **Request:** body `CreateSessionDto` (`createSessionSchema`): `classId` uuid required; `sessionNumber` int ≥1 required; `startAt` and `endAt` dates required; `lessonId`, `tutorId` uuid optional nullable; `title` ≤255 optional; `description`, `location`, `note` optional; `theoryUrls` and `exerciseUrls` arrays of `{name, url (valid URL), key}` default []; `status` SCHEDULED|ONGOING|COMPLETED|CANCELLED|POSTPONED default SCHEDULED; `actualStartAt`, `actualEndAt`, `exerciseDueAt` dates optional nullable; `objectives` string[] default []; `agenda` array of `{time, title, description?}` default []
- **Request (sent):** `POST /sessions`, body:
  ```json
  {"classId":"0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d","sessionNumber":3,"title":"Quadratic equations","startAt":"2026-10-12T18:00:00+07:00","endAt":"2026-10-12T19:30:00+07:00","location":"Room 3B","theoryUrls":[{"name":"Slides W3","url":"https://example.com/slides-w3.pdf","key":"slides-w3"}],"exerciseUrls":[],"status":"SCHEDULED","objectives":["Solve ax^2+bx+c=0"],"agenda":[{"time":"18:00","title":"Warm-up"}]}
  ```
- **Success (real):** not reached: always 500 (see Errors).
- **Errors (real):**
  - `500` happy-path request (valid body/query): `{"success": false, "statusCode": 500, "message": "Cannot read properties of undefined (reading 'classId')", "path": "/sessions", "correlationId": "16dcfb9a-c571-407d-acb3-fba6d3787674", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:03.500Z"}`
  - `422` sessionNumber 0: `{"success": false, "statusCode": 422, "message": "Dữ liệu không hợp lệ", "errors": [{"field": "sessionNumber", "message": "Session number must be >= 1", "code": "too_small"}], "path": "/sessions", "correlationId": "1a443d73-8f4a-4a6a-954b-5a5ba94a44e9", "timestamp": "2026-10-10T11:31:03.503Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/sessions", "correlationId": "c694934b-0f59-4579-ac54-c98c828fe5c6", "timestamp": "2026-10-10T11:31:03.504Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `session.create` `{userId, ...dto}` → TUTOR_SERVICE. Handler expects `data`, so it fails.
- **Verdict:** BUG (always 500). Matches the doc: the handler reads `classId` from `undefined`.

#### 78. POST /sessions/bulk
- **Source:** `features/session/session.controller.ts:54` (`createBulk`)
- **Auth:** JWT + Redis session
- **Request:** body `CreateSessionsDto` (`createSessionsSchema`): `classId` uuid required; `sessions` array of 1–50 items, each as #77 without `classId`
- **Request (sent):** `POST /sessions/bulk`, body:
  ```json
  {"classId":"0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d","sessions":[{"sessionNumber":4,"title":"Linear systems","startAt":"2026-10-14T18:00:00+07:00","endAt":"2026-10-14T19:30:00+07:00","location":"Room 3B"},{"sessionNumber":5,"title":"Review","startAt":"2026-10-16T18:00:00+07:00","endAt":"2026-10-16T19:30:00+07:00","status":"SCHEDULED"}]}
  ```
- **Success (real):** not reached: always 500 (see Errors).
- **Errors (real):**
  - `500` happy-path request (valid body/query): `{"success": false, "statusCode": 500, "message": "Cannot read properties of undefined (reading 'classId')", "path": "/sessions/bulk", "correlationId": "45c0b8e0-d89d-4caa-b332-54d3571d0300", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:03.815Z"}`
  - `422` sessions []: `{"success": false, "statusCode": 422, "message": "Dữ liệu không hợp lệ", "errors": [{"field": "sessions", "message": "At least 1 session is required", "code": "too_small"}], "path": "/sessions/bulk", "correlationId": "5dabbafd-ecf8-4e94-9cbc-ea5bc100ca79", "timestamp": "2026-10-10T11:31:03.817Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/sessions/bulk", "correlationId": "62a8855f-cee6-4aab-966a-0ff180a15b72", "timestamp": "2026-10-10T11:31:03.818Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `session.createBulk` `{userId, ...dto}` → TUTOR_SERVICE. Handler expects `data`, so it fails.
- **Verdict:** BUG (always 500). Matches the doc.

#### 79. GET /sessions
- **Source:** `features/session/session.controller.ts:78` (`getAll`)
- **Auth:** JWT + Redis session
- **Request:** query `page` default 1; `limit` 1–100 default 10; `search` optional; `status` optional (enum as #77); `classId` uuid optional; `startDate`, `endDate` coerced dates optional
- **Request (sent):** query only, `GET /sessions?page=1&limit=10&status=SCHEDULED&startDate=2026-10-01&endDate=2026-10-31`, no body
- **Success (real):** not reached: always 500 (see Errors).
- **Errors (real):**
  - `500` happy-path request (valid body/query): `{"success": false, "statusCode": 500, "message": "Cannot read properties of undefined (reading 'page')", "path": "/sessions?page=1&limit=10&status=SCHEDULED&startDate=2026-10-01&endDate=2026-10-31", "correlationId": "0cfbed14-2a2e-4534-bcd7-87910516fd43", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:04.128Z"}`
  - `422` status=DONE: `{"success": false, "statusCode": 422, "message": "Dữ liệu không hợp lệ", "errors": [{"field": "status", "message": "Invalid option: expected one of \"SCHEDULED\"|\"ONGOING\"|\"COMPLETED\"|\"CANCELLED\"|\"POSTPONED\"", "code": "invalid_value"}], "path": "/sessions?status=DONE", "correlationId": "8a78db43-2767-4aed-aaf1-6097e8859dbb", "timestamp": "2026-10-10T11:31:04.131Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/sessions", "correlationId": "8813056b-f74f-4a1d-90b7-c0870cc5dfab", "timestamp": "2026-10-10T11:31:04.132Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `session.getAll` `{userId, ...query}` → TUTOR_SERVICE. Handler expects `query`, so it fails.
- **Verdict:** BUG (always 500). Matches the doc in status. The message differs (`reading 'page'`, not the destructuring text in the doc).

#### 80. GET /sessions/class/:classId
- **Source:** `features/session/session.controller.ts:91` (`getByClass`)
- **Auth:** JWT + Redis session
- **Request:** path `classId` (no UUID pipe; the handler validates it)
- **Request (sent):** none (`GET /sessions/class/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d`)
- **Success (real):** not reached: no owned class exists (see #73).
- **Errors (real):**
  - `404` unknown class id (no test class exists): `{"success": false, "statusCode": 404, "message": "Không tìm thấy lớp học", "path": "/sessions/class/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "5ba270d3-7ebb-4448-94c0-54ff7743d9a6", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:04.444Z"}`
  - `400` non-uuid classId: `{"success": false, "statusCode": 400, "message": "ID lớp học phải là UUID", "path": "/sessions/class/abc", "correlationId": "afcf0043-5f64-4106-aea2-8f1025f510a1", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:04.753Z"}`
  - `404` student token (not owner): `{"success": false, "statusCode": 404, "message": "Không tìm thấy lớp học", "path": "/sessions/class/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "8e392745-dfe7-4c34-813f-e330efa7c56d", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:05.067Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/sessions/class/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "f5705ddc-90d5-41b9-90ed-c05095c9c215", "timestamp": "2026-10-10T11:31:05.068Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `session.getByClass` `{userId, classId}` → TUTOR_SERVICE
- **Verdict:** NOT EXECUTED (success path). No owned class exists. The 400 and 404 (unknown or non-owner class) responses match the doc.

#### 81. GET /sessions/:id
- **Source:** `features/session/session.controller.ts:100` (`getById`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Request (sent):** none (`GET /sessions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d`)
- **Success (real):** not reached: no session row exists. Session creation (#77, #78) always returns 500.
- **Errors (real):**
  - `404` unknown id: `{"success": false, "statusCode": 404, "message": "Không tìm thấy buổi học", "path": "/sessions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "26a91a3f-60c0-410c-ac49-3ced43f9baf6", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:05.380Z"}`
  - `400` non-uuid id: `{"success": false, "statusCode": 400, "message": "ID buổi học phải là UUID", "path": "/sessions/abc", "correlationId": "cdb812ca-c2ee-4abe-bd80-9fa59f358abf", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:05.689Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/sessions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "8a4ce238-5cd5-4dc5-813f-e84e824cb90f", "timestamp": "2026-10-10T11:31:05.691Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `session.getById` `{userId, id}` → TUTOR_SERVICE
- **Verdict:** NOT EXECUTED (success path). No session row exists, and creation (#77, #78) always returns 500. The 404 and 400 responses match the doc.

#### 82. PUT /sessions/:id
- **Source:** `features/session/session.controller.ts:109` (`update`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; body `UpdateSessionDto` (`updateSessionSchema`, all optional, no defaults; same fields as #77 without `classId`)
- **Request (sent):** `PUT /sessions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d`, body:
  ```json
  {"status":"COMPLETED","actualStartAt":"2026-10-12T11:02:00+07:00","actualEndAt":"2026-10-12T12:28:00+07:00","note":"Covered all exercises"}
  ```
- **Success (real):** not reached: no session row exists (see #81).
- **Errors (real):**
  - `404` unknown id: `{"success": false, "statusCode": 404, "message": "Không tìm thấy buổi học", "path": "/sessions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "5f9d1dd5-1255-47f1-92c9-9ac928db4c68", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:06.001Z"}`
  - `422` status=DONE: `{"success": false, "statusCode": 422, "message": "Dữ liệu không hợp lệ", "errors": [{"field": "status", "message": "Invalid option: expected one of \"SCHEDULED\"|\"ONGOING\"|\"COMPLETED\"|\"CANCELLED\"|\"POSTPONED\"", "code": "invalid_value"}], "path": "/sessions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "13cc0502-3793-4a18-be3f-3e01d0b41f23", "timestamp": "2026-10-10T11:31:06.004Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/sessions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "d57d84f9-6393-4798-9304-971831935982", "timestamp": "2026-10-10T11:31:06.005Z"}`
  - `500` for an owned session: not triggered: no session row exists.
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `session.update` `{userId, id, ...dto}` → TUTOR_SERVICE. Handler expects `data`, so it fails after the owner check.
- **Verdict:** NOT EXECUTED (owned-session path). No session row exists, so the owned-session 500 in the doc is unverified. The 404 and 422 responses match the doc.

#### 83. DELETE /sessions/:id
- **Source:** `features/session/session.controller.ts:123` (`del`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Request (sent):** none (`DELETE /sessions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d`)
- **Success (real):** not reached: no session row exists (see #81).
- **Errors (real):**
  - `404` unknown id: `{"success": false, "statusCode": 404, "message": "Không tìm thấy buổi học", "path": "/sessions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "65a6a3cb-a43b-4753-af05-167ac3af8152", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:06.317Z"}`
  - `400` non-uuid id: `{"success": false, "statusCode": 400, "message": "ID buổi học phải là UUID", "path": "/sessions/abc", "correlationId": "26b6e35f-e240-4c32-bf68-0394b3722af3", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:06.628Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/sessions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "35fe12b4-dc3d-4871-b1cd-fc0a17af4d9b", "timestamp": "2026-10-10T11:31:06.629Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `session.delete` `{userId, id}` → TUTOR_SERVICE
- **Verdict:** NOT EXECUTED (success path). No session row exists. The 404 and 400 responses match the doc.


## Students (`/students`)

> Live run. POST /students cannot create a user (a new email returns 400). No test user exists, and the seeded accounts were not modified, so the PUT and DELETE success paths are not reached. The `GET /students` list is real (200).

#### 84. GET /students/get-student-code
- **Source:** `features/student/student.controller.ts:42` (`generateStudentCodeController`)
- **Auth:** JWT + Redis session
- **Request:** none
- **Request (sent):** none (`GET /students/get-student-code`)
- **Success (real):** not reached: always 400 (see Errors).
- **Errors (real):**
  - `400` happy-path request (valid body/query): `{"success": false, "statusCode": 400, "message": "Trường không được hỗ trợ: undefined", "path": "/students/get-student-code", "correlationId": "0171dd34-113e-4801-afe4-768490ad424f", "serviceName": "user-service", "timestamp": "2026-10-10T11:31:06.936Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/students/get-student-code", "correlationId": "8ccb0a74-b634-4fc0-b87b-580000a9e116", "timestamp": "2026-10-10T11:31:06.937Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `user.getUserByField` `{}` → USER_SERVICE. The route name suggests code generation, but it calls a field lookup with an empty payload (see Unclear).
- **Verdict:** BUG (always 400). Matches the doc: the route cannot succeed for any caller (`Trường không được hỗ trợ: undefined`).

#### 85. POST /students
- **Source:** `features/student/student.controller.ts:106` (`create`)
- **Auth:** JWT + Redis session (no role check)
- **Request:** body `CreateStudentDto` (`createStudentSchema`): `studentName` string 1–255 required; `email` email optional; `userCode` 1–50 optional; `gender` MALE|FEMALE|OTHER optional; `studentPhone` ≤20 optional; `school` ≤255 optional; `parentName` 1–255 optional; `parentRelationship` FATHER|MOTHER|GUARDIAN optional; `parentPhone` ≤20 optional; `parentEmail` email optional
- **Request (sent):** `POST /students`, body:
  ```json
  {"studentName":"Tran Thi Bich","email":"bich.c1791631856@example.com","gender":"FEMALE","studentPhone":"0987654321","school":"THPT Le Quy Don","parentName":"Tran Van Hung","parentRelationship":"FATHER","parentPhone":"0912345678","parentEmail":"hung.tran@example.com"}
  ```
- **Success (real):** not reached: a new email returns 400 (see Errors).
- **Errors (real):**
  - `400` success (new email): `{"success": false, "statusCode": 400, "message": "Failed to hash data: Error: data and salt arguments required", "path": "/students", "correlationId": "f4d6e550-649d-49da-8a7a-d9a5f6e5823c", "serviceName": "user-service", "timestamp": "2026-10-10T11:31:07.250Z"}`
  - `400` email already exists (seeded): `{"success": false, "statusCode": 400, "message": "Email đã tồn tại: student@finance.dev", "path": "/students", "correlationId": "a49e4ee2-1605-4c7e-957e-6bb9550f9aca", "serviceName": "user-service", "timestamp": "2026-10-10T11:31:07.564Z"}`
  - `422` missing studentName: `{"success": false, "statusCode": 422, "message": "Dữ liệu không hợp lệ", "errors": [{"field": "studentName", "message": "Student name must be required ...", "code": "invalid_type"}], "path": "/students", "correlationId": "53b79e16-e6cf-4dc7-b931-cc6108a09324", "timestamp": "2026-10-10T11:31:07.566Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/students", "correlationId": "49f3cc90-fe75-4485-bc09-24f99d3602b4", "timestamp": "2026-10-10T11:31:07.568Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `user.createUser` `{userId: caller, ...dto}` → USER_SERVICE
- **Verdict:** BUG (create cannot succeed). A new email returns 400 `Failed to hash data: Error: data and salt arguments required`. The doc predicted 500 with the bare bcrypt text, so the status and message differ. Checked in the DB: no user row was created for the test email. EMAIL_EXISTS (400) and the 422 validation response match the doc.

#### 86. GET /students
- **Source:** `features/student/student.controller.ts:140` (`getAllStudents`)
- **Auth:** JWT + Redis session (no role check)
- **Request:** query `GetStudentsQueryDto` (`getStudentsQuerySchema`): `page` default 1; `limit` 1–100 default 10; `search` optional; `tutorId` uuid optional; `gender` optional; `isActive` `'true'|'false'` optional
- **Request (sent):** query only, `GET /students?page=1&limit=10&search=Tran&gender=FEMALE&isActive=true`, no body
- **Success (real):** HTTP 200 (`success`), body:
  ```json
  {"statusCode": 200, "message": "Thành công", "data": {"data": [], "pagination": {"page": 1, "pageSize": 10, "total": 0, "totalPages": 0}}, "timestamp": "2026-10-10T11:31:07.573Z", "method": "GET", "path": "/students?page=1&limit=10&search=Tran&gender=FEMALE&isActive=true", "correlationId": "1eed16da-eb65-4a5b-b6b5-978ca57d9f7e"}
  ```
  - no filters (compare): HTTP 200; `{"statusCode": 200, "message": "Thành công", "data": {"data": [{"id": "24a9306c-d9c9-442f-88c7-546c176c55b9", "email": "live-a-tut-1791631860@example.com", "name": "Livea Tut1791631860", "role": "STUDENT", "status": "active", "createdAt": "2026-10-10T11:31:06.259Z"}, {"id": "1d9efe35-04d4-4fba-bf7a-628ce159a353", "email": "live-a-uc-1791631860@example.com", "name": "Livea Uc1791631860", "role": "S`
  - student token (no role check probe): HTTP 200; `{"statusCode": 200, "message": "Thành công", "data": {"data": [{"id": "09a7e254-21cf-4415-87e2-6237b90726b9", "email": "stu2@finance.dev", "name": "Stu Two", "role": "STUDENT", "status": "active", "createdAt": "2026-10-10T11:25:41.177Z"}, {"id": "0d64a39f-a0e4-49f2-abb5-e737091ffd29", "email": "tester1@finance.dev", "name": "Test One", "role": "TUTOR", "status": "active", "createdAt": "2026-10-10T`
- **Errors (real):**
  - `422` isActive=yes: `{"success": false, "statusCode": 422, "message": "Dữ liệu không hợp lệ", "errors": [{"field": "isActive", "message": "Invalid option: expected one of \"true\"|\"false\"", "code": "invalid_value"}], "path": "/students?isActive=yes", "correlationId": "2fe31e6c-2887-48bd-a30b-f101324184de", "timestamp": "2026-10-10T11:31:07.575Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/students", "correlationId": "2e8cb49a-d983-4319-95c8-a25da6366d7a", "timestamp": "2026-10-10T11:31:07.581Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `user.getUsers` `{...query}` → USER_SERVICE (no role filter sent)
- **Verdict:** BUG (data exposure). The list works (200, `{data, pagination}` shape matches the doc). Any STUDENT token can list all student accounts with emails and names (no role check). A filtered search that matched nothing returned an empty list, while the unfiltered request returned rows, so filters look applied. The 422 response matches the doc.

#### 87. GET /students/:id
- **Source:** `features/student/student.controller.ts:212` (`findById`)
- **Auth:** JWT + Redis session (no role check)
- **Request:** path `id`
- **Request (sent):** none (`GET /students/7fcca22a-c9f8-4b8a-98e1-642b2c91d995`)
- **Success (real):** not reached: always 400 (see Errors).
- **Errors (real):**
  - `400` success (seeded student id): `{"success": false, "statusCode": 400, "message": "Trường không được hỗ trợ: undefined", "path": "/students/7fcca22a-c9f8-4b8a-98e1-642b2c91d995", "correlationId": "b3382ffb-c3f8-41f0-baeb-f7a8fcfec6cb", "serviceName": "user-service", "timestamp": "2026-10-10T11:31:07.888Z"}`
  - `400` non-uuid id: `{"success": false, "statusCode": 400, "message": "Trường không được hỗ trợ: undefined", "path": "/students/abc", "correlationId": "5d71607e-f906-4b05-82da-7a800915e291", "serviceName": "user-service", "timestamp": "2026-10-10T11:31:08.197Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/students/7fcca22a-c9f8-4b8a-98e1-642b2c91d995", "correlationId": "20119140-08db-40b2-841f-6fbd9c9c87e1", "timestamp": "2026-10-10T11:31:08.199Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `user.getUserByField` `{id}` → USER_SERVICE
- **Verdict:** BUG (always 400). Matches the doc: every id, including the seeded student's id, returns 400 `Trường không được hỗ trợ: undefined`.

#### 88. PUT /students/:id
- **Source:** `features/student/student.controller.ts:252` (`update`)
- **Auth:** JWT + Redis session (no role check, no ownership check)
- **Request:** path `id`; body `UpdateStudentDto` (`updateStudentSchema`, non-strict, unknown keys dropped): `studentName`, `studentPhone`, `gender`, `birthday` (coerced date), `school`, `address` ≤500, `district`/`province` ≤30, `parentName`, `parentPhone`, `parentEmail`, `parentRelationship`, `parentAddress` ≤500, `parentDistrict`/`parentProvince` ≤30, `avatar` URL nullable; all optional
- **Request (sent):** `PUT /students/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d`, body:
  ```json
  {"gender":"FEMALE","school":"THPT Le Quy Don","address":"12 Nguyen Trai","district":"Quan 1","province":"TP HCM","avatar":"https://cdn.example.com/avatars/bich.png"}
  ```
- **Success (real):** not reached: no test user exists. The seeded accounts must not be changed.
- **Errors (real):**
  - `400` unknown id: `{"success": false, "statusCode": 400, "message": "Không tìm thấy người dùng", "path": "/students/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "1a036161-a593-4b27-b173-bac674b90af9", "serviceName": "user-service", "timestamp": "2026-10-10T11:31:08.513Z"}`
  - `422` avatar not a URL: `{"success": false, "statusCode": 422, "message": "Dữ liệu không hợp lệ", "errors": [{"field": "avatar", "message": "Invalid URL", "code": "invalid_format"}], "path": "/students/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "e033195b-bbdf-46e0-8859-546e71cb8710", "timestamp": "2026-10-10T11:31:08.515Z"}`
  - `400` non-uuid id: `{"success": false, "statusCode": 400, "message": "ID người dùng phải là UUID", "path": "/students/abc", "correlationId": "74a74541-0e5a-4f34-b9b2-6314f5852ace", "serviceName": "user-service", "timestamp": "2026-10-10T11:31:08.823Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/students/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "e50261c4-2025-4126-96db-048a63401176", "timestamp": "2026-10-10T11:31:08.825Z"}`
  - `200` with the password hash in the response: not triggered: no test user.
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `user.updateUser` `{userId: <path id>, ...dto}` → USER_SERVICE. The path id is sent in the `userId` slot, which elsewhere means the caller.
- **Verdict:** NOT EXECUTED (success path). No test user exists, and the seeded accounts were not modified. The 400 USER_NOT_FOUND, 400 non-UUID, 422 and 401 responses match the doc. The doc's 200 claim (which also returns the password hash) is unverified.

#### 89. DELETE /students/:id
- **Source:** `features/student/student.controller.ts:265` (`delete`)
- **Auth:** JWT + Redis session (no role check)
- **Request:** path `id`
- **Request (sent):** none (`DELETE /students/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d`)
- **Success (real):** not reached: no test user exists to delete (see #88).
- **Errors (real):**
  - `400` unknown id: `{"success": false, "statusCode": 400, "message": "Không tìm thấy người dùng", "path": "/students/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "8b9b5bf1-784e-4693-be51-0e693398fcee", "serviceName": "user-service", "timestamp": "2026-10-10T11:31:09.136Z"}`
  - `400` non-uuid id: `{"success": false, "statusCode": 400, "message": "ID người dùng phải là UUID", "path": "/students/abc", "correlationId": "0980c5a3-65ba-4bf0-8957-c5ece45b2c6d", "serviceName": "user-service", "timestamp": "2026-10-10T11:31:09.448Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/students/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "113ae623-9547-458f-a26b-eebaa416e6df", "timestamp": "2026-10-10T11:31:09.450Z"}`
  - `200`: not triggered: no test user to delete.
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `user.deleteUserByAdmin` `{id}` → USER_SERVICE
- **Verdict:** NOT EXECUTED (success path). No test user exists to delete, and the seeded accounts were not touched. The 400 USER_NOT_FOUND, 400 non-UUID and 401 responses match the doc.


## Tuitions (`/tuitions`)

> Live run. No owned class exists, so no tuition could be created, and the tuition success paths are not reached. The GET routes always return 400 (the gateway sends no `userId`).

#### 90. POST /tuitions
- **Source:** `features/tuition/tuition.controller.ts:40` (`create`)
- **Auth:** JWT + Redis session
- **Request:** body `CreateTuitionDto` (`createTuitionSchema`): `classId` uuid required; `studentId` uuid required; `amount` number ≥0 required; `dueDate`, `paidDate` dates optional; `status` PAID|UNPAID|OVERDUE default UNPAID; `note` optional
- **Request (sent):** `POST /tuitions`, body:
  ```json
  {"classId":"0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d","studentId":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","amount":1500000,"dueDate":"2026-10-15","status":"UNPAID","note":"October tuition"}
  ```
- **Success (real):** not reached: no owned class exists (see #73).
- **Errors (real):**
  - `404` unknown class id (no test class exists): `{"success": false, "statusCode": 404, "message": "Không tìm thấy lớp học", "path": "/tuitions", "correlationId": "7a321f51-2aac-4c1f-92e6-c9e9676a6ed1", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:09.761Z"}`
  - `422` amount -5: `{"success": false, "statusCode": 422, "message": "Dữ liệu không hợp lệ", "errors": [{"field": "amount", "message": "Amount must be positive", "code": "too_small"}], "path": "/tuitions", "correlationId": "8c9d1262-fbfb-4b01-9336-39d23e227c84", "timestamp": "2026-10-10T11:31:09.763Z"}`
  - `404` student token (not class tutor): `{"success": false, "statusCode": 404, "message": "Không tìm thấy lớp học", "path": "/tuitions", "correlationId": "671d2594-e92c-430c-b7ed-f153ac1d3690", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:10.076Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/tuitions", "correlationId": "5463bd21-ed31-4e42-be31-fb7560cc0e5a", "timestamp": "2026-10-10T11:31:10.078Z"}`
  - `201`: not triggered: no owned class.
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `tuition.create` `{userId, data}` → TUTOR_SERVICE
- **Verdict:** NOT EXECUTED (success path). No owned class exists, so the create could not succeed. The 404 CLASS_NOT_FOUND responses are correct for a missing or non-owned class, and the 422 matches the doc.

#### 91. GET /tuitions/summary
- **Source:** `features/tuition/tuition.controller.ts:56` (`getSummary`)
- **Auth:** JWT + Redis session
- **Request:** query `classId` read as raw string, not validated
- **Request (sent):** query only, `GET /tuitions/summary?classId=0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d`, no body
- **Success (real):** not reached: always 400 (see Errors).
- **Errors (real):**
  - `400` valid request (gateway sends no `userId`): `{"success": false, "statusCode": 400, "message": "ID người dùng phải là UUID", "path": "/tuitions/summary?classId=0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "6dce4707-9d77-4051-bd5a-73babcde741e", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:10.385Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/tuitions/summary?classId=0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "9ff64e42-e607-41b4-bd79-9eee801b507d", "timestamp": "2026-10-10T11:31:10.387Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `tuition.getSummary` `{classId}` → TUTOR_SERVICE
- **Verdict:** BUG (always 400). Matches the doc: the gateway sends no `userId` and the handler rejects the call.

#### 92. GET /tuitions
- **Source:** `features/tuition/tuition.controller.ts:69` (`getAll`)
- **Auth:** JWT + Redis session
- **Request:** query `GetTuitionsQueryDto` (`getTuitionsQuerySchema`): `page` default 1; `limit` 1–100 default 10; `classId`, `studentId` uuid optional; `status` optional (enum as #90)
- **Request (sent):** query only, `GET /tuitions?page=1&limit=10&status=UNPAID&classId=0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d`, no body
- **Success (real):** not reached: always 400 (see Errors).
- **Errors (real):**
  - `400` valid request (gateway sends no `userId`): `{"success": false, "statusCode": 400, "message": "ID người dùng phải là UUID", "path": "/tuitions?page=1&limit=10&status=UNPAID&classId=0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "f2276732-2a9b-48b5-a2d8-920a3715fb05", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:10.697Z"}`
  - `422` status=DONE: `{"success": false, "statusCode": 422, "message": "Dữ liệu không hợp lệ", "errors": [{"field": "status", "message": "Invalid option: expected one of \"PAID\"|\"UNPAID\"|\"OVERDUE\"", "code": "invalid_value"}], "path": "/tuitions?status=DONE", "correlationId": "a05cdda1-dca5-496e-9e68-118d37daa4f1", "timestamp": "2026-10-10T11:31:10.699Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/tuitions", "correlationId": "1aac9aed-ff09-47e3-9ebe-253c00638e0e", "timestamp": "2026-10-10T11:31:10.700Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `tuition.getAll` `{query}` → TUTOR_SERVICE. No `userId` is sent, so the handler rejects it.
- **Verdict:** BUG (always 400). Matches the doc.

#### 93. GET /tuitions/:id
- **Source:** `features/tuition/tuition.controller.ts:81` (`getById`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Request (sent):** none (`GET /tuitions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d`)
- **Success (real):** not reached: always 400 (see Errors).
- **Errors (real):**
  - `400` valid request (gateway sends no `userId`): `{"success": false, "statusCode": 400, "message": "ID người dùng phải là UUID", "path": "/tuitions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "52f84f61-da8b-41c5-8d5e-8c59def7e43f", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:11.007Z"}`
  - `400` unknown id: `{"success": false, "statusCode": 400, "message": "ID người dùng phải là UUID", "path": "/tuitions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "3ec29cfa-79c7-43b6-a20d-522122d6455f", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:11.316Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/tuitions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "1b01131f-4f3a-4b0b-80aa-2056e9b9968e", "timestamp": "2026-10-10T11:31:11.317Z"}`
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `tuition.getById` `{id}` → TUTOR_SERVICE. No `userId` is sent, so the handler rejects it.
- **Verdict:** BUG (always 400). Matches the doc. The id-not-found case also returns 400, so the route fails for every id.

#### 94. PUT /tuitions/:id
- **Source:** `features/tuition/tuition.controller.ts:90` (`update`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; body `UpdateTuitionDto` (`updateTuitionSchema` = create partial, without `classId` and `studentId`)
- **Request (sent):** `PUT /tuitions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d`, body:
  ```json
  {"status":"PAID","paidDate":"2026-10-09","note":"Paid by bank transfer"}
  ```
- **Success (real):** not reached: no tuition row exists (creation #90 was blocked).
- **Errors (real):**
  - `404` unknown tuition id (no tuition row exists): `{"success": false, "statusCode": 404, "message": "Không tìm thấy hồ sơ học phí", "path": "/tuitions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "7d6ad885-4ae0-4b0a-9965-87f3e4da9c84", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:11.629Z"}`
  - `422` status=DONE: `{"success": false, "statusCode": 422, "message": "Dữ liệu không hợp lệ", "errors": [{"field": "status", "message": "Invalid option: expected one of \"PAID\"|\"UNPAID\"|\"OVERDUE\"", "code": "invalid_value"}], "path": "/tuitions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "24380630-40a4-4abb-a31e-9252ae90a029", "timestamp": "2026-10-10T11:31:11.631Z"}`
  - `400` non-uuid id: `{"success": false, "statusCode": 400, "message": "ID phải là UUID", "path": "/tuitions/abc", "correlationId": "4ea92384-c3e5-42f4-9649-998b0df8975f", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:11.940Z"}`
  - `404` unknown id: `{"success": false, "statusCode": 404, "message": "Không tìm thấy hồ sơ học phí", "path": "/tuitions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "9c74a6c2-53c7-47ca-b7b3-b76a3e79973f", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:12.252Z"}`
  - `404` student token (not class tutor): `{"success": false, "statusCode": 404, "message": "Không tìm thấy hồ sơ học phí", "path": "/tuitions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "93b08066-6f53-4abc-87ea-22d7e10dcebb", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:12.564Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/tuitions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "6d692dfb-843a-47f3-a22a-2b2001123d71", "timestamp": "2026-10-10T11:31:12.566Z"}`
  - `200`: not triggered: no tuition row.
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `tuition.update` `{userId, id, data}` → TUTOR_SERVICE
- **Verdict:** NOT EXECUTED (success path). No tuition row exists (creation #90 was blocked by the missing class). The 404, 400 and 422 responses match the doc.

#### 95. DELETE /tuitions/:id
- **Source:** `features/tuition/tuition.controller.ts:104` (`delete`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Request (sent):** none (`DELETE /tuitions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d`)
- **Success (real):** not reached: no tuition row exists (see #90).
- **Errors (real):**
  - `404` unknown tuition id (no tuition row exists): `{"success": false, "statusCode": 404, "message": "Không tìm thấy hồ sơ học phí", "path": "/tuitions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "01879226-3bb9-4f12-acbe-4248fc7407e9", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:12.878Z"}`
  - `404` re-delete same id: `{"success": false, "statusCode": 404, "message": "Không tìm thấy hồ sơ học phí", "path": "/tuitions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "46d2db37-b7f3-426f-bfb5-2c97fb31d94a", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:13.194Z"}`
  - `400` non-uuid id: `{"success": false, "statusCode": 400, "message": "ID phải là UUID", "path": "/tuitions/abc", "correlationId": "fe6bdefd-b148-42e9-887d-f525d7c5dab0", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:13.502Z"}`
  - `404` unknown id: `{"success": false, "statusCode": 404, "message": "Không tìm thấy hồ sơ học phí", "path": "/tuitions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "a06a0159-41ad-4f7a-b0a3-bf1fb01426d9", "serviceName": "tutor-service", "timestamp": "2026-10-10T11:31:13.815Z"}`
  - `401` no Authorization header: `{"success": false, "statusCode": 401, "message": "Unauthorized ...", "path": "/tuitions/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "correlationId": "f5e719f7-ccdc-4d64-a92e-562a9bd5a8ae", "timestamp": "2026-10-10T11:31:13.817Z"}`
  - `200`: not triggered: no tuition row.
  - `504`: not triggered: a stalled RabbitMQ consumer would be needed; the 504 path was not forced.
- **Downstream:** RMQ `tuition.delete` `{userId, id}` → TUTOR_SERVICE
- **Verdict:** NOT EXECUTED (success path). No tuition row exists. The 404, 400 and 401 responses match the doc.

## Dashboard, email, logs, redis, reports

> Live results from the dev gateway at http://localhost:8888 (run by the agent in `scratchpad/live-D`). Bodies are shown as received, with `correlationId`, `timestamp` and `trace` removed, strings cut to about 120 chars and arrays to 2 items. Test users were created with a `live-D-` email prefix and deleted again. Seeded accounts were not changed. Tokens are named `admin`, `tutor`, `student` (seeded), or `test-user T1` (a student created for the run).

#### 96. GET /dashboard/overview
- **Source:** `features/dashboard/dashboard.controller.ts:30` (`overview`)
- **Auth:** JWT + Redis session
- **Request (spec):** none
- **Request (sent):**
  - `GET /dashboard/overview | token=tutor | body=none`
  - `GET /dashboard/overview | token=admin | body=none`
  - `GET /dashboard/overview | token=student | body=none`
  - `GET /dashboard/overview | token=none | body=none`
- **Success (real):**
  - HTTP 200 (tutor overview): `{"statusCode":200,"message":"Thành công","data":{"role":"TUTOR","stats":{"classesCount":1,"studentsCount":1,"sessionsThisWeek":1,"sessionsCompletedThisWeek":0,"sessionsTodayCompleted":0,"sessionsTodayPending":1,"revenueThisMonth":0,"overdueTuitionCount":0,"unpaidTuitionAmount":0},"todaySchedule":[{"id":"0423da1b-53a2-45fd-954b-e12ae7d8b87d","startAt":"2026-10-10T11:28:35.650Z","endAt":"2026-10-10T12:28:35.650Z","title":"LIVE-A session","className":"LIVE-A Test Class 1791631704","subject":"Toan","format":"ONLINE","location":null}],"upcomingSchedule":[],"monthly":[{"month":1,"revenue":0,"sessions":0,"newStudents":0,"newClasses":0,"cumulativeRevenue":0},{"month":2,"revenue":0,"sessions":0,"newStudents":0,"newClasses":0,"cumulativeRevenue":0},"... 10 more item(s)"]},"method":"GET","path":"/dashboard/overview"}`
  - also HTTP 200 (admin overview)
  - also HTTP 200 (student overview)
- **Errors (real):**
  - HTTP 401, trigger: no token; request `GET /dashboard/overview`; body: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/dashboard/overview"}`
- **Downstream:** RMQ `dashboard.overview` `{userId}` → TUTOR_SERVICE (`dashboard.rpc.controller.ts`, `DashboardService.getOverview`)
- **Verdict:** OK. 200 for tutor, admin and student; 401 without a token.
- **Notes:** Envelope `message` is `Thành công` (doc says `SUCCESS`). Stats in this dev DB are mostly zero or change between runs.

#### 97. GET /emails
- **Source:** `features/email/email.controller.ts:21` (`testSendEmail`)
- **Auth:** Public (no token needed)
- **Request (spec):** none
- **Request (sent):**
  - `GET /emails | token=none | body=none`
- **Success (real):**
  - not reached: no 2xx response was produced for this route in this run (see Errors and Notes)
- **Errors (real):**
  - not triggered: see Verdict
  - NOT EXECUTED: sends external email (Resend, hardcoded recipient)
- **Downstream:** RMQ `email.test` `{}` → THIRD_SERVICE. Anyone on the internet can trigger a real send: `EmailService.testSendEmailService` mails a hardcoded recipient from source (see Unclear).
- **Verdict:** NOT EXECUTED: sends external email (Resend, hardcoded recipient). Route takes no input, so no validation-only case exists.
- **Notes:** The Resend success and 500 examples in the doc are unverified.

#### 98. GET /logs
- **Source:** `features/log/log.controller.ts:39` (`findAll`)
- **Auth:** JWT + ADMIN (class-level `RolesGuard` + `@Roles('ADMIN')`, E-ROLE)
- **Request (spec):** query `GetRequestLogsQueryDto` (`getRequestLogsQuerySchema`): `page` default 1; `limit` 1–100 default 20; `serviceName` optional; `type` HTTP|RPC optional; `correlationId` optional; `search` trimmed optional
- **Request (sent):**
  - `GET /logs?page=1&limit=20&serviceName=gateway&type=HTTP&search=/users | token=admin | body=none`
  - `GET /logs?page=1&limit=5 | token=admin | body=none`
  - `GET /logs?limit=500 | token=admin | body=none`
  - `GET /logs?type=BOGUS | token=admin | body=none`
  - `GET /logs | token=tutor | body=none`
  - `GET /logs | token=student | body=none`
  - `GET /logs | token=none | body=none`
- **Success (real):**
  - not reached: no 2xx response was produced for this route in this run (see Errors and Notes)
- **Errors (real):**
  - HTTP 500, trigger: admin list filtered; request `GET /logs?page=1&limit=20&serviceName=gateway&type=HTTP&search=/users`; body: `{"success":false,"statusCode":500,"message":"Failed query: select \"id\", \"service_name\", \"type\", \"method\", \"path\", \"status_code\", \"duration_ms\", \"correlation_id\", ...","path":"/logs?page=1&limit=20&serviceName=gateway&type=HTTP&search=/users","serviceName":"third-service"}`
  - HTTP 500, trigger: admin list plain; request `GET /logs?page=1&limit=5`; body: `{"success":false,"statusCode":500,"message":"Failed query: select \"id\", \"service_name\", \"type\", \"method\", \"path\", \"status_code\", \"duration_ms\", \"correlation_id\", ...","path":"/logs?page=1&limit=5","serviceName":"third-service"}`
  - HTTP 422, trigger: limit 500 422; request `GET /logs?limit=500`; body: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"limit","message":"Too big: expected number to be <=100","code":"too_big"}],"path":"/logs?limit=500"}`
  - HTTP 422, trigger: type BOGUS 422; request `GET /logs?type=BOGUS`; body: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"type","message":"Invalid option: expected one of \"HTTP\"|\"RPC\"","code":"invalid_value"}],"path":"/logs?type=BOGUS"}`
  - HTTP 403, trigger: tutor 403; request `GET /logs`; body: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/logs"}`
  - HTTP 403, trigger: student 403; request `GET /logs`; body: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/logs"}`
  - HTTP 401, trigger: no token 401; request `GET /logs`; body: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/logs"}`
- **Downstream:** RMQ `log.query` (query object sent as the payload) → THIRD_SERVICE
- **Verdict:** BUG: every call returns 500 (the list query fails), so no rows are ever returned. Also leaks SQL in the message.
- **Notes:** Schema drift: the select lists `request_headers`, `response_headers` and `host`, which do not exist in `backends_db.request_logs` (16 columns, checked with `\d request_logs`). The 500 `message` echoes the full SQL text and bound params (information disclosure). 422 for `limit=500` and `type=BOGUS`, 403 for tutor and student, and 401 without a token are correct.

#### 99. GET /logs/trace/:correlationId
- **Source:** `features/log/log.controller.ts:54` (`trace`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request (spec):** path `correlationId` (string, no validation)
- **Request (sent):**
  - `GET /logs/trace/does-not-exist-D-123 | token=admin | body=none`
  - `GET /logs/trace/does-not-exist-D-123 | token=tutor | body=none`
  - `GET /logs/trace/does-not-exist-D-123 | token=none | body=none`
- **Success (real):**
  - not reached: no 2xx response was produced for this route in this run (see Errors and Notes)
- **Errors (real):**
  - HTTP 500, trigger: trace unknown correlationId; request `GET /logs/trace/does-not-exist-D-123`; body: `{"success":false,"statusCode":500,"message":"Failed query: select \"id\", \"service_name\", \"type\", \"method\", \"path\", \"status_code\", \"duration_ms\", \"correlation_id\", ...","path":"/logs/trace/does-not-exist-D-123","serviceName":"third-service"}`
  - HTTP 403, trigger: trace tutor 403; request `GET /logs/trace/does-not-exist-D-123`; body: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/logs/trace/does-not-exist-D-123"}`
  - HTTP 401, trigger: trace no token 401; request `GET /logs/trace/does-not-exist-D-123`; body: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/logs/trace/does-not-exist-D-123"}`
- **Downstream:** RMQ `log.trace` `{correlationId}` → THIRD_SERVICE
- **Verdict:** BUG: 500 for an unknown correlationId (same missing-column failure as #98), so trace never returns rows. 403 and 401 correct.
- **Notes:** Same root cause as #98.

#### 100. GET /logs/stats
- **Source:** `features/log/log.controller.ts:65` (`stats`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request (spec):** none
- **Request (sent):**
  - `GET /logs/stats | token=admin | body=none`
  - `GET /logs/stats | token=tutor | body=none`
  - `GET /logs/stats | token=student | body=none`
- **Success (real):**
  - HTTP 200 (admin stats): `{"statusCode":200,"message":"Thành công","data":[],"method":"GET","path":"/logs/stats"}`
- **Errors (real):**
  - HTTP 403, trigger: tutor 403; request `GET /logs/stats`; body: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/logs/stats"}`
  - HTTP 403, trigger: student 403; request `GET /logs/stats`; body: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/logs/stats"}`
- **Downstream:** RMQ `log.stats` `{}` → THIRD_SERVICE
- **Verdict:** OK. 200 with `data: []` in this DB (no matching 24 h gateway rows). 403 for tutor and student.
- **Notes:** A non-empty result was not observed, so the aggregation logic is unverified.

#### 101. GET /redis
- **Source:** `features/redis/redis.controller.ts:29` (`get`)
- **Auth:** JWT + Redis session (no role check; any authenticated user)
- **Request (spec):** query `key` string min 1 required (`getRedisQuerySchema`)
- **Request (sent):**
  - `GET /redis?key=doesnotexist_D_x | token=admin | body=none`
  - `GET /redis | token=admin | body=none`
  - `GET /redis?key= | token=student | body=none`
  - `GET /redis?key=x | token=none | body=none`
  - `GET /redis?key=session:7fcca22a-c9f8-4b8a-98e1-642b2c91d995 | token=student | body=none`
  - `GET /redis?key=session:fd698f7a-e348-41b1-9ef0-d5a0a5acb9f7 | token=student | body=none`
  - `GET /redis?key=session:fd698f7a-e348-41b1-9ef0-d5a0a5acb9f7 | token=none | body=none`
  - `GET /redis?key=liveD:wrongtype | token=admin | body=none`
- **Success (real):**
  - HTTP 200 (missing key -> null): `{"statusCode":200,"message":"Thành công","data":null,"method":"GET","path":"/redis?key=doesnotexist_D_x"}`
  - also HTTP 200 (student reads own session key)
  - also HTTP 200 (student reads ADMIN session key (cross-user))
- **Errors (real):**
  - HTTP 422, trigger: no key 422; request `GET /redis`; body: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"key","message":"Invalid input: expected string, received undefined","code":"invalid_type"}],"path":"/redis"}`
  - HTTP 422, trigger: empty key 422; request `GET /redis?key=`; body: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"key","message":"key query param is required","code":"too_small"}],"path":"/redis?key="}`
  - HTTP 401, trigger: no token 401; request `GET /redis?key=x`; body: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/redis?key=x"}`
  - HTTP 401, trigger: no token 401; request `GET /redis?key=session:fd698f7a-e348-41b1-9ef0-d5a0a5acb9f7`; body: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/redis?key=session:fd698f7a-e348-41b1-9ef0-d5a0a5acb9f7"}`
  - HTTP 500, trigger: hash key -> WRONGTYPE; request `GET /redis?key=liveD:wrongtype`; body: `{"success":false,"statusCode":500,"message":"WRONGTYPE Operation against a key holding the wrong kind of value","path":"/redis?key=liveD:wrongtype","serviceName":"third-service"}`
- **Downstream:** RMQ `redis.get` `{key}` → THIRD_SERVICE. Any arbitrary key can be read, including the `session:<userId>` keys the JWT guard relies on (see Unclear).
- **Verdict:** BUG (security): any authenticated user can read any user's session token. A STUDENT read `session:<ADMIN id>` and received a JWT (200). Value redacted in results.json.
- **Notes:** Missing key returns `data: null`; empty key returns 422 `key query param is required`; a hash key returns 500 `WRONGTYPE ...` as the doc says (test hash created and deleted in `tutor-redis-1`). Recommend ADMIN-only access and no reads of `session:*`.

#### 102. GET /reports/learning/summary
- **Source:** `features/report/report.controller.ts:38` (`getSummary`)
- **Auth:** JWT + ADMIN (class-level `RolesGuard` + `@Roles('ADMIN')`, E-ROLE)
- **Request (spec):** none
- **Request (sent):**
  - `GET /reports/learning/summary | token=admin | body=none`
  - `GET /reports/learning/summary | token=tutor | body=none`
  - `GET /reports/learning/summary | token=none | body=none`
- **Success (real):**
  - HTTP 200 (admin summary): `{"statusCode":200,"message":"Thành công","data":{"activeClasses":1,"avgAttendanceRate":0,"avgCurriculumProgress":0,"submissionRate":0},"method":"GET","path":"/reports/learning/summary"}`
- **Errors (real):**
  - HTTP 403, trigger: tutor 403; request `GET /reports/learning/summary`; body: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/reports/learning/summary"}`
  - HTTP 401, trigger: no token 401; request `GET /reports/learning/summary`; body: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/reports/learning/summary"}`
- **Downstream:** RMQ `report.summary` `{}` → TUTOR_SERVICE
- **Verdict:** OK. 200 with zeros in this DB; 403 for tutor; 401 without a token.

#### 103. GET /reports/learning/attendance-trend
- **Source:** `features/report/report.controller.ts:49` (`getAttendanceTrend`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request (spec):** none
- **Request (sent):**
  - `GET /reports/learning/attendance-trend | token=admin | body=none`
  - `GET /reports/learning/attendance-trend | token=student | body=none`
  - `GET /reports/learning/attendance-trend | token=none | body=none`
- **Success (real):**
  - HTTP 200 (admin trend): `{"statusCode":200,"message":"Thành công","data":[{"month":"05/2026","rate":0},{"month":"06/2026","rate":0},"... 4 more item(s)"],"method":"GET","path":"/reports/learning/attendance-trend"}`
- **Errors (real):**
  - HTTP 403, trigger: student 403; request `GET /reports/learning/attendance-trend`; body: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/reports/learning/attendance-trend"}`
  - HTTP 401, trigger: no token 401; request `GET /reports/learning/attendance-trend`; body: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/reports/learning/attendance-trend"}`
- **Downstream:** RMQ `report.attendanceTrend` `{}` → TUTOR_SERVICE
- **Verdict:** OK. 200 with 6 points (`MM/YYYY`, oldest first); 403 for student; 401 without a token.

#### 104. GET /reports/learning/classes
- **Source:** `features/report/report.controller.ts:63` (`getClasses`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request (spec):** query `GetLearningClassReportsQueryDto`: `page` default 1; `limit` 1–100 default 10; `search` trimmed optional
- **Request (sent):**
  - `GET /reports/learning/classes?page=1&limit=10&search=Toan | token=admin | body=none`
  - `GET /reports/learning/classes?limit=0 | token=admin | body=none`
  - `GET /reports/learning/classes | token=student | body=none`
- **Success (real):**
  - HTTP 200 (admin classes): `{"statusCode":200,"message":"Thành công","data":{"data":[{"classId":"fe4d599e-324f-4d64-ae01-4fe2d95df3a6","className":"LIVE-A Test Class 1791631704","tutorName":"Tutor Account","studentCount":1,"attendanceRate":0,"curriculumProgress":0,"assignmentsSubmitted":0,"assignmentsTotal":0,"averageScore":null}],"pagination":{"total":1,"page":1,"limit":10,"totalPages":1}},"method":"GET","path":"/reports/learning/classes?page=1&limit=10&search=Toan"}`
- **Errors (real):**
  - HTTP 422, trigger: limit 0 422; request `GET /reports/learning/classes?limit=0`; body: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"limit","message":"Too small: expected number to be >=1","code":"too_small"}],"path":"/reports/learning/classes?limit=0"}`
  - HTTP 403, trigger: student 403; request `GET /reports/learning/classes`; body: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/reports/learning/classes"}`
- **Downstream:** RMQ `report.classList` `{query}` → TUTOR_SERVICE
- **Verdict:** OK. 200 `{data, pagination}`; 422 for `limit=0` (`Too small: expected number to be >=1`); 403 for student.
- **Notes:** The class rows returned are from other agents' test data in the same DB; the sample in the doc is illustrative.

## Test scenarios (`/test-scenarios`, class-level `RolesGuard` + `@Roles('ADMIN')`)

#### 105. GET /test-scenarios/routes
- **Source:** `features/test-scenario/test-scenario.controller.ts:73` (`routes`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request (spec):** none
- **Request (sent):**
  - `GET /test-scenarios/routes | token=admin | body=none`
  - `GET /test-scenarios/routes | token=tutor | body=none`
  - `GET /test-scenarios/routes | token=none | body=none`
- **Success (real):**
  - HTTP 200 (admin routes): `{"statusCode":200,"message":"Thành công","data":[{"method":"GET","path":"/","summary":"Health check","tag":"Health","params":[],"isPublic":false,"roles":null,"multipart":false,"oauth":false,"bodySchema":null,"querySchema":null,"uuidParams":[]},{"method":"GET","path":"/admin/students","summary":"List students","tag":"Admin","params":[],"isPublic":false,"roles":["ADMIN"],"multipart":false,"oauth":false,"bodySchema":null,"querySchema":{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"page":{"default":1,"type":"integer","minimum":1,"maximum":9007199254740991},"limit":{"default":10,"type":"integer","minimum":1,"maximum":100},"search":{"type":"string","minLength":1},"isActive":{"type":"string","enum":["true","false"]}}},"uuidParams":[]},"... 130 more item(s)"],"method":"GET","path":"/test-scenarios/routes"}`
- **Errors (real):**
  - HTTP 403, trigger: tutor 403; request `GET /test-scenarios/routes`; body: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/test-scenarios/routes"}`
  - HTTP 401, trigger: no token 401; request `GET /test-scenarios/routes`; body: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/test-scenarios/routes"}`
- **Downstream:** none (local discovery)
- **Verdict:** OK. 200 with the route catalogue from Nest metadata; 403 for tutor; 401 without a token.
- **Notes:** The catalogue does not list `POST /test-scenarios/generate` or `POST /test-scenarios/bulk`, which exist in source (see #106 and #107).

#### 106. POST /test-scenarios/generate
- **Source:** `features/test-scenario/test-scenario.controller.ts:85` (`generate`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request (spec):** body `GenerateTestScenariosBodyDto` (`generateTestScenariosSchema`): `routes` array (≤500) of `{method, path}` optional (default: every route except `/test-scenarios*`); `categories` array of valid|auth|validation|not_found|domain, min 1, optional
- **Request (sent):**
  - `POST /test-scenarios/generate | token=admin | body={"routes":[{"method":"POST","path":"/users"},{"method":"GET","path":"/logs"}],"categories":["valid","auth","validation"]}`
  - `POST /test-scenarios/generate | token=admin | body={"routes":[{"method":"GET","path":"/logs"}],"categories":["bogus"]}`
  - `POST /test-scenarios/generate | token=student | body={"routes":[{"method":"GET","path":"/logs"}]}`
- **Success (real):**
  - not reached: no 2xx response was produced for this route in this run (see Errors and Notes)
- **Errors (real):**
  - HTTP 404, trigger: admin generate; request `POST /test-scenarios/generate`; body: `{"success":false,"statusCode":404,"message":"Cannot POST /test-scenarios/generate","path":"/test-scenarios/generate"}`
  - HTTP 404, trigger: bad category 404 (route missing); request `POST /test-scenarios/generate`; body: `{"success":false,"statusCode":404,"message":"Cannot POST /test-scenarios/generate","path":"/test-scenarios/generate"}`
  - HTTP 404, trigger: student (route missing); request `POST /test-scenarios/generate`; body: `{"success":false,"statusCode":404,"message":"Cannot POST /test-scenarios/generate","path":"/test-scenarios/generate"}`
- **Downstream:** RMQ `testscenario.generate` `{routes, listRoutes, categories}` → THIRD_SERVICE
- **Verdict:** BUG: 404 `Cannot POST /test-scenarios/generate` for admin and student. The route exists in source (`test-scenario.controller.ts:77`) but not in the running gateway's route catalogue (#105), so the running build is older than the source. Validation 422 not reached.
- **Notes:** Stale build or failed route registration; the handler was not exercised.

#### 107. POST /test-scenarios/bulk
- **Source:** `features/test-scenario/test-scenario.controller.ts:110` (`bulkCreate`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request (spec):** body `BulkCreateTestScenariosDto`: `scenarios` array 1–500 of the create-scenario shape in #114
- **Request (sent):**
  - `POST /test-scenarios/bulk | token=admin | body={"scenarios":[{"service":"gateway","method":"GET","path":"/logs","name":"D-live bulk 1791631898","expectedStatus":200}]}`
  - `POST /test-scenarios/bulk | token=admin | body={"scenarios":[]}`
- **Success (real):**
  - not reached: no 2xx response was produced for this route in this run (see Errors and Notes)
- **Errors (real):**
  - HTTP 404, trigger: admin bulk one scenario; request `POST /test-scenarios/bulk`; body: `{"success":false,"statusCode":404,"message":"Cannot POST /test-scenarios/bulk","path":"/test-scenarios/bulk"}`
  - HTTP 404, trigger: bulk empty; request `POST /test-scenarios/bulk`; body: `{"success":false,"statusCode":404,"message":"Cannot POST /test-scenarios/bulk","path":"/test-scenarios/bulk"}`
- **Downstream:** RMQ `testscenario.createMany` `dto` (`{scenarios}`) → THIRD_SERVICE
- **Verdict:** BUG: 404 `Cannot POST /test-scenarios/bulk`. Same stale-build cause as #106; the empty-list 422 case was not reached.

#### 108. GET /test-scenarios/auth-profiles
- **Source:** `features/test-scenario/test-scenario.controller.ts:125` (`authProfiles`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request (spec):** none
- **Request (sent):**
  - `GET /test-scenarios/auth-profiles | token=admin | body=none`
  - `GET /test-scenarios/auth-profiles | token=student | body=none`
- **Success (real):**
  - HTTP 200 (admin auth-profiles): `{"statusCode":200,"message":"Thành công","data":[{"profile":"admin","configured":false,"email":null},{"profile":"tutor","configured":false,"email":null},"... 2 more item(s)"],"method":"GET","path":"/test-scenarios/auth-profiles"}`
- **Errors (real):**
  - HTTP 403, trigger: student 403; request `GET /test-scenarios/auth-profiles`; body: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/test-scenarios/auth-profiles"}`
- **Downstream:** RMQ `testscenario.authprofiles` `{}` → THIRD_SERVICE
- **Verdict:** OK. 200 with 4 profiles (`admin`, `tutor`, plus 2 more), all `configured: false` and `email: null`; 403 for student.
- **Notes:** The doc's `student` profile example could not be confirmed by name (only the first two entries were shown).

#### 109. GET /test-scenarios/fixtures
- **Source:** `features/test-scenario/test-scenario.controller.ts:133` (`listFixtures`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request (spec):** none
- **Request (sent):**
  - `GET /test-scenarios/fixtures | token=admin | body=none`
  - `GET /test-scenarios/fixtures | token=student | body=none`
- **Success (real):**
  - not reached: no 2xx response was produced for this route in this run (see Errors and Notes)
- **Errors (real):**
  - HTTP 500, trigger: admin fixtures list; request `GET /test-scenarios/fixtures`; body: `{"success":false,"statusCode":500,"message":"Failed query: select \"id\", \"key\", \"description\", \"value\", \"resolver\", \"resolved_at\", \"created_at\", \"updated_at\" from ...","path":"/test-scenarios/fixtures","serviceName":"third-service"}`
  - HTTP 403, trigger: student 403; request `GET /test-scenarios/fixtures`; body: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/test-scenarios/fixtures"}`
- **Downstream:** RMQ `testscenario.fixtures.list` `{}` → THIRD_SERVICE
- **Verdict:** BUG: 500 for admin. The `test_fixtures` table does not exist in `backends_db` (`to_regclass` is NULL), so the select fails. 403 for student is correct.
- **Notes:** Schema drift: migration for fixtures is not applied in this database.

#### 110. POST /test-scenarios/fixtures
- **Source:** `features/test-scenario/test-scenario.controller.ts:146` (`createFixture`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request (spec):** body `CreateTestFixtureDto` (`createTestFixtureSchema`): `key` regex `^[A-Za-z][A-Za-z0-9_]{0,99}$` required; `description` ≤500 optional; `value` string ≤2000 optional nullable; `resolver` optional nullable `{method: "GET" (default), path (starts with a single "/"), authProfile (default admin), extract (1–200 chars)}`. Refinement: `value` or `resolver` must be present (422 otherwise).
- **Request (sent):**
  - `POST /test-scenarios/fixtures | token=admin | body={"key":"dLive_fixture_1791631898","description":"live D","value":"abc"}`
  - `POST /test-scenarios/fixtures | token=admin | body={"key":"1bad-key"}`
  - `POST /test-scenarios/fixtures | token=admin | body={"key":"dLive_noval"}`
  - `POST /test-scenarios/fixtures | token=student | body={"key":"dLive_x","value":"a"}`
- **Success (real):**
  - not reached: no 2xx response was produced for this route in this run (see Errors and Notes)
- **Errors (real):**
  - HTTP 500, trigger: valid literal fixture; request `POST /test-scenarios/fixtures`; body: `{"success":false,"statusCode":500,"message":"Failed query: select \"id\", \"key\", \"description\", \"value\", \"resolver\", \"resolved_at\", \"created_at\", \"updated_at\" from ...","path":"/test-scenarios/fixtures","serviceName":"third-service"}`
  - HTTP 422, trigger: bad key 422; request `POST /test-scenarios/fixtures`; body: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"key","message":"key: letters, digits and _, starting with a letter","code":"invalid_format"},{"field":"","message":"a fixture needs a value or a resolver","code":"custom"}],"path":"/test-scenarios/fixtures"}`
  - HTTP 422, trigger: neither value nor resolver 422; request `POST /test-scenarios/fixtures`; body: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"","message":"a fixture needs a value or a resolver","code":"custom"}],"path":"/test-scenarios/fixtures"}`
  - HTTP 403, trigger: student 403; request `POST /test-scenarios/fixtures`; body: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/test-scenarios/fixtures"}`
- **Downstream:** RMQ `testscenario.fixtures.create` `dto` → THIRD_SERVICE (`TestFixtureService.create`)
- **Verdict:** BUG: a valid body returns 500 (same missing `test_fixtures` table; create runs a select first). The 422 validation cases and the 403 case are correct.
- **Notes:** Real validation messages: bad key `key: letters, digits and _, starting with a letter`; no value or resolver `a fixture needs a value or a resolver`. The 201 and 409 cases were not reached.

#### 111. PATCH /test-scenarios/fixtures/:id
- **Source:** `features/test-scenario/test-scenario.controller.ts:158` (`updateFixture`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request (spec):** path `id` uuid (`ParseUUIDPipe`, 400 if not a UUID); body `UpdateTestFixtureDto` (`updateTestFixtureSchema`, the fixture fields all optional)
- **Request (sent):**
  - `PATCH /test-scenarios/fixtures/00000000-0000-4000-8000-00000000d00d | token=admin | body={"description":"x"}`
  - `PATCH /test-scenarios/fixtures/not-a-uuid | token=admin | body={"description":"x"}`
- **Success (real):**
  - not reached: no 2xx response was produced for this route in this run (see Errors and Notes)
- **Errors (real):**
  - HTTP 500, trigger: unknown id; request `PATCH /test-scenarios/fixtures/00000000-0000-4000-8000-00000000d00d`; body: `{"success":false,"statusCode":500,"message":"Failed query: update \"test_fixtures\" set \"description\" = $1, \"updated_at\" = $2 where \"test_fixtures\".\"id\" = $3 return...","path":"/test-scenarios/fixtures/00000000-0000-4000-8000-00000000d00d","serviceName":"third-service"}`
  - HTTP 400, trigger: bad uuid 400; request `PATCH /test-scenarios/fixtures/not-a-uuid`; body: `{"success":false,"statusCode":400,"message":"Validation failed (uuid is expected)","path":"/test-scenarios/fixtures/not-a-uuid"}`
- **Downstream:** RMQ `testscenario.fixtures.update` `{id, dto}` → THIRD_SERVICE
- **Verdict:** BUG: unknown id returns 500 instead of 404 `Test fixture not found` (missing table). Bad UUID 400 is correct.

#### 112. DELETE /test-scenarios/fixtures/:id
- **Source:** `features/test-scenario/test-scenario.controller.ts:171` (`deleteFixture`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request (spec):** path `id` uuid (`ParseUUIDPipe`)
- **Request (sent):**
  - `DELETE /test-scenarios/fixtures/00000000-0000-4000-8000-00000000d00d | token=admin | body=none`
  - `DELETE /test-scenarios/fixtures/not-a-uuid | token=admin | body=none`
- **Success (real):**
  - not reached: no 2xx response was produced for this route in this run (see Errors and Notes)
- **Errors (real):**
  - HTTP 500, trigger: unknown id; request `DELETE /test-scenarios/fixtures/00000000-0000-4000-8000-00000000d00d`; body: `{"success":false,"statusCode":500,"message":"Failed query: delete from \"test_fixtures\" where \"test_fixtures\".\"id\" = $1 returning \"id\", \"key\", \"description\", \"valu...","path":"/test-scenarios/fixtures/00000000-0000-4000-8000-00000000d00d","serviceName":"third-service"}`
  - HTTP 400, trigger: bad uuid 400; request `DELETE /test-scenarios/fixtures/not-a-uuid`; body: `{"success":false,"statusCode":400,"message":"Validation failed (uuid is expected)","path":"/test-scenarios/fixtures/not-a-uuid"}`
- **Downstream:** RMQ `testscenario.fixtures.delete` `{id}` → THIRD_SERVICE
- **Verdict:** BUG: unknown id returns 500 instead of 404 (missing table). Bad UUID 400 is correct.

#### 113. POST /test-scenarios/fixtures/:id/resolve
- **Source:** `features/test-scenario/test-scenario.controller.ts:184` (`resolveFixture`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request (spec):** path `id` uuid (`ParseUUIDPipe`); optional `Authorization` header, forwarded as `accessToken` with the `Bearer ` prefix stripped
- **Request (sent):**
  - `POST /test-scenarios/fixtures/00000000-0000-4000-8000-00000000d00d/resolve | token=admin | body=none`
  - `POST /test-scenarios/fixtures/not-a-uuid/resolve | token=admin | body=none`
- **Success (real):**
  - not reached: no 2xx response was produced for this route in this run (see Errors and Notes)
- **Errors (real):**
  - HTTP 500, trigger: unknown id; request `POST /test-scenarios/fixtures/00000000-0000-4000-8000-00000000d00d/resolve`; body: `{"success":false,"statusCode":500,"message":"Failed query: select \"id\", \"key\", \"description\", \"value\", \"resolver\", \"resolved_at\", \"created_at\", \"updated_at\" from ...","path":"/test-scenarios/fixtures/00000000-0000-4000-8000-00000000d00d/resolve","serviceName":"third-service"}`
  - HTTP 400, trigger: bad uuid 400; request `POST /test-scenarios/fixtures/not-a-uuid/resolve`; body: `{"success":false,"statusCode":400,"message":"Validation failed (uuid is expected)","path":"/test-scenarios/fixtures/not-a-uuid/resolve"}`
- **Downstream:** RMQ `testscenario.fixtures.resolve` `{id, accessToken}` → THIRD_SERVICE
- **Verdict:** BUG: unknown id returns 500 instead of 404 (missing table). Bad UUID 400 is correct. The resolver call path was not reached.

#### 114. POST /test-scenarios
- **Source:** `features/test-scenario/test-scenario.controller.ts:196` (`create`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request (spec):** body `CreateTestScenarioDto` (`createTestScenarioSchema`): `service` string 1–50 required; `method` GET|POST|PUT|PATCH|DELETE required; `path` string starting with a single "/" required; `name` 1–200 required; `description` optional; `requestTemplate` `{headers?: record<string,string>, body?: any}` default {}; `expectedStatus` int 100–599 required; `category` valid|auth|validation|not_found|domain default valid; `authProfile` caller|admin|tutor|student|parent|none default caller
- **Request (sent):**
  - `POST /test-scenarios | token=admin | body={"service":"gateway","method":"GET","path":"/dashboard/overview","name":"D-live dashboard as admin 1791631898","description":"live test D","requestTemplate":{"headers":{"authorization":"Bearer {{accessToken}}"}},"expectedStatus":200,"category":"valid","authProfile":"admin"}`
  - `POST /test-scenarios | token=admin | body={"service":"gateway","method":"FOO","path":"/logs","name":"x","expectedStatus":200}`
  - `POST /test-scenarios | token=admin | body={"service":"gateway","method":"GET","path":"/logs","name":"x","expectedStatus":99}`
  - `POST /test-scenarios | token=student | body={"service":"gateway","method":"GET","path":"/logs","name":"x","expectedStatus":200}`
  - `POST /test-scenarios | token=none | body={"service":"gateway","method":"GET","path":"/logs","name":"x","expectedStatus":200}`
- **Success (real):**
  - not reached: no 2xx response was produced for this route in this run (see Errors and Notes)
- **Errors (real):**
  - HTTP 500, trigger: admin create valid scenario; request `POST /test-scenarios`; body: `{"success":false,"statusCode":500,"message":"Failed query: insert into \"test_scenarios\" (\"id\", \"service\", \"method\", \"path\", \"name\", \"description\", \"request_templa...","path":"/test-scenarios","serviceName":"third-service"}`
  - HTTP 422, trigger: bad method 422; request `POST /test-scenarios`; body: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"method","message":"Invalid option: expected one of \"GET\"|\"POST\"|\"PUT\"|\"PATCH\"|\"DELETE\"","code":"invalid_value"}],"path":"/test-scenarios"}`
  - HTTP 422, trigger: expectedStatus 99 422; request `POST /test-scenarios`; body: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"expectedStatus","message":"Too small: expected number to be >=100","code":"too_small"}],"path":"/test-scenarios"}`
  - HTTP 403, trigger: student 403; request `POST /test-scenarios`; body: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/test-scenarios"}`
  - HTTP 401, trigger: no token 401; request `POST /test-scenarios`; body: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/test-scenarios"}`
- **Downstream:** RMQ `testscenario.create` `dto` → THIRD_SERVICE
- **Verdict:** BUG: a valid create returns 500. The insert names column `auth_profile`, which does not exist in the `test_scenarios` table. 422, 403 and 401 are correct.
- **Notes:** No scenario could be created through the API, so the happy paths of #115 and #118-#121 were not reached. No rows were inserted by SQL.

#### 115. GET /test-scenarios
- **Source:** `features/test-scenario/test-scenario.controller.ts:215` (`list`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request (spec):** query `service`, `method`, `path` (strings) and `category` (enum) all optional
- **Request (sent):**
  - `GET /test-scenarios?service=gateway&method=GET&category=valid | token=admin | body=none`
  - `GET /test-scenarios?category=bogus | token=admin | body=none`
  - `GET /test-scenarios | token=student | body=none`
- **Success (real):**
  - not reached: no 2xx response was produced for this route in this run (see Errors and Notes)
- **Errors (real):**
  - HTTP 500, trigger: admin list filtered; request `GET /test-scenarios?service=gateway&method=GET&category=valid`; body: `{"success":false,"statusCode":500,"message":"Failed query: select \"test_scenarios\".\"id\", \"test_scenarios\".\"service\", \"test_scenarios\".\"method\", \"test_scenarios\".\"...","path":"/test-scenarios?service=gateway&method=GET&category=valid","serviceName":"third-service"}`
  - HTTP 422, trigger: bad category 422; request `GET /test-scenarios?category=bogus`; body: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"category","message":"Invalid option: expected one of \"valid\"|\"auth\"|\"validation\"|\"not_found\"|\"domain\"","code":"invalid_value"}],"path":"/test-scenarios?category=bogus"}`
  - HTTP 403, trigger: student 403; request `GET /test-scenarios`; body: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/test-scenarios"}`
- **Downstream:** RMQ `testscenario.list` `query` → THIRD_SERVICE
- **Verdict:** BUG: 500 on the list query (join selects `auth_profile`, same missing column as #114). 422 for bad category and 403 for student are correct.

#### 116. GET /test-scenarios/meta
- **Source:** `features/test-scenario/test-scenario.controller.ts:229` (`meta`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request (spec):** none
- **Request (sent):**
  - `GET /test-scenarios/meta | token=admin | body=none`
  - `GET /test-scenarios/meta | token=student | body=none`
- **Success (real):**
  - HTTP 200 (admin meta): `{"statusCode":200,"message":"Thành công","data":{"environment":"development"},"method":"GET","path":"/test-scenarios/meta"}`
- **Errors (real):**
  - HTTP 403, trigger: student 403; request `GET /test-scenarios/meta`; body: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/test-scenarios/meta"}`
- **Downstream:** none (env read)
- **Verdict:** OK. 200 `{environment: "development"}`; 403 for student.

#### 117. GET /test-scenarios/stats
- **Source:** `features/test-scenario/test-scenario.controller.ts:242` (`stats`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request (spec):** none
- **Request (sent):**
  - `GET /test-scenarios/stats | token=admin | body=none`
- **Success (real):**
  - HTTP 200 (admin stats): `{"statusCode":200,"message":"Thành công","data":[],"method":"GET","path":"/test-scenarios/stats"}`
- **Errors (real):**
  - not triggered: see Verdict
- **Downstream:** RMQ `testscenario.stats` `{}` → THIRD_SERVICE
- **Verdict:** OK. 200 with `data: []` (no scenarios to aggregate).

#### 118. GET /test-scenarios/:id/runs
- **Source:** `features/test-scenario/test-scenario.controller.ts:255` (`runs`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request (spec):** path `id` uuid (`ParseUUIDPipe`); query `limit` int (default 20, `ParseIntPipe`, non-integer is 400)
- **Request (sent):**
  - `GET /test-scenarios/00000000-0000-4000-8000-00000000d00d/runs | token=admin | body=none`
  - `GET /test-scenarios/not-a-uuid/runs?limit=5 | token=admin | body=none`
  - `GET /test-scenarios/00000000-0000-4000-8000-00000000d00d/runs?limit=abc | token=admin | body=none`
- **Success (real):**
  - not reached: no 2xx response was produced for this route in this run (see Errors and Notes)
- **Errors (real):**
  - HTTP 500, trigger: unknown scenario id; request `GET /test-scenarios/00000000-0000-4000-8000-00000000d00d/runs`; body: `{"success":false,"statusCode":500,"message":"Failed query: select \"id\", \"service\", \"method\", \"path\", \"name\", \"description\", \"request_template\", \"expected_status\",...","path":"/test-scenarios/00000000-0000-4000-8000-00000000d00d/runs","serviceName":"third-service"}`
  - HTTP 400, trigger: bad uuid 400; request `GET /test-scenarios/not-a-uuid/runs?limit=5`; body: `{"success":false,"statusCode":400,"message":"Validation failed (uuid is expected)","path":"/test-scenarios/not-a-uuid/runs?limit=5"}`
  - HTTP 400, trigger: limit abc 400; request `GET /test-scenarios/00000000-0000-4000-8000-00000000d00d/runs?limit=abc`; body: `{"success":false,"statusCode":400,"message":"Validation failed (numeric string is expected)","path":"/test-scenarios/00000000-0000-4000-8000-00000000d00d/runs?limit=abc"}`
- **Downstream:** RMQ `testscenario.runs` `{id, limit}` → THIRD_SERVICE
- **Verdict:** BUG: unknown scenario id returns 500 instead of 404 `Test scenario not found` (same missing `auth_profile` column). Bad UUID 400 and non-integer limit 400 are correct.
- **Notes:** Happy path not reached (no scenario exists).

#### 119. PATCH /test-scenarios/:id
- **Source:** `features/test-scenario/test-scenario.controller.ts:267` (`update`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request (spec):** path `id` uuid (`ParseUUIDPipe`); body `UpdateTestScenarioDto` (`updateTestScenarioSchema`, every field of #114 optional, no defaults)
- **Request (sent):**
  - `PATCH /test-scenarios/00000000-0000-4000-8000-00000000d00d | token=admin | body={"expectedStatus":200}`
  - `PATCH /test-scenarios/not-a-uuid | token=admin | body={"expectedStatus":200}`
  - `PATCH /test-scenarios/00000000-0000-4000-8000-00000000d00d | token=admin | body={"expectedStatus":99}`
- **Success (real):**
  - not reached: no 2xx response was produced for this route in this run (see Errors and Notes)
- **Errors (real):**
  - HTTP 500, trigger: unknown id; request `PATCH /test-scenarios/00000000-0000-4000-8000-00000000d00d`; body: `{"success":false,"statusCode":500,"message":"Failed query: update \"test_scenarios\" set \"expected_status\" = $1, \"updated_at\" = $2 where \"test_scenarios\".\"id\" = $3 ...","path":"/test-scenarios/00000000-0000-4000-8000-00000000d00d","serviceName":"third-service"}`
  - HTTP 400, trigger: bad uuid 400; request `PATCH /test-scenarios/not-a-uuid`; body: `{"success":false,"statusCode":400,"message":"Validation failed (uuid is expected)","path":"/test-scenarios/not-a-uuid"}`
  - HTTP 422, trigger: expectedStatus 99 422; request `PATCH /test-scenarios/00000000-0000-4000-8000-00000000d00d`; body: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"expectedStatus","message":"Too small: expected number to be >=100","code":"too_small"}],"path":"/test-scenarios/00000000-0000-4000-8000-00000000d00d"}`
- **Downstream:** RMQ `testscenario.update` `{id, dto}` → THIRD_SERVICE
- **Verdict:** BUG: unknown id returns 500 instead of 404. Expected-status 422 and bad UUID 400 are correct.

#### 120. DELETE /test-scenarios/:id
- **Source:** `features/test-scenario/test-scenario.controller.ts:280` (`remove`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request (spec):** path `id` uuid (`ParseUUIDPipe`)
- **Request (sent):**
  - `DELETE /test-scenarios/00000000-0000-4000-8000-00000000d00d | token=admin | body=none`
  - `DELETE /test-scenarios/not-a-uuid | token=admin | body=none`
  - `DELETE /test-scenarios/00000000-0000-4000-8000-00000000d00d | token=tutor | body=none`
- **Success (real):**
  - not reached: no 2xx response was produced for this route in this run (see Errors and Notes)
- **Errors (real):**
  - HTTP 500, trigger: unknown id; request `DELETE /test-scenarios/00000000-0000-4000-8000-00000000d00d`; body: `{"success":false,"statusCode":500,"message":"Failed query: delete from \"test_scenarios\" where \"test_scenarios\".\"id\" = $1 returning \"id\", \"service\", \"method\", \"pat...","path":"/test-scenarios/00000000-0000-4000-8000-00000000d00d","serviceName":"third-service"}`
  - HTTP 400, trigger: bad uuid 400; request `DELETE /test-scenarios/not-a-uuid`; body: `{"success":false,"statusCode":400,"message":"Validation failed (uuid is expected)","path":"/test-scenarios/not-a-uuid"}`
  - HTTP 403, trigger: tutor 403; request `DELETE /test-scenarios/00000000-0000-4000-8000-00000000d00d`; body: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/test-scenarios/00000000-0000-4000-8000-00000000d00d"}`
- **Downstream:** RMQ `testscenario.delete` `{id}` → THIRD_SERVICE
- **Verdict:** BUG: unknown id returns 500 instead of 404. Bad UUID 400 and tutor 403 are correct.

#### 121. POST /test-scenarios/:id/run
- **Source:** `features/test-scenario/test-scenario.controller.ts:302` (`run`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request (spec):** path `id` uuid (`ParseUUIDPipe`); query `async` (string; `'true'` sets `wait=false`); `Authorization` header forwarded as `accessToken`; the caller's `user.id` is sent as `userId`
- **Request (sent):**
  - `POST /test-scenarios/00000000-0000-4000-8000-00000000d00d/run?async=true | token=admin | body=none`
  - `POST /test-scenarios/not-a-uuid/run | token=admin | body=none`
  - `POST /test-scenarios/00000000-0000-4000-8000-00000000d00d/run | token=student | body=none`
- **Success (real):**
  - not reached: no 2xx response was produced for this route in this run (see Errors and Notes)
- **Errors (real):**
  - HTTP 500, trigger: unknown scenario async; request `POST /test-scenarios/00000000-0000-4000-8000-00000000d00d/run?async=true`; body: `{"success":false,"statusCode":500,"message":"Failed query: select \"id\", \"service\", \"method\", \"path\", \"name\", \"description\", \"request_template\", \"expected_status\",...","path":"/test-scenarios/00000000-0000-4000-8000-00000000d00d/run?async=true","serviceName":"third-service"}`
  - HTTP 400, trigger: bad uuid 400; request `POST /test-scenarios/not-a-uuid/run`; body: `{"success":false,"statusCode":400,"message":"Validation failed (uuid is expected)","path":"/test-scenarios/not-a-uuid/run"}`
  - HTTP 403, trigger: student 403; request `POST /test-scenarios/00000000-0000-4000-8000-00000000d00d/run`; body: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/test-scenarios/00000000-0000-4000-8000-00000000d00d/run"}`
- **Downstream:** RMQ `testscenario.run` `{id, userId, accessToken, wait}` → THIRD_SERVICE. Sync runs use the gateway default RMQ timeout (10 s per attempt, 3 attempts) while the service's own fetch timeout is 15 s, so a slow target can produce a 504 and the retry re-executes the run (see Unclear).
- **Verdict:** BUG: unknown scenario id returns 500 instead of 404. Bad UUID 400 and student 403 are correct. Sync and async success not reached.

## Upload (`/upload`)

#### 122. POST /upload
- **Source:** `features/upload/upload.controller.ts:55` (`upload`)
- **Auth:** Public (anonymous)
- **Request (spec):** multipart/form-data, single file in field `file` (Multer, no size or type limit set in the gateway). The gateway sends `{file: {originalname, mimetype, size, buffer: <base64 string>}}`.
- **Request (sent):**
  - `POST /upload | token=none | body=multipart/form-data (see label)`
- **Success (real):**
  - not reached: no 2xx response was produced for this route in this run (see Errors and Notes)
- **Errors (real):**
  - HTTP 500, trigger: single png, valid multipart; request `POST /upload`; body: `{"success":false,"statusCode":500,"message":"The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Re...","path":"/upload","serviceName":"third-service"}`
  - HTTP 500, trigger: text field only, no file; request `POST /upload`; body: `{"success":false,"statusCode":500,"message":"Cannot read properties of undefined (reading 'originalname')","path":"/upload"}`
  - HTTP 400, trigger: wrong field name "other"; request `POST /upload`; body: `{"success":false,"statusCode":400,"message":"Unexpected file field - other","path":"/upload"}`
- **Downstream:** RMQ `upload.upload` `{file: {originalname, mimetype, size, buffer: base64}}` → THIRD_SERVICE. THIRD's `UploadRpcController.reconstruct` reads `file.buffer.data` (the `{type:'Buffer', data:[...]}` JSON form), so the base64 string yields `Buffer.from(undefined)`.
- **Verdict:** BUG: valid PNG upload returns 500 with the Buffer contract error (doc's documented failure). Text-only multipart returns 500 `Cannot read properties of undefined (reading 'originalname')`, as the doc says. A wrong field name returns 400 `Unexpected file field - other`, which is a correct client error.
- **Notes:** The failure happens before the object write, so nothing was stored. The success example is unreachable until the buffer contract is fixed.

#### 123. POST /upload/multiple
- **Source:** `features/upload/upload.controller.ts:82` (`uploadMultiple`)
- **Auth:** Public (anonymous)
- **Request (spec):** multipart/form-data, up to 10 files in field `files`
- **Request (sent):**
  - `POST /upload/multiple | token=none | body=multipart/form-data (see label)`
- **Success (real):**
  - HTTP 201 (text field only, no files): `{"statusCode":201,"message":"Thành công","data":[],"method":"POST","path":"/upload/multiple"}`
- **Errors (real):**
  - HTTP 500, trigger: two png files; request `POST /upload/multiple`; body: `{"success":false,"statusCode":500,"message":"The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Re...","path":"/upload/multiple","serviceName":"third-service"}`
  - HTTP 400, trigger: wrong field name "other"; request `POST /upload/multiple`; body: `{"success":false,"statusCode":400,"message":"Unexpected file field - other","path":"/upload/multiple"}`
- **Downstream:** RMQ `upload.uploadMultiple` `{files: [{originalname, mimetype, size, buffer: base64}]}` → THIRD_SERVICE
- **Verdict:** BUG: two PNG files return 500 (same Buffer error). Multipart with no `files` field returns 201 with `data: []` (doc predicted 500 `reading 'map'`); an empty success should be a 400.
- **Notes:** A wrong field name returns 400 `Unexpected file field - other`.

#### 124. GET /upload/download
- **Source:** `features/upload/upload.controller.ts:100` (`download`)
- **Auth:** Public (anonymous)
- **Request (spec):** query `key` (string, no validation)
- **Request (sent):**
  - `GET /upload/download?key=uploads/liveD-does-not-exist.png | token=none | body=none`
  - `GET /upload/download | token=none | body=none`
- **Success (real):**
  - not reached: no 2xx response was produced for this route in this run (see Errors and Notes)
- **Errors (real):**
  - HTTP 500, trigger: download missing key; request `GET /upload/download?key=uploads/liveD-does-not-exist.png`; body: `{"success":false,"statusCode":500,"message":"The specified key does not exist.","path":"/upload/download?key=uploads/liveD-does-not-exist.png","serviceName":"third-service"}`
  - HTTP 500, trigger: download no key param; request `GET /upload/download`; body: `{"success":false,"statusCode":500,"message":"No value provided for input HTTP label: Key.","path":"/upload/download","serviceName":"third-service"}`
- **Downstream:** RMQ `upload.download` `{key}` → THIRD_SERVICE. Intended reply `{buffer: base64}` per gateway; actual reply `{content, contentType, contentLength, filename}` from `UploadRpcController.download`.
- **Verdict:** BUG: a missing object returns 500 `The specified key does not exist.` (should be 404). A missing `key` query returns 500 `No value provided for input HTTP label: Key.` (should be 400 or 422; the route has no validation).
- **Notes:** The doc says every call fails with the Buffer error; that is not what happens here. The request reaches R2 and fails with S3 NoSuchKey. The success path is untested because no upload could be stored.

#### 125. DELETE /upload/:key
- **Source:** `features/upload/upload.controller.ts:113` (`delete`)
- **Auth:** Public (anonymous; deletes stored files with no login)
- **Request (spec):** path `key` (the R2 object key, for example `uploads/<uuid>.jpg`; a slash must be URL-encoded as `%2F` to match the single `:key` segment)
- **Request (sent):**
  - `DELETE /upload/uploads%2Flive-D-missing.png | token=none | body=none`
- **Success (real):**
  - not reached: no 2xx response was produced for this route in this run (see Errors and Notes)
- **Errors (real):**
  - HTTP 500, trigger: delete missing key; request `DELETE /upload/uploads%2Flive-D-missing.png`; body: `{"success":false,"statusCode":500,"message":"no elements in sequence","path":"/upload/uploads%2Flive-D-missing.png"}`
- **Downstream:** RMQ `upload.delete` `{key}` → THIRD_SERVICE (`UploadRpcController.del` returns the `void` result)
- **Verdict:** BUG: delete of a missing key returns 500 `no elements in sequence` (empty RMQ reply on a void handler), as the doc predicts.
- **Notes:** Existing-key delete not reached because no upload could be stored.

## Users (`/users`)

#### 126. GET /users
- **Source:** `features/user/user.controller.ts:68` (`getUsers`)
- **Auth:** JWT + Redis session (no role check; any authenticated user)
- **Request (spec):** query `GetUsersQueryDto` (`getUsersQuerySchema`): `page` default 1; `limit` 1–100 default 10 (`pageSize` accepted as an alias); `search` trimmed optional; `role` ADMIN|TUTOR|PARENT|STUDENT optional; `isActive` `'true'|'false'` optional
- **Request (sent):**
  - `GET /users?page=1&limit=10&search=live-D-&role=STUDENT&isActive=true | token=admin | body=none`
  - `GET /users?limit=500 | token=admin | body=none`
  - `GET /users?pageSize=2&page=1 | token=admin | body=none`
  - `GET /users?search=live-D- | token=student | body=none`
  - `GET /users?isActive=maybe | token=admin | body=none`
  - `GET /users?limit=5 | token=none | body=none`
- **Success (real):**
  - HTTP 200 (admin list filtered): `{"statusCode":200,"message":"Thành công","data":{"data":[{"id":"1e7e9ca2-1242-45c3-a328-f2d3e4ab2e34","email":"live-D-t4-1791631898@example.com","name":"Tog Dtest","role":"STUDENT","status":"active","createdAt":"2026-10-10T11:31:47.645Z"},{"id":"4551c3c3-ad51-4721-a864-b67f14aa5ce4","email":"live-D-del-1791631898@example.com","name":"Del Dtest","role":"STUDENT","status":"active","createdAt":"2026-10-10T11:31:47.565Z"},"... 1 more item(s)"],"pagination":{"page":1,"pageSize":10,"total":3,"totalPages":1}},"method":"GET","path":"/users?page=1&limit=10&search=live-D-&role=STUDENT&isActive=true"}`
  - also HTTP 200 (pageSize alias)
  - also HTTP 200 (STUDENT lists all users (no role check))
- **Errors (real):**
  - HTTP 422, trigger: limit 500 422; request `GET /users?limit=500`; body: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"limit","message":"Too big: expected number to be <=100","code":"too_big"}],"path":"/users?limit=500"}`
  - HTTP 422, trigger: isActive=maybe 422; request `GET /users?isActive=maybe`; body: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"isActive","message":"Invalid option: expected one of \"true\"|\"false\"","code":"invalid_value"}],"path":"/users?isActive=maybe"}`
  - HTTP 401, trigger: no token 401; request `GET /users?limit=5`; body: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/users?limit=5"}`
- **Downstream:** RMQ `user.getUsers` `query` → USER_SERVICE
- **Verdict:** BUG (data exposure): any STUDENT receives the full user directory (200 with emails, roles and status). Shape `{data, pagination}` matches the doc. 422 for `limit=500` and `isActive=maybe`, 401 without a token, and the `pageSize` alias are correct.
- **Notes:** Items expose `name` rather than `firstName`/`lastName`; no password field in list items.

#### 127. GET /users/detail-user
- **Source:** `features/user/user.controller.ts:85` (`getDetailUserController`)
- **Auth:** JWT + Redis session (current user only)
- **Request (spec):** none. The `getUserDetailQuerySchema` (`include`, `transactionLimit`) exists in the schema file but is not wired to this route.
- **Request (sent):**
  - `GET /users/detail-user | token=student | body=none`
  - `GET /users/detail-user | token=test-user T1 (self token) | body=none`
  - `GET /users/detail-user | token=none | body=none`
- **Success (real):**
  - HTTP 200 ((setup) student detail): `{"statusCode":200,"message":"Thành công","data":{"id":"7fcca22a-c9f8-4b8a-98e1-642b2c91d995","email":"student@finance.dev","username":"student","firstName":"Student","lastName":"Account","avatar":null,"phone":null,"isActive":true,"role":"STUDENT","description":null,"userCode":null,"gender":null,"dateOfBirth":null,"address":null,"district":null,"province":null,"subjects":null,"facebookId":null,"googleId":null,"school":null,"relationship":null,"gradesId":[],"parentId":null,"tutorId":null,"createdAt":"2026-10-10T11:24:53.427Z","updatedAt":"2026-10-10T11:24:53.427Z"},"method":"GET","path":"/users/detail-user"}`
  - also HTTP 200 (T1 self detail)
  - also HTTP 200 (T1 detail after password change)
  - also HTTP 200 (deleted T1 token detail)
- **Errors (real):**
  - HTTP 401, trigger: no token 401; request `GET /users/detail-user`; body: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/users/detail-user"}`
- **Downstream:** RMQ `user.getDetailUser` `{userId}` → USER_SERVICE
- **Verdict:** OK. 200 for admin, tutor and student; the `password` field is absent. A deleted user returns `data: null`.
- **Notes:** The deleted user's JWT still returns 200, so sessions are not invalidated on delete (not a doc claim, noted for review).

#### 128. GET /users/get-by-field
- **Source:** `features/user/user.controller.ts:101` (`getUserByField`)
- **Auth:** JWT + Redis session (no role check)
- **Request (spec):** query `field` string non-empty required; `value` string non-empty required. Downstream accepts only `id`, `email`, `username`, `phone`, `userCode` (verified in `UserService.searchableFields`).
- **Request (sent):**
  - `GET /users/get-by-field?field=id&value=a4d6a887-720f-4f75-afae-6194615c21fb | token=admin | body=none`
  - `GET /users/get-by-field?field=email&value=live-D-student-1791631898@example.com | token=admin | body=none`
  - `GET /users/get-by-field?field=id&value=96f0d1db-c07d-461a-bccb-2a21410c78b6 | token=admin | body=none`
  - `GET /users/get-by-field?field=firstName&value=Live | token=admin | body=none`
  - `GET /users/get-by-field?field=email | token=admin | body=none`
  - `GET /users/get-by-field?field=email&value=live-D-student-1791631898@example.com | token=none | body=none`
- **Success (real):**
  - HTTP 200 (verify role of STUDENT-created user T2): `{"statusCode":200,"message":"Thành công","data":[{"id":"a4d6a887-720f-4f75-afae-6194615c21fb","email":"live-D-adm-1791631898@example.com","username":"dtestadm","firstName":"Adm","lastName":"Dtest","password":"$2b$10$VbKsKX1fD2QOYn90bbUFUuo9SoQgyDMmf2IlsRq2j/4Gacbx4VHxm","avatar":null,"phone":null,"isActive":true,"role":"ADMIN","description":null,"userCode":null,"gender":null,"dateOfBirth":null,"address":null,"district":null,"province":null,"subjects":null,"facebookId":null,"googleId":null,"school":null,"relationship":null,"gradesId":[],"parentId":null,"tutorId":null,"createdAt":"2026-10-10T11:31:47.501Z","updatedAt":"2026-10-10T11:31:47.501Z"}],"method":"GET","path":"/users/get-by-field?field=id&value=a4d6a887-720f-4f75-afae-6194615c21fb"}`
  - also HTTP 200 (lookup T1 by email)
  - also HTTP 200 (lookup T1 by id)
- **Errors (real):**
  - HTTP 400, trigger: unsupported field 400; request `GET /users/get-by-field?field=firstName&value=Live`; body: `{"success":false,"statusCode":400,"message":"Trường không được hỗ trợ: firstName","path":"/users/get-by-field?field=firstName&value=Live","serviceName":"user-service"}`
  - HTTP 422, trigger: missing value 422; request `GET /users/get-by-field?field=email`; body: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"value","message":"Value must be string ...","code":"invalid_type"}],"path":"/users/get-by-field?field=email"}`
  - HTTP 401, trigger: no token 401; request `GET /users/get-by-field?field=email&value=live-D-student-1791631898@example.com`; body: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/users/get-by-field?field=email&value=live-D-student-1791631898@example.com"}`
- **Downstream:** RMQ `user.getUserByField` `{field, value}` → USER_SERVICE
- **Verdict:** BUG (data exposure): returns the bcrypt `password` hash for every match (verified for admin lookups). Unsupported field 400 and missing value 422 are correct.
- **Notes:** Messages differ from the doc: `Trường không được hỗ trợ: firstName` and `Value must be string ...`.

#### 129. POST /users
- **Source:** `features/user/user.controller.ts:119` (`createUser`)
- **Auth:** JWT + Redis session (no role check; any authenticated user can create any role, see Unclear)
- **Request (spec):** body `CreateUserDto` (`createUserSchema`, not strict): `email` required email; `firstName` and `lastName` 2–100 required; `password` 6–20 required (complexity only applied when length is 8–100); `username` 1–100 optional; `avatar` URL optional; `isActive` boolean default true; `role` ADMIN|TUTOR|PARENT|STUDENT default STUDENT; `dateOfBirth` `z.date()` optional (a JSON string is rejected); `relationship` MOTHER|FATHER|'' default ''; `classId`, `gradesId` uuid[] default []; `parentId`, `tutorId` uuid optional; `description`, `userCode`, `gender`, `address`, `district`, `province`, `subjects`, `facebookId`, `googleId`, `school` strings default ''
- **Request (sent):**
  - `POST /users | token=admin | body={"email":"live-D-student-1791631898@example.com","firstName":"Live","lastName":"Dtest","password":"Test#1234","role":"STUDENT","username":"liveD631898"}`
  - `POST /users | token=admin | body={"email":"live-D-student-1791631898@example.com","firstName":"Live","lastName":"Dtest","password":"Test#1234"}`
  - `POST /users | token=admin | body={"email":"live-D-short-1791631898@example.com","firstName":"Live","lastName":"Dtest","password":"123"}`
  - `POST /users | token=admin | body={"email":"not-an-email","firstName":"L","lastName":"D","password":"Test#1234"}`
  - `POST /users | token=none | body={"email":"x@example.com","firstName":"L","lastName":"D","password":"Test#1234"}`
  - `POST /users | token=student | body={"email":"live-D-adm-1791631898@example.com","firstName":"Adm","lastName":"Dtest","password":"Test#1234","role":"ADMIN"}`
  - `POST /users | token=student | body={"email":"live-D-del-1791631898@example.com","firstName":"Del","lastName":"Dtest","password":"Test#1234"}`
  - `POST /users | token=admin | body={"email":"live-D-t4-1791631898@example.com","firstName":"Tog","lastName":"Dtest","password":"Test#1234"}`
- **Success (real):**
  - HTTP 201 (admin creates STUDENT T1): `{"statusCode":201,"message":"Thành công","data":{"message":"User created successfully","data":{"email":"live-D-student-1791631898@example.com","fullName":"Live Dtest","password":"$2b$10$W05Qi5nlWjwPJAxi14G1EOLJ.z9g//dw6srAYkbydnUJYb9y6O7KK"}},"method":"POST","path":"/users"}`
  - also HTTP 201 (STUDENT creates ADMIN user T2 (escalation))
  - also HTTP 201 (STUDENT creates T3 (for delete test))
  - also HTTP 201 (admin creates T4 (status test))
- **Errors (real):**
  - HTTP 400, trigger: duplicate email 400; request `POST /users`; body: `{"success":false,"statusCode":400,"message":"Email đã tồn tại: live-D-student-1791631898@example.com","path":"/users","serviceName":"user-service"}`
  - HTTP 422, trigger: short password 422; request `POST /users`; body: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"password","message":"Password must be at least 6 characters","code":"too_small"}],"path":"/users"}`
  - HTTP 422, trigger: bad email 422; request `POST /users`; body: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"email","message":"Invalid email address","code":"invalid_format"},{"field":"firstName","message":"First name must be at least 2 characters","code":"too_small"},"... 1 more item(s)"],"path":"/users"}`
  - HTTP 401, trigger: no token 401; request `POST /users`; body: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/users"}`
- **Downstream:** RMQ `user.createUser` `dto` → USER_SERVICE
- **Verdict:** BUG: (1) a STUDENT created a user with `role: "ADMIN"` (201; `get-by-field` confirms role ADMIN). (2) The 201 response includes the bcrypt hash of the new password. Duplicate email 400 and short password 422 are correct.
- **Notes:** Duplicate email message is `Email đã tồn tại: <email>`; short password is `Password must be at least 6 characters`.

#### 130. PUT /users
- **Source:** `features/user/user.controller.ts:137` (`updateUserController`)
- **Auth:** JWT + Redis session (self-update)
- **Request (spec):** body `UpdateUserDto` (`updateUserSchema`, `.strict()`, all optional): `email`, `username`, `firstName`/`lastName` (2–100), `avatar` URL nullable, `phone` ≤20 nullable, `isActive`, `role` ADMIN|TUTOR|PARENT|STUDENT, `description` ≤5000 nullable, `userCode` ≤6 nullable, `gender` nullable, `dateOfBirth` nullable, `address`, `district`/`province` ≤30 nullable, `subjects`, `facebookId`, `googleId`, `school` ≤255, `relationship` ≤50, `classId`, `parentId`, `tutorId` uuid nullable, `gradesId` uuid[]. `password` is rejected (422).
- **Request (sent):**
  - `PUT /users | token=test-user T1 (self token) | body={"firstName":"Live2","lastName":"Dtest"}`
  - `PUT /users | token=test-user T1 (self token) | body={"password":"Hacked#1"}`
  - `PUT /users | token=test-user T1 (self token) | body={"school":"THPT Test D","subjects":"Math, Physics","phone":"0901234567"}`
  - `PUT /users | token=test-user T1 (self token) | body={"role":"TUTOR","firstName":"Live2"}`
  - `PUT /users | token=none | body={"school":"x"}`
- **Success (real):**
  - HTTP 200 (student self update ok): `{"statusCode":200,"message":"Thành công","data":{"id":"96f0d1db-c07d-461a-bccb-2a21410c78b6","email":"live-D-student-1791631898@example.com","username":"liveD631898","firstName":"Live","lastName":"Dtest","password":"$2b$10$W05Qi5nlWjwPJAxi14G1EOLJ.z9g//dw6srAYkbydnUJYb9y6O7KK","avatar":null,"phone":"0901234567","isActive":true,"role":"STUDENT","description":null,"userCode":null,"gender":null,"dateOfBirth":null,"address":null,"district":null,"province":null,"subjects":"Math, Physics","facebookId":null,"googleId":null,"school":"THPT Test D","relationship":null,"gradesId":[],"parentId":null,"tutorId":null,"createdAt":"2026-10-10T11:31:47.115Z","updatedAt":"2026-10-10T11:31:48.397Z"},"method":"PUT","path":"/users"}`
  - also HTTP 200 (role in body bypasses name check)
- **Errors (real):**
  - HTTP 400, trigger: student renames self 400; request `PUT /users`; body: `{"success":false,"statusCode":400,"message":"Học sinh không được tự thay đổi họ tên","path":"/users","serviceName":"user-service"}`
  - HTTP 422, trigger: password key 422; request `PUT /users`; body: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"","message":"Unrecognized key: \"password\"","code":"unrecognized_keys"}],"path":"/users"}`
  - HTTP 401, trigger: no token 401; request `PUT /users`; body: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/users"}`
- **Downstream:** RMQ `user.updateUser` `{userId: caller.id, role: caller.role, ...dto}` → USER_SERVICE. The RPC handler takes `role` out of the data, so the body's `role` is not persisted, but it does overwrite `caller.role` for the STUDENT name check (see Unclear).
- **Verdict:** BUG: the student self-rename guard is bypassed. A STUDENT sending `role: "TUTOR"` with `firstName` gets 200 and the name changes (stored role stays STUDENT). A plain rename gets 400 `Học sinh không được tự thay đổi họ tên`. The response includes the password hash. Unknown key `password` gets 422 correctly.

#### 131. PUT /users/:id
- **Source:** `features/user/user.controller.ts:157` (`updateUserByAdminController`)
- **Auth:** JWT + Redis session (no role check; the route name says admin)
- **Request (spec):** path `id` (no UUID pipe); body same as #130 (strict)
- **Request (sent):**
  - `PUT /users/96f0d1db-c07d-461a-bccb-2a21410c78b6 | token=admin | body={"role":"TUTOR","isActive":true,"school":"THPT Test D"}`
  - `PUT /users/not-a-uuid | token=admin | body={"school":"x"}`
  - `PUT /users/00000000-0000-4000-8000-00000000d00d | token=admin | body={"school":"x"}`
  - `PUT /users/96f0d1db-c07d-461a-bccb-2a21410c78b6 | token=admin | body={"password":"x"}`
  - `PUT /users/96f0d1db-c07d-461a-bccb-2a21410c78b6 | token=student | body={"role":"ADMIN"}`
  - `PUT /users/96f0d1db-c07d-461a-bccb-2a21410c78b6 | token=admin | body={"role":"STUDENT"}`
- **Success (real):**
  - HTTP 200 (admin update T1 role TUTOR): `{"statusCode":200,"message":"Thành công","data":{"id":"96f0d1db-c07d-461a-bccb-2a21410c78b6","email":"live-D-student-1791631898@example.com","username":"liveD631898","firstName":"Live2","lastName":"Dtest","password":"$2b$10$W05Qi5nlWjwPJAxi14G1EOLJ.z9g//dw6srAYkbydnUJYb9y6O7KK","avatar":null,"phone":"0901234567","isActive":true,"role":"TUTOR","description":null,"userCode":null,"gender":null,"dateOfBirth":null,"address":null,"district":null,"province":null,"subjects":"Math, Physics","facebookId":null,"googleId":null,"school":"THPT Test D","relationship":null,"gradesId":[],"parentId":null,"tutorId":null,"createdAt":"2026-10-10T11:31:47.115Z","updatedAt":"2026-10-10T11:31:48.414Z"},"method":"PUT","path":"/users/96f0d1db-c07d-461a-bccb-2a21410c78b6"}`
  - also HTTP 200 (STUDENT escalates T1 to ADMIN (no role check))
  - also HTTP 200 (admin restores T1 role STUDENT)
- **Errors (real):**
  - HTTP 400, trigger: non-uuid 400; request `PUT /users/not-a-uuid`; body: `{"success":false,"statusCode":400,"message":"ID người dùng phải là UUID","path":"/users/not-a-uuid","serviceName":"user-service"}`
  - HTTP 400, trigger: unknown id 400; request `PUT /users/00000000-0000-4000-8000-00000000d00d`; body: `{"success":false,"statusCode":400,"message":"Không tìm thấy người dùng","path":"/users/00000000-0000-4000-8000-00000000d00d","serviceName":"user-service"}`
  - HTTP 422, trigger: password key 422; request `PUT /users/96f0d1db-c07d-461a-bccb-2a21410c78b6`; body: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"","message":"Unrecognized key: \"password\"","code":"unrecognized_keys"}],"path":"/users/96f0d1db-c07d-461a-bccb-2a21410c78b6"}`
- **Downstream:** RMQ `user.updateUserByAdmin` `{id, ...dto}` → USER_SERVICE. Caller role is not sent.
- **Verdict:** BUG (no role check): a STUDENT changed another user's role to ADMIN (200; role persisted as ADMIN). Non-UUID 400 and unknown id 400 are correct (unknown id is 400, not 404, as the doc says); unknown key 422 is correct.
- **Notes:** Messages: `ID người dùng phải là UUID`, `Không tìm thấy người dùng`.

#### 132. PUT /users/:id/status
- **Source:** `features/user/user.controller.ts:176` (`updateStatusUserController`)
- **Auth:** JWT + Redis session (no role check)
- **Request (spec):** path `id` (no UUID pipe on the gateway; downstream validates); no body
- **Request (sent):**
  - `PUT /users/96f0d1db-c07d-461a-bccb-2a21410c78b6/status | token=admin | body=none`
  - `PUT /users/not-a-uuid/status | token=admin | body=none`
  - `PUT /users/00000000-0000-4000-8000-00000000d00d/status | token=admin | body=none`
  - `PUT /users/96f0d1db-c07d-461a-bccb-2a21410c78b6/status | token=none | body=none`
  - `PUT /users/1e7e9ca2-1242-45c3-a328-f2d3e4ab2e34/status | token=student | body=none`
- **Success (real):**
  - HTTP 200 (toggle T1 status): `{"statusCode":200,"message":"Thành công","data":{"id":"96f0d1db-c07d-461a-bccb-2a21410c78b6","email":"live-D-student-1791631898@example.com","username":"liveD631898","firstName":"Live2","lastName":"Dtest","password":"$2b$10$W05Qi5nlWjwPJAxi14G1EOLJ.z9g//dw6srAYkbydnUJYb9y6O7KK","avatar":null,"phone":"0901234567","isActive":false,"role":"STUDENT","description":null,"userCode":null,"gender":null,"dateOfBirth":null,"address":null,"district":null,"province":null,"subjects":"Math, Physics","facebookId":null,"googleId":null,"school":"THPT Test D","relationship":null,"gradesId":[],"parentId":null,"tutorId":null,"createdAt":"2026-10-10T11:31:47.115Z","updatedAt":"2026-10-10T11:31:49.058Z"},"method":"PUT","path":"/users/96f0d1db-c07d-461a-bccb-2a21410c78b6/status"}`
  - also HTTP 200 (toggle T1 status back)
  - also HTTP 200 (STUDENT toggles another user status (no role check))
- **Errors (real):**
  - HTTP 400, trigger: non-uuid 400; request `PUT /users/not-a-uuid/status`; body: `{"success":false,"statusCode":400,"message":"ID người dùng phải là UUID","path":"/users/not-a-uuid/status","serviceName":"user-service"}`
  - HTTP 400, trigger: unknown id 400; request `PUT /users/00000000-0000-4000-8000-00000000d00d/status`; body: `{"success":false,"statusCode":400,"message":"Không tìm thấy người dùng","path":"/users/00000000-0000-4000-8000-00000000d00d/status","serviceName":"user-service"}`
  - HTTP 401, trigger: no token 401; request `PUT /users/96f0d1db-c07d-461a-bccb-2a21410c78b6/status`; body: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/users/96f0d1db-c07d-461a-bccb-2a21410c78b6/status"}`
- **Downstream:** RMQ `user.updateStatusUser` `{id}` → USER_SERVICE. Toggle: each call flips `isActive`; it is not idempotent.
- **Verdict:** BUG (no role check): a STUDENT toggled another user's `isActive` (200). Non-UUID 400 and unknown id 400 are correct.
- **Notes:** Each call flips the flag; not idempotent, as the doc says.

#### 133. DELETE /users/:id
- **Source:** `features/user/user.controller.ts:191` (`deleteUserByAdminController`)
- **Auth:** JWT + Redis session (no role check)
- **Request (spec):** path `id` (no UUID pipe on the gateway; downstream validates)
- **Request (sent):**
  - `DELETE /users/not-a-uuid | token=admin | body=none`
  - `DELETE /users/00000000-0000-4000-8000-00000000d00d | token=admin | body=none`
  - `DELETE /users/4551c3c3-ad51-4721-a864-b67f14aa5ce4 | token=student | body=none`
  - `DELETE /users/a4d6a887-720f-4f75-afae-6194615c21fb | token=admin | body=none`
  - `DELETE /users/1e7e9ca2-1242-45c3-a328-f2d3e4ab2e34 | token=admin | body=none`
  - `DELETE /users/96f0d1db-c07d-461a-bccb-2a21410c78b6 | token=admin | body=none`
- **Success (real):**
  - HTTP 200 (STUDENT deletes another user (no role check)): `{"statusCode":200,"message":"Thành công","data":{"id":"4551c3c3-ad51-4721-a864-b67f14aa5ce4"},"method":"DELETE","path":"/users/4551c3c3-ad51-4721-a864-b67f14aa5ce4"}`
  - also HTTP 200 (admin deletes T2)
  - also HTTP 200 (admin deletes T4)
  - also HTTP 200 (admin deletes T1)
- **Errors (real):**
  - HTTP 400, trigger: non-uuid 400; request `DELETE /users/not-a-uuid`; body: `{"success":false,"statusCode":400,"message":"ID người dùng phải là UUID","path":"/users/not-a-uuid","serviceName":"user-service"}`
  - HTTP 400, trigger: unknown id 400; request `DELETE /users/00000000-0000-4000-8000-00000000d00d`; body: `{"success":false,"statusCode":400,"message":"Không tìm thấy người dùng","path":"/users/00000000-0000-4000-8000-00000000d00d","serviceName":"user-service"}`
  - HTTP 400, trigger: delete T1 again; request `DELETE /users/96f0d1db-c07d-461a-bccb-2a21410c78b6`; body: `{"success":false,"statusCode":400,"message":"Không tìm thấy người dùng","path":"/users/96f0d1db-c07d-461a-bccb-2a21410c78b6","serviceName":"user-service"}`
- **Downstream:** RMQ `user.deleteUserByAdmin` `{id}` → USER_SERVICE
- **Verdict:** BUG (no role check): a STUDENT hard-deleted another user's account (200). Non-UUID 400 and unknown id 400 are correct.

#### 134. POST /users/change-password
- **Source:** `features/user/user.controller.ts:206` (`changePasswordController`)
- **Auth:** JWT + Redis session (self only)
- **Request (spec):** body `ChangePasswordValues` (`changePasswordSchema`): `currentPassword` string min 1 required; `newPassword` string 8–14 required, must have lowercase, uppercase, digit and special char (complexity applied only when length is 8–14)
- **Request (sent):**
  - `POST /users/change-password | token=test-user T1 (self token) | body={"currentPassword":"Wrong#9999","newPassword":"Newpass#26"}`
  - `POST /users/change-password | token=test-user T1 (self token) | body={"currentPassword":"Test#1234","newPassword":"abc"}`
  - `POST /users/change-password | token=none | body={"currentPassword":"Test#1234","newPassword":"Newpass#26"}`
  - `POST /users/change-password | token=test-user T1 (self token) | body={"currentPassword":"Test#1234","newPassword":"Newpass#26"}`
- **Success (real):**
  - HTTP 200 (success): `{"statusCode":200,"message":"Thành công","data":{"message":"Password changed successfully"},"method":"POST","path":"/users/change-password"}`
- **Errors (real):**
  - HTTP 401, trigger: wrong current 401; request `POST /users/change-password`; body: `{"success":false,"statusCode":401,"message":"Mật khẩu hiện tại không đúng","path":"/users/change-password","serviceName":"user-service"}`
  - HTTP 422, trigger: weak new 422; request `POST /users/change-password`; body: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"newPassword","message":"Password must be at least 8 characters","code":"too_small"}],"path":"/users/change-password"}`
  - HTTP 401, trigger: no token 401; request `POST /users/change-password`; body: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/users/change-password"}`
- **Downstream:** RMQ `user.changePassword` `{userId: caller.id, currentPassword, newPassword}` → USER_SERVICE
- **Verdict:** OK. 200 `Password changed successfully`; wrong current password 401 `Mật khẩu hiện tại không đúng`; weak new password 422 `Password must be at least 8 characters`; 401 without a token. Login with the new password works.

## 3. Unclear / not verified

- **Downstream reply shapes and DB tables:** the gateway forwards every RPC reply unchanged. Reply shapes and the tables each handler touches live in the user, tutor and third services and were not read. The gateway itself has no DB access. `src/database/schema.ts` is not imported by any gateway code.
- **Downstream authorization:** role and ownership checks on the RPC side are not verified for routes with no `RolesGuard` (see Key observations 2 and 3). Ownership is also not checked for notification `:id` routes, `PUT /students/:id`, or `PUT /classes/:id` beyond the caller `userId` passed along.
- **Downstream error statuses:** the E-RPC rows describe the propagation mechanism only. Specific 404/409/400 cases are not enumerated because the responders are outside this module.
- **Role defaults on admin create:** `POST /admin/tutors` and `POST /admin/students` do not send `role`. Whether the user service defaults it to STUDENT (the gateway's `createUserSchema` default, which is not applied on this route) is not verified.
- **Role filters on list routes:** `GET /admin/tutors`, `GET /admin/students` and `GET /students` send no role filter to `user.getUsers`. Whether the result is limited to the matching role is not verified.
- **`GET /students/get-student-code`:** named as a code generator but it calls `user.getUserByField` with `{}`. It may be mis-wired; not verified.
- **`user.getUserByField` payload:** admin and student routes send `{id}`, while `GET /users/get-by-field` sends `{field, value}`. The accepted contract is not verified.
- **`PUT /students/:id`:** the URL id is sent in the `userId` slot of `user.updateUser`, which elsewhere means the caller. The downstream meaning is not verified.
- **`PUT /users` role escalation:** the body may contain `role`, and the caller's role is forwarded with it. Whether the user service rejects a self-assigned ADMIN is not verified.
- **`GET /users/detail-user`:** `getUserDetailQuerySchema` (`include`, `transactionLimit`) exists but is not applied to this route.
- **`GET /kafka/*`:** these look like health or debug routes. `/kafka/send` writes through user-service with a fixed payload; whether it creates a row on each call is not verified. `/kafka/tutor/error` sends `kafka.user`, not a tutor pattern.
- **Email:** whether `GET /emails` actually sends mail, and whether `POST /auth/forgot-password` sends mail via THIRD_SERVICE, was not verified.
- **`POST /auth/reset-password`:** requires a Bearer token even though the reset token (`jti`) is in the body. The intended flow is unclear.
- **Passport failure responses:** the shape and status of OAuth failures (`/auth/google*`, `/auth/facebook*`) were not verified, nor the strategy validation in `src/packages/strategy/*`.
- **Success message localization:** the default "SUCCESS" translations in `src/data/i18n` were not inspected. The "Login successful" message on `POST /auth/register` is copied from login.
- **`POST /users` `dateOfBirth`:** typed as `z.date()`, so a JSON string is rejected by the gateway. Whether this is intended was not verified.
- **Multer limits:** no file-size or file-type limit was found in the gateway. Downstream limits were not checked.
- **`GET /logs`:** the query object is sent directly as the RPC payload (not wrapped), and the expected downstream shape was not verified.
- **Reference docs:** `gateway/API_ENDPOINTS.md` and `gateway/PAGES_API_REVIEW.md` were not compared with this inventory. Source was used as the source of truth.
- **Swagger document:** the generated OpenAPI document was not compared with the route metadata. `/api-docs` is registered outside the controllers, so it is not covered by the global guards.
