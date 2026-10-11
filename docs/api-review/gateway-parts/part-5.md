## Dashboard, email, logs, redis, reports

#### 96. GET /dashboard/overview
- **Source:** `features/dashboard/dashboard.controller.ts:30` (`overview`)
- **Auth:** JWT + Redis session
- **Request:** none
- **Success:** 200; data = TUTOR_SERVICE reply (`DashboardOverview`, returned as a literal by `DashboardService.getOverview`, verified)
- **Errors:** E-AUTH; E-RPC (404 `User not found` when the token's user is missing downstream; 400 `User Id must be uuid` for a non-UUID `userId`)
- **Downstream:** RMQ `dashboard.overview` `{userId}` → TUTOR_SERVICE (`dashboard.rpc.controller.ts`, `DashboardService.getOverview`)
- **Request example:** none
- **Success response example** (role TUTOR; `monthly` abbreviated to 2 of 12 entries; schedule row fields inferred from `TodayScheduleRow` DTO type):
```json
{"statusCode":200,"message":"SUCCESS","data":{"role":"TUTOR","stats":{"classesCount":4,"studentsCount":38,"sessionsThisWeek":9,"sessionsCompletedThisWeek":5,"sessionsTodayCompleted":1,"sessionsTodayPending":2,"revenueThisMonth":12500000,"overdueTuitionCount":3,"unpaidTuitionAmount":4200000},"todaySchedule":[{"id":"9b1d6c3e-2f4a-4e8b-a1d7-5c0e9f2b7a10","startAt":"2026-10-10T08:00:00.000Z","endAt":"2026-10-10T09:30:00.000Z","title":"Algebra review","className":"Toan 9A","subject":"Math","format":"ONLINE","location":null}],"upcomingSchedule":[],"monthly":[{"month":1,"revenue":0,"sessions":0,"newStudents":0,"newClasses":0,"cumulativeRevenue":0},{"month":2,"revenue":3000000,"sessions":12,"newStudents":2,"newClasses":1,"cumulativeRevenue":3000000}]},"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/dashboard/overview","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 401 token missing/invalid: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/dashboard/overview","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f","timestamp":"2026-10-10T08:30:00.000Z"}`
  - 404 user row missing (downstream `NotFoundException`): same envelope, `"statusCode":404,"message":"User not found"`
  - 504 RMQ attempt timeout (10 s x 3): same envelope, `"statusCode":504,"message":"Timeout has occurred"` (inferred from rxjs `TimeoutError` text)

#### 97. GET /emails
- **Source:** `features/email/email.controller.ts:21` (`testSendEmail`)
- **Auth:** Public (no token needed)
- **Request:** none
- **Success:** 200; data = THIRD_SERVICE reply (the Resend SDK `data` object from `EmailService.sendMail`)
- **Errors:** E-RPC (Resend failures are rethrown as `Error(error.message)` and surface as 500)
- **Downstream:** RMQ `email.test` `{}` → THIRD_SERVICE. Anyone on the internet can trigger a real send: `EmailService.testSendEmailService` mails a hardcoded recipient from source (see Unclear).
- **Request example:** none
- **Success response example** (Resend response shape from the SDK, not in this repo; inferred):
```json
{"statusCode":200,"message":"SUCCESS","data":{"id":"49a3999c-0ce1-4ea6-afb4-2d5a1b7c9e30"},"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/emails","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 500 Resend rejects the request (for example invalid API key); message is Resend's error text, not fixed in source: `{"success":false,"statusCode":500,"message":"<Resend error message>","path":"/emails","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f","timestamp":"2026-10-10T08:30:00.000Z"}`
  - 504 RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/emails",...}`

#### 98. GET /logs
- **Source:** `features/log/log.controller.ts:39` (`findAll`)
- **Auth:** JWT + ADMIN (class-level `RolesGuard` + `@Roles('ADMIN')`, E-ROLE)
- **Request:** query `GetRequestLogsQueryDto` (`getRequestLogsQuerySchema`): `page` default 1; `limit` 1–100 default 20; `serviceName` optional; `type` HTTP|RPC optional; `correlationId` optional; `search` trimmed optional
- **Success:** 200; data = THIRD_SERVICE reply `{data: request_log rows, pagination: {total, page, limit, totalPages}}` (verified in `LogRepository.findAll`); rows are raw `request_logs` columns, ordered `createdAt DESC`
- **Errors:** E-AUTH; E-ROLE; E-ZOD; E-RPC
- **Downstream:** RMQ `log.query` (query object sent as the payload) → THIRD_SERVICE
- **Request example:** `GET /logs?page=1&limit=20&serviceName=gateway&type=HTTP&search=/users`
- **Success response example:**
```json
{"statusCode":200,"message":"SUCCESS","data":{"data":[{"id":"0e7c1a9b-3d2f-4b6e-8c5a-7f1e2d3c4b5a","serviceName":"gateway","type":"HTTP","method":"GET","path":"/users","statusCode":200,"durationMs":42,"correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f","traceId":"a1b2c3d4-0000-4000-8000-000000000001","parentTraceId":null,"userId":"3f2b8c1e-6a0d-4c1e-9f2a-7b5d8e9c0a12","ip":"127.0.0.1","requestBody":null,"responseBody":"{\"statusCode\":200,...}","requestHeaders":"{\"x-correlation-id\":\"5f0c...\"}","responseHeaders":"{}","host":"gateway-1","errorMessage":null,"createdAt":"2026-10-10T08:29:58.000Z"}],"pagination":{"total":1,"page":1,"limit":20,"totalPages":1}},"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/logs","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 422 `limit=500`: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"limit","message":"Too big: expected number to be <=100","code":"too_big"}],"path":"/logs?limit=500","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f","timestamp":"2026-10-10T08:30:00.000Z"}`
  - 403 non-admin: `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/logs","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f","timestamp":"2026-10-10T08:30:00.000Z"}`
  - 504 RMQ timeout: `"statusCode":504,"message":"Timeout has occurred"`

#### 99. GET /logs/trace/:correlationId
- **Source:** `features/log/log.controller.ts:54` (`trace`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request:** path `correlationId` (string, no validation)
- **Success:** 200; data = THIRD_SERVICE reply: array of `request_logs` rows for that correlationId, ordered `createdAt ASC`, empty array when unknown (verified in `LogRepository.findByCorrelationId`)
- **Errors:** E-AUTH; E-ROLE; E-RPC
- **Downstream:** RMQ `log.trace` `{correlationId}` → THIRD_SERVICE
- **Request example:** `GET /logs/trace/5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f`
- **Success response example** (one hop shown; full row columns as in #98):
```json
{"statusCode":200,"message":"SUCCESS","data":[{"id":"0e7c1a9b-3d2f-4b6e-8c5a-7f1e2d3c4b5a","serviceName":"gateway","type":"HTTP","method":"POST","path":"/users","statusCode":200,"durationMs":310,"correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f","traceId":"a1b2c3d4-0000-4000-8000-000000000001","parentTraceId":null,"userId":"3f2b8c1e-6a0d-4c1e-9f2a-7b5d8e9c0a12","ip":"127.0.0.1","requestBody":null,"responseBody":null,"requestHeaders":null,"responseHeaders":null,"host":"gateway-1","errorMessage":null,"createdAt":"2026-10-10T08:29:58.000Z"}],"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/logs/trace/5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 401: `"statusCode":401,"message":"Unauthorized ..."` (envelope as in #96)
  - 403: `"statusCode":403,"message":"You do not have permission to access this resource"`
  - 504: `"statusCode":504,"message":"Timeout has occurred"`

#### 100. GET /logs/stats
- **Source:** `features/log/log.controller.ts:65` (`stats`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request:** none
- **Success:** 200; data = THIRD_SERVICE reply: array of `{method, path, calls24h, errorCount24h, p95Ms}` (verified in `LogRepository.statsByEndpoint`; gateway HTTP root hops in the last 24 h)
- **Errors:** E-AUTH; E-ROLE; E-RPC
- **Downstream:** RMQ `log.stats` `{}` → THIRD_SERVICE
- **Request example:** none
- **Success response example:**
```json
{"statusCode":200,"message":"SUCCESS","data":[{"method":"GET","path":"/users","calls24h":412,"errorCount24h":3,"p95Ms":118},{"method":"POST","path":"/auth/login","calls24h":57,"errorCount24h":9,"p95Ms":240}],"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/logs/stats","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 401: `"statusCode":401,"message":"Unauthorized ..."`
  - 403: `"statusCode":403,"message":"You do not have permission to access this resource"`
  - 504: `"statusCode":504,"message":"Timeout has occurred"`

#### 101. GET /redis
- **Source:** `features/redis/redis.controller.ts:29` (`get`)
- **Auth:** JWT + Redis session (no role check; any authenticated user)
- **Request:** query `key` string min 1 required (`getRedisQuerySchema`)
- **Success:** 200; data = THIRD_SERVICE reply: the raw string stored at `key`, or `null` when the key does not exist (verified in `RedisService.get`)
- **Errors:** E-AUTH; E-ZOD (missing `key`); E-RPC (500 `WRONGTYPE ...` for a hash/list/set key)
- **Downstream:** RMQ `redis.get` `{key}` → THIRD_SERVICE. Any arbitrary key can be read, including the `session:<userId>` keys the JWT guard relies on (see Unclear).
- **Request example:** `GET /redis?key=session:3f2b8c1e-6a0d-4c1e-9f2a-7b5d8e9c0a12`
- **Success response example** (value format not verified; a missing key returns `"data":null`):
```json
{"statusCode":200,"message":"SUCCESS","data":"1","timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/redis","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 422 missing key: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"key","message":"Invalid input: expected string, received undefined","code":"invalid_type"}],"path":"/redis","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f","timestamp":"2026-10-10T08:30:00.000Z"}`
  - 500 key holds a non-string type (`redis.get` throws, not an HTTP error): `"statusCode":500,"message":"WRONGTYPE Operation against a key holding the wrong kind of value"`
  - 504 RMQ timeout: `"statusCode":504,"message":"Timeout has occurred"`

#### 102. GET /reports/learning/summary
- **Source:** `features/report/report.controller.ts:38` (`getSummary`)
- **Auth:** JWT + ADMIN (class-level `RolesGuard` + `@Roles('ADMIN')`, E-ROLE)
- **Request:** none
- **Success:** 200; data = TUTOR_SERVICE reply `{activeClasses, avgAttendanceRate, avgCurriculumProgress, submissionRate}` (verified in `ReportService.getSummary`; rates are integer percents)
- **Errors:** E-AUTH; E-ROLE; E-RPC
- **Downstream:** RMQ `report.summary` `{}` → TUTOR_SERVICE
- **Request example:** none
- **Success response example:**
```json
{"statusCode":200,"message":"SUCCESS","data":{"activeClasses":12,"avgAttendanceRate":87,"avgCurriculumProgress":64,"submissionRate":73},"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/reports/learning/summary","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 401: `"statusCode":401,"message":"Unauthorized ..."`
  - 403: `"statusCode":403,"message":"You do not have permission to access this resource"`
  - 504: `"statusCode":504,"message":"Timeout has occurred"`

#### 103. GET /reports/learning/attendance-trend
- **Source:** `features/report/report.controller.ts:49` (`getAttendanceTrend`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request:** none
- **Success:** 200; data = TUTOR_SERVICE reply: array of 6 `{month: "MM/YYYY", rate}` points, oldest first (verified in `ReportService.getAttendanceTrend`)
- **Errors:** E-AUTH; E-ROLE; E-RPC
- **Downstream:** RMQ `report.attendanceTrend` `{}` → TUTOR_SERVICE
- **Request example:** none
- **Success response example:**
```json
{"statusCode":200,"message":"SUCCESS","data":[{"month":"05/2026","rate":84},{"month":"06/2026","rate":86},{"month":"07/2026","rate":88},{"month":"08/2026","rate":85},{"month":"09/2026","rate":90},{"month":"10/2026","rate":0}],"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/reports/learning/attendance-trend","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 401: `"statusCode":401,"message":"Unauthorized ..."`
  - 403: `"statusCode":403,"message":"You do not have permission to access this resource"`
  - 504: `"statusCode":504,"message":"Timeout has occurred"`

#### 104. GET /reports/learning/classes
- **Source:** `features/report/report.controller.ts:63` (`getClasses`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request:** query `GetLearningClassReportsQueryDto`: `page` default 1; `limit` 1–100 default 10; `search` trimmed optional
- **Success:** 200; data = TUTOR_SERVICE reply `{data: [...], pagination: {total, page, limit, totalPages}}` (verified in `ReportService.getClassReports`; the page's `data` items use `classId, className, tutorName, studentCount, attendanceRate, curriculumProgress, assignmentsSubmitted, assignmentsTotal, averageScore`)
- **Errors:** E-AUTH; E-ROLE; E-ZOD; E-RPC
- **Downstream:** RMQ `report.classList` `{query}` → TUTOR_SERVICE
- **Request example:** `GET /reports/learning/classes?page=1&limit=10&search=Toan`
- **Success response example:**
```json
{"statusCode":200,"message":"SUCCESS","data":{"data":[{"classId":"c1f0a9d2-4e7b-4a3c-8d6e-2b9f0a1c3d54","className":"Toan 9A","tutorName":"Tran Thi B","studentCount":24,"attendanceRate":88,"curriculumProgress":57,"assignmentsSubmitted":41,"assignmentsTotal":60,"averageScore":7.4}],"pagination":{"total":1,"page":1,"limit":10,"totalPages":1}},"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/reports/learning/classes","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 422 `limit=0`: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"limit","message":"Too small: expected number to be >=1","code":"too_small"}],"path":"/reports/learning/classes?limit=0",...}`
  - 401: `"statusCode":401,"message":"Unauthorized ..."`
  - 403: `"statusCode":403,"message":"You do not have permission to access this resource"`
  - 504: `"statusCode":504,"message":"Timeout has occurred"`

## Test scenarios (`/test-scenarios`, class-level `RolesGuard` + `@Roles('ADMIN')`)

#### 105. GET /test-scenarios/routes
- **Source:** `features/test-scenario/test-scenario.controller.ts:73` (`routes`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request:** none
- **Success:** 200; data = route catalog built from Nest metadata (`listHttpRoutes`), sorted by path then method; no RPC
- **Errors:** E-AUTH; E-ROLE
- **Downstream:** none (local discovery)
- **Request example:** none
- **Success response example** (fields from `RouteInfo`; the `argumentsOf` schema fields are omitted):
```json
{"statusCode":200,"message":"SUCCESS","data":[{"method":"GET","path":"/users","summary":"Get users","tag":"User","params":[],"uuidParams":[],"isPublic":false,"roles":null,"multipart":false,"oauth":false},{"method":"PUT","path":"/users/:id","summary":null,"tag":"User","params":["id"],"uuidParams":[],"isPublic":false,"roles":null,"multipart":false,"oauth":false}],"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/test-scenarios/routes","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 401: `"statusCode":401,"message":"Unauthorized ..."`
  - 403: `"statusCode":403,"message":"You do not have permission to access this resource"`

#### 106. POST /test-scenarios/generate
- **Source:** `features/test-scenario/test-scenario.controller.ts:85` (`generate`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request:** body `GenerateTestScenariosBodyDto` (`generateTestScenariosSchema`): `routes` array (≤500) of `{method, path}` optional (default: every route except `/test-scenarios*`); `categories` array of valid|auth|validation|not_found|domain, min 1, optional
- **Success:** 200; data = THIRD_SERVICE reply `{scenarios: [...], fixtures: [...]}`; nothing is saved. Each scenario is the create shape of #114 plus `exists`; each fixture is `{key, suggestion, exists}` (verified in `TestScenarioService.generate`; scenario field list inferred from `generateForRoute`)
- **Errors:** E-AUTH; E-ROLE; E-ZOD; E-RPC
- **Downstream:** RMQ `testscenario.generate` `{routes, listRoutes, categories}` → THIRD_SERVICE
- **Request example:**
```json
{"routes":[{"method":"POST","path":"/users"},{"method":"GET","path":"/logs"}],"categories":["valid","auth","validation"]}
```
- **Success response example** (scenario fields beyond the ones shown are inferred from the generator; one scenario and one fixture shown):
```json
{"statusCode":200,"message":"SUCCESS","data":{"scenarios":[{"service":"gateway","method":"GET","path":"/logs","name":"GET /logs rejects non-admin","category":"auth","expectedStatus":403,"authProfile":"student","requestTemplate":{},"description":"Sinh tự động từ GET /logs","exists":false}],"fixtures":[{"key":"adminAccessToken","suggestion":{"method":"GET","path":"/users/detail-user","authProfile":"admin","extract":"data.id"},"exists":false}]},"timestamp":"2026-10-10T08:30:00.000Z","method":"POST","path":"/test-scenarios/generate","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 422 bad category: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"categories.0","message":"Invalid option: expected one of \"valid\"|\"auth\"|\"validation\"|\"not_found\"|\"domain\"","code":"invalid_value"}],"path":"/test-scenarios/generate",...}`
  - 401: `"statusCode":401,"message":"Unauthorized ..."`
  - 403: `"statusCode":403,"message":"You do not have permission to access this resource"`
  - 504: `"statusCode":504,"message":"Timeout has occurred"`

#### 107. POST /test-scenarios/bulk
- **Source:** `features/test-scenario/test-scenario.controller.ts:110` (`bulkCreate`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request:** body `BulkCreateTestScenariosDto`: `scenarios` array 1–500 of the create-scenario shape in #114
- **Success:** 201; data = THIRD_SERVICE reply `{created, skipped}`; duplicates (same method + path + name) are skipped (verified in `TestScenarioService.createMany`)
- **Errors:** E-AUTH; E-ROLE; E-ZOD; E-RPC
- **Downstream:** RMQ `testscenario.createMany` `dto` (`{scenarios}`) → THIRD_SERVICE
- **Request example:**
```json
{"scenarios":[{"service":"tutor-service","method":"GET","path":"/classes","name":"list classes as admin","expectedStatus":200,"category":"valid","authProfile":"admin"},{"service":"tutor-service","method":"GET","path":"/classes","name":"list classes without token","expectedStatus":401,"category":"auth","authProfile":"none"}]}
```
- **Success response example:**
```json
{"statusCode":201,"message":"SUCCESS","data":{"created":2,"skipped":0},"timestamp":"2026-10-10T08:30:00.000Z","method":"POST","path":"/test-scenarios/bulk","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 422 empty list: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"scenarios","message":"Too small: expected array to have >=1 items","code":"too_small"}],"path":"/test-scenarios/bulk",...}`
  - 401 / 403: as #106
  - 504: `"statusCode":504,"message":"Timeout has occurred"`

#### 108. GET /test-scenarios/auth-profiles
- **Source:** `features/test-scenario/test-scenario.controller.ts:125` (`authProfiles`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request:** none
- **Success:** 200; data = THIRD_SERVICE reply: array of `{profile, configured, email}` (verified in `TestAuthService.statuses`; `email` is the configured test account, `null` when unset; the profile list is inferred from the env-backed `ACCOUNT_PROFILES`)
- **Errors:** E-AUTH; E-ROLE; E-RPC
- **Downstream:** RMQ `testscenario.authprofiles` `{}` → THIRD_SERVICE
- **Request example:** none
- **Success response example:**
```json
{"statusCode":200,"message":"SUCCESS","data":[{"profile":"admin","configured":true,"email":"qa-admin@example.com"},{"profile":"student","configured":false,"email":null}],"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/test-scenarios/auth-profiles","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 401: `"statusCode":401,"message":"Unauthorized ..."`
  - 403: `"statusCode":403,"message":"You do not have permission to access this resource"`
  - 504: `"statusCode":504,"message":"Timeout has occurred"`

#### 109. GET /test-scenarios/fixtures
- **Source:** `features/test-scenario/test-scenario.controller.ts:133` (`listFixtures`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request:** none
- **Success:** 200; data = THIRD_SERVICE reply: array of `test_fixtures` rows (`TestFixtureService.findAll` → `repo.findAll`); columns below
- **Errors:** E-AUTH; E-ROLE; E-RPC
- **Downstream:** RMQ `testscenario.fixtures.list` `{}` → THIRD_SERVICE
- **Request example:** none
- **Success response example** (columns from `testFixtures` schema):
```json
{"statusCode":200,"message":"SUCCESS","data":[{"id":"8d3e0a1b-6f2c-4b7e-9a51-2c4d6e8f0a13","key":"adminClassId","description":"First class id from admin list","value":"c1f0a9d2-4e7b-4a3c-8d6e-2b9f0a1c3d54","resolver":{"method":"GET","path":"/classes","authProfile":"admin","extract":"data.0.id"},"resolvedAt":"2026-10-10T08:29:00.000Z","createdAt":"2026-10-09T10:00:00.000Z","updatedAt":"2026-10-10T08:29:00.000Z"}],"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/test-scenarios/fixtures","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 401: `"statusCode":401,"message":"Unauthorized ..."`
  - 403: `"statusCode":403,"message":"You do not have permission to access this resource"`
  - 504: `"statusCode":504,"message":"Timeout has occurred"`

#### 110. POST /test-scenarios/fixtures
- **Source:** `features/test-scenario/test-scenario.controller.ts:146` (`createFixture`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request:** body `CreateTestFixtureDto` (`createTestFixtureSchema`): `key` regex `^[A-Za-z][A-Za-z0-9_]{0,99}$` required; `description` ≤500 optional; `value` string ≤2000 optional nullable; `resolver` optional nullable `{method: "GET" (default), path (starts with a single "/"), authProfile (default admin), extract (1–200 chars)}`. Refinement: `value` or `resolver` must be present (422 otherwise).
- **Success:** 201; data = THIRD_SERVICE reply: the created `test_fixtures` row
- **Errors:** E-AUTH; E-ROLE; E-ZOD; E-RPC (409 when the key already exists)
- **Downstream:** RMQ `testscenario.fixtures.create` `dto` → THIRD_SERVICE (`TestFixtureService.create`)
- **Request example:**
```json
{"key":"adminClassId","description":"First class id from admin list","resolver":{"method":"GET","path":"/classes","authProfile":"admin","extract":"data.0.id"}}
```
- **Success response example:**
```json
{"statusCode":201,"message":"SUCCESS","data":{"id":"8d3e0a1b-6f2c-4b7e-9a51-2c4d6e8f0a13","key":"adminClassId","description":"First class id from admin list","value":null,"resolver":{"method":"GET","path":"/classes","authProfile":"admin","extract":"data.0.id"},"resolvedAt":null,"createdAt":"2026-10-10T08:30:00.000Z","updatedAt":"2026-10-10T08:30:00.000Z"},"timestamp":"2026-10-10T08:30:00.000Z","method":"POST","path":"/test-scenarios/fixtures","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 409 duplicate key: `{"success":false,"statusCode":409,"message":"Test fixture key already exists","path":"/test-scenarios/fixtures","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f","timestamp":"2026-10-10T08:30:00.000Z"}`
  - 422 bad key: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"key","message":"Invalid string: must match pattern /^[A-Za-z][A-Za-z0-9_]{0,99}$/","code":"invalid_format"}],"path":"/test-scenarios/fixtures",...}`
  - 422 neither `value` nor `resolver` (refinement; exact message not verified in source)
  - 401 / 403: as #109
  - 504: `"statusCode":504,"message":"Timeout has occurred"`

#### 111. PATCH /test-scenarios/fixtures/:id
- **Source:** `features/test-scenario/test-scenario.controller.ts:158` (`updateFixture`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request:** path `id` uuid (`ParseUUIDPipe`, 400 if not a UUID); body `UpdateTestFixtureDto` (`updateTestFixtureSchema`, the fixture fields all optional)
- **Success:** 200; data = THIRD_SERVICE reply: the updated fixture row. Changing `resolver` without `value` clears the cached `value` and `resolvedAt` (verified in `TestFixtureService.update`)
- **Errors:** E-AUTH; E-ROLE; E-400 (bad UUID); E-ZOD; E-RPC (404 unknown id, 409 key taken)
- **Downstream:** RMQ `testscenario.fixtures.update` `{id, dto}` → THIRD_SERVICE
- **Request example:**
```json
{"value":"8d3e0a1b-6f2c-4b7e-9a51-2c4d6e8f0a14","description":"Pinned class id for smoke tests"}
```
- **Success response example:**
```json
{"statusCode":200,"message":"SUCCESS","data":{"id":"8d3e0a1b-6f2c-4b7e-9a51-2c4d6e8f0a13","key":"adminClassId","description":"Pinned class id for smoke tests","value":"8d3e0a1b-6f2c-4b7e-9a51-2c4d6e8f0a14","resolver":{"method":"GET","path":"/classes","authProfile":"admin","extract":"data.0.id"},"resolvedAt":"2026-10-10T08:29:00.000Z","createdAt":"2026-10-09T10:00:00.000Z","updatedAt":"2026-10-10T08:31:00.000Z"},"timestamp":"2026-10-10T08:31:00.000Z","method":"PATCH","path":"/test-scenarios/fixtures/8d3e0a1b-6f2c-4b7e-9a51-2c4d6e8f0a13","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 400 bad UUID (ParseUUIDPipe default text): `{"success":false,"statusCode":400,"message":"Validation failed (uuid is expected)","path":"/test-scenarios/fixtures/not-a-uuid",...}`
  - 404 unknown id: `"statusCode":404,"message":"Test fixture not found"`
  - 409 key taken: `"statusCode":409,"message":"Test fixture key already exists"`
  - 401 / 403: as #109; 504: `"statusCode":504,"message":"Timeout has occurred"`

#### 112. DELETE /test-scenarios/fixtures/:id
- **Source:** `features/test-scenario/test-scenario.controller.ts:171` (`deleteFixture`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request:** path `id` uuid (`ParseUUIDPipe`)
- **Success:** 200; data = THIRD_SERVICE reply: the deleted fixture row (`repo.delete` returns the row)
- **Errors:** E-AUTH; E-ROLE; E-400; E-RPC (404 unknown id)
- **Downstream:** RMQ `testscenario.fixtures.delete` `{id}` → THIRD_SERVICE
- **Request example:** none (path only: `DELETE /test-scenarios/fixtures/8d3e0a1b-6f2c-4b7e-9a51-2c4d6e8f0a13`)
- **Success response example:**
```json
{"statusCode":200,"message":"SUCCESS","data":{"id":"8d3e0a1b-6f2c-4b7e-9a51-2c4d6e8f0a13","key":"adminClassId","description":"First class id from admin list","value":"c1f0a9d2-4e7b-4a3c-8d6e-2b9f0a1c3d54","resolver":{"method":"GET","path":"/classes","authProfile":"admin","extract":"data.0.id"},"resolvedAt":"2026-10-10T08:29:00.000Z","createdAt":"2026-10-09T10:00:00.000Z","updatedAt":"2026-10-10T08:29:00.000Z"},"timestamp":"2026-10-10T08:31:30.000Z","method":"DELETE","path":"/test-scenarios/fixtures/8d3e0a1b-6f2c-4b7e-9a51-2c4d6e8f0a13","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 404: `"statusCode":404,"message":"Test fixture not found"`
  - 400 bad UUID: `"statusCode":400,"message":"Validation failed (uuid is expected)"`
  - 401 / 403 / 504: as #111

#### 113. POST /test-scenarios/fixtures/:id/resolve
- **Source:** `features/test-scenario/test-scenario.controller.ts:184` (`resolveFixture`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request:** path `id` uuid (`ParseUUIDPipe`); optional `Authorization` header, forwarded as `accessToken` with the `Bearer ` prefix stripped
- **Success:** 200; data = THIRD_SERVICE reply: the fixture row. A fixed fixture (no resolver) is returned as is; a resolver fixture is re-fetched and its `value` and `resolvedAt` are updated (`TestFixtureService.resolve`)
- **Errors:** E-AUTH; E-ROLE; E-400; E-RPC
- **Downstream:** RMQ `testscenario.fixtures.resolve` `{id, accessToken}` → THIRD_SERVICE
- **Request example:** none (`POST /test-scenarios/fixtures/8d3e0a1b-6f2c-4b7e-9a51-2c4d6e8f0a13/resolve`, optional `Authorization: Bearer <token>`)
- **Success response example:**
```json
{"statusCode":200,"message":"SUCCESS","data":{"id":"8d3e0a1b-6f2c-4b7e-9a51-2c4d6e8f0a13","key":"adminClassId","description":"First class id from admin list","value":"c1f0a9d2-4e7b-4a3c-8d6e-2b9f0a1c3d54","resolver":{"method":"GET","path":"/classes","authProfile":"admin","extract":"data.0.id"},"resolvedAt":"2026-10-10T08:32:00.000Z","createdAt":"2026-10-09T10:00:00.000Z","updatedAt":"2026-10-10T08:32:00.000Z"},"timestamp":"2026-10-10T08:32:00.000Z","method":"POST","path":"/test-scenarios/fixtures/8d3e0a1b-6f2c-4b7e-9a51-2c4d6e8f0a13/resolve","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 400 resolver call failed (`BadRequestException`): `{"success":false,"statusCode":400,"message":"Could not resolve the test fixture: Fixture \"adminClassId\": GET /classes returned 403","path":"/test-scenarios/fixtures/8d3e0a1b-6f2c-4b7e-9a51-2c4d6e8f0a13/resolve",...}`
  - 404 unknown id: `"statusCode":404,"message":"Test fixture not found"`
  - 400 bad UUID: `"statusCode":400,"message":"Validation failed (uuid is expected)"`
  - 401 / 403 / 504: as #111

#### 114. POST /test-scenarios
- **Source:** `features/test-scenario/test-scenario.controller.ts:196` (`create`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request:** body `CreateTestScenarioDto` (`createTestScenarioSchema`): `service` string 1–50 required; `method` GET|POST|PUT|PATCH|DELETE required; `path` string starting with a single "/" required; `name` 1–200 required; `description` optional; `requestTemplate` `{headers?: record<string,string>, body?: any}` default {}; `expectedStatus` int 100–599 required; `category` valid|auth|validation|not_found|domain default valid; `authProfile` caller|admin|tutor|student|parent|none default caller
- **Success:** 201; data = THIRD_SERVICE reply: the created `test_scenarios` row (no duplicate check on this route; `bulk` does check)
- **Errors:** E-AUTH; E-ROLE; E-ZOD; E-RPC
- **Downstream:** RMQ `testscenario.create` `dto` → THIRD_SERVICE
- **Request example:**
```json
{"service":"tutor-service","method":"GET","path":"/classes","name":"list classes as admin","description":"Admin can read the class list","requestTemplate":{"headers":{"authorization":"Bearer {{accessToken}}"}},"expectedStatus":200,"category":"valid","authProfile":"admin"}
```
- **Success response example:**
```json
{"statusCode":201,"message":"SUCCESS","data":{"id":"e4a7c2d9-1b3f-4d6a-8e0c-9f2b5a7d1c63","service":"tutor-service","method":"GET","path":"/classes","name":"list classes as admin","description":"Admin can read the class list","requestTemplate":{"headers":{"authorization":"Bearer {{accessToken}}"}},"expectedStatus":200,"category":"valid","authProfile":"admin","createdAt":"2026-10-10T08:33:00.000Z","updatedAt":"2026-10-10T08:33:00.000Z"},"timestamp":"2026-10-10T08:33:00.000Z","method":"POST","path":"/test-scenarios","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 422 bad method: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"method","message":"Invalid option: expected one of \"GET\"|\"POST\"|\"PUT\"|\"PATCH\"|\"DELETE\"","code":"invalid_value"}],"path":"/test-scenarios",...}`
  - 401 / 403 / 504: as #110

#### 115. GET /test-scenarios
- **Source:** `features/test-scenario/test-scenario.controller.ts:215` (`list`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request:** query `service`, `method`, `path` (strings) and `category` (enum) all optional
- **Success:** 200; data = THIRD_SERVICE reply: array of scenario rows, each with `lastRun` (`{correlationId, actualStatus, passed, durationMs, runAt}` or `null`) and `flow` (request_logs hops of the last run; hop field list partly inferred), ordered by path, method, createdAt (verified in `TestScenarioRepository.findAll`)
- **Errors:** E-AUTH; E-ROLE; E-ZOD; E-RPC
- **Downstream:** RMQ `testscenario.list` `query` → THIRD_SERVICE
- **Request example:** `GET /test-scenarios?service=tutor-service&method=GET&category=valid`
- **Success response example:**
```json
{"statusCode":200,"message":"SUCCESS","data":[{"id":"e4a7c2d9-1b3f-4d6a-8e0c-9f2b5a7d1c63","service":"tutor-service","method":"GET","path":"/classes","name":"list classes as admin","description":"Admin can read the class list","requestTemplate":{"headers":{"authorization":"Bearer {{accessToken}}"}},"expectedStatus":200,"category":"valid","authProfile":"admin","createdAt":"2026-10-10T08:33:00.000Z","updatedAt":"2026-10-10T08:33:00.000Z","lastRun":{"correlationId":"7c9e1f2a-3b4d-4e5f-8a6b-9c0d1e2f3a4b","actualStatus":200,"passed":true,"durationMs":64,"runAt":"2026-10-10T08:34:00.000Z"},"flow":[{"serviceName":"gateway","type":"HTTP","statusCode":200,"durationMs":64}]}],"timestamp":"2026-10-10T08:35:00.000Z","method":"GET","path":"/test-scenarios","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 422 bad category: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"category","message":"Invalid option: expected one of \"valid\"|\"auth\"|\"validation\"|\"not_found\"|\"domain\"","code":"invalid_value"}],"path":"/test-scenarios?category=bogus",...}`
  - 401 / 403 / 504: as #110

#### 116. GET /test-scenarios/meta
- **Source:** `features/test-scenario/test-scenario.controller.ts:229` (`meta`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request:** none
- **Success:** 200; data `{environment}` from `APP_ENV`, else `NODE_ENV`, else `"development"` (gateway env read, no RPC)
- **Errors:** E-AUTH; E-ROLE
- **Downstream:** none (env read)
- **Request example:** none
- **Success response example:**
```json
{"statusCode":200,"message":"SUCCESS","data":{"environment":"development"},"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/test-scenarios/meta","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 401: `"statusCode":401,"message":"Unauthorized ..."`
  - 403: `"statusCode":403,"message":"You do not have permission to access this resource"`

#### 117. GET /test-scenarios/stats
- **Source:** `features/test-scenario/test-scenario.controller.ts:242` (`stats`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request:** none
- **Success:** 200; data = THIRD_SERVICE reply: array of `{method, path, casesTotal, casesPassed}` per endpoint; a scenario counts as passed only if its latest run passed (verified in `statsByEndpoint`)
- **Errors:** E-AUTH; E-ROLE; E-RPC
- **Downstream:** RMQ `testscenario.stats` `{}` → THIRD_SERVICE
- **Request example:** none
- **Success response example:**
```json
{"statusCode":200,"message":"SUCCESS","data":[{"method":"GET","path":"/classes","casesTotal":3,"casesPassed":2},{"method":"POST","path":"/auth/login","casesTotal":4,"casesPassed":4}],"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/test-scenarios/stats","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 401: `"statusCode":401,"message":"Unauthorized ..."`
  - 403: `"statusCode":403,"message":"You do not have permission to access this resource"`
  - 504: `"statusCode":504,"message":"Timeout has occurred"`

#### 118. GET /test-scenarios/:id/runs
- **Source:** `features/test-scenario/test-scenario.controller.ts:255` (`runs`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request:** path `id` uuid (`ParseUUIDPipe`); query `limit` int (default 20, `ParseIntPipe`, non-integer is 400)
- **Success:** 200; data = THIRD_SERVICE reply: array of `test_runs` rows, newest first, `limit` clamped to 1–100 in the service (verified in `TestScenarioService.findRuns`)
- **Errors:** E-AUTH; E-ROLE; E-400; E-RPC (404 unknown scenario)
- **Downstream:** RMQ `testscenario.runs` `{id, limit}` → THIRD_SERVICE
- **Request example:** `GET /test-scenarios/e4a7c2d9-1b3f-4d6a-8e0c-9f2b5a7d1c63/runs?limit=5`
- **Success response example:**
```json
{"statusCode":200,"message":"SUCCESS","data":[{"id":"b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e","scenarioId":"e4a7c2d9-1b3f-4d6a-8e0c-9f2b5a7d1c63","correlationId":"7c9e1f2a-3b4d-4e5f-8a6b-9c0d1e2f3a4b","actualStatus":200,"expectedStatus":200,"passed":true,"durationMs":64,"errorMessage":null,"responseBody":"[{\"id\":\"c1f0a9d2-4e7b-4a3c-8d6e-2b9f0a1c3d54\"}]","requestPath":"/classes","triggeredBy":"3f2b8c1e-6a0d-4c1e-9f2a-7b5d8e9c0a12","createdAt":"2026-10-10T08:34:00.000Z"}],"timestamp":"2026-10-10T08:35:00.000Z","method":"GET","path":"/test-scenarios/e4a7c2d9-1b3f-4d6a-8e0c-9f2b5a7d1c63/runs","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 404 unknown scenario: `{"success":false,"statusCode":404,"message":"Test scenario not found","path":"/test-scenarios/<uuid>/runs",...}`
  - 400 non-integer limit (`ParseIntPipe` default text): `"statusCode":400,"message":"Validation failed (numeric string is expected)"`
  - 400 bad UUID: `"statusCode":400,"message":"Validation failed (uuid is expected)"`
  - 401 / 403 / 504: as #117

#### 119. PATCH /test-scenarios/:id
- **Source:** `features/test-scenario/test-scenario.controller.ts:267` (`update`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request:** path `id` uuid (`ParseUUIDPipe`); body `UpdateTestScenarioDto` (`updateTestScenarioSchema`, every field of #114 optional, no defaults)
- **Success:** 200; data = THIRD_SERVICE reply: the updated `test_scenarios` row (verified in `TestScenarioService.update`)
- **Errors:** E-AUTH; E-ROLE; E-400; E-ZOD; E-RPC (404 unknown id)
- **Downstream:** RMQ `testscenario.update` `{id, dto}` → THIRD_SERVICE
- **Request example:**
```json
{"expectedStatus":201,"description":"Created response expected after the fixture change"}
```
- **Success response example:**
```json
{"statusCode":200,"message":"SUCCESS","data":{"id":"e4a7c2d9-1b3f-4d6a-8e0c-9f2b5a7d1c63","service":"tutor-service","method":"GET","path":"/classes","name":"list classes as admin","description":"Created response expected after the fixture change","requestTemplate":{"headers":{"authorization":"Bearer {{accessToken}}"}},"expectedStatus":201,"category":"valid","authProfile":"admin","createdAt":"2026-10-10T08:33:00.000Z","updatedAt":"2026-10-10T08:36:00.000Z"},"timestamp":"2026-10-10T08:36:00.000Z","method":"PATCH","path":"/test-scenarios/e4a7c2d9-1b3f-4d6a-8e0c-9f2b5a7d1c63","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 404 unknown id: `"statusCode":404,"message":"Test scenario not found"`
  - 422 expectedStatus 99: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"expectedStatus","message":"Too small: expected number to be >=100","code":"too_small"}],"path":"/test-scenarios/<uuid>",...}`
  - 400 bad UUID: `"statusCode":400,"message":"Validation failed (uuid is expected)"`
  - 401 / 403 / 504: as #117

#### 120. DELETE /test-scenarios/:id
- **Source:** `features/test-scenario/test-scenario.controller.ts:280` (`remove`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request:** path `id` uuid (`ParseUUIDPipe`)
- **Success:** 200; data = THIRD_SERVICE reply: the deleted row; its runs are removed by the FK cascade (verified in `TestScenarioRepository.delete` and the `test_runs` schema)
- **Errors:** E-AUTH; E-ROLE; E-400; E-RPC (404 unknown id)
- **Downstream:** RMQ `testscenario.delete` `{id}` → THIRD_SERVICE
- **Request example:** none (path only)
- **Success response example:**
```json
{"statusCode":200,"message":"SUCCESS","data":{"id":"e4a7c2d9-1b3f-4d6a-8e0c-9f2b5a7d1c63","service":"tutor-service","method":"GET","path":"/classes","name":"list classes as admin","description":"Created response expected after the fixture change","requestTemplate":{"headers":{"authorization":"Bearer {{accessToken}}"}},"expectedStatus":201,"category":"valid","authProfile":"admin","createdAt":"2026-10-10T08:33:00.000Z","updatedAt":"2026-10-10T08:36:00.000Z"},"timestamp":"2026-10-10T08:37:00.000Z","method":"DELETE","path":"/test-scenarios/e4a7c2d9-1b3f-4d6a-8e0c-9f2b5a7d1c63","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 404: `"statusCode":404,"message":"Test scenario not found"`
  - 400 bad UUID: `"statusCode":400,"message":"Validation failed (uuid is expected)"`
  - 401 / 403 / 504: as #117

#### 121. POST /test-scenarios/:id/run
- **Source:** `features/test-scenario/test-scenario.controller.ts:302` (`run`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request:** path `id` uuid (`ParseUUIDPipe`); query `async` (string; `'true'` sets `wait=false`); `Authorization` header forwarded as `accessToken`; the caller's `user.id` is sent as `userId`
- **Success:** 200; data = THIRD_SERVICE reply. Sync (default): the `test_runs` row. `?async=true`: `{correlationId, scenarioId}` immediately, and the run finishes in the background (verified in `TestScenarioService.run`). A transport failure (timeout, connection refused) or a setup failure is recorded as a failed run with `passed:false`, not as an HTTP error.
- **Errors:** E-AUTH; E-ROLE; E-400; E-RPC
- **Downstream:** RMQ `testscenario.run` `{id, userId, accessToken, wait}` → THIRD_SERVICE. Sync runs use the gateway default RMQ timeout (10 s per attempt, 3 attempts) while the service's own fetch timeout is 15 s, so a slow target can produce a 504 and the retry re-executes the run (see Unclear).
- **Request example:** `POST /test-scenarios/e4a7c2d9-1b3f-4d6a-8e0c-9f2b5a7d1c63/run?async=true` (no body)
- **Success response example** (`async=true`; without the query the data is the `test_runs` row, columns as in #118):
```json
{"statusCode":200,"message":"SUCCESS","data":{"correlationId":"7c9e1f2a-3b4d-4e5f-8a6b-9c0d1e2f3a4b","scenarioId":"e4a7c2d9-1b3f-4d6a-8e0c-9f2b5a7d1c63"},"timestamp":"2026-10-10T08:38:00.000Z","method":"POST","path":"/test-scenarios/e4a7c2d9-1b3f-4d6a-8e0c-9f2b5a7d1c63/run","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 404 unknown scenario: `"statusCode":404,"message":"Test scenario not found"`
  - 400 bad UUID: `"statusCode":400,"message":"Validation failed (uuid is expected)"`
  - 401 / 403: as #117
  - 504 sync run slower than 10 s: `"statusCode":504,"message":"Timeout has occurred"`

## Upload (`/upload`)

#### 122. POST /upload
- **Source:** `features/upload/upload.controller.ts:55` (`upload`)
- **Auth:** Public (anonymous)
- **Request:** multipart/form-data, single file in field `file` (Multer, no size or type limit set in the gateway). The gateway sends `{file: {originalname, mimetype, size, buffer: <base64 string>}}`.
- **Success:** 201; data = THIRD_SERVICE reply `UploadResponse` `{url, key, size, mimetype}` (intended shape from `UploadService.upload`; not reachable today, see Errors)
- **Errors:** E-500 `Cannot read properties of undefined (reading 'originalname')` when no file is sent; E-500 `The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Received undefined` on every real upload (contract mismatch, see Unclear); E-RPC; retries (3 attempts) can store duplicate objects on timeout.
- **Downstream:** RMQ `upload.upload` `{file: {originalname, mimetype, size, buffer: base64}}` → THIRD_SERVICE. THIRD's `UploadRpcController.reconstruct` reads `file.buffer.data` (the `{type:'Buffer', data:[...]}` JSON form), so the base64 string yields `Buffer.from(undefined)`.
- **Request example:** multipart form: `file=@./photo.jpg` (image/jpeg, about 2 MB)
- **Success response example** (intended shape; unreachable until the buffer contract is fixed):
```json
{"statusCode":201,"message":"SUCCESS","data":{"url":"https://pub-example.r2.dev/uploads/4d2e9b1a-7c3f-4a8e-b6d0-1f5e2c9a8b70.jpg","key":"uploads/4d2e9b1a-7c3f-4a8e-b6d0-1f5e2c9a8b70.jpg","size":418230,"mimetype":"image/jpeg"},"timestamp":"2026-10-10T08:40:00.000Z","method":"POST","path":"/upload","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 500 no file: `{"success":false,"statusCode":500,"message":"Cannot read properties of undefined (reading 'originalname')","path":"/upload","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f","timestamp":"2026-10-10T08:40:00.000Z"}`
  - 500 real upload (current behaviour): `"statusCode":500,"message":"The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Received undefined"`
  - 504 RMQ timeout (large file): `"statusCode":504,"message":"Timeout has occurred"`

#### 123. POST /upload/multiple
- **Source:** `features/upload/upload.controller.ts:82` (`uploadMultiple`)
- **Auth:** Public (anonymous)
- **Request:** multipart/form-data, up to 10 files in field `files`
- **Success:** 201; data = THIRD_SERVICE reply: array of `UploadResponse` (intended shape from `UploadService.uploadMultiple`; not reachable today, same contract mismatch as #122)
- **Errors:** E-500 `Cannot read properties of undefined (reading 'map')` when no files are sent; E-500 same Buffer message as #122 on every real upload; E-RPC. Multer's own errors (for example more than 10 files) are not mapped by the gateway.
- **Downstream:** RMQ `upload.uploadMultiple` `{files: [{originalname, mimetype, size, buffer: base64}]}` → THIRD_SERVICE
- **Request example:** multipart form: `files=@./a.jpg`, `files=@./b.png`
- **Success response example** (intended shape):
```json
{"statusCode":201,"message":"SUCCESS","data":[{"url":"https://pub-example.r2.dev/uploads/4d2e9b1a-7c3f-4a8e-b6d0-1f5e2c9a8b70.jpg","key":"uploads/4d2e9b1a-7c3f-4a8e-b6d0-1f5e2c9a8b70.jpg","size":418230,"mimetype":"image/jpeg"},{"url":"https://pub-example.r2.dev/uploads/9e8d7c6b-5a4f-4321-8e7d-6c5b4a3f2e10.png","key":"uploads/9e8d7c6b-5a4f-4321-8e7d-6c5b4a3f2e10.png","size":152004,"mimetype":"image/jpeg"}],"timestamp":"2026-10-10T08:40:00.000Z","method":"POST","path":"/upload/multiple","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 500 no files: `"statusCode":500,"message":"Cannot read properties of undefined (reading 'map')"`
  - 500 real upload: `"statusCode":500,"message":"The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Received undefined"`
  - 504: `"statusCode":504,"message":"Timeout has occurred"`

#### 124. GET /upload/download
- **Source:** `features/upload/upload.controller.ts:100` (`download`)
- **Auth:** Public (anonymous)
- **Request:** query `key` (string, no validation)
- **Success:** 200 raw binary (`application/octet-stream`, `Content-Disposition: attachment; filename="<key>"`), not the JSON envelope. Intended body is the file bytes; not reachable today (see Errors).
- **Errors:** E-500 on every call: the gateway reads `result.buffer` (base64), but THIRD returns `{content: Buffer, contentType, contentLength, filename}`, so `Buffer.from(undefined, 'base64')` throws; E-500 for a missing R2 object (S3 `NoSuchKey`, text not verified); E-RPC; `key` is written into the header unescaped
- **Downstream:** RMQ `upload.download` `{key}` → THIRD_SERVICE. Intended reply `{buffer: base64}` per gateway; actual reply `{content, contentType, contentLength, filename}` from `UploadRpcController.download`.
- **Request example:** `GET /upload/download?key=uploads/4d2e9b1a-7c3f-4a8e-b6d0-1f5e2c9a8b70.jpg`
- **Success response example:** binary body, not JSON. Headers: `Content-Type: application/octet-stream`, `Content-Disposition: attachment; filename="uploads/4d2e9b1a-7c3f-4a8e-b6d0-1f5e2c9a8b70.jpg"`. Body: the file bytes (not reachable today).
- **Error examples:**
  - 500 current behaviour (every call): `{"success":false,"statusCode":500,"message":"The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Received undefined","path":"/upload/download?key=uploads/x.jpg","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f","timestamp":"2026-10-10T08:40:00.000Z"}`
  - 500 missing object (inferred from S3 SDK, text not verified in repo): `"statusCode":500,"message":"The specified key does not exist."`
  - 504: `"statusCode":504,"message":"Timeout has occurred"`

#### 125. DELETE /upload/:key
- **Source:** `features/upload/upload.controller.ts:113` (`delete`)
- **Auth:** Public (anonymous; deletes stored files with no login)
- **Request:** path `key` (the R2 object key, for example `uploads/<uuid>.jpg`; a slash must be URL-encoded as `%2F` to match the single `:key` segment)
- **Success:** 200 intended; data = THIRD_SERVICE reply. The handler returns `undefined` (`UploadService.delete` returns `void`), so the RMQ reply is empty. The R2 object is deleted, but the gateway treats the empty reply as a failure (see Errors).
- **Errors:** E-500 `no elements in sequence` (empty RMQ reply, `firstValueFrom` EmptyError; inferred from the empty-reply behaviour documented in THIRD's `redis.set` comment), after 3 attempts although the object was deleted; E-RPC
- **Downstream:** RMQ `upload.delete` `{key}` → THIRD_SERVICE (`UploadRpcController.del` returns the `void` result)
- **Request example:** `DELETE /upload/uploads%2F4d2e9b1a-7c3f-4a8e-b6d0-1f5e2c9a8b70.jpg`
- **Success response example** (intended; the current reply is empty, see Errors):
```json
{"statusCode":200,"message":"SUCCESS","data":null,"timestamp":"2026-10-10T08:41:00.000Z","method":"DELETE","path":"/upload/uploads%2F4d2e9b1a-7c3f-4a8e-b6d0-1f5e2c9a8b70.jpg","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 500 empty reply (current behaviour): `{"success":false,"statusCode":500,"message":"no elements in sequence","path":"/upload/uploads%2F4d2e9b1a-7c3f-4a8e-b6d0-1f5e2c9a8b70.jpg","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f","timestamp":"2026-10-10T08:41:00.000Z"}`
  - 504: `"statusCode":504,"message":"Timeout has occurred"`

## Users (`/users`)

#### 126. GET /users
- **Source:** `features/user/user.controller.ts:68` (`getUsers`)
- **Auth:** JWT + Redis session (no role check; any authenticated user)
- **Request:** query `GetUsersQueryDto` (`getUsersQuerySchema`): `page` default 1; `limit` 1–100 default 10 (`pageSize` accepted as an alias); `search` trimmed optional; `role` ADMIN|TUTOR|PARENT|STUDENT optional; `isActive` `'true'|'false'` optional
- **Success:** 200; data = USER_SERVICE reply `{data: [...], pagination: {page, pageSize, total, totalPages}}` (verified in `UserService.getUsersService`). The `UserListResponseDto` type in the DTO package (`{message, query, meta}`) does not match what the service returns. Items expose `id, email, name, role, status, createdAt` only (no password).
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `user.getUsers` `query` → USER_SERVICE
- **Request example:** `GET /users?page=1&limit=10&search=nguyen&role=TUTOR&isActive=true`
- **Success response example:**
```json
{"statusCode":200,"message":"SUCCESS","data":{"data":[{"id":"3f2b8c1e-6a0d-4c1e-9f2a-7b5d8e9c0a12","email":"nguyen.van.a@example.com","name":"Nguyen Van A","role":"TUTOR","status":"active","createdAt":"2026-09-01T07:12:45.000Z"}],"pagination":{"page":1,"pageSize":10,"total":1,"totalPages":1}},"timestamp":"2026-10-10T08:42:00.000Z","method":"GET","path":"/users","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 401: `"statusCode":401,"message":"Unauthorized ..."`
  - 422 `limit=500`: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"limit","message":"Too big: expected number to be <=100","code":"too_big"}],"path":"/users?limit=500",...}`
  - 504: `"statusCode":504,"message":"Timeout has occurred"`

#### 127. GET /users/detail-user
- **Source:** `features/user/user.controller.ts:85` (`getDetailUserController`)
- **Auth:** JWT + Redis session (current user only)
- **Request:** none. The `getUserDetailQuerySchema` (`include`, `transactionLimit`) exists in the schema file but is not wired to this route.
- **Success:** 200; data = USER_SERVICE reply for the caller: the `users` row without `password` (verified in `getDetailUserService`), or `null` when the user no longer exists
- **Errors:** E-AUTH; E-RPC (400 `User Id must be uuid` if the token subject is not a UUID)
- **Downstream:** RMQ `user.getDetailUser` `{userId}` → USER_SERVICE
- **Request example:** none
- **Success response example** (all `users` columns except `password`):
```json
{"statusCode":200,"message":"SUCCESS","data":{"id":"3f2b8c1e-6a0d-4c1e-9f2a-7b5d8e9c0a12","email":"nguyen.van.a@example.com","username":"nguyenvana","firstName":"Nguyen","lastName":"Van A","avatar":null,"phone":"0901234567","isActive":true,"role":"TUTOR","description":null,"userCode":"TU4X9K","gender":null,"dateOfBirth":null,"address":null,"district":null,"province":null,"subjects":"Math","facebookId":null,"googleId":null,"school":"THPT Nguyen Du","relationship":null,"gradesId":[],"parentId":null,"tutorId":null,"createdAt":"2026-09-01T07:12:45.000Z","updatedAt":"2026-09-01T07:12:45.000Z"},"timestamp":"2026-10-10T08:42:00.000Z","method":"GET","path":"/users/detail-user","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 401 session missing or expired: `"statusCode":401,"message":"Session expired or not found ..."`
  - 504: `"statusCode":504,"message":"Timeout has occurred"`

#### 128. GET /users/get-by-field
- **Source:** `features/user/user.controller.ts:101` (`getUserByField`)
- **Auth:** JWT + Redis session (no role check)
- **Request:** query `field` string non-empty required; `value` string non-empty required. Downstream accepts only `id`, `email`, `username`, `phone`, `userCode` (verified in `UserService.searchableFields`).
- **Success:** 200; data = USER_SERVICE reply: array of full `users` rows, **including the bcrypt `password` hash** (`findByField` selects all columns; verified). Missing matches return `[]`.
- **Errors:** E-AUTH; E-ZOD; E-RPC (400 `Unsupported field: <field>` for any other field)
- **Downstream:** RMQ `user.getUserByField` `{field, value}` → USER_SERVICE
- **Request example:** `GET /users/get-by-field?field=email&value=nguyen.van.a@example.com`
- **Success response example** (password hash shown as returned, which is a security issue; see Unclear):
```json
{"statusCode":200,"message":"SUCCESS","data":[{"id":"3f2b8c1e-6a0d-4c1e-9f2a-7b5d8e9c0a12","email":"nguyen.van.a@example.com","username":"nguyenvana","firstName":"Nguyen","lastName":"Van A","password":"$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy","avatar":null,"phone":"0901234567","isActive":true,"role":"TUTOR","description":null,"userCode":"TU4X9K","gender":null,"dateOfBirth":null,"address":null,"district":null,"province":null,"subjects":"Math","facebookId":null,"googleId":null,"school":"THPT Nguyen Du","relationship":null,"gradesId":[],"parentId":null,"tutorId":null,"createdAt":"2026-09-01T07:12:45.000Z","updatedAt":"2026-09-01T07:12:45.000Z"}],"timestamp":"2026-10-10T08:42:00.000Z","method":"GET","path":"/users/get-by-field","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 400 unsupported field (`field=firstName`): `{"success":false,"statusCode":400,"message":"Unsupported field: firstName","path":"/users/get-by-field?field=firstName&value=Nguyen",...}`
  - 422 missing value: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"value","message":"Invalid input: expected string, received undefined","code":"invalid_type"}],...}`
  - 401 / 504: as #126

#### 129. POST /users
- **Source:** `features/user/user.controller.ts:119` (`createUser`)
- **Auth:** JWT + Redis session (no role check; any authenticated user can create any role, see Unclear)
- **Request:** body `CreateUserDto` (`createUserSchema`, not strict): `email` required email; `firstName` and `lastName` 2–100 required; `password` 6–20 required (complexity only applied when length is 8–100); `username` 1–100 optional; `avatar` URL optional; `isActive` boolean default true; `role` ADMIN|TUTOR|PARENT|STUDENT default STUDENT; `dateOfBirth` `z.date()` optional (a JSON string is rejected); `relationship` MOTHER|FATHER|'' default ''; `classId`, `gradesId` uuid[] default []; `parentId`, `tutorId` uuid optional; `description`, `userCode`, `gender`, `address`, `district`, `province`, `subjects`, `facebookId`, `googleId`, `school` strings default ''
- **Success:** 201; data = USER_SERVICE reply `{message, data: {email, fullName, password}}` (verified in `UserService.createUserService`). The `password` field is the **bcrypt hash** of the input, not the plaintext. Only `email, firstName, lastName, password, username, role` (and `userCode` for TUTOR) are persisted; other body fields are validated but silently dropped.
- **Errors:** E-AUTH; E-ZOD; E-RPC (400 duplicate email or username)
- **Downstream:** RMQ `user.createUser` `dto` → USER_SERVICE
- **Request example:**
```json
{"email":"nguyen.van.a@example.com","firstName":"Nguyen","lastName":"Van A","password":"Secret#12","username":"nguyenvana","role":"TUTOR","school":"THPT Nguyen Du"}
```
- **Success response example:**
```json
{"statusCode":201,"message":"SUCCESS","data":{"message":"User created successfully","data":{"email":"nguyen.van.a@example.com","fullName":"Nguyen Van A","password":"$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"}},"timestamp":"2026-10-10T08:43:00.000Z","method":"POST","path":"/users","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 400 duplicate email: `{"success":false,"statusCode":400,"message":"Email already exists: nguyen.van.a@example.com","path":"/users","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f","timestamp":"2026-10-10T08:43:00.000Z"}`
  - 400 duplicate username: `"statusCode":400,"message":"Username already exists: nguyenvana"`
  - 422 short password: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"password","message":"Too small: expected string to have >=6 characters","code":"too_small"}],"path":"/users",...}`
  - 401 / 504: as #126

#### 130. PUT /users
- **Source:** `features/user/user.controller.ts:137` (`updateUserController`)
- **Auth:** JWT + Redis session (self-update)
- **Request:** body `UpdateUserDto` (`updateUserSchema`, `.strict()`, all optional): `email`, `username`, `firstName`/`lastName` (2–100), `avatar` URL nullable, `phone` ≤20 nullable, `isActive`, `role` ADMIN|TUTOR|PARENT|STUDENT, `description` ≤5000 nullable, `userCode` ≤6 nullable, `gender` nullable, `dateOfBirth` nullable, `address`, `district`/`province` ≤30 nullable, `subjects`, `facebookId`, `googleId`, `school` ≤255, `relationship` ≤50, `classId`, `parentId`, `tutorId` uuid nullable, `gradesId` uuid[]. `password` is rejected (422).
- **Success:** 200; data = USER_SERVICE reply: the full updated `users` row **including the `password` hash** (`update().returning()`; verified)
- **Errors:** E-AUTH; E-ZOD (includes unknown keys such as `password`); E-RPC (400 `Students are not allowed to update their own first/last name`, 400 `User not found`)
- **Downstream:** RMQ `user.updateUser` `{userId: caller.id, role: caller.role, ...dto}` → USER_SERVICE. The RPC handler takes `role` out of the data, so the body's `role` is not persisted, but it does overwrite `caller.role` for the STUDENT name check (see Unclear).
- **Request example:**
```json
{"firstName":"Nguyen","lastName":"Van An","phone":"0901234567","school":"THPT Nguyen Du","subjects":"Math, Physics"}
```
- **Success response example:**
```json
{"statusCode":200,"message":"SUCCESS","data":{"id":"3f2b8c1e-6a0d-4c1e-9f2a-7b5d8e9c0a12","email":"nguyen.van.a@example.com","username":"nguyenvana","firstName":"Nguyen","lastName":"Van An","password":"$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy","avatar":null,"phone":"0901234567","isActive":true,"role":"TUTOR","description":null,"userCode":"TU4X9K","gender":null,"dateOfBirth":null,"address":null,"district":null,"province":null,"subjects":"Math, Physics","facebookId":null,"googleId":null,"school":"THPT Nguyen Du","relationship":null,"gradesId":[],"parentId":null,"tutorId":null,"createdAt":"2026-09-01T07:12:45.000Z","updatedAt":"2026-10-10T08:44:00.000Z"},"timestamp":"2026-10-10T08:44:00.000Z","method":"PUT","path":"/users","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 422 unknown key `password`: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"","message":"Unrecognized key: \"password\"","code":"unrecognized_keys"}],"path":"/users",...}`
  - 400 student renaming self (`role` in body set to a non-STUDENT value bypasses this; see Unclear): `{"success":false,"statusCode":400,"message":"Students are not allowed to update their own first/last name","path":"/users",...}`
  - 400 user row missing: `"statusCode":400,"message":"User not found"`
  - 401 / 504: as #126

#### 131. PUT /users/:id
- **Source:** `features/user/user.controller.ts:157` (`updateUserByAdminController`)
- **Auth:** JWT + Redis session (no role check; the route name says admin)
- **Request:** path `id` (no UUID pipe); body same as #130 (strict)
- **Success:** 200; data = USER_SERVICE reply: the full updated `users` row including `password` hash (same as #130). Any field in the body is persisted, including `role`.
- **Errors:** E-AUTH; E-ZOD; E-RPC (400 `User Id must be uuid` for a non-UUID id; 400 `User not found` for an unknown id, not 404)
- **Downstream:** RMQ `user.updateUserByAdmin` `{id, ...dto}` → USER_SERVICE. Caller role is not sent.
- **Request example:** `PUT /users/3f2b8c1e-6a0d-4c1e-9f2a-7b5d8e9c0a12` with body `{"role":"TUTOR","isActive":true,"school":"THPT Nguyen Du"}`
- **Success response example:** same row shape as #130 with the updated fields; `"updatedAt"` is the update time.
```json
{"statusCode":200,"message":"SUCCESS","data":{"id":"3f2b8c1e-6a0d-4c1e-9f2a-7b5d8e9c0a12","email":"nguyen.van.a@example.com","username":"nguyenvana","firstName":"Nguyen","lastName":"Van A","password":"$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy","avatar":null,"phone":"0901234567","isActive":true,"role":"TUTOR","description":null,"userCode":"TU4X9K","gender":null,"dateOfBirth":null,"address":null,"district":null,"province":null,"subjects":"Math","facebookId":null,"googleId":null,"school":"THPT Nguyen Du","relationship":null,"gradesId":[],"parentId":null,"tutorId":null,"createdAt":"2026-09-01T07:12:45.000Z","updatedAt":"2026-10-10T08:45:00.000Z"},"timestamp":"2026-10-10T08:45:00.000Z","method":"PUT","path":"/users/3f2b8c1e-6a0d-4c1e-9f2a-7b5d8e9c0a12","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 400 non-UUID id: `{"success":false,"statusCode":400,"message":"User Id must be uuid","path":"/users/not-a-uuid",...}`
  - 400 unknown id: `"statusCode":400,"message":"User not found"`
  - 422 unknown key: as #130
  - 401 / 504: as #126

#### 132. PUT /users/:id/status
- **Source:** `features/user/user.controller.ts:176` (`updateStatusUserController`)
- **Auth:** JWT + Redis session (no role check)
- **Request:** path `id` (no UUID pipe on the gateway; downstream validates); no body
- **Success:** 200; data = USER_SERVICE reply: the updated `users` row with `isActive` flipped (`!user.isActive`), including the `password` hash (verified in `updateStatusUserService`)
- **Errors:** E-AUTH; E-RPC (400 `User Id must be uuid`; 400 `User not found`)
- **Downstream:** RMQ `user.updateStatusUser` `{id}` → USER_SERVICE. Toggle: each call flips `isActive`; it is not idempotent.
- **Request example:** none (`PUT /users/3f2b8c1e-6a0d-4c1e-9f2a-7b5d8e9c0a12/status`)
- **Success response example:**
```json
{"statusCode":200,"message":"SUCCESS","data":{"id":"3f2b8c1e-6a0d-4c1e-9f2a-7b5d8e9c0a12","email":"nguyen.van.a@example.com","username":"nguyenvana","firstName":"Nguyen","lastName":"Van A","password":"$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy","avatar":null,"phone":"0901234567","isActive":false,"role":"TUTOR","description":null,"userCode":"TU4X9K","gender":null,"dateOfBirth":null,"address":null,"district":null,"province":null,"subjects":"Math","facebookId":null,"googleId":null,"school":"THPT Nguyen Du","relationship":null,"gradesId":[],"parentId":null,"tutorId":null,"createdAt":"2026-09-01T07:12:45.000Z","updatedAt":"2026-10-10T08:46:00.000Z"},"timestamp":"2026-10-10T08:46:00.000Z","method":"PUT","path":"/users/3f2b8c1e-6a0d-4c1e-9f2a-7b5d8e9c0a12/status","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 400 non-UUID id: `{"success":false,"statusCode":400,"message":"User Id must be uuid","path":"/users/not-a-uuid/status",...}`
  - 400 unknown id: `"statusCode":400,"message":"User not found"`
  - 401 / 504: as #126

#### 133. DELETE /users/:id
- **Source:** `features/user/user.controller.ts:191` (`deleteUserByAdminController`)
- **Auth:** JWT + Redis session (no role check)
- **Request:** path `id` (no UUID pipe on the gateway; downstream validates)
- **Success:** 200; data = USER_SERVICE reply `{id}` (verified in `deleteUserByAdminService`). Hard delete; `parentId`/`tutorId` children cascade.
- **Errors:** E-AUTH; E-RPC (400 `User Id must be uuid`; 400 `User not found`)
- **Downstream:** RMQ `user.deleteUserByAdmin` `{id}` → USER_SERVICE
- **Request example:** none (`DELETE /users/3f2b8c1e-6a0d-4c1e-9f2a-7b5d8e9c0a12`)
- **Success response example:**
```json
{"statusCode":200,"message":"SUCCESS","data":{"id":"3f2b8c1e-6a0d-4c1e-9f2a-7b5d8e9c0a12"},"timestamp":"2026-10-10T08:47:00.000Z","method":"DELETE","path":"/users/3f2b8c1e-6a0d-4c1e-9f2a-7b5d8e9c0a12","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 400 unknown id: `{"success":false,"statusCode":400,"message":"User not found","path":"/users/3f2b8c1e-6a0d-4c1e-9f2a-7b5d8e9c0a12",...}`
  - 400 non-UUID id: `"statusCode":400,"message":"User Id must be uuid"`
  - 401 / 504: as #126

#### 134. POST /users/change-password
- **Source:** `features/user/user.controller.ts:206` (`changePasswordController`)
- **Auth:** JWT + Redis session (self only)
- **Request:** body `ChangePasswordValues` (`changePasswordSchema`): `currentPassword` string min 1 required; `newPassword` string 8–14 required, must have lowercase, uppercase, digit and special char (complexity applied only when length is 8–14)
- **Success:** 200; data = USER_SERVICE reply `{message: "Password changed successfully"}` (verified in `changePasswordService`)
- **Errors:** E-AUTH; E-ZOD; E-RPC (401 wrong current password; 400 `User not found`)
- **Downstream:** RMQ `user.changePassword` `{userId: caller.id, currentPassword, newPassword}` → USER_SERVICE
- **Request example:**
```json
{"currentPassword":"OldPass#1","newPassword":"NewPass#2026"}
```
- **Success response example:**
```json
{"statusCode":200,"message":"SUCCESS","data":{"message":"Password changed successfully"},"timestamp":"2026-10-10T08:48:00.000Z","method":"POST","path":"/users/change-password","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f"}
```
- **Error examples:**
  - 401 wrong current password (`UnauthorizedException`): `{"success":false,"statusCode":401,"message":"Current password is incorrect","path":"/users/change-password","correlationId":"5f0c2d1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f","timestamp":"2026-10-10T08:48:00.000Z"}`
  - 422 weak new password: `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"newPassword","message":"Too small: expected string to have >=8 characters","code":"too_small"}],"path":"/users/change-password",...}`
  - 401 session / 504: as #126
