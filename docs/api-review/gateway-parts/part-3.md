## Classes (`/classes`)

Notes for this group: example messages are the default `vi` text (no `Accept-Language` header). 5xx bodies also carry `trace` outside production; it is omitted below. Ids used in examples: tutor `b7e1c2d4-3f5a-4e6b-9c8d-1a2b3c4d5e6f`, class `5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f`, student `d4c3b2a1-9f8e-4d7c-8b6a-5f4e3d2c1b0a`.

#### 38. POST /classes
- **Source:** `features/class/class.controller.ts:42` (`create`)
- **Auth:** JWT + Redis session
- **Request:** body `CreateClassDto` (`createClassSchema`): `name` string 1–255 required; `code` string 1–50 required; `subject` string 1–255 required; `tuition` number ≥0 default 0 optional; `description` optional; `status` OPEN|CLOSED|UPCOMING default OPEN; `format` ONLINE|OFFLINE default OFFLINE; `startTime` date required; `endTime` date required; `location` optional; `curriculumId` uuid optional nullable; `tutorId` uuid required; `schedulesId` uuid[] default []
- **Success:** 201; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `class.create` `{userId, ...dto}` → TUTOR_SERVICE
- **Known mismatch:** the handler (`class.rpc.controller.ts`) passes the payload to `ClassService.createClassService({userId, data})`, which destructures `data`. The gateway sends the DTO flat, so every valid request fails before the insert. The downstream 400s (`CLASS_NAME_EXISTS`, `CLASS_CODE_EXISTS`, `TUTOR_NOT_FOUND`) are unreachable until this is fixed.
- **Request example:**
```json
{"name":"Toán 12 - Ôn thi THPT","code":"TOAN12A","subject":"Toán học","tuition":1500000,"description":"Lớp ôn thi tốt nghiệp","status":"OPEN","format":"OFFLINE","startTime":"2026-11-02T11:00:00.000Z","endTime":"2026-11-02T12:30:00.000Z","location":"Phòng 201, 12 Nguyễn Trãi","curriculumId":"9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","tutorId":"b7e1c2d4-3f5a-4e6b-9c8d-1a2b3c4d5e6f","schedulesId":[]}
```
- **Success response example** (not reachable today; shape is the `classes` row returned by `repo.create`):
```json
{"statusCode":201,"message":"Thành công","data":{"id":"5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","name":"Toán 12 - Ôn thi THPT","code":"TOAN12A","subject":"Toán học","tuition":"1500000.00","description":"Lớp ôn thi tốt nghiệp","status":"OPEN","format":"OFFLINE","startTime":"2026-11-02T11:00:00.000Z","endTime":"2026-11-02T12:30:00.000Z","location":"Phòng 201, 12 Nguyễn Trãi","curriculumId":"9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","tutorId":"b7e1c2d4-3f5a-4e6b-9c8d-1a2b3c4d5e6f","createdAt":"2026-10-10T08:30:00.000Z","updatedAt":"2026-10-10T08:30:00.000Z"},"timestamp":"2026-10-10T08:30:00.000Z","method":"POST","path":"/classes","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH, missing or invalid Bearer token: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/classes","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `422` E-ZOD, `tutorId` is `"abc"`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"tutorId","message":"Invalid tutor ID","code":"invalid_format"}],"path":"/classes","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `500` valid body, payload mismatch above (`tutor-service` TypeError): `{"success":false,"statusCode":500,"message":"Cannot destructure property 'name' of 'data' as it is undefined.","path":"/classes","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` no reply within 10 s on 3 attempts: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/classes","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

#### 39. PUT /classes/:id
- **Source:** `features/class/class.controller.ts:58` (`update`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; body `UpdateClassDto` (`updateClassSchema` = create fields partial, without `tutorId`, plus `studentIds` uuid[] ≤100 optional)
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `class.update` `{userId, id, ...dto}` → TUTOR_SERVICE
- **Known mismatch:** `ClassService.updateClassService` reads `data` (`{userId, id, data}`), but the gateway sends the DTO flat. A non-owner gets 404. The owner hits a TypeError because `data.name` is read on `undefined`.
- **Request example:**
```json
{"status":"CLOSED","location":"Phòng 305, 12 Nguyễn Trãi","studentIds":["d4c3b2a1-9f8e-4d7c-8b6a-5f4e3d2c1b0a"]}
```
- **Success response example** (not reachable today; `repo.update` row):
```json
{"statusCode":200,"message":"Thành công","data":{"id":"5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","name":"Toán 12 - Ôn thi THPT","code":"TOAN12A","subject":"Toán học","tuition":"1500000.00","description":"Lớp ôn thi tốt nghiệp","status":"CLOSED","format":"OFFLINE","startTime":"2026-11-02T11:00:00.000Z","endTime":"2026-11-02T12:30:00.000Z","location":"Phòng 305, 12 Nguyễn Trãi","curriculumId":"9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","tutorId":"b7e1c2d4-3f5a-4e6b-9c8d-1a2b3c4d5e6f","createdAt":"2026-10-01T03:12:45.000Z","updatedAt":"2026-10-10T08:30:00.000Z"},"timestamp":"2026-10-10T08:30:00.000Z","method":"PUT","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `422` E-ZOD, `status` is `"ARCHIVED"`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"status","message":"Invalid option: expected one of \"OPEN\"|\"CLOSED\"|\"UPCOMING\"","code":"invalid_value"}],"path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `404` E-RPC, caller is not the tutor of the class (`CLASS_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Không tìm thấy lớp học","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `500` owner caller, payload mismatch: `{"success":false,"statusCode":500,"message":"Cannot read properties of undefined (reading 'name')","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

#### 40. GET /classes/generate-code
- **Source:** `features/class/class.controller.ts:71` (`generateCode`)
- **Auth:** JWT + Redis session
- **Request:** none
- **Success:** 200; data = TUTOR_SERVICE reply (generated code)
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `class.generateCode` `{}` → TUTOR_SERVICE
- **Request example:** none
- **Success response example** (handler returns `{ code }`; code is 6 uppercase alphanumerics):
```json
{"statusCode":200,"message":"Thành công","data":{"code":"K7Q2X9"},"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/classes/generate-code","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/classes/generate-code","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `409` E-RPC, 5 random codes all already in use (`UNABLE_TO_GENERATE_UNIQUE_CODE`): `{"success":false,"statusCode":409,"message":"Không tạo được mã duy nhất, vui lòng thử lại","path":"/classes/generate-code","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/classes/generate-code","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

#### 41. GET /classes
- **Source:** `features/class/class.controller.ts:85` (`getAll`)
- **Auth:** JWT + Redis session
- **Request:** query `GetClassesQueryDto` (`getClassesQuerySchema`): `page` default 1; `limit` 1–100 default 10; `search` trimmed optional; `status` OPEN|CLOSED|UPCOMING optional; `subject` string optional; `studentsId` uuid optional
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `class.getAll` `{userId, ...query}` → TUTOR_SERVICE
- **Known mismatch:** the handler reads `query` from `{userId, query}`. The gateway sends the query flat, so `query` is `undefined`. `getClassesService` spreads it into `{}`, so the request succeeds with defaults (page 1, limit 10, no filters). `search`, `status`, `subject`, `studentsId`, `page` and `limit` are all silently ignored.
- **Request example:** `GET /classes?page=1&limit=5&status=OPEN&search=Toán`
- **Success response example** (the shape is `getClasses`; the filters are dropped as described above, so this lists all of the tutor's classes):
```json
{"statusCode":200,"message":"Thành công","data":{"classes":[{"id":"5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","name":"Toán 12 - Ôn thi THPT","code":"TOAN12A","subject":"Toán học","tuition":"1500000.00","description":"Lớp ôn thi tốt nghiệp","status":"OPEN","format":"OFFLINE","startTime":"2026-11-02T11:00:00.000Z","endTime":"2026-11-02T12:30:00.000Z","location":"Phòng 201, 12 Nguyễn Trãi","curriculumId":"9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","tutorId":"b7e1c2d4-3f5a-4e6b-9c8d-1a2b3c4d5e6f","createdAt":"2026-10-01T03:12:45.000Z","updatedAt":"2026-10-01T03:12:45.000Z","students":[{"classId":"5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","id":"d4c3b2a1-9f8e-4d7c-8b6a-5f4e3d2c1b0a","firstName":"Minh","lastName":"Trần Quang","email":"minh.tq@example.com","phone":"0901234567","avatar":null,"userCode":"HS0042","gender":"MALE","school":"THCS Lê Quý Đôn","enrolledAt":"2026-10-02T09:00:00.000Z"}],"schedules":[{"id":"7b6a5f4e-3d2c-4b1a-9f8e-7d6c5b4a3f2e","classId":"5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","dayOfWeek":"MONDAY","startTime":"18:00","endTime":"19:30","format":"OFFLINE","location":"Phòng 201","createdAt":"2026-10-01T03:12:45.000Z","updatedAt":"2026-10-01T03:12:45.000Z"}]}],"pagination":{"total":1,"page":1,"limit":10,"totalPages":1}},"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/classes?page=1&limit=5&status=OPEN&search=Toán","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/classes?page=1","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `422` E-ZOD, `limit=500`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"limit","message":"Too big: expected number to be <=100","code":"too_big"}],"path":"/classes?limit=500","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/classes","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

#### 42. GET /classes/:id
- **Source:** `features/class/class.controller.ts:98` (`getById`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `class.getById` `{userId, id}` → TUTOR_SERVICE
- **Request example:** `GET /classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f`
- **Success response example** (`repo.getClass`: the class row plus enrolled students):
```json
{"statusCode":200,"message":"Thành công","data":{"id":"5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","name":"Toán 12 - Ôn thi THPT","code":"TOAN12A","subject":"Toán học","tuition":"1500000.00","description":"Lớp ôn thi tốt nghiệp","status":"OPEN","format":"OFFLINE","startTime":"2026-11-02T11:00:00.000Z","endTime":"2026-11-02T12:30:00.000Z","location":"Phòng 201, 12 Nguyễn Trãi","curriculumId":"9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","tutorId":"b7e1c2d4-3f5a-4e6b-9c8d-1a2b3c4d5e6f","createdAt":"2026-10-01T03:12:45.000Z","updatedAt":"2026-10-01T03:12:45.000Z","students":[{"id":"d4c3b2a1-9f8e-4d7c-8b6a-5f4e3d2c1b0a","firstName":"Minh","lastName":"Trần Quang","email":"minh.tq@example.com","phone":"0901234567","avatar":null,"userCode":"HS0042","gender":"MALE","school":"THCS Lê Quý Đôn","enrolledAt":"2026-10-02T09:00:00.000Z"}]},"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `400` E-RPC, `id` is `abc` (`CLASS_ID_MUST_BE_UUID`): `{"success":false,"statusCode":400,"message":"ID lớp học phải là UUID","path":"/classes/abc","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `404` E-RPC, caller is neither the tutor, an enrolled student, nor a parent of one (`CLASS_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Không tìm thấy lớp học","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

#### 43. POST /classes/:id/students
- **Source:** `features/class/class.controller.ts:107` (`addStudents`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; body `AddStudentsDto` (`addStudentsSchema`): `studentIds` uuid[] 1–100 required
- **Success:** 200 (`HttpCode OK`, not 201); data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `class.addStudents` `{userId, classId, studentIds}` → TUTOR_SERVICE
- **Known mismatch:** `ClassService.addStudentsService` reads `data.studentIds`, but the gateway sends `studentIds` at the top level. A non-owner gets 404. The owner hits a TypeError.
- **Request example:**
```json
{"studentIds":["d4c3b2a1-9f8e-4d7c-8b6a-5f4e3d2c1b0a","e5d4c3b2-a1f0-4e9d-8c7b-6a5f4e3d2c1b"]}
```
- **Success response example** (not reachable today; service returns this object):
```json
{"statusCode":200,"message":"Thành công","data":{"classId":"5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","added":2,"skipped":0,"studentIds":["d4c3b2a1-9f8e-4d7c-8b6a-5f4e3d2c1b0a","e5d4c3b2-a1f0-4e9d-8c7b-6a5f4e3d2c1b"]},"timestamp":"2026-10-10T08:30:00.000Z","method":"POST","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f/students","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f/students","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `422` E-ZOD, `studentIds` is `[]`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"studentIds","message":"At least 1 student is required","code":"too_small"}],"path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f/students","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `404` E-RPC, caller is not the tutor of the class (`CLASS_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Không tìm thấy lớp học","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f/students","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `500` owner caller, payload mismatch: `{"success":false,"statusCode":500,"message":"Cannot read properties of undefined (reading 'studentIds')","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f/students","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f/students","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

#### 44. GET /classes/:id/students
- **Source:** `features/class/class.controller.ts:121` (`getStudents`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `class.getStudents` `{userId, classId}` → TUTOR_SERVICE
- **Known mismatch:** the handler reads `id`, but the gateway sends `classId`. The service therefore sees an empty id and always returns 400 `CLASS_ID_MUST_BE_UUID`. The route never succeeds today.
- **Request example:** `GET /classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f/students`
- **Success response example** (not reachable today; `repo.getAllStudent`):
```json
{"statusCode":200,"message":"Thành công","data":[{"id":"d4c3b2a1-9f8e-4d7c-8b6a-5f4e3d2c1b0a","firstName":"Minh","lastName":"Trần Quang","email":"minh.tq@example.com","avatar":null,"phone":"0901234567","role":"STUDENT","userCode":"HS0042","parent":{"id":"f6e5d4c3-b2a1-4f0e-9d8c-7b6a5f4e3d2c","firstName":"Hùng","lastName":"Trần","email":"hung.tran@example.com","avatar":null,"phone":"0912345678","relationship":"Bố"}}],"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f/students","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f/students","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `400` E-RPC, every call (`CLASS_ID_MUST_BE_UUID` from the `classId`/`id` mismatch): `{"success":false,"statusCode":400,"message":"ID lớp học phải là UUID","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f/students","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f/students","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

#### 45. GET /classes/:id/materials
- **Source:** `features/class/class.controller.ts:130` (`getMaterials`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `class.getMaterials` `{userId, classId}` → TUTOR_SERVICE
- **Known mismatch:** same `classId`/`id` mismatch as route 44. Always 400 `CLASS_ID_MUST_BE_UUID` today.
- **Request example:** `GET /classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f/materials`
- **Success response example** (not reachable today; shape from `getClassMaterialsService`):
```json
{"statusCode":200,"message":"Thành công","data":{"class":{"id":"5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","name":"Toán 12 - Ôn thi THPT","subject":"Toán học","curriculumId":"9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d"},"lessons":[{"id":"2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","title":"Bài 1: Hàm số bậc nhất","description":"Khái niệm và đồ thị","order":1,"chapterId":"e1d2c3b4-a5f6-4978-8a9b-0c1d2e3f4a5b","chapterTitle":"Chương 1: Hàm số","theoryUrls":[{"name":"Lý thuyết bài 1.pdf","url":"https://cdn.example.com/files/ly-thuyet-bai-1.pdf","key":"lesson/2f6e/theory-1.pdf"}],"exerciseUrls":[],"createdAt":"2026-10-01T03:12:45.000Z"}],"theoryCount":1,"exerciseCount":0},"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f/materials","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f/materials","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `400` E-RPC, every call (`CLASS_ID_MUST_BE_UUID`): `{"success":false,"statusCode":400,"message":"ID lớp học phải là UUID","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f/materials","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f/materials","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

#### 46. GET /classes/:id/watches
- **Source:** `features/class/class.controller.ts:142` (`getWatch`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `class.getWatch` `{userId, classId}` → TUTOR_SERVICE
- **Known mismatch:** same `classId`/`id` mismatch as route 44. Always 400 `CLASS_ID_MUST_BE_UUID` today.
- **Request example:** `GET /classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f/watches`
- **Success response example** (not reachable today; shape from `getClassWatchService`):
```json
{"statusCode":200,"message":"Thành công","data":{"class":{"id":"5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","name":"Toán 12 - Ôn thi THPT","code":"TOAN12A","subject":"Toán học","status":"OPEN","format":"OFFLINE","startTime":"2026-11-02T11:00:00.000Z","endTime":"2026-11-02T12:30:00.000Z","location":"Phòng 201, 12 Nguyễn Trãi","curriculumId":"9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","tutorId":"b7e1c2d4-3f5a-4e6b-9c8d-1a2b3c4d5e6f"},"recentSession":{"id":"c3d4e5f6-0a1b-4c2d-9e8f-7a6b5c4d3e2f","classId":"5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","sessionNumber":3,"title":"Buổi 3: Đồ thị hàm số","status":"SCHEDULED","startAt":"2026-11-02T11:00:00.000Z","endAt":"2026-11-02T12:30:00.000Z","exerciseUrls":[]},"schedules":[{"id":"7b6a5f4e-3d2c-4b1a-9f8e-7d6c5b4a3f2e","classId":"5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","dayOfWeek":"MONDAY","startTime":"18:00","endTime":"19:30","format":"OFFLINE","location":"Phòng 201"}],"students":[{"id":"d4c3b2a1-9f8e-4d7c-8b6a-5f4e3d2c1b0a","firstName":"Minh","lastName":"Trần Quang","email":"minh.tq@example.com","avatar":null,"phone":"0901234567","role":"STUDENT","userCode":"HS0042","parent":{"id":"f6e5d4c3-b2a1-4f0e-9d8c-7b6a5f4e3d2c","firstName":"Hùng","lastName":"Trần","email":"hung.tran@example.com","avatar":null,"phone":"0912345678","relationship":"Bố"}}]},"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f/watches","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f/watches","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `400` E-RPC, every call (`CLASS_ID_MUST_BE_UUID`): `{"success":false,"statusCode":400,"message":"ID lớp học phải là UUID","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f/watches","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f/watches","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

#### 47. DELETE /classes/:id
- **Source:** `features/class/class.controller.ts:151` (`del`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `class.delete` `{userId, id}` → TUTOR_SERVICE
- **Request example:** `DELETE /classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f`
- **Success response example** (`{ id }`):
```json
{"statusCode":200,"message":"Thành công","data":{"id":"5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f"},"timestamp":"2026-10-10T08:30:00.000Z","method":"DELETE","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `404` E-RPC, caller is not the tutor, or the class does not exist (`CLASS_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Không tìm thấy lớp học","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/classes/5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

## Curriculum (`/curriculum`)

#### 48. GET /curriculum/generate-code
- **Source:** `features/curriculum/curriculum.controller.ts:39` (`generateCode`)
- **Auth:** JWT + Redis session
- **Request:** none
- **Success:** 201 (`HttpCode CREATED` on a GET); data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `curriculum.generateCode` `{}` → TUTOR_SERVICE
- **Request example:** none
- **Success response example** (handler returns `{ code }`):
```json
{"statusCode":201,"message":"Thành công","data":{"code":"Q3M8T1"},"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/curriculum/generate-code","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/curriculum/generate-code","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `409` E-RPC, 5 generated codes all in use (`UNABLE_TO_GENERATE_UNIQUE_CODE`): `{"success":false,"statusCode":409,"message":"Không tạo được mã duy nhất, vui lòng thử lại","path":"/curriculum/generate-code","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/curriculum/generate-code","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

#### 49. POST /curriculum
- **Source:** `features/curriculum/curriculum.controller.ts:61` (`create`)
- **Auth:** JWT + Redis session
- **Request:** body `CreateCurriculumDto` (`createCurriculumSchema`): `subject` string 1–255 required; `code` string 1–6 required; `grade` string or number, coerced to number, required; `courseTime` string required; `description` optional; `gradesId` uuid required
- **Success:** 201; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `curriculum.create` `{userId, ...dto}` → TUTOR_SERVICE
- **Known mismatch:** the handler reads `createCurriculum` from `{userId, createCurriculum}`, but the gateway sends the DTO flat. Every valid request fails with a TypeError. Also, even once fixed, `CurriculumRepository.create` inserts `gradesId: null`, so the `gradesId` the client sends is discarded.
- **Request example:**
```json
{"subject":"Đại Số","code":"DSA12","grade":"12","courseTime":"12 buổi","description":"Đại số lớp 12","gradesId":"0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f"}
```
- **Success response example** (not reachable today; the inserted curriculum row):
```json
{"statusCode":201,"message":"Thành công","data":{"id":"9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","userId":"b7e1c2d4-3f5a-4e6b-9c8d-1a2b3c4d5e6f","gradesId":null,"subject":"Đại Số","code":"DSA12","grade":"12","courseTime":"12 buổi","description":"Đại số lớp 12","createdAt":"2026-10-10T08:30:00.000Z","updatedAt":"2026-10-10T08:30:00.000Z"},"timestamp":"2026-10-10T08:30:00.000Z","method":"POST","path":"/curriculum","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/curriculum","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `422` E-ZOD, `code` is 7 characters: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"code","message":"Code curriculum must me 6 character ...","code":"too_big"}],"path":"/curriculum","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `500` valid body, payload mismatch: `{"success":false,"statusCode":500,"message":"Cannot destructure property 'subject' of 'data' as it is undefined.","path":"/curriculum","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/curriculum","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

#### 50. GET /curriculum
- **Source:** `features/curriculum/curriculum.controller.ts:76` (`getAll`)
- **Auth:** JWT + Redis session
- **Request:** query `page` default 1; `limit` 1–100 default 10; `search` trimmed optional
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `curriculum.getAll` `{userId, ...query}` → TUTOR_SERVICE
- **Known mismatch:** the handler reads `query` from `{userId, query}`, but the gateway sends it flat. `query.page` then throws. The route fails for every valid request.
- **Request example:** `GET /curriculum?page=1&limit=10&search=Đại`
- **Success response example** (not reachable today; shape from `CurriculumRepository.findAll`):
```json
{"statusCode":200,"message":"Thành công","data":{"curriculums":[{"id":"9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","userId":"b7e1c2d4-3f5a-4e6b-9c8d-1a2b3c4d5e6f","gradesId":null,"subject":"Đại Số","code":"DSA12","grade":"12","courseTime":"12 buổi","description":"Đại số lớp 12","createdAt":"2026-10-10T08:30:00.000Z","updatedAt":"2026-10-10T08:30:00.000Z","chapterCount":1,"lessonCount":1}],"pagination":{"total":1,"page":1,"limit":10,"totalPages":1}},"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/curriculum?page=1&limit=10&search=Đại","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/curriculum","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `422` E-ZOD, `limit=0`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"limit","message":"Too small: expected number to be >=1","code":"too_small"}],"path":"/curriculum?limit=0","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `500` every valid call, payload mismatch: `{"success":false,"statusCode":500,"message":"Cannot read properties of undefined (reading 'page')","path":"/curriculum","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/curriculum","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

#### 51. GET /curriculum/:id
- **Source:** `features/curriculum/curriculum.controller.ts:89` (`getById`)
- **Auth:** JWT + Redis session
- **Request:** path `id` (no UUID pipe)
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `curriculum.getById` `{userId, id}` → TUTOR_SERVICE
- **Notes:** an id that is not in the database returns 200 with `data: null`, because the service does not throw. An invalid UUID returns 400.
- **Request example:** `GET /curriculum/9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d`
- **Success response example** (`findByIdWithDetails`: the curriculum row plus its chapters and lessons):
```json
{"statusCode":200,"message":"Thành công","data":{"id":"9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","userId":"b7e1c2d4-3f5a-4e6b-9c8d-1a2b3c4d5e6f","gradesId":"0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f","subject":"Đại Số","code":"DSA12","grade":"12","courseTime":"12 buổi","description":"Đại số lớp 12","createdAt":"2026-10-10T08:30:00.000Z","updatedAt":"2026-10-10T08:30:00.000Z","chapterCount":1,"lessonCount":1,"chapters":[{"id":"e1d2c3b4-a5f6-4978-8a9b-0c1d2e3f4a5b","curriculumId":"9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","title":"Chương 1: Hàm số","description":null,"order":1,"createdAt":"2026-10-10T08:30:00.000Z","updatedAt":"2026-10-10T08:30:00.000Z","lessons":[{"id":"2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","curriculumId":"9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","chapterId":"e1d2c3b4-a5f6-4978-8a9b-0c1d2e3f4a5b","title":"Bài 1: Hàm số bậc nhất","description":"Khái niệm và đồ thị","theoryUrls":[],"exerciseUrls":[],"order":1,"createdAt":"2026-10-10T08:30:00.000Z","updatedAt":"2026-10-10T08:30:00.000Z"}]}],"lessons":[]},"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/curriculum/9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/curriculum/9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `400` E-RPC, `id` is `abc` (`CURRICULUM_ID_INVALID`): `{"success":false,"statusCode":400,"message":"ID chương trình học không hợp lệ","path":"/curriculum/abc","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/curriculum/9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

#### 52. PUT /curriculum/:id
- **Source:** `features/curriculum/curriculum.controller.ts:109` (`update`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; body `UpdateCurriculumDto` (`createCurriculumSchema.partial()`)
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `curriculum.update` `{userId, id, data}` → TUTOR_SERVICE
- **Request example:**
```json
{"courseTime":"15 buổi","description":"Cập nhật số buổi học"}
```
- **Success response example** (the updated curriculum row from `repo.update`):
```json
{"statusCode":200,"message":"Thành công","data":{"id":"9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","userId":"b7e1c2d4-3f5a-4e6b-9c8d-1a2b3c4d5e6f","gradesId":"0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f","subject":"Đại Số","code":"DSA12","grade":"12","courseTime":"15 buổi","description":"Cập nhật số buổi học","createdAt":"2026-10-10T08:30:00.000Z","updatedAt":"2026-10-10T08:35:00.000Z"},"timestamp":"2026-10-10T08:35:00.000Z","method":"PUT","path":"/curriculum/9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/curriculum/9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `422` E-ZOD, `code` is `""`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"code","message":"Code curriculum must me 6 character ...","code":"too_small"}],"path":"/curriculum/9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `404` E-RPC, no curriculum with that id (`CURRICULUM_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Không tìm thấy chương trình học","path":"/curriculum/9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/curriculum/9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

#### 53. DELETE /curriculum/:id
- **Source:** `features/curriculum/curriculum.controller.ts:123` (`delete`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `curriculum.delete` `{userId, id}` → TUTOR_SERVICE
- **Request example:** `DELETE /curriculum/9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d`
- **Success response example** (the service returns a boolean):
```json
{"statusCode":200,"message":"Thành công","data":true,"timestamp":"2026-10-10T08:30:00.000Z","method":"DELETE","path":"/curriculum/9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/curriculum/9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `404` E-RPC, no curriculum with that id (`CURRICULUM_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Không tìm thấy chương trình học","path":"/curriculum/9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/curriculum/9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

## Lessons (`/curriculum/lessons`)

#### 54. POST /curriculum/lessons
- **Source:** `features/lesson/lesson.controller.ts:40` (`create`)
- **Auth:** JWT + Redis session
- **Request:** query `curriculumId` and `chapterId` read as raw strings with no validation (neither is checked at the gateway); body `CreateLessonBodyDto` (`createLessonBodySchema`): `title` string 1–255 required; `description` optional; `theoryUrls` and `exerciseUrls` arrays of `{name, url (valid URL), key}` optional; `order` int default 0 optional
- **Success:** 201; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD (body only); E-RPC (query problems surface downstream)
- **Downstream:** RMQ `lesson.create` `{curriculumId, chapterId, data}` → TUTOR_SERVICE
- **Request example:** `POST /curriculum/lessons?curriculumId=9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d&chapterId=e1d2c3b4-a5f6-4978-8a9b-0c1d2e3f4a5b`
```json
{"title":"Bài 1: Hàm số bậc nhất","description":"Khái niệm và đồ thị","theoryUrls":[{"name":"Lý thuyết bài 1.pdf","url":"https://cdn.example.com/files/ly-thuyet-bai-1.pdf","key":"lesson/2f6e/theory-1.pdf"}],"exerciseUrls":[],"order":1}
```
- **Success response example** (the inserted lesson row):
```json
{"statusCode":201,"message":"Thành công","data":{"id":"2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","curriculumId":"9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","chapterId":"e1d2c3b4-a5f6-4978-8a9b-0c1d2e3f4a5b","title":"Bài 1: Hàm số bậc nhất","description":"Khái niệm và đồ thị","theoryUrls":[{"name":"Lý thuyết bài 1.pdf","url":"https://cdn.example.com/files/ly-thuyet-bai-1.pdf","key":"lesson/2f6e/theory-1.pdf"}],"exerciseUrls":[],"order":1,"createdAt":"2026-10-10T08:30:00.000Z","updatedAt":"2026-10-10T08:30:00.000Z"},"timestamp":"2026-10-10T08:30:00.000Z","method":"POST","path":"/curriculum/lessons?curriculumId=9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d&chapterId=e1d2c3b4-a5f6-4978-8a9b-0c1d2e3f4a5b","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/curriculum/lessons","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `422` E-ZOD, `title` is `""`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"title","message":"Title is required","code":"too_small"}],"path":"/curriculum/lessons?curriculumId=9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `400` E-RPC, `curriculumId` query missing (`CURRICULUM_ID_MUST_BE_UUID`): `{"success":false,"statusCode":400,"message":"curriculumId phải là UUID hợp lệ","path":"/curriculum/lessons","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/curriculum/lessons","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

#### 55. GET /curriculum/lessons
- **Source:** `features/lesson/lesson.controller.ts:56` (`getAll`)
- **Auth:** JWT + Redis session
- **Request:** query `curriculumId` uuid required; `chapterId` uuid optional; `page` default 1; `limit` 1–100 default 10
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `lesson.getAll` `{query}` → TUTOR_SERVICE
- **Routing risk:** `CurriculumController` (`@Controller('curriculum')`, `GET /:id`) is registered before `LessonController` (`CurriculumModule` is imported before `LessonModule` in `app.module.ts`). Express matches in registration order, so `GET /curriculum/lessons` is probably caught by `curriculum.getById` with id `lessons`. Not verified at runtime. If so, the response is the 400 below and the 422 never occurs.
- **Request example:** `GET /curriculum/lessons?curriculumId=9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d&chapterId=e1d2c3b4-a5f6-4978-8a9b-0c1d2e3f4a5b&page=1&limit=10`
- **Success response example** (`findAll`: lesson rows plus pagination):
```json
{"statusCode":200,"message":"Thành công","data":{"lessons":[{"id":"2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","curriculumId":"9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","chapterId":"e1d2c3b4-a5f6-4978-8a9b-0c1d2e3f4a5b","title":"Bài 1: Hàm số bậc nhất","description":"Khái niệm và đồ thị","theoryUrls":[{"name":"Lý thuyết bài 1.pdf","url":"https://cdn.example.com/files/ly-thuyet-bai-1.pdf","key":"lesson/2f6e/theory-1.pdf"}],"exerciseUrls":[],"order":1,"createdAt":"2026-10-10T08:30:00.000Z","updatedAt":"2026-10-10T08:30:00.000Z"}],"pagination":{"total":1,"page":1,"limit":10,"totalPages":1}},"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/curriculum/lessons?curriculumId=9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d&chapterId=e1d2c3b4-a5f6-4978-8a9b-0c1d2e3f4a5b&page=1&limit=10","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/curriculum/lessons?curriculumId=9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `422` E-ZOD, `curriculumId=abc` (only when not shadowed by route 51): `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"curriculumId","message":"Invalid curriculum ID","code":"invalid_format"}],"path":"/curriculum/lessons?curriculumId=abc","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `400` E-RPC, if shadowed by `GET /curriculum/:id` with id `lessons` (`CURRICULUM_ID_INVALID`): `{"success":false,"statusCode":400,"message":"ID chương trình học không hợp lệ","path":"/curriculum/lessons","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/curriculum/lessons?curriculumId=9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

#### 56. GET /curriculum/lessons/:id
- **Source:** `features/lesson/lesson.controller.ts:68` (`getById`)
- **Auth:** JWT + Redis session
- **Request:** path `id` (no UUID pipe)
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `lesson.getById` `{id}` → TUTOR_SERVICE
- **Notes:** an id that is not in the database returns 200 with `data: null`, because the service does not throw. An invalid UUID returns 400.
- **Request example:** `GET /curriculum/lessons/2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918`
- **Success response example** (lesson row):
```json
{"statusCode":200,"message":"Thành công","data":{"id":"2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","curriculumId":"9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","chapterId":"e1d2c3b4-a5f6-4978-8a9b-0c1d2e3f4a5b","title":"Bài 1: Hàm số bậc nhất","description":"Khái niệm và đồ thị","theoryUrls":[{"name":"Lý thuyết bài 1.pdf","url":"https://cdn.example.com/files/ly-thuyet-bai-1.pdf","key":"lesson/2f6e/theory-1.pdf"}],"exerciseUrls":[],"order":1,"createdAt":"2026-10-10T08:30:00.000Z","updatedAt":"2026-10-10T08:30:00.000Z"},"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/curriculum/lessons/2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/curriculum/lessons/2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `400` E-RPC, `id` is `abc` (`LESSON_ID_INVALID`): `{"success":false,"statusCode":400,"message":"ID bài học không hợp lệ","path":"/curriculum/lessons/abc","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/curriculum/lessons/2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

#### 57. PUT /curriculum/lessons/:id
- **Source:** `features/lesson/lesson.controller.ts:77` (`update`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; body `UpdateLessonDto` (`updateLessonSchema` = `createLessonSchema.partial()`, so it also accepts `curriculumId`, `chapterId`, `theoryUrls`, `exerciseUrls`, `order`)
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `lesson.update` `{id, data}` → TUTOR_SERVICE
- **Request example:**
```json
{"title":"Bài 1: Hàm số bậc nhất (cập nhật)","order":2}
```
- **Success response example** (the updated lesson row):
```json
{"statusCode":200,"message":"Thành công","data":{"id":"2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","curriculumId":"9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d","chapterId":"e1d2c3b4-a5f6-4978-8a9b-0c1d2e3f4a5b","title":"Bài 1: Hàm số bậc nhất (cập nhật)","description":"Khái niệm và đồ thị","theoryUrls":[{"name":"Lý thuyết bài 1.pdf","url":"https://cdn.example.com/files/ly-thuyet-bai-1.pdf","key":"lesson/2f6e/theory-1.pdf"}],"exerciseUrls":[],"order":2,"createdAt":"2026-10-10T08:30:00.000Z","updatedAt":"2026-10-10T08:36:00.000Z"},"timestamp":"2026-10-10T08:36:00.000Z","method":"PUT","path":"/curriculum/lessons/2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/curriculum/lessons/2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `422` E-ZOD, `theoryUrls[0].url` is `"not-a-url"`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"theoryUrls.0.url","message":"Invalid URL","code":"invalid_format"}],"path":"/curriculum/lessons/2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `404` E-RPC, no lesson with that id (`LESSON_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Không tìm thấy bài học","path":"/curriculum/lessons/2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/curriculum/lessons/2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

#### 58. DELETE /curriculum/lessons/:id
- **Source:** `features/lesson/lesson.controller.ts:90` (`delete`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `lesson.delete` `{id}` → TUTOR_SERVICE
- **Request example:** `DELETE /curriculum/lessons/2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918`
- **Success response example** (the service returns a boolean):
```json
{"statusCode":200,"message":"Thành công","data":true,"timestamp":"2026-10-10T08:30:00.000Z","method":"DELETE","path":"/curriculum/lessons/2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/curriculum/lessons/2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `404` E-RPC, no lesson with that id (`LESSON_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Không tìm thấy bài học","path":"/curriculum/lessons/2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/curriculum/lessons/2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

## Exercises (`/exercises`)

#### 59. POST /exercises
- **Source:** `features/exercise/exercise.controller.ts:40` (`create`)
- **Auth:** JWT + Redis session (no role check)
- **Request:** body `CreateExerciseDto` (`createExerciseSchema`): `tutorId` uuid required; `studentId` uuid required; `sessionId` uuid optional nullable; `lessonId` uuid optional nullable; `issueUrls` and `exerciseUrls` arrays of `{name, url, key}` optional nullable; `status` SUBMITTED|GRADED|RESUBMIT optional
- **Success:** 201; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `exercise.create` `{userId, ...dto}` → TUTOR_SERVICE
- **Known mismatch:** the handler reads `data` from `{userId, data}`, but the gateway sends the DTO flat. `data.studentId` throws on every valid request. The 403, 404 and 409 branches (`EXERCISE_SUBMIT_NOT_ALLOWED`, `USER_NOT_FOUND`, `EXERCISE_ALREADY_SUBMITTED`) cannot be reached until this is fixed.
- **Request example:**
```json
{"tutorId":"b7e1c2d4-3f5a-4e6b-9c8d-1a2b3c4d5e6f","studentId":"d4c3b2a1-9f8e-4d7c-8b6a-5f4e3d2c1b0a","sessionId":"c3d4e5f6-0a1b-4c2d-9e8f-7a6b5c4d3e2f","lessonId":"2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","exerciseUrls":[{"name":"bai-lam.pdf","url":"https://cdn.example.com/files/bai-lam.pdf","key":"exercise/a0b1/bai-lam.pdf"}],"status":"SUBMITTED"}
```
- **Success response example** (not reachable today; `ExerciseDetailDto` from `repo.create`):
```json
{"statusCode":201,"message":"Thành công","data":{"id":"a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d","lessonId":"2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","sessionId":"c3d4e5f6-0a1b-4c2d-9e8f-7a6b5c4d3e2f","tutorId":"b7e1c2d4-3f5a-4e6b-9c8d-1a2b3c4d5e6f","studentId":"d4c3b2a1-9f8e-4d7c-8b6a-5f4e3d2c1b0a","issueUrls":[],"exerciseUrls":[{"name":"bai-lam.pdf","url":"https://cdn.example.com/files/bai-lam.pdf","key":"exercise/a0b1/bai-lam.pdf"}],"status":"SUBMITTED","score":null,"comment":null,"gradedAt":null,"createdAt":"2026-10-10T08:30:00.000Z","updatedAt":"2026-10-10T08:30:00.000Z"},"timestamp":"2026-10-10T08:30:00.000Z","method":"POST","path":"/exercises","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/exercises","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `422` E-ZOD, `tutorId` is `"abc"`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"tutorId","message":"tutorId must be uuid ...","code":"invalid_format"}],"path":"/exercises","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `500` valid body, payload mismatch: `{"success":false,"statusCode":500,"message":"Cannot read properties of undefined (reading 'studentId')","path":"/exercises","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `409` E-RPC, once the mismatch is fixed, a submission already exists for this student and session (`EXERCISE_ALREADY_SUBMITTED`): `{"success":false,"statusCode":409,"message":"Bài tập đã được nộp cho buổi học này","path":"/exercises","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/exercises","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

#### 60. GET /exercises
- **Source:** `features/exercise/exercise.controller.ts:61` (`getAll`)
- **Auth:** JWT + Redis session
- **Request:** query `page` default 1; `limit` 1–100 default 10; `sessionId`, `studentId`, `classId`, `tutorId` uuid optional
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `exercise.getAll` `{userId, ...query}` → TUTOR_SERVICE
- **Known mismatch:** the handler reads `query` from `{userId, query}`, but the gateway sends it flat. `ExerciseRepository.findAll` destructures `query` and throws for every valid request.
- **Request example:** `GET /exercises?page=1&limit=10&classId=5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f&studentId=d4c3b2a1-9f8e-4d7c-8b6a-5f4e3d2c1b0a`
- **Success response example** (not reachable today; shape from `ExerciseRepository.findAll`, which returns `data`, not `exercises`):
```json
{"statusCode":200,"message":"Thành công","data":{"data":[{"id":"a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d","lessonId":"2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","sessionId":"c3d4e5f6-0a1b-4c2d-9e8f-7a6b5c4d3e2f","tutorId":"b7e1c2d4-3f5a-4e6b-9c8d-1a2b3c4d5e6f","studentId":"d4c3b2a1-9f8e-4d7c-8b6a-5f4e3d2c1b0a","issueUrls":[],"exerciseUrls":[{"name":"bai-lam.pdf","url":"https://cdn.example.com/files/bai-lam.pdf","key":"exercise/a0b1/bai-lam.pdf"}],"status":"SUBMITTED","score":null,"comment":null,"gradedAt":null,"createdAt":"2026-10-10T08:30:00.000Z","updatedAt":"2026-10-10T08:30:00.000Z","session":{"id":"c3d4e5f6-0a1b-4c2d-9e8f-7a6b5c4d3e2f","sessionNumber":3,"classId":"5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f"},"class":{"id":"5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f","name":"Toán 12 - Ôn thi THPT","code":"TOAN12A"},"student":{"id":"d4c3b2a1-9f8e-4d7c-8b6a-5f4e3d2c1b0a","firstName":"Minh","lastName":"Trần Quang","userCode":"HS0042","avatar":null}}],"pagination":{"total":1,"page":1,"limit":10,"totalPages":1}},"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/exercises?page=1&limit=10&classId=5c9d8e7f-1a2b-4c3d-8e9f-0a1b2c3d4e5f&studentId=d4c3b2a1-9f8e-4d7c-8b6a-5f4e3d2c1b0a","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/exercises","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `422` E-ZOD, `classId=abc`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"classId","message":"Invalid UUID","code":"invalid_format"}],"path":"/exercises?classId=abc","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `500` every valid call, payload mismatch: `{"success":false,"statusCode":500,"message":"Cannot destructure property 'page' of 'query' as it is undefined.","path":"/exercises","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/exercises","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

#### 61. GET /exercises/:id
- **Source:** `features/exercise/exercise.controller.ts:74` (`getById`)
- **Auth:** JWT + Redis session
- **Request:** path `id` (no UUID pipe)
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `exercise.getById` `{userId, id}` → TUTOR_SERVICE
- **Request example:** `GET /exercises/a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d`
- **Success response example** (`ExerciseDetailDto`; `score` is a number, or null when ungraded):
```json
{"statusCode":200,"message":"Thành công","data":{"id":"a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d","lessonId":"2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","sessionId":"c3d4e5f6-0a1b-4c2d-9e8f-7a6b5c4d3e2f","tutorId":"b7e1c2d4-3f5a-4e6b-9c8d-1a2b3c4d5e6f","studentId":"d4c3b2a1-9f8e-4d7c-8b6a-5f4e3d2c1b0a","issueUrls":[],"exerciseUrls":[{"name":"bai-lam.pdf","url":"https://cdn.example.com/files/bai-lam.pdf","key":"exercise/a0b1/bai-lam.pdf"}],"status":"SUBMITTED","score":null,"comment":null,"gradedAt":null,"createdAt":"2026-10-10T08:30:00.000Z","updatedAt":"2026-10-10T08:30:00.000Z"},"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/exercises/a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/exercises/a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `400` E-RPC, `id` is `abc` (`ID_MUST_BE_UUID` with label): `{"success":false,"statusCode":400,"message":"ID phải là UUID: Exercise Id","path":"/exercises/abc","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `404` E-RPC, no exercise, or the caller is neither the tutor nor the student (`EXERCISE_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Không tìm thấy bài tập","path":"/exercises/a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/exercises/a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

#### 62. PATCH /exercises/:id/submit
- **Source:** `features/exercise/exercise.controller.ts:83` (`submit`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; body `SubmitExerciseDto` (`submitExerciseSchema`): `exerciseUrls` array of `{name, url, key}` min 1 required
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `exercise.submit` `{userId, id, data}` → TUTOR_SERVICE
- **Request example:**
```json
{"exerciseUrls":[{"name":"bai-lam-v2.pdf","url":"https://cdn.example.com/files/bai-lam-v2.pdf","key":"exercise/a0b1/bai-lam-v2.pdf"}]}
```
- **Success response example** (`ExerciseDetailDto` after the update; status is reset to SUBMITTED):
```json
{"statusCode":200,"message":"Thành công","data":{"id":"a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d","lessonId":"2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","sessionId":"c3d4e5f6-0a1b-4c2d-9e8f-7a6b5c4d3e2f","tutorId":"b7e1c2d4-3f5a-4e6b-9c8d-1a2b3c4d5e6f","studentId":"d4c3b2a1-9f8e-4d7c-8b6a-5f4e3d2c1b0a","issueUrls":[],"exerciseUrls":[{"name":"bai-lam-v2.pdf","url":"https://cdn.example.com/files/bai-lam-v2.pdf","key":"exercise/a0b1/bai-lam-v2.pdf"}],"status":"SUBMITTED","score":null,"comment":null,"gradedAt":null,"createdAt":"2026-10-10T08:30:00.000Z","updatedAt":"2026-10-10T08:40:00.000Z"},"timestamp":"2026-10-10T08:40:00.000Z","method":"PATCH","path":"/exercises/a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d/submit","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/exercises/a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d/submit","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `422` E-ZOD, `exerciseUrls` is `[]`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"exerciseUrls","message":"Cần ít nhất một tệp bài làm","code":"too_small"}],"path":"/exercises/a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d/submit","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `403` E-RPC, caller is not the student on the row (`EXERCISE_RE_SUBMIT_NOT_ALLOWED`): `{"success":false,"statusCode":403,"message":"Bạn chỉ có thể nộp lại bài tập của chính mình","path":"/exercises/a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d/submit","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `400` E-RPC, exercise already graded (`EXERCISE_ALREADY_GRADED`): `{"success":false,"statusCode":400,"message":"Bài tập đã được chấm — không thể nộp lại","path":"/exercises/a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d/submit","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/exercises/a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d/submit","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`

#### 63. PATCH /exercises/:id/grade
- **Source:** `features/exercise/exercise.controller.ts:97` (`grade`)
- **Auth:** JWT + Redis session (no role check; any authenticated user can call it)
- **Request:** path `id`; body `GradeExerciseDto` (`gradeExerciseSchema`): `score` number 0–10 required (coerced); `comment` string ≤2000 optional nullable
- **Success:** 200; data = TUTOR_SERVICE reply
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `exercise.grade` `{userId, id, data}` → TUTOR_SERVICE
- **Notes:** the gateway does not check the role, but `ExerciseService.gradeExerciseService` allows only the row's `tutorId` (403 otherwise).
- **Request example:**
```json
{"score":8.5,"comment":"Làm đúng phần lớn, cần trình bày rõ bước 3."}
```
- **Success response example** (`ExerciseDetailDto` after grading; `score` is returned as a number):
```json
{"statusCode":200,"message":"Thành công","data":{"id":"a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d","lessonId":"2f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918","sessionId":"c3d4e5f6-0a1b-4c2d-9e8f-7a6b5c4d3e2f","tutorId":"b7e1c2d4-3f5a-4e6b-9c8d-1a2b3c4d5e6f","studentId":"d4c3b2a1-9f8e-4d7c-8b6a-5f4e3d2c1b0a","issueUrls":[],"exerciseUrls":[{"name":"bai-lam-v2.pdf","url":"https://cdn.example.com/files/bai-lam-v2.pdf","key":"exercise/a0b1/bai-lam-v2.pdf"}],"status":"GRADED","score":8.5,"comment":"Làm đúng phần lớn, cần trình bày rõ bước 3.","gradedAt":"2026-10-10T08:45:00.000Z","createdAt":"2026-10-10T08:30:00.000Z","updatedAt":"2026-10-10T08:45:00.000Z"},"timestamp":"2026-10-10T08:45:00.000Z","method":"PATCH","path":"/exercises/a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d/grade","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35"}
```
- **Error response examples:**
  - `401` E-AUTH: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/exercises/a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d/grade","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `422` E-ZOD, `score` is `11`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"score","message":"Điểm tối đa là 10","code":"too_big"}],"path":"/exercises/a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d/grade","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `403` E-RPC, caller is not the assigned tutor (`EXERCISE_GRADE_NOT_ALLOWED`): `{"success":false,"statusCode":403,"message":"Chỉ gia sư phụ trách mới được chấm bài tập này","path":"/exercises/a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d/grade","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `404` E-RPC, no exercise with that id (`EXERCISE_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Không tìm thấy bài tập","path":"/exercises/a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d/grade","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","serviceName":"tutor-service","timestamp":"2026-10-10T08:31:00.000Z"}`
  - `504` RMQ timeout: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/exercises/a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d/grade","correlationId":"7f3c9a2e-5b1d-4e8f-a6c0-2d9b4e7a1f35","timestamp":"2026-10-10T08:31:00.000Z"}`
