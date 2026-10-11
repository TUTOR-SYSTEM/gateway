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
