## Notifications (`/notifications`)

> Shared examples for this range. Envelope fields per the global section: `trace` is omitted from the 5xx examples below (present outside production). **500 (broker down):** `{"success":false,"statusCode":500,"message":"{\"err\":{},\"url\":\"amqp://...\"}","path":"<path>","correlationId":"...","timestamp":"..."}`, the stringified connection error from `toRpcErrorPayload`. It is only listed per route where a distinct 500 exists.
> Default message language is `vi` (`DEFAULT_LANGUAGE`); the `en` text is given in parentheses. `correlationId` in examples is `b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e`, `timestamp` is `2026-10-10T08:15:30.123Z`.

#### 64. POST /notifications
- **Source:** `features/notification/notification.controller.ts:52` (`create`)
- **Auth:** JWT + Redis session (no role check)
- **Request:** body `CreateNotificationDto` (`createNotificationSchema`): `type` SYSTEM|TUITION|STUDENT|TUTOR required; `title` string 1–255 required; `content` string required; `subContent` ≤255 optional; `senderId`, `userId`, `classId`, `studentId` uuid optional nullable; `redirectUrl` ≤500 optional; `actionLabel` ≤100 optional; `actionType` VIEW|CONTACT|PAYMENT|UPDATE optional; `metadata` record optional
- **Request example:**
  ```json
  {"type":"TUITION","title":"Tuition reminder","content":"October tuition is due on 15/10/2026.","subContent":"Math 10A","senderId":"9b1e2c4a-3f7d-4a5b-8c6e-1d2f3a4b5c6d","userId":"4d5e6f70-1234-4abc-9def-0123456789ab","classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","actionLabel":"Pay now","actionType":"PAYMENT","redirectUrl":"/tuitions","metadata":{"amount":1500000}}
  ```
- **Success:** 201; data = THIRD_SERVICE reply
- **Success response example** (handler `NotificationRpcController.create` returns `repo.create` `.returning()` row, all `notifications` columns):
  ```json
  {"statusCode":201,"message":"SUCCESS","data":{"id":"7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d","userId":"4d5e6f70-1234-4abc-9def-0123456789ab","senderId":"9b1e2c4a-3f7d-4a5b-8c6e-1d2f3a4b5c6d","classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","studentId":null,"type":"TUITION","title":"Tuition reminder","content":"October tuition is due on 15/10/2026.","subContent":"Math 10A","redirectUrl":"/tuitions","actionLabel":"Pay now","actionType":"PAYMENT","isRead":false,"readAt":null,"metadata":{"amount":1500000},"createdAt":"2026-10-10T08:15:30.123Z","updatedAt":"2026-10-10T08:15:30.123Z"},"timestamp":"2026-10-10T08:15:30.123Z","method":"POST","path":"/notifications","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Error response examples:**
  - `401` missing/invalid Bearer: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/notifications","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `422` body without `title`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ" (en: "Validation failed"),"errors":[{"field":"title","message":"Title is required","code":"invalid_type"}],"path":"/notifications","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `400` no `senderId` in body (THIRD_SERVICE checks `senderId`, not `userId`, and the gateway schema makes it optional): `{"success":false,"statusCode":400,"message":"userId không hợp lệ" (en: "userId is not valid"),"path":"/notifications","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"third-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `504` THIRD_SERVICE no reply in 3×10 s: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/notifications","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
- **Downstream:** RMQ `notification.create` `{userId: caller, ...dto}` → THIRD_SERVICE. If the body has no `userId`, the caller becomes the recipient. A body `userId: null` overrides that and stores no recipient.
- **Status:** works only when `senderId` is supplied (see the 400 above); the gateway schema does not require it.

#### 65. GET /notifications
- **Source:** `features/notification/notification.controller.ts:69` (`getAll`)
- **Auth:** JWT + Redis session
- **Request:** query `page` default 1; `limit` 1–100 default 10; `search` trimmed optional; `type` optional (same enum as #64); `isRead` `z.coerce.boolean()` optional (any non-empty string coerces to true, so `isRead=false` is read as true)
- **Request example:** `?page=1&limit=20&type=TUITION&isRead=true&search=tuition`
- **Success:** 200; data = THIRD_SERVICE reply
- **Success response example** (handler `findAll` returns `{data, pagination}`, `createdAt` as ISO string):
  ```json
  {"statusCode":200,"message":"SUCCESS","data":{"data":[{"id":"7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d","userId":"4d5e6f70-1234-4abc-9def-0123456789ab","senderId":"9b1e2c4a-3f7d-4a5b-8c6e-1d2f3a4b5c6d","classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","studentId":null,"type":"TUITION","title":"Tuition reminder","content":"October tuition is due on 15/10/2026.","subContent":"Math 10A","redirectUrl":"/tuitions","actionLabel":"Pay now","actionType":"PAYMENT","isRead":true,"readAt":"2026-10-09T20:02:11.000Z","metadata":{"amount":1500000},"createdAt":"2026-10-08T07:00:00.000Z","updatedAt":"2026-10-09T20:02:11.000Z"}],"pagination":{"total":1,"page":1,"limit":20,"totalPages":1}},"timestamp":"2026-10-10T08:15:30.123Z","method":"GET","path":"/notifications?page=1&limit=20&type=TUITION&isRead=true&search=tuition","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/notifications","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `422` `?limit=500`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"limit","message":"Too big: expected number to be <=100","code":"too_big"}],"path":"/notifications?limit=500","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}` (zod v4 default text)
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/notifications","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
- **Downstream:** RMQ `notification.getAll` `{userId, ...query}` → THIRD_SERVICE

#### 66. PATCH /notifications/read-all
- **Source:** `features/notification/notification.controller.ts:81` (`markAllAsRead`)
- **Auth:** JWT + Redis session
- **Request:** none
- **Success:** 200; data = THIRD_SERVICE reply
- **Success response example** (handler returns the raw drizzle postgres-js `update` result without `.returning()`; **inferred**: it serializes to an empty array, the row count is not returned):
  ```json
  {"statusCode":200,"message":"SUCCESS","data":[],"timestamp":"2026-10-10T08:15:30.123Z","method":"PATCH","path":"/notifications/read-all","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/notifications/read-all","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/notifications/read-all","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
- **Downstream:** RMQ `notification.markAllAsRead` `{userId}` → THIRD_SERVICE

#### 67. GET /notifications/:id
- **Source:** `features/notification/notification.controller.ts:90` (`getById`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; the caller id is not sent, so ownership is not checked here
- **Request example:** `/notifications/7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d`
- **Success:** 200; data = THIRD_SERVICE reply
- **Success response example** (handler `findById` returns the `notifications` row or throws 404):
  ```json
  {"statusCode":200,"message":"SUCCESS","data":{"id":"7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d","userId":"4d5e6f70-1234-4abc-9def-0123456789ab","senderId":"9b1e2c4a-3f7d-4a5b-8c6e-1d2f3a4b5c6d","classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","studentId":null,"type":"TUITION","title":"Tuition reminder","content":"October tuition is due on 15/10/2026.","subContent":"Math 10A","redirectUrl":"/tuitions","actionLabel":"Pay now","actionType":"PAYMENT","isRead":false,"readAt":null,"metadata":{"amount":1500000},"createdAt":"2026-10-08T07:00:00.000Z","updatedAt":"2026-10-08T07:00:00.000Z"},"timestamp":"2026-10-10T08:15:30.123Z","method":"GET","path":"/notifications/7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/notifications/7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `404` id not found (`NOTIFICATION_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Không tìm thấy thông báo" (en: "Notification not found"),"path":"/notifications/7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"third-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/notifications/7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
- **Downstream:** RMQ `notification.getById` `{id}` → THIRD_SERVICE

#### 68. PATCH /notifications/:id/read
- **Source:** `features/notification/notification.controller.ts:99` (`markAsRead`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; no ownership check at the gateway
- **Request example:** `/notifications/7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d/read` (no body)
- **Success:** 200; data = THIRD_SERVICE reply
- **Success response example** (handler `markAsRead` returns the updated row; `readAt` stays null because the repository sets only `isRead`):
  ```json
  {"statusCode":200,"message":"SUCCESS","data":{"id":"7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d","userId":"4d5e6f70-1234-4abc-9def-0123456789ab","senderId":"9b1e2c4a-3f7d-4a5b-8c6e-1d2f3a4b5c6d","classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","studentId":null,"type":"TUITION","title":"Tuition reminder","content":"October tuition is due on 15/10/2026.","subContent":"Math 10A","redirectUrl":"/tuitions","actionLabel":"Pay now","actionType":"PAYMENT","isRead":true,"readAt":null,"metadata":{"amount":1500000},"createdAt":"2026-10-08T07:00:00.000Z","updatedAt":"2026-10-10T08:15:30.123Z"},"timestamp":"2026-10-10T08:15:30.123Z","method":"PATCH","path":"/notifications/7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d/read","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/notifications/7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d/read","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `404` id not found: `{"success":false,"statusCode":404,"message":"Không tìm thấy thông báo" (en: "Notification not found"),"path":"/notifications/7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d/read","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"third-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/notifications/7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d/read","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
- **Downstream:** RMQ `notification.markAsRead` `{id}` → THIRD_SERVICE

#### 69. DELETE /notifications/:id
- **Source:** `features/notification/notification.controller.ts:108` (`delete`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; no ownership check at the gateway
- **Request example:** `/notifications/7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d` (no body)
- **Success:** 200; data = THIRD_SERVICE reply
- **Success response example** (handler `delete` returns `{id}`):
  ```json
  {"statusCode":200,"message":"SUCCESS","data":{"id":"7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d"},"timestamp":"2026-10-10T08:15:30.123Z","method":"DELETE","path":"/notifications/7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/notifications/7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `404` id not found: `{"success":false,"statusCode":404,"message":"Không tìm thấy thông báo" (en: "Notification not found"),"path":"/notifications/7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"third-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/notifications/7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
- **Downstream:** RMQ `notification.delete` `{id}` → THIRD_SERVICE

## Schedules (`/schedules`)

> Status for this section: **POST /schedules, POST /schedules/bulk, GET /schedules, PATCH /schedules/:id and the session equivalents (#77, #78, #79, #82) always fail.** The gateway sends `{userId, ...dto}` (or `{userId, ...query}`) but the TUTOR_SERVICE handlers read `payload.data` / `payload.query`. The handler gets `undefined`, and the first property access throws. The 500 messages below are the V8 messages for those accesses.

#### 70. POST /schedules
- **Source:** `features/schedule/schedule.controller.ts:42` (`create`)
- **Auth:** JWT + Redis session
- **Request:** body `CreateScheduleDto` (`createScheduleSchema`): `classId` uuid required; `dayOfWeek` MONDAY…SUNDAY required; `startTime` and `endTime` `HH:mm` strings required; `format` ONLINE|OFFLINE default ONLINE; `location` optional
- **Request example:**
  ```json
  {"classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","dayOfWeek":"MONDAY","startTime":"18:00","endTime":"19:30","format":"OFFLINE","location":"Room 3B"}
  ```
- **Success:** 201; data = TUTOR_SERVICE reply
- **Success response example:** unreachable (handler throws before the insert). If it returned, the value would be the `schedules` row (**inferred from table columns**):
  ```json
  {"statusCode":201,"message":"SUCCESS","data":{"id":"5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c","classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","dayOfWeek":"MONDAY","startTime":"18:00","endTime":"19:30","format":"OFFLINE","location":"Room 3B","createdAt":"2026-10-10T08:15:30.123Z","updatedAt":"2026-10-10T08:15:30.123Z"},"timestamp":"2026-10-10T08:15:30.123Z","method":"POST","path":"/schedules","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/schedules","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `422` `startTime` = `6pm`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"startTime","message":"Invalid time format (HH:mm)","code":"invalid_format"}],"path":"/schedules","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `500` always (handler reads `payload.data.classId` on `undefined`): `{"success":false,"statusCode":500,"message":"Cannot read properties of undefined (reading 'classId')","path":"/schedules","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/schedules","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
- **Downstream:** RMQ `schedule.create` `{userId, ...dto}` → TUTOR_SERVICE. Handler expects `{userId, data}` (`schedule.rpc.controller.ts`), so it fails.
- **Status:** broken (always 500, see above).

#### 71. POST /schedules/bulk
- **Source:** `features/schedule/schedule.controller.ts:54` (`createBulk`)
- **Auth:** JWT + Redis session
- **Request:** body `CreateSchedulesDto` (`createSchedulesSchema`): `classId` uuid required; `schedules` array of 1–7 items, each with `dayOfWeek`, `startTime`, `endTime`, `format` (default ONLINE), `location` optional
- **Request example:**
  ```json
  {"classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","schedules":[{"dayOfWeek":"TUESDAY","startTime":"18:00","endTime":"19:30","format":"ONLINE"},{"dayOfWeek":"THURSDAY","startTime":"18:00","endTime":"19:30","format":"OFFLINE","location":"Room 3B"}]}
  ```
- **Success:** 201; data = TUTOR_SERVICE reply
- **Success response example:** unreachable. If it returned, `repo.createMany` gives an array of `schedules` rows (**inferred**):
  ```json
  {"statusCode":201,"message":"SUCCESS","data":[{"id":"5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c","classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","dayOfWeek":"TUESDAY","startTime":"18:00","endTime":"19:30","format":"ONLINE","location":null,"createdAt":"2026-10-10T08:15:30.123Z","updatedAt":"2026-10-10T08:15:30.123Z"}],"timestamp":"2026-10-10T08:15:30.123Z","method":"POST","path":"/schedules/bulk","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/schedules/bulk","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `422` `schedules: []`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"schedules","message":"At least 1 schedule is required","code":"too_small"}],"path":"/schedules/bulk","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `500` always: `{"success":false,"statusCode":500,"message":"Cannot read properties of undefined (reading 'classId')","path":"/schedules/bulk","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/schedules/bulk","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
- **Downstream:** RMQ `schedule.createBulk` `{userId, ...dto}` → TUTOR_SERVICE. Handler expects `data`, so it fails.
- **Status:** broken (always 500).

#### 72. GET /schedules
- **Source:** `features/schedule/schedule.controller.ts:73` (`getAll`)
- **Auth:** JWT + Redis session
- **Request:** query `page` default 1; `limit` 1–100 default 10; `search` optional; `classId` uuid optional
- **Request example:** `?page=1&limit=10&classId=c1a2b3d4-e5f6-4789-8abc-def012345678`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Success response example:** unreachable. If `query` were passed, the handler returns `{schedules, pagination}` where each row is a `schedules` row plus `class` (**inferred from repository**):
  ```json
  {"statusCode":200,"message":"SUCCESS","data":{"schedules":[{"id":"5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c","classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","dayOfWeek":"MONDAY","startTime":"18:00","endTime":"19:30","format":"OFFLINE","location":"Room 3B","createdAt":"2026-10-10T08:15:30.123Z","updatedAt":"2026-10-10T08:15:30.123Z","class":{"id":"c1a2b3d4-e5f6-4789-8abc-def012345678","name":"Math 10A","code":"MATH10A","subject":"Math"}}],"pagination":{"total":1,"page":1,"limit":10,"totalPages":1}},"timestamp":"2026-10-10T08:15:30.123Z","method":"GET","path":"/schedules?page=1&limit=10","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/schedules","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `422` `?limit=0`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"limit","message":"Too small: expected number to be >=1","code":"too_small"}],"path":"/schedules?limit=0","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}` (zod v4 default text)
  - `500` always (handler destructures `undefined`): `{"success":false,"statusCode":500,"message":"Cannot destructure property 'page' of 'query' as it is undefined.","path":"/schedules","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/schedules","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
- **Downstream:** RMQ `schedule.getAll` `{userId, ...query}` → TUTOR_SERVICE. Handler expects `query`, so it fails.
- **Status:** broken (always 500).

#### 73. GET /schedules/class/:classId
- **Source:** `features/schedule/schedule.controller.ts:86` (`getByClass`)
- **Auth:** JWT + Redis session
- **Request:** path `classId` (no UUID pipe; the handler validates it)
- **Request example:** `/schedules/class/c1a2b3d4-e5f6-4789-8abc-def012345678`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Success response example** (handler `getByClass` returns an array of `schedules` rows ordered by day and start time; only the class owner passes `assertClassOwner`):
  ```json
  {"statusCode":200,"message":"SUCCESS","data":[{"id":"5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c","classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","dayOfWeek":"MONDAY","startTime":"18:00","endTime":"19:30","format":"OFFLINE","location":"Room 3B","createdAt":"2026-10-10T08:15:30.123Z","updatedAt":"2026-10-10T08:15:30.123Z"}],"timestamp":"2026-10-10T08:15:30.123Z","method":"GET","path":"/schedules/class/c1a2b3d4-e5f6-4789-8abc-def012345678","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/schedules/class/c1a2b3d4-e5f6-4789-8abc-def012345678","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `400` non-UUID `classId` (`CLASS_ID_MUST_BE_UUID`): `{"success":false,"statusCode":400,"message":"ID lớp học phải là UUID" (en: "Class Id must be uuid"),"path":"/schedules/class/abc","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `404` caller does not own the class (`CLASS_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Không tìm thấy lớp học" (en: "Class not found"),"path":"/schedules/class/c1a2b3d4-e5f6-4789-8abc-def012345678","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/schedules/class/c1a2b3d4-e5f6-4789-8abc-def012345678","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
- **Downstream:** RMQ `schedule.getByClass` `{userId, classId}` → TUTOR_SERVICE

#### 74. GET /schedules/:id
- **Source:** `features/schedule/schedule.controller.ts:95` (`getById`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Request example:** `/schedules/5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Success response example** (handler returns the `schedules` row after the owner check):
  ```json
  {"statusCode":200,"message":"SUCCESS","data":{"id":"5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c","classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","dayOfWeek":"MONDAY","startTime":"18:00","endTime":"19:30","format":"OFFLINE","location":"Room 3B","createdAt":"2026-10-10T08:15:30.123Z","updatedAt":"2026-10-10T08:15:30.123Z"},"timestamp":"2026-10-10T08:15:30.123Z","method":"GET","path":"/schedules/5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/schedules/5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `400` non-UUID id (`SCHEDULE_ID_MUST_BE_UUID`): `{"success":false,"statusCode":400,"message":"ID lịch học phải là UUID" (en: "Schedule Id must be uuid"),"path":"/schedules/abc","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `404` unknown id (`SCHEDULE_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Không tìm thấy lịch học" (en: "Schedule not found"),"path":"/schedules/5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/schedules/5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
- **Downstream:** RMQ `schedule.getById` `{userId, id}` → TUTOR_SERVICE

#### 75. PATCH /schedules/:id
- **Source:** `features/schedule/schedule.controller.ts:104` (`update`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; body `UpdateScheduleDto` (`createScheduleSchema.partial().omit({classId})`)
- **Request example:** `/schedules/5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c` with body `{"startTime":"19:00","endTime":"20:30","location":"Room 4A"}`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Success response example:** unreachable (see Status). If it returned, `repo.update` returns the updated `schedules` row (**inferred**):
  ```json
  {"statusCode":200,"message":"SUCCESS","data":{"id":"5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c","classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","dayOfWeek":"MONDAY","startTime":"19:00","endTime":"20:30","format":"OFFLINE","location":"Room 4A","createdAt":"2026-10-10T08:15:30.123Z","updatedAt":"2026-10-10T08:20:00.000Z"},"timestamp":"2026-10-10T08:20:00.000Z","method":"PATCH","path":"/schedules/5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/schedules/5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `422` `startTime` = `19h`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"startTime","message":"Invalid time format (HH:mm)","code":"invalid_format"}],"path":"/schedules/5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `404` unknown id (`SCHEDULE_NOT_FOUND`), reached before the broken write: `{"success":false,"statusCode":404,"message":"Không tìm thấy lịch học" (en: "Schedule not found"),"path":"/schedules/5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `500` for any existing schedule the caller owns: `{"success":false,"statusCode":500,"message":"Cannot read properties of undefined (reading 'dayOfWeek')","path":"/schedules/5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/schedules/5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
- **Downstream:** RMQ `schedule.update` `{userId, id, ...dto}` → TUTOR_SERVICE. Handler expects `data`, so it fails after the owner check.
- **Status:** broken (500 for every owned schedule).

#### 76. DELETE /schedules/:id
- **Source:** `features/schedule/schedule.controller.ts:118` (`del`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Request example:** `/schedules/5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c` (no body)
- **Success:** 200; data = TUTOR_SERVICE reply
- **Success response example** (handler `delScheduleService` returns `{id}`):
  ```json
  {"statusCode":200,"message":"SUCCESS","data":{"id":"5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c"},"timestamp":"2026-10-10T08:20:00.000Z","method":"DELETE","path":"/schedules/5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/schedules/5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:20:00.000Z"}`
  - `400` non-UUID id: `{"success":false,"statusCode":400,"message":"ID lịch học phải là UUID" (en: "Schedule Id must be uuid"),"path":"/schedules/abc","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:20:00.000Z"}`
  - `404` unknown id: `{"success":false,"statusCode":404,"message":"Không tìm thấy lịch học" (en: "Schedule not found"),"path":"/schedules/5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:20:00.000Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/schedules/5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:20:00.000Z"}`
- **Downstream:** RMQ `schedule.delete` `{userId, id}` → TUTOR_SERVICE

## Sessions (`/sessions`)

> Status for this section: **POST /sessions, POST /sessions/bulk, GET /sessions, PUT /sessions/:id always fail** for the same reason as Schedules (the handler reads `payload.data` / `payload.query`, which the gateway does not send). Read routes #80 and #81 work. Students and parents receive `exerciseUrls: []` on the detail route until the session is `COMPLETED`.

#### 77. POST /sessions
- **Source:** `features/session/session.controller.ts:42` (`create`)
- **Auth:** JWT + Redis session
- **Request:** body `CreateSessionDto` (`createSessionSchema`): `classId` uuid required; `sessionNumber` int ≥1 required; `startAt` and `endAt` dates required; `lessonId`, `tutorId` uuid optional nullable; `title` ≤255 optional; `description`, `location`, `note` optional; `theoryUrls` and `exerciseUrls` arrays of `{name, url (valid URL), key}` default []; `status` SCHEDULED|ONGOING|COMPLETED|CANCELLED|POSTPONED default SCHEDULED; `actualStartAt`, `actualEndAt`, `exerciseDueAt` dates optional nullable; `objectives` string[] default []; `agenda` array of `{time, title, description?}` default []
- **Request example:**
  ```json
  {"classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","sessionNumber":3,"title":"Quadratic equations","startAt":"2026-10-12T18:00:00+07:00","endAt":"2026-10-12T19:30:00+07:00","location":"Room 3B","theoryUrls":[{"name":"Slides W3","url":"https://example.com/slides-w3.pdf","key":"slides-w3"}],"exerciseUrls":[],"status":"SCHEDULED","objectives":["Solve ax^2+bx+c=0"],"agenda":[{"time":"18:00","title":"Warm-up"}]}
  ```
- **Success:** 201; data = TUTOR_SERVICE reply
- **Success response example:** unreachable (see Status). If it returned, the `class_sessions` row (**inferred from table columns**):
  ```json
  {"statusCode":201,"message":"SUCCESS","data":{"id":"2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b","classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","lessonId":null,"tutorId":"9b1e2c4a-3f7d-4a5b-8c6e-1d2f3a4b5c6d","title":"Quadratic equations","description":null,"sessionNumber":3,"lessionId":null,"theoryUrls":[{"name":"Slides W3","url":"https://example.com/slides-w3.pdf","key":"slides-w3"}],"exerciseUrls":[],"startAt":"2026-10-12T11:00:00.000Z","endAt":"2026-10-12T12:30:00.000Z","location":"Room 3B","status":"SCHEDULED","note":null,"actualStartAt":null,"actualEndAt":null,"objectives":["Solve ax^2+bx+c=0"],"agenda":[{"time":"18:00","title":"Warm-up"}],"exerciseDueAt":null,"createdAt":"2026-10-10T08:15:30.123Z","updatedAt":"2026-10-10T08:15:30.123Z"},"timestamp":"2026-10-10T08:15:30.123Z","method":"POST","path":"/sessions","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/sessions","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `422` `sessionNumber` = 0: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"sessionNumber","message":"Session number must be >= 1","code":"too_small"}],"path":"/sessions","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `500` always: `{"success":false,"statusCode":500,"message":"Cannot read properties of undefined (reading 'classId')","path":"/sessions","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/sessions","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
- **Downstream:** RMQ `session.create` `{userId, ...dto}` → TUTOR_SERVICE. Handler expects `data`, so it fails.
- **Status:** broken (always 500).

#### 78. POST /sessions/bulk
- **Source:** `features/session/session.controller.ts:54` (`createBulk`)
- **Auth:** JWT + Redis session
- **Request:** body `CreateSessionsDto` (`createSessionsSchema`): `classId` uuid required; `sessions` array of 1–50 items, each as #77 without `classId`
- **Request example:**
  ```json
  {"classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","sessions":[{"sessionNumber":4,"title":"Linear systems","startAt":"2026-10-14T18:00:00+07:00","endAt":"2026-10-14T19:30:00+07:00","location":"Room 3B"},{"sessionNumber":5,"title":"Review","startAt":"2026-10-16T18:00:00+07:00","endAt":"2026-10-16T19:30:00+07:00","status":"SCHEDULED"}]}
  ```
- **Success:** 201; data = TUTOR_SERVICE reply
- **Success response example:** unreachable. If it returned, `repo.createMany` gives an array of `class_sessions` rows (**inferred**):
  ```json
  {"statusCode":201,"message":"SUCCESS","data":[{"id":"2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6c","classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","sessionNumber":4,"title":"Linear systems","status":"SCHEDULED","startAt":"2026-10-14T11:00:00.000Z","endAt":"2026-10-14T12:30:00.000Z","location":"Room 3B","theoryUrls":[],"exerciseUrls":[],"objectives":[],"agenda":[],"createdAt":"2026-10-10T08:15:30.123Z","updatedAt":"2026-10-10T08:15:30.123Z"}],"timestamp":"2026-10-10T08:15:30.123Z","method":"POST","path":"/sessions/bulk","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/sessions/bulk","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `422` `sessions: []`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"sessions","message":"At least 1 session is required","code":"too_small"}],"path":"/sessions/bulk","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `500` always: `{"success":false,"statusCode":500,"message":"Cannot read properties of undefined (reading 'classId')","path":"/sessions/bulk","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/sessions/bulk","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
- **Downstream:** RMQ `session.createBulk` `{userId, ...dto}` → TUTOR_SERVICE. Handler expects `data`, so it fails.
- **Status:** broken (always 500).

#### 79. GET /sessions
- **Source:** `features/session/session.controller.ts:78` (`getAll`)
- **Auth:** JWT + Redis session
- **Request:** query `page` default 1; `limit` 1–100 default 10; `search` optional; `status` optional (enum as #77); `classId` uuid optional; `startDate`, `endDate` coerced dates optional
- **Request example:** `?page=1&limit=10&status=SCHEDULED&startDate=2026-10-01&endDate=2026-10-31`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Success response example:** unreachable. If `query` were passed, the handler returns `{sessions, pagination}` (**inferred from repository and gateExercises**):
  ```json
  {"statusCode":200,"message":"SUCCESS","data":{"sessions":[{"id":"2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b","classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","title":"Quadratic equations","sessionNumber":3,"status":"SCHEDULED","startAt":"2026-10-12T11:00:00.000Z","endAt":"2026-10-12T12:30:00.000Z","exerciseUrls":[],"class":{"id":"c1a2b3d4-e5f6-4789-8abc-def012345678","name":"Math 10A","code":"MATH10A","subject":"Math","tutorId":"9b1e2c4a-3f7d-4a5b-8c6e-1d2f3a4b5c6d"}}],"pagination":{"total":1,"page":1,"limit":10,"totalPages":1}},"timestamp":"2026-10-10T08:15:30.123Z","method":"GET","path":"/sessions?page=1&limit=10","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/sessions","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `422` `?status=DONE`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"status","message":"Invalid option: expected one of \"SCHEDULED\"|\"ONGOING\"|\"COMPLETED\"|\"CANCELLED\"|\"POSTPONED\"","code":"invalid_value"}],"path":"/sessions?status=DONE","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}` (zod v4 default text)
  - `500` always: `{"success":false,"statusCode":500,"message":"Cannot destructure property 'page' of 'query' as it is undefined.","path":"/sessions","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/sessions","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
- **Downstream:** RMQ `session.getAll` `{userId, ...query}` → TUTOR_SERVICE. Handler expects `query`, so it fails.
- **Status:** broken (always 500).

#### 80. GET /sessions/class/:classId
- **Source:** `features/session/session.controller.ts:91` (`getByClass`)
- **Auth:** JWT + Redis session
- **Request:** path `classId` (no UUID pipe; the handler validates it)
- **Request example:** `/sessions/class/c1a2b3d4-e5f6-4789-8abc-def012345678`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Success response example** (handler `getByClass` returns an array of `class_sessions` rows ordered by `sessionNumber`, then `startAt`; owner only):
  ```json
  {"statusCode":200,"message":"SUCCESS","data":[{"id":"2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b","classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","lessonId":null,"tutorId":"9b1e2c4a-3f7d-4a5b-8c6e-1d2f3a4b5c6d","title":"Quadratic equations","description":null,"sessionNumber":3,"lessionId":null,"theoryUrls":[],"exerciseUrls":[],"startAt":"2026-10-12T11:00:00.000Z","endAt":"2026-10-12T12:30:00.000Z","location":"Room 3B","status":"SCHEDULED","note":null,"actualStartAt":null,"actualEndAt":null,"objectives":[],"agenda":[],"exerciseDueAt":null,"createdAt":"2026-10-10T08:15:30.123Z","updatedAt":"2026-10-10T08:15:30.123Z"}],"timestamp":"2026-10-10T08:15:30.123Z","method":"GET","path":"/sessions/class/c1a2b3d4-e5f6-4789-8abc-def012345678","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/sessions/class/c1a2b3d4-e5f6-4789-8abc-def012345678","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `400` non-UUID `classId`: `{"success":false,"statusCode":400,"message":"ID lớp học phải là UUID" (en: "Class Id must be uuid"),"path":"/sessions/class/abc","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `404` caller does not own the class: `{"success":false,"statusCode":404,"message":"Không tìm thấy lớp học" (en: "Class not found"),"path":"/sessions/class/c1a2b3d4-e5f6-4789-8abc-def012345678","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/sessions/class/c1a2b3d4-e5f6-4789-8abc-def012345678","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
- **Downstream:** RMQ `session.getByClass` `{userId, classId}` → TUTOR_SERVICE

#### 81. GET /sessions/:id
- **Source:** `features/session/session.controller.ts:100` (`getById`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Request example:** `/sessions/2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Success response example** (handler `getDetailById` plus `gateExercises`; `lesson` is `null` when no lesson is linked):
  ```json
  {"statusCode":200,"message":"SUCCESS","data":{"id":"2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b","classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","lessonId":"a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d","tutorId":"9b1e2c4a-3f7d-4a5b-8c6e-1d2f3a4b5c6d","title":"Quadratic equations","description":null,"sessionNumber":3,"theoryUrls":[{"name":"Slides W3","url":"https://example.com/slides-w3.pdf","key":"slides-w3"}],"exerciseUrls":[{"name":"Worksheet 3","url":"https://example.com/ws3.pdf","key":"ws3"}],"startAt":"2026-10-12T11:00:00.000Z","endAt":"2026-10-12T12:30:00.000Z","location":"Room 3B","status":"COMPLETED","note":null,"actualStartAt":"2026-10-12T11:02:00.000Z","actualEndAt":"2026-10-12T12:28:00.000Z","objectives":["Solve ax^2+bx+c=0"],"agenda":[{"time":"18:00","title":"Warm-up"}],"exerciseDueAt":"2026-10-19T11:00:00.000Z","createdAt":"2026-10-10T08:15:30.123Z","updatedAt":"2026-10-12T12:30:00.000Z","class":{"id":"c1a2b3d4-e5f6-4789-8abc-def012345678","name":"Math 10A","code":"MATH10A","subject":"Math","curriculumId":"e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a8b","tutorId":"9b1e2c4a-3f7d-4a5b-8c6e-1d2f3a4b5c6d"},"lesson":{"id":"a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d","title":"Quadratic functions","chapterTitle":"Functions"}},"timestamp":"2026-10-10T08:15:30.123Z","method":"GET","path":"/sessions/2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
  Note: when the caller is a student or parent and the status is not `COMPLETED`, `exerciseUrls` is `[]`.
- **Errors:** E-AUTH; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/sessions/2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `400` non-UUID id (`SESSION_ID_MUST_BE_UUID`): `{"success":false,"statusCode":400,"message":"ID buổi học phải là UUID" (en: "Session Id must be uuid"),"path":"/sessions/abc","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `404` unknown id, or caller has no access (`SESSION_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Không tìm thấy buổi học" (en: "Session not found"),"path":"/sessions/2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/sessions/2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
- **Downstream:** RMQ `session.getById` `{userId, id}` → TUTOR_SERVICE

#### 82. PUT /sessions/:id
- **Source:** `features/session/session.controller.ts:109` (`update`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; body `UpdateSessionDto` (`updateSessionSchema`, all optional, no defaults; same fields as #77 without `classId`)
- **Request example:** `/sessions/2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b` with body `{"status":"COMPLETED","actualStartAt":"2026-10-12T11:02:00+07:00","actualEndAt":"2026-10-12T12:28:00+07:00","note":"Covered all exercises"}`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Success response example:** unreachable (see Status). If it returned, the updated `class_sessions` row (**inferred**). Shape as #77 with the new values.
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/sessions/2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `422` `status` = `DONE`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"status","message":"Invalid option: expected one of \"SCHEDULED\"|\"ONGOING\"|\"COMPLETED\"|\"CANCELLED\"|\"POSTPONED\"","code":"invalid_value"}],"path":"/sessions/2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}` (zod v4 default text)
  - `404` unknown id (`SESSION_NOT_FOUND`), reached before the broken write: `{"success":false,"statusCode":404,"message":"Không tìm thấy buổi học" (en: "Session not found"),"path":"/sessions/2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `500` for any owned session: `{"success":false,"statusCode":500,"message":"Cannot read properties of undefined (reading 'lessonId')","path":"/sessions/2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/sessions/2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
- **Downstream:** RMQ `session.update` `{userId, id, ...dto}` → TUTOR_SERVICE. Handler expects `data`, so it fails after the owner check.
- **Status:** broken (500 for every owned session).

#### 83. DELETE /sessions/:id
- **Source:** `features/session/session.controller.ts:123` (`del`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Request example:** `/sessions/2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b` (no body)
- **Success:** 200; data = TUTOR_SERVICE reply
- **Success response example** (handler `delSessionService` returns `{id}`):
  ```json
  {"statusCode":200,"message":"SUCCESS","data":{"id":"2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b"},"timestamp":"2026-10-10T08:20:00.000Z","method":"DELETE","path":"/sessions/2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/sessions/2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:20:00.000Z"}`
  - `400` non-UUID id: `{"success":false,"statusCode":400,"message":"ID buổi học phải là UUID" (en: "Session Id must be uuid"),"path":"/sessions/abc","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:20:00.000Z"}`
  - `404` unknown id: `{"success":false,"statusCode":404,"message":"Không tìm thấy buổi học" (en: "Session not found"),"path":"/sessions/2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:20:00.000Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/sessions/2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:20:00.000Z"}`
- **Downstream:** RMQ `session.delete` `{userId, id}` → TUTOR_SERVICE

## Students (`/students`)

> Status for this section: **GET /students/get-student-code and GET /students/:id always return 400.** The gateway sends `{}` or `{id}` to `user.getUserByField`, but the USER handler needs `{field, value}`. **POST /students** cannot succeed because the gateway schema has no `password`, and the gateway forwards the raw DTO (`studentName`) where USER expects `firstName`/`lastName`. **PUT /students/:id** returns 200, but `studentName`, `studentPhone`, `birthday`, `parent*` and `address`-style keys are not `users` columns and are dropped (**inferred from drizzle `set()` behaviour**). Only `gender`, `school`, `address`, `district`, `province` and `avatar` persist.

#### 84. GET /students/get-student-code
- **Source:** `features/student/student.controller.ts:42` (`generateStudentCodeController`)
- **Auth:** JWT + Redis session
- **Request:** none
- **Success:** 200; data = USER_SERVICE reply
- **Success response example:** unreachable (the handler throws `UNSUPPORTED_FIELD: undefined`). No success body is produced.
- **Errors:** E-AUTH; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/students/get-student-code","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:20:00.000Z"}`
  - `400` always (`field` is undefined): `{"success":false,"statusCode":400,"message":"Trường không được hỗ trợ: undefined" (en: "Unsupported field: undefined"),"path":"/students/get-student-code","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"user-service","timestamp":"2026-10-10T08:20:00.000Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/students/get-student-code","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:20:00.000Z"}`
- **Downstream:** RMQ `user.getUserByField` `{}` → USER_SERVICE. The route name suggests code generation, but it calls a field lookup with an empty payload (see Unclear).
- **Status:** broken (always 400).

#### 85. POST /students
- **Source:** `features/student/student.controller.ts:106` (`create`)
- **Auth:** JWT + Redis session (no role check)
- **Request:** body `CreateStudentDto` (`createStudentSchema`): `studentName` string 1–255 required; `email` email optional; `userCode` 1–50 optional; `gender` MALE|FEMALE|OTHER optional; `studentPhone` ≤20 optional; `school` ≤255 optional; `parentName` 1–255 optional; `parentRelationship` FATHER|MOTHER|GUARDIAN optional; `parentPhone` ≤20 optional; `parentEmail` email optional
- **Request example:**
  ```json
  {"studentName":"Tran Thi Bich","email":"bich.tran@example.com","gender":"FEMALE","studentPhone":"0987654321","school":"THPT Le Quy Don","parentName":"Tran Van Hung","parentRelationship":"FATHER","parentPhone":"0912345678","parentEmail":"hung.tran@example.com"}
  ```
- **Success:** 201; data = USER_SERVICE reply
- **Success response example:** unreachable in practice (see Status). If the password step succeeded, `createUserService` returns (**inferred from DTO and service**):
  ```json
  {"statusCode":201,"message":"SUCCESS","data":{"message":"User created successfully","data":{"email":"bich.tran@example.com","fullName":"Tran Thi Bich","password":"$2b$10$Qm4Xr...(bcrypt hash)"}},"timestamp":"2026-10-10T08:20:00.000Z","method":"POST","path":"/students","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
  Note: `password` here is the stored bcrypt hash, not a plaintext password. The service returns it to the caller.
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/students","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:20:00.000Z"}`
  - `422` `studentName` missing: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"studentName","message":"Student name must be required ...","code":"invalid_type"}],"path":"/students","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:20:00.000Z"}`
  - `400` `email` already registered (`EMAIL_EXISTS`): `{"success":false,"statusCode":400,"message":"Email đã tồn tại: bich.tran@example.com" (en: "Email already exists: bich.tran@example.com"),"path":"/students","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"user-service","timestamp":"2026-10-10T08:20:00.000Z"}`
  - `500` (**inferred**) when the email is free: the gateway sends no `password`, so `hashData(undefined)` rejects. The message is the native bcrypt error: `{"success":false,"statusCode":500,"message":"data and salt arguments required","path":"/students","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"user-service","timestamp":"2026-10-10T08:20:00.000Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/students","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:20:00.000Z"}`
- **Downstream:** RMQ `user.createUser` `{userId: caller, ...dto}` → USER_SERVICE
- **Status:** broken. `firstName`/`lastName` are never set, and no password is generated (see the 500 above).

#### 86. GET /students
- **Source:** `features/student/student.controller.ts:140` (`getAllStudents`)
- **Auth:** JWT + Redis session (no role check)
- **Request:** query `GetStudentsQueryDto` (`getStudentsQuerySchema`): `page` default 1; `limit` 1–100 default 10; `search` optional; `tutorId` uuid optional; `gender` optional; `isActive` `'true'|'false'` optional
- **Request example:** `?page=1&limit=10&search=Tran&gender=FEMALE&isActive=true`
- **Success:** 200; data = USER_SERVICE reply
- **Success response example** (handler `getUsersService`):
  ```json
  {"statusCode":200,"message":"SUCCESS","data":{"data":[{"id":"4d5e6f70-1234-4abc-9def-0123456789ab","email":"bich.tran@example.com","name":"Tran Thi Bich","role":"STUDENT","status":"active","createdAt":"2026-09-01T03:10:00.000Z"}],"pagination":{"page":1,"pageSize":10,"total":1,"totalPages":1}},"timestamp":"2026-10-10T08:20:00.000Z","method":"GET","path":"/students?page=1&limit=10&search=Tran&gender=FEMALE&isActive=true","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/students","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:20:00.000Z"}`
  - `422` `?isActive=yes`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"isActive","message":"Invalid option: expected one of \"true\"|\"false\"","code":"invalid_value"}],"path":"/students?isActive=yes","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:20:00.000Z"}` (zod v4 default text)
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/students","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:20:00.000Z"}`
- **Downstream:** RMQ `user.getUsers` `{...query}` → USER_SERVICE (no role filter sent)

#### 87. GET /students/:id
- **Source:** `features/student/student.controller.ts:212` (`findById`)
- **Auth:** JWT + Redis session (no role check)
- **Request:** path `id`
- **Request example:** `/students/4d5e6f70-1234-4abc-9def-0123456789ab`
- **Success:** 200; data = user record
- **Success response example:** unreachable (see Status). If it worked, `getUserByField` returns an **array** of full `users` rows, password hash included (**traced**). It would not be a single object:
  ```json
  {"statusCode":200,"message":"SUCCESS","data":[{"id":"4d5e6f70-1234-4abc-9def-0123456789ab","email":"bich.tran@example.com","username":"bichtran","firstName":"Thi","lastName":"Tran","password":"$2b$10$Qm4Xr...(bcrypt hash)","role":"STUDENT"}],"timestamp":"2026-10-10T08:20:00.000Z","method":"GET","path":"/students/4d5e6f70-1234-4abc-9def-0123456789ab","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/students/4d5e6f70-1234-4abc-9def-0123456789ab","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:20:00.000Z"}`
  - `400` always (`field` is undefined, the gateway sends `{id}`): `{"success":false,"statusCode":400,"message":"Trường không được hỗ trợ: undefined" (en: "Unsupported field: undefined"),"path":"/students/4d5e6f70-1234-4abc-9def-0123456789ab","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"user-service","timestamp":"2026-10-10T08:20:00.000Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/students/4d5e6f70-1234-4abc-9def-0123456789ab","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:20:00.000Z"}`
- **Downstream:** RMQ `user.getUserByField` `{id}` → USER_SERVICE
- **Status:** broken (always 400).

#### 88. PUT /students/:id
- **Source:** `features/student/student.controller.ts:252` (`update`)
- **Auth:** JWT + Redis session (no role check, no ownership check)
- **Request:** path `id`; body `UpdateStudentDto` (`updateStudentSchema`, non-strict, unknown keys dropped): `studentName`, `studentPhone`, `gender`, `birthday` (coerced date), `school`, `address` ≤500, `district`/`province` ≤30, `parentName`, `parentPhone`, `parentEmail`, `parentRelationship`, `parentAddress` ≤500, `parentDistrict`/`parentProvince` ≤30, `avatar` URL nullable; all optional
- **Request example:** `/students/4d5e6f70-1234-4abc-9def-0123456789ab` with body `{"gender":"FEMALE","school":"THPT Le Quy Don","address":"12 Nguyen Trai","district":"Quan 1","province":"TP HCM","avatar":"https://cdn.example.com/avatars/bich.png"}`. Body keys that are not `users` columns (for example `studentName`) are accepted by the gateway but dropped by USER (see Status).
- **Success:** 200; data = USER_SERVICE reply
- **Success response example** (handler `updateOwnProfileService` then `repo.update` `.returning()`; the **full row, including the password hash**):
  ```json
  {"statusCode":200,"message":"SUCCESS","data":{"id":"4d5e6f70-1234-4abc-9def-0123456789ab","email":"bich.tran@example.com","username":"bichtran","firstName":"Thi","lastName":"Tran","password":"$2b$10$Qm4Xr...(bcrypt hash)","avatar":"https://cdn.example.com/avatars/bich.png","phone":"0987654321","isActive":true,"role":"STUDENT","description":null,"userCode":null,"gender":"FEMALE","dateOfBirth":null,"address":"12 Nguyen Trai","district":"Quan 1","province":"TP HCM","subjects":null,"facebookId":null,"googleId":null,"school":"THPT Le Quy Don","relationship":null,"gradesId":[],"parentId":null,"tutorId":"9b1e2c4a-3f7d-4a5b-8c6e-1d2f3a4b5c6d","createdAt":"2026-09-01T03:10:00.000Z","updatedAt":"2026-10-10T08:20:00.000Z"},"timestamp":"2026-10-10T08:20:00.000Z","method":"PUT","path":"/students/4d5e6f70-1234-4abc-9def-0123456789ab","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
  Security note: the response exposes the stored bcrypt hash. `getDetailUserService` strips `password`; this path does not.
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/students/4d5e6f70-1234-4abc-9def-0123456789ab","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:20:00.000Z"}`
  - `422` `avatar` not a URL: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"avatar","message":"Invalid URL","code":"invalid_format"}],"path":"/students/4d5e6f70-1234-4abc-9def-0123456789ab","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:20:00.000Z"}` (zod v4 default text)
  - `400` non-UUID path id (`USER_ID_MUST_BE_UUID`): `{"success":false,"statusCode":400,"message":"ID người dùng phải là UUID" (en: "User Id must be uuid"),"path":"/students/abc","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"user-service","timestamp":"2026-10-10T08:20:00.000Z"}`
  - `400` unknown user id (`USER_NOT_FOUND`): `{"success":false,"statusCode":400,"message":"Không tìm thấy người dùng" (en: "User not found"),"path":"/students/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"user-service","timestamp":"2026-10-10T08:20:00.000Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/students/4d5e6f70-1234-4abc-9def-0123456789ab","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:20:00.000Z"}`
- **Downstream:** RMQ `user.updateUser` `{userId: <path id>, ...dto}` → USER_SERVICE. The path id is sent in the `userId` slot, which elsewhere means the caller.

#### 89. DELETE /students/:id
- **Source:** `features/student/student.controller.ts:265` (`delete`)
- **Auth:** JWT + Redis session (no role check)
- **Request:** path `id`
- **Request example:** `/students/4d5e6f70-1234-4abc-9def-0123456789ab` (no body)
- **Success:** 200; data = USER_SERVICE reply
- **Success response example** (handler `deleteUserByAdminService` returns `{id}`):
  ```json
  {"statusCode":200,"message":"SUCCESS","data":{"id":"4d5e6f70-1234-4abc-9def-0123456789ab"},"timestamp":"2026-10-10T08:20:00.000Z","method":"DELETE","path":"/students/4d5e6f70-1234-4abc-9def-0123456789ab","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/students/4d5e6f70-1234-4abc-9def-0123456789ab","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:20:00.000Z"}`
  - `400` non-UUID id: `{"success":false,"statusCode":400,"message":"ID người dùng phải là UUID" (en: "User Id must be uuid"),"path":"/students/abc","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"user-service","timestamp":"2026-10-10T08:20:00.000Z"}`
  - `400` unknown id (`USER_NOT_FOUND`): `{"success":false,"statusCode":400,"message":"Không tìm thấy người dùng" (en: "User not found"),"path":"/students/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"user-service","timestamp":"2026-10-10T08:20:00.000Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/students/4d5e6f70-1234-4abc-9def-0123456789ab","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:20:00.000Z"}`
- **Downstream:** RMQ `user.deleteUserByAdmin` `{id}` → USER_SERVICE

## Tuitions (`/tuitions`)

> Status for this section: **GET /tuitions, GET /tuitions/summary and GET /tuitions/:id always return 400.** The gateway sends `{query}`, `{classId}` and `{id}` with no `userId`, and the TUTOR_SERVICE handlers check `userId` first. Create, update and delete work.

#### 90. POST /tuitions
- **Source:** `features/tuition/tuition.controller.ts:40` (`create`)
- **Auth:** JWT + Redis session
- **Request:** body `CreateTuitionDto` (`createTuitionSchema`): `classId` uuid required; `studentId` uuid required; `amount` number ≥0 required; `dueDate`, `paidDate` dates optional; `status` PAID|UNPAID|OVERDUE default UNPAID; `note` optional
- **Request example:**
  ```json
  {"classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","studentId":"4d5e6f70-1234-4abc-9def-0123456789ab","amount":1500000,"dueDate":"2026-10-15","status":"UNPAID","note":"October tuition"}
  ```
- **Success:** 201; data = TUTOR_SERVICE reply
- **Success response example** (handler `create` returns `findById` serialized row; `amount` is a numeric string):
  ```json
  {"statusCode":201,"message":"SUCCESS","data":{"id":"8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f","classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","studentId":"4d5e6f70-1234-4abc-9def-0123456789ab","amount":"1500000.00","dueDate":"2026-10-15T00:00:00.000Z","paidDate":null,"status":"UNPAID","note":"October tuition","createdAt":"2026-10-10T08:15:30.123Z","updatedAt":"2026-10-10T08:15:30.123Z","class":{"id":"c1a2b3d4-e5f6-4789-8abc-def012345678","name":"Math 10A","code":"MATH10A"},"student":{"id":"4d5e6f70-1234-4abc-9def-0123456789ab","firstName":"Thi","lastName":"Tran","userCode":null,"phone":"0987654321","avatar":null}},"timestamp":"2026-10-10T08:15:30.123Z","method":"POST","path":"/tuitions","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/tuitions","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `422` `amount` = -5: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"amount","message":"Amount must be positive","code":"too_small"}],"path":"/tuitions","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `404` caller is not the class tutor (`CLASS_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Không tìm thấy lớp học" (en: "Class not found"),"path":"/tuitions","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/tuitions","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
- **Downstream:** RMQ `tuition.create` `{userId, data}` → TUTOR_SERVICE

#### 91. GET /tuitions/summary
- **Source:** `features/tuition/tuition.controller.ts:56` (`getSummary`)
- **Auth:** JWT + Redis session
- **Request:** query `classId` read as raw string, not validated
- **Request example:** `?classId=c1a2b3d4-e5f6-4789-8abc-def012345678`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Success response example:** unreachable (always 400, see Status). If it worked, the handler returns (**inferred from repository**):
  ```json
  {"statusCode":200,"message":"SUCCESS","data":{"totalPaid":3000000,"totalUnpaid":1500000,"totalOverdue":0,"totalRevenue":3000000},"timestamp":"2026-10-10T08:15:30.123Z","method":"GET","path":"/tuitions/summary?classId=c1a2b3d4-e5f6-4789-8abc-def012345678","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/tuitions/summary","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `400` always (no `userId` sent): `{"success":false,"statusCode":400,"message":"ID người dùng phải là UUID" (en: "User Id must be uuid"),"path":"/tuitions/summary?classId=c1a2b3d4-e5f6-4789-8abc-def012345678","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/tuitions/summary","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
- **Downstream:** RMQ `tuition.getSummary` `{classId}` → TUTOR_SERVICE
- **Status:** broken (always 400).

#### 92. GET /tuitions
- **Source:** `features/tuition/tuition.controller.ts:69` (`getAll`)
- **Auth:** JWT + Redis session
- **Request:** query `GetTuitionsQueryDto` (`getTuitionsQuerySchema`): `page` default 1; `limit` 1–100 default 10; `classId`, `studentId` uuid optional; `status` optional (enum as #90)
- **Request example:** `?page=1&limit=10&status=UNPAID&classId=c1a2b3d4-e5f6-4789-8abc-def012345678`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Success response example:** unreachable (always 400, see Status). If it worked, `findAll` returns `{tuitions, pagination}` where each row is the serialized row from #90 (**inferred from repository**).
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/tuitions","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `422` `?status=DONE`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"status","message":"Invalid option: expected one of \"PAID\"|\"UNPAID\"|\"OVERDUE\"","code":"invalid_value"}],"path":"/tuitions?status=DONE","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}` (zod v4 default text)
  - `400` always (no `userId` sent): `{"success":false,"statusCode":400,"message":"ID người dùng phải là UUID" (en: "User Id must be uuid"),"path":"/tuitions","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/tuitions","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
- **Downstream:** RMQ `tuition.getAll` `{query}` → TUTOR_SERVICE. No `userId` is sent, so the handler rejects it.
- **Status:** broken (always 400).

#### 93. GET /tuitions/:id
- **Source:** `features/tuition/tuition.controller.ts:81` (`getById`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Request example:** `/tuitions/8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Success response example:** unreachable (always 400, see Status). If it worked, the serialized row from #90 (**inferred from repository**).
- **Errors:** E-AUTH; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/tuitions/8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `400` always (no `userId` sent): `{"success":false,"statusCode":400,"message":"ID người dùng phải là UUID" (en: "User Id must be uuid"),"path":"/tuitions/8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:15:30.123Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/tuitions/8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:15:30.123Z"}`
- **Downstream:** RMQ `tuition.getById` `{id}` → TUTOR_SERVICE. No `userId` is sent, so the handler rejects it.
- **Status:** broken (always 400).

#### 94. PUT /tuitions/:id
- **Source:** `features/tuition/tuition.controller.ts:90` (`update`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; body `UpdateTuitionDto` (`updateTuitionSchema` = create partial, without `classId` and `studentId`)
- **Request example:** `/tuitions/8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f` with body `{"status":"PAID","paidDate":"2026-10-09","note":"Paid by bank transfer"}`
- **Success:** 200; data = TUTOR_SERVICE reply
- **Success response example** (handler `update` returns `findById` serialized row):
  ```json
  {"statusCode":200,"message":"SUCCESS","data":{"id":"8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f","classId":"c1a2b3d4-e5f6-4789-8abc-def012345678","studentId":"4d5e6f70-1234-4abc-9def-0123456789ab","amount":"1500000.00","dueDate":"2026-10-15T00:00:00.000Z","paidDate":"2026-10-09T00:00:00.000Z","status":"PAID","note":"Paid by bank transfer","createdAt":"2026-10-10T08:15:30.123Z","updatedAt":"2026-10-10T08:25:00.000Z","class":{"id":"c1a2b3d4-e5f6-4789-8abc-def012345678","name":"Math 10A","code":"MATH10A"},"student":{"id":"4d5e6f70-1234-4abc-9def-0123456789ab","firstName":"Thi","lastName":"Tran","userCode":null,"phone":"0987654321","avatar":null}},"timestamp":"2026-10-10T08:25:00.000Z","method":"PUT","path":"/tuitions/8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/tuitions/8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:25:00.000Z"}`
  - `422` `status` = `DONE`: `{"success":false,"statusCode":422,"message":"Dữ liệu không hợp lệ","errors":[{"field":"status","message":"Invalid option: expected one of \"PAID\"|\"UNPAID\"|\"OVERDUE\"","code":"invalid_value"}],"path":"/tuitions/8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:25:00.000Z"}` (zod v4 default text)
  - `400` non-UUID id (`ID_MUST_BE_UUID`): `{"success":false,"statusCode":400,"message":"ID phải là UUID" (en: "id must be uuid"),"path":"/tuitions/abc","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:25:00.000Z"}`
  - `404` unknown id (`TUITION_RECORD_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Không tìm thấy hồ sơ học phí" (en: "Tuition record not found"),"path":"/tuitions/8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:25:00.000Z"}`
  - `404` caller is not the class tutor (`CLASS_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Không tìm thấy lớp học" (en: "Class not found"),"path":"/tuitions/8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:25:00.000Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/tuitions/8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:25:00.000Z"}`
- **Downstream:** RMQ `tuition.update` `{userId, id, data}` → TUTOR_SERVICE

#### 95. DELETE /tuitions/:id
- **Source:** `features/tuition/tuition.controller.ts:104` (`delete`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Request example:** `/tuitions/8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f` (no body)
- **Success:** 200; data = TUTOR_SERVICE reply
- **Success response example** (handler `delete` returns `{id}`):
  ```json
  {"statusCode":200,"message":"SUCCESS","data":{"id":"8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f"},"timestamp":"2026-10-10T08:25:00.000Z","method":"DELETE","path":"/tuitions/8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e"}
  ```
- **Errors:** E-AUTH; E-RPC
- **Error response examples:**
  - `401`: `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/tuitions/8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:25:00.000Z"}`
  - `400` non-UUID id (`ID_MUST_BE_UUID`): `{"success":false,"statusCode":400,"message":"ID phải là UUID" (en: "id must be uuid"),"path":"/tuitions/abc","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:25:00.000Z"}`
  - `404` unknown id (`TUITION_RECORD_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Không tìm thấy hồ sơ học phí" (en: "Tuition record not found"),"path":"/tuitions/8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:25:00.000Z"}`
  - `404` caller is not the class tutor (`CLASS_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Không tìm thấy lớp học" (en: "Class not found"),"path":"/tuitions/8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","serviceName":"tutor-service","timestamp":"2026-10-10T08:25:00.000Z"}`
  - `504`: `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/tuitions/8c9d0e1f-2a3b-4c5d-8e6f-7a8b9c0d1e2f","correlationId":"b7f3c2a1-9e4d-4f6a-8b2c-1d3e5f7a9c0e","timestamp":"2026-10-10T08:25:00.000Z"}`
- **Downstream:** RMQ `tuition.delete` `{userId, id}` → TUTOR_SERVICE
