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
