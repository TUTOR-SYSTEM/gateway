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

