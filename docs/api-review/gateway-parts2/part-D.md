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
