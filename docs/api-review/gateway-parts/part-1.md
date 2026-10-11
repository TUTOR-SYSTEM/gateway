## App (no controller prefix) and framework routes

> Examples assume `Accept-Language: en`; with no header the gateway answers in `vi`. Codes such as `USER_NOT_FOUND` are localized by `HttpExceptionFilter`, but raw strings such as `Unauthorized ...` and `data from user failed ...` are returned as written. `RmqProducer.send` retries every downstream error, including 4xx, twice (100 ms then 200 ms backoff, 10 s per attempt), so a downstream 400 reaches the client only after 3 deliveries. The `/kafka/*` and `/health/*` routes are unauthenticated debug endpoints; routes 6 and 7 leak data (see their notes).

#### 1. GET /
- **Source:** `app.controller.ts:23` (`getHello`)
- **Auth:** JWT + Redis session (not `@Public`)
- **Request:** none
- **Success:** 200; data `"Hello World!"` (local, no RPC)
  ```json
  {"statusCode":200,"message":"Success","data":"Hello World!","timestamp":"2026-10-10T03:12:45.120Z","method":"GET","path":"/","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d"}
  ```
- **Errors:** E-AUTH
  - 401, no `Authorization: Bearer` header or token fails verification:
    ```json
    {"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","timestamp":"2026-10-10T03:12:45.120Z"}
    ```
  - 401, token valid but the Redis session `session:{userId}` is missing (logged out or expired):
    ```json
    {"success":false,"statusCode":401,"message":"Session expired or not found ...","path":"/","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","timestamp":"2026-10-10T03:12:45.120Z"}
    ```
- **Downstream:** none (the JWT guard itself sends `redis.get` to THIRD_SERVICE for uncached sessions)

#### 2. GET /kafka/emit
- **Source:** `app.controller.ts:38` (`pingMsgFromKafkaController`)
- **Auth:** Public
- **Request:** none
- **Success:** 200; data empty (fire-and-forget emit, `defaultValue: undefined`; the `data` key is omitted from the envelope) (inferred from the emit wrapper)
  ```json
  {"statusCode":200,"message":"Success","timestamp":"2026-10-10T03:12:45.120Z","method":"GET","path":"/kafka/emit","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d"}
  ```
- **Errors:** E-500 only (emit has no retry or timeout)
  - 500, RabbitMQ publish fails (broker down or bad credentials). The raw broker error text is returned as `message` (inferred, not reproduced):
    ```json
    {"success":false,"statusCode":500,"message":"<raw broker error text>","path":"/kafka/emit","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","timestamp":"2026-10-10T03:12:45.120Z"}
    ```
- **Downstream:** RMQ emit `kafka.ping` → USER_SERVICE (`user_queue`), payload `123`; USER handler `kafka.ping` is a `@MessagePattern` that only logs and returns nothing

#### 3. GET /kafka/send
- **Source:** `app.controller.ts:72` (`sendMsgFromKafkaController`)
- **Auth:** Public
- **Request:** none; sends a fixed test payload `{"email":"test.kafka@example.com","firstName":"Kafka","lastName":"Test","username":"kafka_test_user","role":"STUDENT","timestamp":"<now ISO>"}`
- **Success:** 200; data = RMQ reply spread plus `requestId`, `duration`. The USER handler (`user/src/app.controller.ts` `kafka.send`) returns `{statusCode,message,data}`; the gateway forwards only `data`. Real fields, not inferred. The side effect is not verified.
  ```json
  {"statusCode":200,"message":"Success","data":{"userId":"generated-uuid-1791000000000","email":"test.kafka@example.com","fullName":"Kafka Test","username":"kafka_test_user","role":"STUDENT","processedAt":"2026-10-10T03:12:45.200Z","receivedAt":"2026-10-10T03:12:45.120Z","requestId":"1791000000000-x7k2p","duration":84},"timestamp":"2026-10-10T03:12:45.290Z","method":"GET","path":"/kafka/send","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d"}
  ```
- **Errors:** E-RPC (10 s per attempt, 2 retries); E-500 `RabbitMQ send failed after …`
  - 504, no reply within 10 s on all 3 attempts (about 30 s total). `Timeout has occurred` is the rxjs default text (not verified live):
    ```json
    {"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/kafka/send","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","timestamp":"2026-10-10T03:12:45.120Z"}
    ```
  - 500, broker connection failure. `RmqProducer` stringifies a non-RPC connection object into `message`, which can include the broker URL (inferred from the producer's source comment, not reproduced). The `RabbitMQ send failed after …` branch is effectively unreachable, because `send` always throws an `HttpException`, which carries `status`.
- **Downstream:** RMQ send `kafka.send` → USER_SERVICE. Public endpoint that triggers a user-service call with a fixed payload; the side effect is not verified.

#### 4. GET /kafka/error
- **Source:** `app.controller.ts:136` (`testMsgError`)
- **Auth:** Public
- **Request:** none
- **Success:** not reachable; the USER handler `kafka.user.error` always throws, so the client never gets 200.
- **Errors:** E-RPC
  - 400, USER handler always throws `BadRequestException('data from user failed ...')` (after 3 deliveries):
    ```json
    {"success":false,"statusCode":400,"message":"data from user failed ...","path":"/kafka/error","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","serviceName":"user-service","timestamp":"2026-10-10T03:12:45.120Z"}
    ```
- **Downstream:** RMQ send `kafka.user.error` → USER_SERVICE, payload `123`

#### 5. GET /kafka/tutor/error
- **Source:** `app.controller.ts:152` (`testError`)
- **Auth:** Public
- **Request:** none
- **Success:** not reachable; the chain always ends in an error (see Errors).
- **Errors:** E-RPC
  - 400, USER relays TUTOR's `kafka.tutor` handler error (`data from tutor failed ...`, thrown by `tutor-service/src/app.controller.ts`). `serviceName` is preserved as `tutor-service`:
    ```json
    {"success":false,"statusCode":400,"message":"data from tutor failed ...","path":"/kafka/tutor/error","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","serviceName":"tutor-service","timestamp":"2026-10-10T03:12:45.120Z"}
    ```
  - Retries nest: USER retries to TUTOR 3 times, and the gateway retries to USER 3 times, so up to 9 deliveries.
- **Downstream:** RMQ send `kafka.user` → USER_SERVICE (despite the "tutor" in the path), payload `123`; USER then sends `kafka.tutor` → TUTOR_SERVICE (`tutor_queue`)

#### 6. GET /health/postgres
- **Source:** `app.controller.ts:184` (`checkPostgresConnection`)
- **Auth:** Public
- **Request:** none
- **Success:** 200; data `{connection:"postgres", status:"connected", timestamp, databaseStats: <RPC reply>}`. The USER handler `health.postgres` (`USER/src/app.controller.ts`) returns a plain object built from `db.query.users.findMany()`; `sampleUsers` is included because the gateway sends `fetchData: true`. Columns come from the handler's mapper, not a raw row.
  ```json
  {"statusCode":200,"message":"Success","data":{"connection":"postgres","status":"connected","timestamp":"2026-10-10T03:14:02.000Z","databaseStats":{"status":"healthy","database":"PostgreSQL","connection":"connected","timestamp":"2026-10-10T03:14:02.000Z","message":"Database connection is healthy","stats":{"totalUsers":42,"byRole":{"admin":1,"tutor":12,"student":25,"parent":4}},"sampleUsers":[{"id":"9b2c4e7a-1f3d-4b8e-9a6c-5d2e7f8a1b3c","email":"tutor.anna@example.com","username":"anna_tutor","firstName":"Anna","lastName":"Tran","role":"TUTOR","isActive":true,"createdAt":"2026-08-01T09:00:00.000Z"}]}},"timestamp":"2026-10-10T03:14:02.000Z","method":"GET","path":"/health/postgres","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d"}
  ```
- **Errors:** E-RPC (rethrown unchanged)
  - 200, not an HTTP error: the USER handler catches DB failures and returns `status:"unhealthy"`, and the gateway does not inspect it. The gateway still reports `connection:"postgres", status:"connected"` (both hard-coded). Clients must read `databaseStats.status`.
  - 504, USER does not reply within 30 s total: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/health/postgres","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","timestamp":"2026-10-10T03:14:02.000Z"}`
  - Note: this public endpoint returns up to 5 users' email, name and role without authentication.
- **Downstream:** RMQ send `health.postgres` `{fetchData:true}` → USER_SERVICE

#### 7. GET /health/redis
- **Source:** `app.controller.ts:232` (`checkRedisConnection`)
- **Auth:** Public
- **Request:** none
- **Success:** 200; data `{connection:"redis", status:"connected", timestamp, cacheStats: <RPC reply>}`. The THIRD handler `health.redis` (`THIRD_SERVICE/src/app.controller.ts`) returns `ping`, `stats` and, because `fetchData` is true, `sampleKeys` with the values of up to 10 keys.
  ```json
  {"statusCode":200,"message":"Success","data":{"connection":"redis","status":"connected","timestamp":"2026-10-10T03:15:10.000Z","cacheStats":{"status":"healthy","cache":"Redis","connection":"connected","timestamp":"2026-10-10T03:15:10.000Z","message":"Redis connection is healthy","ping":"PONG","stats":{"totalKeys":137,"info":"# Memory, used_memory:1048576, used_memory_human:1.00M, used_memory_rss:3145728, ..."},"sampleKeys":{"session:9b2c4e7a-1f3d-4b8e-9a6c-5d2e7f8a1b3c":"eyJhbGciOi...(refresh JWT)","reset-password:550e8400-e29b-41d4-a716-446655440000":"9b2c4e7a-1f3d-4b8e-9a6c-5d2e7f8a1b3c"}}},"timestamp":"2026-10-10T03:15:10.000Z","method":"GET","path":"/health/redis","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d"}
  ```
- **Errors:** E-RPC (rethrown unchanged)
  - 200, not an HTTP error: when Redis is down the THIRD handler returns `status:"unhealthy"` and the gateway still reports `status:"connected"`.
  - 504, THIRD does not reply within 30 s total: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/health/redis","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","timestamp":"2026-10-10T03:15:10.000Z"}`
  - **Security:** `sampleKeys` returns raw values without authentication. Login writes `session:{userId}` with the refresh token as the value (`USER auth.service.ts`), and reset writes `reset-password:{jti}`. Anyone who calls this endpoint can read live refresh tokens. Remove `fetchData` from the gateway call, or gate the route.
- **Downstream:** RMQ send `health.redis` `{fetchData:true}` → THIRD_SERVICE (`third_queue`)

## Auth (`/auth`)

#### 8. POST /auth/register
- **Source:** `features/auth/auth.controller.ts:75` (`register`)
- **Auth:** Public
- **Request:** body `RegisterDto` (`registerSchema`, not strict): `email` string email required; `username` string optional; `password` string 6–25 chars, must contain lowercase, uppercase, digit and special char; `firstName` string 1–25 required; `lastName` string 1–25 required
  ```json
  {"email":"anna.tutor@example.com","username":"anna_tutor","password":"Password123!","firstName":"Anna","lastName":"Tran"}
  ```
  `username` may be omitted; USER then generates one. The USER handler always creates the account with role `TUTOR` (`auth.service.ts` `registerService`), whatever the client sends.
- **Success:** 200 (`HttpCode OK`); custom message "Login successful" (copy-paste from login); data `{user:{id,email,username,firstName,lastName}}`
  ```json
  {"statusCode":200,"message":"Login successful","data":{"user":{"id":"9b2c4e7a-1f3d-4b8e-9a6c-5d2e7f8a1b3c","email":"anna.tutor@example.com","username":"anna_tutor","firstName":"Anna","lastName":"Tran"}},"timestamp":"2026-10-10T03:16:00.000Z","method":"POST","path":"/auth/register","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d"}
  ```
- **Errors:** E-ZOD; E-RPC (e.g. duplicate email, status not verified in gateway)
  - 422, validation (`password` lacks an uppercase letter, `firstName` empty; one error per field):
    ```json
    {"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"password","message":"Password must include at least one uppercase letter (A-Z)","code":"custom"},{"field":"firstName","message":"First name is required","code":"too_small"}],"path":"/auth/register","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","timestamp":"2026-10-10T03:16:00.000Z"}
    ```
  - 400, email already registered (`EMAIL_EXISTS`):
    ```json
    {"success":false,"statusCode":400,"message":"Email already exists","path":"/auth/register","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","serviceName":"user-service","timestamp":"2026-10-10T03:16:00.000Z"}
    ```
  - 400, username already taken (`USERNAME_EXISTS`): same envelope with `"message":"Username already exists"`.
  - Retry hazard: if the first attempt creates the user but its reply times out, the gateway retries and the client receives the 400 `Email already exists` for an account that was in fact created.
- **Downstream:** RMQ `auth.register` → USER_SERVICE

#### 9. POST /auth/login
- **Source:** `features/auth/auth.controller.ts:121` (`login`)
- **Auth:** Public
- **Request:** body `LoginDto` (`loginSchema`): `email` email required; `password` string with the same 6–25 char and complexity rules as register (applied on login too)
  ```json
  {"email":"tutor.anna@example.com","password":"Password123!"}
  ```
- **Success:** 200; message "Login successful"; data `LoginResponseDto` `{accessToken, refreshToken, user:{id,email,userCode|null,username}}` (USER `auth.service.ts` `loginService`, verified)
  ```json
  {"statusCode":200,"message":"Login successful","data":{"accessToken":"eyJhbGciOiJIUzI1NiIs...(access JWT)","refreshToken":"eyJhbGciOiJIUzI1NiIs...(refresh JWT)","user":{"id":"9b2c4e7a-1f3d-4b8e-9a6c-5d2e7f8a1b3c","email":"tutor.anna@example.com","userCode":"K7P2QX","username":"anna_tutor"}},"timestamp":"2026-10-10T03:16:30.000Z","method":"POST","path":"/auth/login","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d"}
  ```
- **Errors:** E-ZOD; 401 invalid credentials (Swagger only; propagation from USER_SERVICE not verified)
  - Correction: the USER handler throws `BadRequestException`, so the status is **400**, not 401. Swagger documents 401 but the code never returns it.
  - 422, validation:
    ```json
    {"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"email","message":"Invalid email address","code":"invalid_format"},{"field":"password","message":"Password must be at least 6 characters long","code":"too_small"}],"path":"/auth/login","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","timestamp":"2026-10-10T03:16:30.000Z"}
    ```
  - 400, no user with that email (`USER_NOT_FOUND`):
    ```json
    {"success":false,"statusCode":400,"message":"User not found","path":"/auth/login","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","serviceName":"user-service","timestamp":"2026-10-10T03:16:30.000Z"}
    ```
  - 400, wrong password (`INVALID_PASSWORD`): same envelope with `"message":"Invalid password"`.
- **Downstream:** RMQ `auth.login` → USER_SERVICE

#### 10. POST /auth/login/user-code
- **Source:** `features/auth/auth.controller.ts:168` (`loginByUserCode`)
- **Auth:** Public
- **Request:** body `LoginByUserCodeDto` (`loginByUserCodeSchema`): `userCode` string exactly 6 chars required; `password` same rules as login; `role` enum `PARENT` | `STUDENT` required (`TUTOR` is rejected by the schema)
  ```json
  {"userCode":"R3M9QD","password":"Password123!","role":"STUDENT"}
  ```
- **Success:** 200; message "Login successful"; data `LoginResponseDto`
  ```json
  {"statusCode":200,"message":"Login successful","data":{"accessToken":"eyJhbGciOiJIUzI1NiIs...(access JWT)","refreshToken":"eyJhbGciOiJIUzI1NiIs...(refresh JWT)","user":{"id":"4d1e8f20-7c3a-4e9b-b2d5-8a6f1c0e9b77","email":"student.bao@example.com","userCode":"R3M9QD","username":"bao_student"}},"timestamp":"2026-10-10T03:17:00.000Z","method":"POST","path":"/auth/login/user-code","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d"}
  ```
- **Errors:** E-ZOD; 401 invalid credentials (Swagger only)
  - Correction: the code path returns **400**. `USER_NOT_FOUND` is thrown when no row matches both `userCode` and `role`, and `INVALID_PASSWORD` for a wrong password.
  - 422, validation (short code, role outside the enum; the enum message is the Zod v4 default text):
    ```json
    {"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"userCode","message":"User code must be 6 characters","code":"too_small"},{"field":"role","message":"Invalid option: expected one of \"PARENT\"|\"STUDENT\"","code":"invalid_value"}],"path":"/auth/login/user-code","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","timestamp":"2026-10-10T03:17:00.000Z"}
    ```
  - 400, no user with that code and role (`USER_NOT_FOUND`): `{"success":false,"statusCode":400,"message":"User not found","path":"/auth/login/user-code","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","serviceName":"user-service","timestamp":"2026-10-10T03:17:00.000Z"}`
  - Note: `userCode` is generated only for TUTOR accounts at creation (`user.service.ts` `createUserService`). A STUDENT or PARENT can log in this way only if a code was set some other way (not verified).
- **Downstream:** RMQ `auth.loginByUserCode` → USER_SERVICE

#### 11. POST /auth/refresh
- **Source:** `features/auth/auth.controller.ts:194` (`refresh`)
- **Auth:** Public
- **Request:** body `{refreshToken: string min 1 required}`
  ```json
  {"refreshToken":"eyJhbGciOiJIUzI1NiIs...(refresh JWT)"}
  ```
- **Success:** 200; message "Token refreshed"; data `LoginResponseDto`
  ```json
  {"statusCode":200,"message":"Token refreshed","data":{"accessToken":"eyJhbGciOiJIUzI1NiIs...(new access JWT)","refreshToken":"eyJhbGciOiJIUzI1NiIs...(new refresh JWT)","user":{"id":"9b2c4e7a-1f3d-4b8e-9a6c-5d2e7f8a1b3c","email":"tutor.anna@example.com","userCode":"K7P2QX","username":"anna_tutor"}},"timestamp":"2026-10-10T03:18:00.000Z","method":"POST","path":"/auth/refresh","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d"}
  ```
- **Errors:** E-ZOD; 401 invalid or expired refresh token (Swagger only)
  - 422, empty `refreshToken`:
    ```json
    {"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"refreshToken","message":"Refresh token is required","code":"too_small"}],"path":"/auth/refresh","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","timestamp":"2026-10-10T03:18:00.000Z"}
    ```
  - 401, signature or expiry fails (`INVALID_OR_EXPIRED_REFRESH_TOKEN`):
    ```json
    {"success":false,"statusCode":401,"message":"Invalid or expired refresh token","path":"/auth/refresh","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","serviceName":"user-service","timestamp":"2026-10-10T03:18:00.000Z"}
    ```
  - 401, token is valid but the user was deleted (`USER_NO_LONGER_EXISTS`): same envelope with `"message":"User no longer exists"`.
- **Downstream:** RMQ `auth.refresh` → USER_SERVICE

#### 12. POST /auth/forgot-password
- **Source:** `features/auth/auth.controller.ts:216` (`forgotPassword`)
- **Auth:** Public
- **Request:** body `{email: email required}`
  ```json
  {"email":"tutor.anna@example.com"}
  ```
- **Success:** 200; message "Forgot password successful"; data `{ok:true}`
  ```json
  {"statusCode":200,"message":"Forgot password successful","data":{"ok":true},"timestamp":"2026-10-10T03:18:30.000Z","method":"POST","path":"/auth/forgot-password","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d"}
  ```
- **Errors:** E-ZOD; E-RPC
  - 422, invalid email: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"email","message":"Invalid email address","code":"invalid_format"}],"path":"/auth/forgot-password","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","timestamp":"2026-10-10T03:18:30.000Z"}`
  - 400, unknown email (`USER_NOT_FOUND`). This reveals whether an account exists:
    ```json
    {"success":false,"statusCode":400,"message":"User not found","path":"/auth/forgot-password","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","serviceName":"user-service","timestamp":"2026-10-10T03:18:30.000Z"}
    ```
  - 500, email send fails in THIRD (`email.service.ts` rethrows the Resend error). The raw message is returned (inferred, not reproduced). Each gateway retry creates a new reset token and sends another email, so the user can receive up to 3 mails.
- **Downstream:** RMQ `auth.forgotPassword` → USER_SERVICE, which then sends `redis.set` (`reset-password:{jti}`, TTL 300 s) and `email.sendForgotPasswordMail` to THIRD_SERVICE

#### 13. POST /auth/reset-password
- **Source:** `features/auth/auth.controller.ts:254` (`resetPassword`)
- **Auth:** JWT + Redis session (Bearer required, although the handler is not `@Public`)
- **Request:** body `ResetPasswordDto` (`resetPasswordSchema`): `jti` uuid string required; `password` same complexity rules; `newPassword` accepted as an alias for `password`; `confirmPassword` string 6–25 required, must equal `password` (422 on mismatch)
  ```json
  {"jti":"550e8400-e29b-41d4-a716-446655440000","password":"NewPass123!","confirmPassword":"NewPass123!"}
  ```
- **Success:** 200; message "Reset password successful"; data `{ok:true}` (the reset token is deleted from Redis afterwards)
  ```json
  {"statusCode":200,"message":"Reset password successful","data":{"ok":true},"timestamp":"2026-10-10T03:19:00.000Z","method":"POST","path":"/auth/reset-password","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d"}
  ```
- **Errors:** E-AUTH; E-ZOD (incl. invalid `jti`, mismatch); E-RPC
  - 401, no Bearer token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/auth/reset-password","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","timestamp":"2026-10-10T03:19:00.000Z"}`
  - 422, `confirmPassword` differs from `password`:
    ```json
    {"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"confirmPassword","message":"Confirm password must be the same as password","code":"custom"}],"path":"/auth/reset-password","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","timestamp":"2026-10-10T03:19:00.000Z"}
    ```
    A `jti` that is not a UUID gives field `jti`, message `Invalid reset password token`.
  - 400, token missing or expired in Redis (`INVALID_RESET_PASSWORD_TOKEN`; TTL 300 s, or already used):
    ```json
    {"success":false,"statusCode":400,"message":"Invalid reset password token","path":"/auth/reset-password","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","serviceName":"user-service","timestamp":"2026-10-10T03:19:00.000Z"}
    ```
- **Downstream:** RMQ `auth.resetPassword` → USER_SERVICE, which calls `redis.get` on THIRD_SERVICE, then updates the password

#### 14. GET /auth/google
- **Source:** `features/auth/auth.controller.ts:269` (`googleAuth`)
- **Auth:** Public
- **Request:** none; Passport `AuthGuard('google')` redirects
- **Success:** 302 redirect to Google consent (no body, no envelope)
  ```
  HTTP/1.1 302 Found
  Location: https://accounts.google.com/o/oauth2/v2/auth?...
  ```
- **Errors:** Passport failures (shape not verified)
- **Downstream:** Passport Google strategy (`packages/strategy/google.strategy.ts`); no RMQ call

#### 15. GET /auth/google/callback
- **Source:** `features/auth/auth.controller.ts:284` (`googleAuthCallback`)
- **Auth:** Public (Passport `AuthGuard('google')` validates the OAuth code)
- **Request:** query params from Google (handled by Passport); `req.user` is `GoogleProfile`
- **Success:** 302 to `GOOGLE_OAUTH_REDIRECT_URL` (default `http://localhost:3000/oauth/callback`) with `?accessToken=&refreshToken=` in the query string. Tokens in a URL end up in browser history and logs.
  ```
  HTTP/1.1 302 Found
  Location: http://localhost:3000/oauth/callback?accessToken=eyJhbGciOiJIUzI1NiIs...&refreshToken=eyJhbGciOiJIUzI1NiIs...
  ```
- **Errors:** Passport failures (shape not verified); E-RPC returns a JSON error, not a redirect
  - 504, USER does not reply in time (no redirect happens):
    ```json
    {"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/auth/google/callback","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","timestamp":"2026-10-10T03:19:30.000Z"}
    ```
  - 400, the new STUDENT row cannot be read back (`FAILED_TO_CREATE_USER`): same envelope with `"message":"Failed to create user"` and `"serviceName":"user-service"`.
- **Downstream:** RMQ `auth.googleLogin` → USER_SERVICE (passes the profile)

#### 16. GET /auth/facebook
- **Source:** `features/auth/auth.controller.ts:312` (`facebookAuth`)
- **Auth:** Public
- **Request:** none; Passport `AuthGuard('facebook')` redirects
- **Success:** 302 redirect to Facebook consent (no body, no envelope)
  ```
  HTTP/1.1 302 Found
  Location: https://www.facebook.com/v<version>/dialog/oauth?...
  ```
- **Errors:** Passport failures (shape not verified)
- **Downstream:** Passport Facebook strategy (`packages/strategy/facebook.strategy.ts`); no RMQ call

#### 17. GET /auth/facebook/callback
- **Source:** `features/auth/auth.controller.ts:328` (`facebookAuthCallback`)
- **Auth:** Public (Passport `AuthGuard('facebook')`)
- **Request:** Facebook OAuth query params (Passport); `req.user` is `FacebookProfile`
- **Success:** 302 to `GOOGLE_OAUTH_REDIRECT_URL` (same env var as Google, no Facebook-specific one) with `?accessToken=&refreshToken=`
  ```
  HTTP/1.1 302 Found
  Location: http://localhost:3000/oauth/callback?accessToken=eyJhbGciOiJIUzI1NiIs...&refreshToken=eyJhbGciOiJIUzI1NiIs...
  ```
- **Errors:** Passport failures (shape not verified); E-RPC returns JSON
  - 504, USER does not reply in time: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/auth/facebook/callback","correlationId":"6f1d2c3a-8b4e-4f5a-9c7d-2e1b0a9f8e7d","timestamp":"2026-10-10T03:20:00.000Z"}`
  - 400, same `FAILED_TO_CREATE_USER` case as route 15, with `path` `/auth/facebook/callback`.
- **Downstream:** RMQ `auth.facebookLogin` → USER_SERVICE
