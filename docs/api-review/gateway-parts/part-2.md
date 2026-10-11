## Admin (`/admin`, class-level `RolesGuard` + `@Roles('ADMIN')`)

_Message strings below are shown in English (`Accept-Language: en`). The gateway default language is Vietnamese (`vi`), so the same codes localize differently. Timestamps and correlation IDs are placeholders._

#### 18. POST /admin/tutors
- **Source:** `features/admin/admin.controller.ts:121` (`createTutor`)
- **Auth:** JWT + ADMIN (E-ROLE)
- **Request:** body `CreateManagedUserDto` (`createManagedUserSchema`, `.strict()`): `email` required email; `password` string 6–20 required (complexity enforced only when length is 8–14); `firstName` trimmed 2–100 required; `lastName` trimmed 2–100 required; `username` 1–50 optional; `phone` ≤20 optional; `gender` MALE|FEMALE|OTHER optional; `dateOfBirth` coerced date optional; `school` ≤255 optional; `subjects` string[] ≤20 optional; `description` ≤5000 optional; `isActive` boolean default true. Unknown keys (including `role`) are a 422.
- **Success:** 201; data = USER_SERVICE reply `{message, data:{email, fullName, password}}`. The `password` field is the bcrypt hash, not the plaintext.
- **Errors:** E-AUTH; E-ROLE; E-ZOD; E-RPC. Downstream duplicate errors are 400, not 409.
- **Downstream:** RMQ `user.createUser` → USER_SERVICE (`user.rpc.controller.ts` → `createUserService`). Verified: only `email`, `username` (generated from last+first name when omitted), `firstName`, `lastName`, `password` (hashed) and `role` are persisted. `role` defaults to `STUDENT` because the gateway sends none, so this endpoint creates STUDENT accounts despite the `/admin/tutors` path. `userCode` is generated only for TUTOR, so these accounts get none. `phone`, `gender`, `dateOfBirth`, `school`, `subjects`, `description` and `isActive` pass validation but are not saved. The gateway retries 3 times and the create is not idempotent: if the first attempt commits and times out, the retry returns 400 `Email already exists`.
- **Request example:**
  ```json
  {"email":"tutor.minh@example.com","password":"Tutor@2026","firstName":"Minh","lastName":"Nguyen","username":"nguyenminh","phone":"0912345678"}
  ```
- **Success response example:**
  ```json
  {"statusCode":201,"message":"Success","data":{"message":"User created successfully","data":{"email":"tutor.minh@example.com","fullName":"Minh Nguyen","password":"$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"}},"timestamp":"2026-10-10T08:30:00.000Z","method":"POST","path":"/admin/tutors","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17"}
  ```
- **Error response examples:**
  - **401** (missing, malformed or expired Bearer token): `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/admin/tutors","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **403** (caller role is not ADMIN): `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/admin/tutors","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **422** (email `not-an-email` and an extra `role` key): `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"email","message":"Invalid email address","code":"invalid_string"},{"field":"","message":"Unrecognized key(s) in object: 'role'","code":"unrecognized_keys"}],"path":"/admin/tutors","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **400** (email already registered, from `EMAIL_EXISTS`): `{"success":false,"statusCode":400,"message":"Email already exists: tutor.minh@example.com","path":"/admin/tutors","serviceName":"user-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **400** (username taken, from `USERNAME_EXISTS`): `{"success":false,"statusCode":400,"message":"Username already exists: nguyenminh","path":"/admin/tutors","serviceName":"user-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **504** (USER_SERVICE did not reply within 10 s on any of 3 attempts): `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/admin/tutors","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:41:10.009Z"}`
  - **500** (RabbitMQ unreachable or wrong `RABBITMQ_URL`; message is the serialized AMQP error): `{"success":false,"statusCode":500,"message":"{\"err\":{...},\"url\":\"amqp://...\"}","path":"/admin/tutors","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`

#### 19. GET /admin/tutors
- **Source:** `features/admin/admin.controller.ts:138` (`listTutors`)
- **Auth:** JWT + ADMIN
- **Request:** query `ListManagedUsersQueryDto`: `page` int ≥1 default 1; `limit` 1–100 default 10; `search` trimmed string optional; `isActive` `'true'|'false'` optional
- **Success:** 200; data = USER_SERVICE paginated reply (`{data:[...], pagination:{page,pageSize,total,totalPages}}`). Each row is `{id, email, name, role, status, createdAt}`. `role` is `STUDENT` when the DB value is null. `status` is `active` or `inactive`.
- **Errors:** E-AUTH; E-ROLE; E-ZOD; E-RPC
- **Downstream:** RMQ `user.getUsers` → USER_SERVICE (`getUsersService`). No role filter is sent, so the list includes every user that matches `search`/`isActive`, not only tutors (see Unclear).
- **Request example:** query string `?page=2&limit=10&search=minh&isActive=true`
- **Success response example:**
  ```json
  {"statusCode":200,"message":"Success","data":{"data":[{"id":"b3f1c9e2-7a4d-4e8b-9c21-5d6e7f8a9b10","email":"tutor.minh@example.com","name":"Minh Nguyen","role":"STUDENT","status":"active","createdAt":"2026-10-08T02:14:55.091Z"}],"pagination":{"page":2,"pageSize":10,"total":11,"totalPages":2}},"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/admin/tutors?page=2&limit=10&search=minh&isActive=true","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17"}
  ```
- **Error response examples:**
  - **401:** `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/admin/tutors","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **403:** `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/admin/tutors","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **422** (`isActive=yes`): `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"isActive","message":"Invalid enum value. Expected 'true' | 'false', received 'yes'","code":"invalid_enum_value"}],"path":"/admin/tutors?isActive=yes","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **504:** `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/admin/tutors","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:41:10.009Z"}`
  - **500:** broker failure, same shape as #18.

#### 20. GET /admin/tutors/:id
- **Source:** `features/admin/admin.controller.ts:151` (`getTutor`)
- **Auth:** JWT + ADMIN
- **Request:** path `id` (string, no UUID pipe)
- **Success:** 200; data = user record from USER_SERVICE. Shape inferred from `findByField`, which does `select()` on all columns: a **full `users` row array**, including `password`. The route cannot reach this path today (see Errors).
- **Errors:** E-AUTH; E-ROLE; E-RPC (not-found behaviour downstream). **Bug:** the gateway sends `{id}` but `user.getUserByField` requires `{field, value}`, so every call returns 400.
- **Downstream:** RMQ `user.getUserByField` `{id}` → USER_SERVICE (`getUserByField`). `field` is undefined, so the handler throws `UNSUPPORTED_FIELD: undefined`. Once that is fixed, the response includes the bcrypt `password` because this path does not strip it (`getDetailUserService` does).
- **Request example:** path `/admin/tutors/b3f1c9e2-7a4d-4e8b-9c21-5d6e7f8a9b10` (no body)
- **Success response example (inferred, unreachable today):**
  ```json
  {"statusCode":200,"message":"Success","data":[{"id":"b3f1c9e2-7a4d-4e8b-9c21-5d6e7f8a9b10","email":"tutor.minh@example.com","username":"nguyenminh","firstName":"Minh","lastName":"Nguyen","password":"$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy","avatar":null,"phone":"0912345678","isActive":true,"role":"STUDENT","description":null,"userCode":null,"gender":null,"dateOfBirth":null,"address":null,"district":null,"province":null,"subjects":null,"facebookId":null,"googleId":null,"school":null,"relationship":null,"gradesId":[],"parentId":null,"tutorId":null,"createdAt":"2026-10-08T02:14:55.091Z","updatedAt":"2026-10-08T02:14:55.091Z"}],"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/admin/tutors/b3f1c9e2-7a4d-4e8b-9c21-5d6e7f8a9b10","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17"}
  ```
- **Error response examples:**
  - **401:** `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/admin/tutors/b3f1c9e2-7a4d-4e8b-9c21-5d6e7f8a9b10","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **403:** `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/admin/tutors/b3f1c9e2-7a4d-4e8b-9c21-5d6e7f8a9b10","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **400** (every call today, from the `{id}` vs `{field,value}` mismatch): `{"success":false,"statusCode":400,"message":"Unsupported field: undefined","path":"/admin/tutors/b3f1c9e2-7a4d-4e8b-9c21-5d6e7f8a9b10","serviceName":"user-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **504:** `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/admin/tutors/b3f1c9e2-7a4d-4e8b-9c21-5d6e7f8a9b10","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:41:10.009Z"}`
  - **500:** broker failure, same shape as #18.

#### 21. PUT /admin/tutors/:id
- **Source:** `features/admin/admin.controller.ts:161` (`updateTutor`)
- **Auth:** JWT + ADMIN
- **Request:** path `id`; body `UpdateManagedUserDto` (`updateManagedUserSchema`, `.strict()`, all optional): `email`, `username` (1–50), `firstName`/`lastName` (2–100), `phone` (≤20, nullable), `gender` (nullable), `dateOfBirth` (nullable), `school` ≤255 (nullable), `subjects` string[] ≤20 (nullable), `description` ≤5000 (nullable), `avatar` URL (nullable), `isActive` boolean. Unknown keys are a 422.
- **Success:** 200; data = USER_SERVICE reply: the full updated `users` row (see example), **including `password`** (the bcrypt hash).
- **Errors:** E-AUTH; E-ROLE; E-ZOD; E-RPC. Missing user and non-UUID id return 400, not 404.
- **Downstream:** RMQ `user.updateUserByAdmin` `{id, ...dto}` → USER_SERVICE (`updateUserService`). It checks existence first (400 `User not found`), then `UPDATE ... RETURNING *`, so the password hash is returned. `subjects` is `string[]` in the DTO but `users.subjects` is `varchar(255)` in the USER schema. An array value will likely fail at the DB with a 500 (not run).
- **Request example:**
  ```json
  {"firstName":"Minh","lastName":"Nguyen","phone":"0912345678","school":"Đại học Bách Khoa Hà Nội","description":"Gia sư Toán lớp 10-12, 5 năm kinh nghiệm.","isActive":true}
  ```
- **Success response example:**
  ```json
  {"statusCode":200,"message":"Success","data":{"id":"b3f1c9e2-7a4d-4e8b-9c21-5d6e7f8a9b10","email":"tutor.minh@example.com","username":"nguyenminh","firstName":"Minh","lastName":"Nguyen","password":"$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy","avatar":null,"phone":"0912345678","isActive":true,"role":"STUDENT","description":"Gia sư Toán lớp 10-12, 5 năm kinh nghiệm.","userCode":null,"gender":null,"dateOfBirth":null,"address":null,"district":null,"province":null,"subjects":null,"facebookId":null,"googleId":null,"school":"Đại học Bách Khoa Hà Nội","relationship":null,"gradesId":[],"parentId":null,"tutorId":null,"createdAt":"2026-10-08T02:14:55.091Z","updatedAt":"2026-10-10T08:30:00.000Z"},"timestamp":"2026-10-10T08:30:00.000Z","method":"PUT","path":"/admin/tutors/b3f1c9e2-7a4d-4e8b-9c21-5d6e7f8a9b10","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17"}
  ```
- **Error response examples:**
  - **401:** `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/admin/tutors/b3f1c9e2-7a4d-4e8b-9c21-5d6e7f8a9b10","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **403:** `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/admin/tutors/b3f1c9e2-7a4d-4e8b-9c21-5d6e7f8a9b10","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **422** (body includes `password`, which is not in the update schema): `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"","message":"Unrecognized key(s) in object: 'password'","code":"unrecognized_keys"}],"path":"/admin/tutors/b3f1c9e2-7a4d-4e8b-9c21-5d6e7f8a9b10","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **400** (no user with that id, from `USER_NOT_FOUND`): `{"success":false,"statusCode":400,"message":"User not found","path":"/admin/tutors/00000000-0000-4000-8000-000000000000","serviceName":"user-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **400** (non-UUID id, from `USER_ID_MUST_BE_UUID`): `{"success":false,"statusCode":400,"message":"User Id must be uuid","path":"/admin/tutors/abc","serviceName":"user-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **504:** `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/admin/tutors/b3f1c9e2-7a4d-4e8b-9c21-5d6e7f8a9b10","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:41:10.009Z"}`
  - **500:** broker failure, same shape as #18.

#### 22. DELETE /admin/tutors/:id
- **Source:** `features/admin/admin.controller.ts:173` (`deleteTutor`)
- **Auth:** JWT + ADMIN
- **Request:** path `id` (none in body)
- **Success:** 200; data = USER_SERVICE reply `{id}`
- **Errors:** E-AUTH; E-ROLE; E-RPC. Missing user and non-UUID id return 400, not 404.
- **Downstream:** RMQ `user.deleteUserByAdmin` `{id}` → USER_SERVICE (`deleteUserByAdminService`). Hard delete. The `users.tutorId` and `users.parentId` foreign keys are `onDelete: cascade`, so deleting a tutor also deletes every student whose `tutorId` points to it. Attendance rows are also removed through their student FK. Retries are not idempotent: a retry after a successful delete returns 400 `User not found`.
- **Request example:** path `/admin/tutors/b3f1c9e2-7a4d-4e8b-9c21-5d6e7f8a9b10` (no body)
- **Success response example:**
  ```json
  {"statusCode":200,"message":"Success","data":{"id":"b3f1c9e2-7a4d-4e8b-9c21-5d6e7f8a9b10"},"timestamp":"2026-10-10T08:30:00.000Z","method":"DELETE","path":"/admin/tutors/b3f1c9e2-7a4d-4e8b-9c21-5d6e7f8a9b10","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17"}
  ```
- **Error response examples:**
  - **401:** `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/admin/tutors/b3f1c9e2-7a4d-4e8b-9c21-5d6e7f8a9b10","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **403:** `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/admin/tutors/b3f1c9e2-7a4d-4e8b-9c21-5d6e7f8a9b10","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **400** (already deleted, or unknown id, from `USER_NOT_FOUND`): `{"success":false,"statusCode":400,"message":"User not found","path":"/admin/tutors/00000000-0000-4000-8000-000000000000","serviceName":"user-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **504:** `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/admin/tutors/b3f1c9e2-7a4d-4e8b-9c21-5d6e7f8a9b10","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:41:10.009Z"}`
  - **500:** broker failure, same shape as #18.

#### 23. POST /admin/students
- **Source:** `features/admin/admin.controller.ts:186` (`createStudent`)
- **Auth:** JWT + ADMIN
- **Request:** same body as #18 (`createManagedUserSchema`, strict). The gateway sends no role.
- **Success:** 201; data = USER_SERVICE reply `{message, data:{email, fullName, password}}` (same as #18)
- **Errors:** E-AUTH; E-ROLE; E-ZOD; E-RPC. Downstream duplicate errors are 400.
- **Downstream:** RMQ `user.createUser` → USER_SERVICE (same persistence rules as #18). The `STUDENT` default matches this endpoint. `phone`, `gender`, `dateOfBirth`, `school`, `subjects`, `description` and `isActive` are validated but not saved. The retry hazard on duplicate create is the same as #18.
- **Request example:**
  ```json
  {"email":"student.an@example.com","password":"Student@88","firstName":"An","lastName":"Le","username":"leanstudent"}
  ```
- **Success response example:**
  ```json
  {"statusCode":201,"message":"Success","data":{"message":"User created successfully","data":{"email":"student.an@example.com","fullName":"An Le","password":"$2b$10$Qm2rXb7VbS1KdP0lE9wZ8uHn3tYc4aVgJ6sLkD1fR0oM8pWe2TyXu"}},"timestamp":"2026-10-10T08:30:00.000Z","method":"POST","path":"/admin/students","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17"}
  ```
- **Error response examples:**
  - **401:** `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/admin/students","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **403:** `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/admin/students","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **422** (password 8–14 characters without a special character): `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"password","message":"Password must include at least one special character","code":"custom"}],"path":"/admin/students","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **400** (email already registered): `{"success":false,"statusCode":400,"message":"Email already exists: student.an@example.com","path":"/admin/students","serviceName":"user-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **504:** `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/admin/students","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:41:10.009Z"}`
  - **500:** broker failure, same shape as #18.

#### 24. GET /admin/students
- **Source:** `features/admin/admin.controller.ts:206` (`listStudents`)
- **Auth:** JWT + ADMIN
- **Request:** query same as #19
- **Success:** 200; data = USER_SERVICE paginated reply (same shape as #19)
- **Errors:** E-AUTH; E-ROLE; E-ZOD; E-RPC
- **Downstream:** RMQ `user.getUsers` → USER_SERVICE (no role filter sent, so the list includes tutors and other roles too)
- **Request example:** query string `?page=1&limit=20&search=an`
- **Success response example:**
  ```json
  {"statusCode":200,"message":"Success","data":{"data":[{"id":"c4a2d8f3-1b5e-4f9c-8d32-6e7f8a9b0c21","email":"student.an@example.com","name":"An Le","role":"STUDENT","status":"active","createdAt":"2026-10-09T10:02:17.450Z"}],"pagination":{"page":1,"pageSize":20,"total":1,"totalPages":1}},"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/admin/students?page=1&limit=20&search=an","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17"}
  ```
- **Error response examples:**
  - **401:** `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/admin/students","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **403:** `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/admin/students","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **422** (`limit=0`): `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"limit","message":"Number must be greater than or equal to 1","code":"too_small"}],"path":"/admin/students?limit=0","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **504:** `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/admin/students","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:41:10.009Z"}`
  - **500:** broker failure, same shape as #18.

#### 25. GET /admin/students/:id
- **Source:** `features/admin/admin.controller.ts:219` (`getStudent`)
- **Auth:** JWT + ADMIN
- **Request:** path `id`
- **Success:** 200; data = user record (same inferred shape as #20). Unreachable today.
- **Errors:** E-AUTH; E-ROLE; E-RPC. **Bug:** same `{id}` vs `{field, value}` mismatch as #20, so every call returns 400.
- **Downstream:** RMQ `user.getUserByField` `{id}` → USER_SERVICE. See #20 for the cause and the password exposure once fixed.
- **Request example:** path `/admin/students/c4a2d8f3-1b5e-4f9c-8d32-6e7f8a9b0c21` (no body)
- **Success response example (inferred, unreachable today):** same as #20 with the student row
- **Error response examples:**
  - **401:** `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/admin/students/c4a2d8f3-1b5e-4f9c-8d32-6e7f8a9b0c21","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **403:** `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/admin/students/c4a2d8f3-1b5e-4f9c-8d32-6e7f8a9b0c21","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **400** (every call today): `{"success":false,"statusCode":400,"message":"Unsupported field: undefined","path":"/admin/students/c4a2d8f3-1b5e-4f9c-8d32-6e7f8a9b0c21","serviceName":"user-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **504:** `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/admin/students/c4a2d8f3-1b5e-4f9c-8d32-6e7f8a9b0c21","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:41:10.009Z"}`
  - **500:** broker failure, same shape as #18.

#### 26. PUT /admin/students/:id
- **Source:** `features/admin/admin.controller.ts:232` (`updateStudent`)
- **Auth:** JWT + ADMIN
- **Request:** path `id`; body `UpdateManagedStudentDto` (`updateManagedStudentSchema` = tutor update fields plus): `userCode` ≤6; `address` string nullable; `district` ≤30 nullable; `province` ≤30 nullable; `parentId` uuid nullable; `tutorId` uuid nullable. All optional.
- **Success:** 200; data = USER_SERVICE reply: the full updated `users` row, including `password` (same shape as #21).
- **Errors:** E-AUTH; E-ROLE; E-ZOD; E-RPC. Missing user and non-UUID id return 400.
- **Downstream:** RMQ `user.updateUserByAdmin` `{id, ...dto}` → USER_SERVICE (same as #21). `parentId` and `tutorId` are foreign keys to `users.id`. A UUID that does not exist there fails the DB constraint, which surfaces as a 500 with the raw Postgres error text (inferred from schema, not run). The response also returns the password hash.
- **Request example:**
  ```json
  {"address":"12 Nguyễn Trãi, Phường 2","district":"Quận 5","province":"TP.HCM","tutorId":"b3f1c9e2-7a4d-4e8b-9c21-5d6e7f8a9b10","userCode":"ST0042"}
  ```
- **Success response example:**
  ```json
  {"statusCode":200,"message":"Success","data":{"id":"c4a2d8f3-1b5e-4f9c-8d32-6e7f8a9b0c21","email":"student.an@example.com","username":"leanstudent","firstName":"An","lastName":"Le","password":"$2b$10$Qm2rXb7VbS1KdP0lE9wZ8uHn3tYc4aVgJ6sLkD1fR0oM8pWe2TyXu","avatar":null,"phone":null,"isActive":true,"role":"STUDENT","description":null,"userCode":"ST0042","gender":null,"dateOfBirth":null,"address":"12 Nguyễn Trãi, Phường 2","district":"Quận 5","province":"TP.HCM","subjects":null,"facebookId":null,"googleId":null,"school":null,"relationship":null,"gradesId":[],"parentId":null,"tutorId":"b3f1c9e2-7a4d-4e8b-9c21-5d6e7f8a9b10","createdAt":"2026-10-09T10:02:17.450Z","updatedAt":"2026-10-10T08:30:00.000Z"},"timestamp":"2026-10-10T08:30:00.000Z","method":"PUT","path":"/admin/students/c4a2d8f3-1b5e-4f9c-8d32-6e7f8a9b0c21","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17"}
  ```
- **Error response examples:**
  - **401:** `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/admin/students/c4a2d8f3-1b5e-4f9c-8d32-6e7f8a9b0c21","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **403:** `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/admin/students/c4a2d8f3-1b5e-4f9c-8d32-6e7f8a9b0c21","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **422** (`tutorId` not a UUID): `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"tutorId","message":"tutorId must be uuid","code":"invalid_string"}],"path":"/admin/students/c4a2d8f3-1b5e-4f9c-8d32-6e7f8a9b0c21","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **400** (unknown student id, from `USER_NOT_FOUND`): `{"success":false,"statusCode":400,"message":"User not found","path":"/admin/students/00000000-0000-4000-8000-000000000000","serviceName":"user-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **500** (`tutorId` UUID that is not an existing user; raw DB error text, variable): `{"success":false,"statusCode":500,"message":"<raw Postgres foreign-key error>","path":"/admin/students/c4a2d8f3-1b5e-4f9c-8d32-6e7f8a9b0c21","serviceName":"user-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **504:** `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/admin/students/c4a2d8f3-1b5e-4f9c-8d32-6e7f8a9b0c21","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:41:10.009Z"}`

#### 27. DELETE /admin/students/:id
- **Source:** `features/admin/admin.controller.ts:244` (`deleteStudent`)
- **Auth:** JWT + ADMIN
- **Request:** path `id`
- **Success:** 200; data = USER_SERVICE reply `{id}`
- **Errors:** E-AUTH; E-ROLE; E-RPC. Missing user and non-UUID id return 400.
- **Downstream:** RMQ `user.deleteUserByAdmin` `{id}` → USER_SERVICE (same as #22). Deleting a parent cascades to its children (`parentId`). Attendance rows are removed through the student FK.
- **Request example:** path `/admin/students/c4a2d8f3-1b5e-4f9c-8d32-6e7f8a9b0c21` (no body)
- **Success response example:**
  ```json
  {"statusCode":200,"message":"Success","data":{"id":"c4a2d8f3-1b5e-4f9c-8d32-6e7f8a9b0c21"},"timestamp":"2026-10-10T08:30:00.000Z","method":"DELETE","path":"/admin/students/c4a2d8f3-1b5e-4f9c-8d32-6e7f8a9b0c21","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17"}
  ```
- **Error response examples:**
  - **401:** `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/admin/students/c4a2d8f3-1b5e-4f9c-8d32-6e7f8a9b0c21","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **403:** `{"success":false,"statusCode":403,"message":"You do not have permission to access this resource","path":"/admin/students/c4a2d8f3-1b5e-4f9c-8d32-6e7f8a9b0c21","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **400** (already deleted or unknown id, from `USER_NOT_FOUND`): `{"success":false,"statusCode":400,"message":"User not found","path":"/admin/students/00000000-0000-4000-8000-000000000000","serviceName":"user-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **504:** `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/admin/students/c4a2d8f3-1b5e-4f9c-8d32-6e7f8a9b0c21","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:41:10.009Z"}`
  - **500:** broker failure, same shape as #18.

## AI chat (`/ai-chat`)

#### 28. POST /ai-chat/chat
- **Source:** `features/ai-chat/ai-chat.controller.ts:37` (`chat`)
- **Auth:** JWT + Redis session (any role)
- **Request:** body `ChatDto` (`chatSchema`): `message` string 1–4000 required
- **Success:** 200; data = `{reply, history}` from TUTOR_SERVICE. `reply` is `{role:"assistant", content, createdAt}`. `history` is the user's in-memory history (up to 100 entries).
- **Errors:** E-AUTH; E-ZOD; E-RPC. A 401 can also be `Session expired or not found ...`.
- **Downstream:** RMQ `ai.chat` `{userId, data}` → TUTOR_SERVICE (`tutor_queue`). `AgentsService.chat` calls the Claude Agent SDK `query()` and joins every SDK message that has a `text` property. Verified in the SDK types: only `SDKNotificationMessage` has `text`, and assistant messages do not. So `content` is most likely always the fallback `Không có phản hồi từ trợ lý.` ("No response from the assistant."). Not run. Each call takes one SDK round-trip, so it can exceed the 10 s per-attempt timeout. History is appended only on success, so a timed-out attempt can still finish later, and a retry can append the message twice.
- **Request example:**
  ```json
  {"message":"Giải thích giúp em định lý Pythagoras"}
  ```
- **Success response example:**
  ```json
  {"statusCode":200,"message":"Success","data":{"reply":{"role":"assistant","content":"Không có phản hồi từ trợ lý.","createdAt":"2026-10-10T08:30:04.512Z"},"history":[{"role":"user","content":"Giải thích giúp em định lý Pythagoras","createdAt":"2026-10-10T08:30:04.480Z"},{"role":"assistant","content":"Không có phản hồi từ trợ lý.","createdAt":"2026-10-10T08:30:04.512Z"}]},"timestamp":"2026-10-10T08:30:04.520Z","method":"POST","path":"/ai-chat/chat","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17"}
  ```
- **Error response examples:**
  - **401:** `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/ai-chat/chat","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **422** (empty message, from `Message is required`): `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"message","message":"Message is required","code":"too_small"}],"path":"/ai-chat/chat","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **422** (message over 4000 characters, from `Message too long`): `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"message","message":"Message too long","code":"too_big"}],"path":"/ai-chat/chat","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **504** (no SDK reply within 10 s on any of 3 attempts): `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/ai-chat/chat","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:41:10.009Z"}`
  - **500** (RabbitMQ unreachable): `{"success":false,"statusCode":500,"message":"{\"err\":{...},\"url\":\"amqp://...\"}","path":"/ai-chat/chat","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`

#### 29. GET /ai-chat/history
- **Source:** `features/ai-chat/ai-chat.controller.ts:49` (`getHistory`)
- **Auth:** JWT + Redis session
- **Request:** query `limit` int 1–200 default 50
- **Success:** 200; data = TUTOR_SERVICE reply: the last `limit` entries of `{role, content, createdAt}`, oldest first
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `ai.history` `{userId, query}` → TUTOR_SERVICE (`slice(-limit)` on the in-memory history, which resets on tutor-service restart and is per process)
- **Request example:** query string `?limit=2`
- **Success response example:**
  ```json
  {"statusCode":200,"message":"Success","data":[{"role":"user","content":"Giải thích giúp em định lý Pythagoras","createdAt":"2026-10-10T08:30:04.480Z"},{"role":"assistant","content":"Không có phản hồi từ trợ lý.","createdAt":"2026-10-10T08:30:04.512Z"}],"timestamp":"2026-10-10T08:32:00.000Z","method":"GET","path":"/ai-chat/history?limit=2","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17"}
  ```
- **Error response examples:**
  - **401:** `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/ai-chat/history?limit=2","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **422** (`limit=0`): `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"limit","message":"Number must be greater than or equal to 1","code":"too_small"}],"path":"/ai-chat/history?limit=0","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **504:** `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/ai-chat/history?limit=2","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:41:10.009Z"}`
  - **500:** broker failure, same shape as #28.

#### 30. DELETE /ai-chat/history
- **Source:** `features/ai-chat/ai-chat.controller.ts:61` (`clearHistory`)
- **Auth:** JWT + Redis session
- **Request:** none
- **Success:** 200; data = TUTOR_SERVICE reply `{success: true}`
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `ai.clearHistory` `{userId}` → TUTOR_SERVICE (deletes the in-memory entry for the user)
- **Request example:** none
- **Success response example:**
  ```json
  {"statusCode":200,"message":"Success","data":{"success":true},"timestamp":"2026-10-10T08:33:00.000Z","method":"DELETE","path":"/ai-chat/history","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17"}
  ```
- **Error response examples:**
  - **401:** `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/ai-chat/history","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **504:** `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/ai-chat/history","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:41:10.009Z"}`
  - **500:** broker failure, same shape as #28.

## Attendance (`/attendances`)

#### 31. GET /attendances/session/:sessionId
- **Source:** `features/attendance/attendance.controller.ts:37` (`getBySession`)
- **Auth:** JWT + Redis session
- **Request:** path `sessionId` (string, no UUID pipe)
- **Success:** 200; data = TUTOR_SERVICE reply: one row per enrolled student in the class roster (from `getAllStudentsService`), `{studentId, firstName, lastName, avatar, userCode, present, note, markedAt}`. Students with no record show `present: false`, `note: null`, `markedAt: null`.
- **Errors:** E-AUTH; E-RPC. A session that the caller cannot see returns 404.
- **Downstream:** RMQ `attendance.getBySession` `{userId, sessionId}` → TUTOR_SERVICE (`getBySessionService`). The session is checked first with `getSessionService`, which applies the owner/enrolled/parent access rule.
- **Request example:** path `/attendances/session/e5b3c9a4-2c6f-4a0d-9e43-7f8a9b0c1d32` (no body)
- **Success response example:**
  ```json
  {"statusCode":200,"message":"Success","data":[{"studentId":"c4a2d8f3-1b5e-4f9c-8d32-6e7f8a9b0c21","firstName":"An","lastName":"Le","avatar":null,"userCode":"ST0042","present":true,"note":null,"markedAt":"2026-10-09T13:05:21.337Z"},{"studentId":"d7e8f9a0-3b2c-4d1e-9f08-1a2b3c4d5e6f","firstName":"Binh","lastName":"Tran","avatar":null,"userCode":"ST0043","present":false,"note":null,"markedAt":null}],"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/attendances/session/e5b3c9a4-2c6f-4a0d-9e43-7f8a9b0c1d32","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17"}
  ```
- **Error response examples:**
  - **401:** `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/attendances/session/e5b3c9a4-2c6f-4a0d-9e43-7f8a9b0c1d32","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}` (or `Session expired or not found ...`)
  - **400** (`sessionId` is not a UUID, from `ID_MUST_BE_UUID` with label): `{"success":false,"statusCode":400,"message":"id must be uuid: Session Id","path":"/attendances/session/abc","serviceName":"tutor-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **404** (no such session, or caller is not the owner, enrolled student or parent, from `SESSION_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Session not found","path":"/attendances/session/00000000-0000-4000-8000-000000000000","serviceName":"tutor-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **504:** `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/attendances/session/e5b3c9a4-2c6f-4a0d-9e43-7f8a9b0c1d32","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:41:10.009Z"}`
  - **500:** broker failure, same shape as #28.

#### 32. PUT /attendances
- **Source:** `features/attendance/attendance.controller.ts:48` (`upsert`)
- **Auth:** JWT + Redis session
- **Request:** body `UpsertAttendanceDto` (`upsertAttendanceSchema`): `sessionId` uuid required; `studentId` uuid required; `present` boolean required; `note` string ≤500 optional/nullable
- **Success:** 200; data = TUTOR_SERVICE reply: the raw `attendances` row `{id, sessionId, studentId, present, note, createdAt, updatedAt}` (`onConflictDoUpdate` on `(sessionId, studentId)`).
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `attendance.upsert` `{userId, ...dto}` → TUTOR_SERVICE (`upsertAttendanceService`). Order of checks: session visible to the caller (404 `Session not found`), caller is the class tutor (403), student in the class roster (404 `Student not found`), then the upsert. The upsert is idempotent for the same `(sessionId, studentId)`, so retries are safe.
- **Request example:**
  ```json
  {"sessionId":"e5b3c9a4-2c6f-4a0d-9e43-7f8a9b0c1d32","studentId":"c4a2d8f3-1b5e-4f9c-8d32-6e7f8a9b0c21","present":true,"note":"Đi trễ 10 phút"}
  ```
- **Success response example:**
  ```json
  {"statusCode":200,"message":"Success","data":{"id":"9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d","sessionId":"e5b3c9a4-2c6f-4a0d-9e43-7f8a9b0c1d32","studentId":"c4a2d8f3-1b5e-4f9c-8d32-6e7f8a9b0c21","present":true,"note":"Đi trễ 10 phút","createdAt":"2026-10-10T08:29:58.000Z","updatedAt":"2026-10-10T08:30:00.000Z"},"timestamp":"2026-10-10T08:30:00.000Z","method":"PUT","path":"/attendances","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17"}
  ```
- **Error response examples:**
  - **401:** `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/attendances","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **422** (`present` is a string): `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"present","message":"present must be boolean","code":"invalid_type"}],"path":"/attendances","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **403** (caller is an enrolled student or parent, not the class tutor, from `ATTENDANCE_MARK_NOT_ALLOWED`): `{"success":false,"statusCode":403,"message":"Only the assigned tutor can mark attendance for this session","path":"/attendances","serviceName":"tutor-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **404** (`studentId` is not in the class roster, from `STUDENT_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Student not found","path":"/attendances","serviceName":"tutor-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **404** (`sessionId` does not exist or is not visible to the caller, from `SESSION_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Session not found","path":"/attendances","serviceName":"tutor-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **504:** `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/attendances","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:41:10.009Z"}`
  - **500:** broker failure, same shape as #28.

## Chapter (`/chapter`)

#### 33. POST /chapter/:curriculumId
- **Source:** `features/chapter/chapter.controller.ts:39` (`create`)
- **Auth:** JWT + Redis session
- **Request:** path `curriculumId` (no UUID pipe); body `CreateChapterDto`: `title` string 1–255 required; `description` string optional; `order` int default 0 optional
- **Success:** 201; data = TUTOR_SERVICE reply: the raw `chapters` row `{id, curriculumId, title, description, order, createdAt, updatedAt}`
- **Errors:** E-AUTH; E-ZOD; E-RPC. An unknown `curriculumId` is a 500, not a 404.
- **Downstream:** RMQ `chapter.create` `{curriculumId, data}` → TUTOR_SERVICE (`createChapterService`). Only checks that `curriculumId` is a UUID. There is no existence or ownership check, so any authenticated user (any role) can add a chapter to any curriculum. A non-existent curriculum fails the FK on insert. The insert is not idempotent, so a retry after a timeout creates a duplicate chapter.
- **Request example:** path `/chapter/a1d2e3f4-5b6c-4d7e-8f90-a1b2c3d4e5f6`, body:
  ```json
  {"title":"Chương 1: Số hữu tỉ","description":"Khái niệm và phép toán trên số hữu tỉ","order":1}
  ```
- **Success response example:**
  ```json
  {"statusCode":201,"message":"Success","data":{"id":"f0e1d2c3-b4a5-4968-8777-665544332211","curriculumId":"a1d2e3f4-5b6c-4d7e-8f90-a1b2c3d4e5f6","title":"Chương 1: Số hữu tỉ","description":"Khái niệm và phép toán trên số hữu tỉ","order":1,"createdAt":"2026-10-10T08:30:00.000Z","updatedAt":"2026-10-10T08:30:00.000Z"},"timestamp":"2026-10-10T08:30:00.000Z","method":"POST","path":"/chapter/a1d2e3f4-5b6c-4d7e-8f90-a1b2c3d4e5f6","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17"}
  ```
- **Error response examples:**
  - **401:** `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/chapter/a1d2e3f4-5b6c-4d7e-8f90-a1b2c3d4e5f6","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}` (or `Session expired or not found ...`)
  - **422** (empty title, from `Title is required`): `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"title","message":"Title is required","code":"too_small"}],"path":"/chapter/a1d2e3f4-5b6c-4d7e-8f90-a1b2c3d4e5f6","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **400** (`curriculumId` path is not a UUID, from `CURRICULUM_ID_MUST_BE_UUID`): `{"success":false,"statusCode":400,"message":"curriculumId must be a valid UUID","path":"/chapter/abc","serviceName":"tutor-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **500** (UUID that does not match a curriculum; FK violation, raw DB error text, variable): `{"success":false,"statusCode":500,"message":"<raw Postgres foreign-key error>","path":"/chapter/00000000-0000-4000-8000-000000000000","serviceName":"tutor-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **504:** `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/chapter/a1d2e3f4-5b6c-4d7e-8f90-a1b2c3d4e5f6","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:41:10.009Z"}`
  - **500:** broker failure, same shape as #28.

#### 34. GET /chapter
- **Source:** `features/chapter/chapter.controller.ts:54` (`getAll`)
- **Auth:** JWT + Redis session
- **Request:** query `curriculumId` uuid required; `page` int ≥1 default 1; `limit` 1–100 default 10
- **Success:** 200; data = TUTOR_SERVICE reply `{chapters: [...], pagination: {total, page, limit, totalPages}}`. Rows are the raw `chapters` columns, ordered by `order` then `id`.
- **Errors:** E-AUTH; E-ZOD (missing or non-uuid `curriculumId`); E-RPC
- **Downstream:** RMQ `chapter.getAll` `{query}` → TUTOR_SERVICE (`getAllChaptersService`, OFFSET pagination). No access check on the curriculum.
- **Request example:** query string `?curriculumId=a1d2e3f4-5b6c-4d7e-8f90-a1b2c3d4e5f6&page=1&limit=10`
- **Success response example:**
  ```json
  {"statusCode":200,"message":"Success","data":{"chapters":[{"id":"f0e1d2c3-b4a5-4968-8777-665544332211","curriculumId":"a1d2e3f4-5b6c-4d7e-8f90-a1b2c3d4e5f6","title":"Chương 1: Số hữu tỉ","description":"Khái niệm và phép toán trên số hữu tỉ","order":1,"createdAt":"2026-10-10T08:30:00.000Z","updatedAt":"2026-10-10T08:30:00.000Z"},{"id":"0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d","curriculumId":"a1d2e3f4-5b6c-4d7e-8f90-a1b2c3d4e5f6","title":"Chương 2: Số thực","description":null,"order":2,"createdAt":"2026-10-10T08:35:00.000Z","updatedAt":"2026-10-10T08:35:00.000Z"}],"pagination":{"total":2,"page":1,"limit":10,"totalPages":1}},"timestamp":"2026-10-10T08:36:00.000Z","method":"GET","path":"/chapter?curriculumId=a1d2e3f4-5b6c-4d7e-8f90-a1b2c3d4e5f6&page=1&limit=10","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17"}
  ```
- **Error response examples:**
  - **401:** `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/chapter","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **422** (`curriculumId` not a UUID, from the schema message): `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"curriculumId","message":"Invalid curriculum ID","code":"invalid_string"}],"path":"/chapter?curriculumId=abc","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **504:** `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/chapter","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:41:10.009Z"}`
  - **500:** broker failure, same shape as #28.

#### 35. GET /chapter/:id
- **Source:** `features/chapter/chapter.controller.ts:66` (`getById`)
- **Auth:** JWT + Redis session
- **Request:** path `id` (no UUID pipe)
- **Success:** 200; data = TUTOR_SERVICE reply: the raw `chapters` row, or `null` when no chapter has that id. **Not-found is 200 with `data: null`, not 404.**
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `chapter.getById` `{id}` → TUTOR_SERVICE (`getChapterByIdService`). Non-UUID ids are rejected with 400.
- **Request example:** path `/chapter/f0e1d2c3-b4a5-4968-8777-665544332211` (no body)
- **Success response example:**
  ```json
  {"statusCode":200,"message":"Success","data":{"id":"f0e1d2c3-b4a5-4968-8777-665544332211","curriculumId":"a1d2e3f4-5b6c-4d7e-8f90-a1b2c3d4e5f6","title":"Chương 1: Số hữu tỉ","description":"Khái niệm và phép toán trên số hữu tỉ","order":1,"createdAt":"2026-10-10T08:30:00.000Z","updatedAt":"2026-10-10T08:30:00.000Z"},"timestamp":"2026-10-10T08:30:00.000Z","method":"GET","path":"/chapter/f0e1d2c3-b4a5-4968-8777-665544332211","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17"}
  ```
- **Error response examples:**
  - **401:** `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/chapter/f0e1d2c3-b4a5-4968-8777-665544332211","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **400** (`id` is not a UUID, from `CHAPTER_ID_INVALID`): `{"success":false,"statusCode":400,"message":"Invalid chapter id","path":"/chapter/abc","serviceName":"tutor-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **504:** `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/chapter/f0e1d2c3-b4a5-4968-8777-665544332211","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:41:10.009Z"}`
  - **500:** broker failure, same shape as #28.

#### 36. PUT /chapter/:id
- **Source:** `features/chapter/chapter.controller.ts:75` (`update`)
- **Auth:** JWT + Redis session
- **Request:** path `id`; body `UpdateChapterDto` (`createChapterSchema.partial()`): `title`, `description`, `order`
- **Success:** 200; data = TUTOR_SERVICE reply: the updated raw `chapters` row (same columns as #33)
- **Errors:** E-AUTH; E-ZOD; E-RPC
- **Downstream:** RMQ `chapter.update` `{id, data}` → TUTOR_SERVICE (`updateChapterService`). Checks the id is a UUID (400), then that the chapter exists (404), then runs `UPDATE ... SET data`. An empty body `{}` passes the schema and gives an empty SET, which is likely a DB error and a 500 (inferred, not run).
- **Request example:**
  ```json
  {"title":"Chương 1: Số hữu tỉ (cập nhật)","order":2}
  ```
- **Success response example:**
  ```json
  {"statusCode":200,"message":"Success","data":{"id":"f0e1d2c3-b4a5-4968-8777-665544332211","curriculumId":"a1d2e3f4-5b6c-4d7e-8f90-a1b2c3d4e5f6","title":"Chương 1: Số hữu tỉ (cập nhật)","description":"Khái niệm và phép toán trên số hữu tỉ","order":2,"createdAt":"2026-10-10T08:30:00.000Z","updatedAt":"2026-10-10T08:30:00.000Z"},"timestamp":"2026-10-10T08:37:00.000Z","method":"PUT","path":"/chapter/f0e1d2c3-b4a5-4968-8777-665544332211","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17"}
  ```
- **Error response examples:**
  - **401:** `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/chapter/f0e1d2c3-b4a5-4968-8777-665544332211","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **422** (empty title, from `Title is required`): `{"success":false,"statusCode":422,"message":"Validation failed","errors":[{"field":"title","message":"Title is required","code":"too_small"}],"path":"/chapter/f0e1d2c3-b4a5-4968-8777-665544332211","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **400** (`id` is not a UUID, from `CHAPTER_ID_INVALID`): `{"success":false,"statusCode":400,"message":"Invalid chapter id","path":"/chapter/abc","serviceName":"tutor-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **404** (unknown chapter, from `CHAPTER_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Chapter not found","path":"/chapter/00000000-0000-4000-8000-000000000000","serviceName":"tutor-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **504:** `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/chapter/f0e1d2c3-b4a5-4968-8777-665544332211","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:41:10.009Z"}`
  - **500:** broker failure, same shape as #28.

#### 37. DELETE /chapter/:id
- **Source:** `features/chapter/chapter.controller.ts:88` (`delete`)
- **Auth:** JWT + Redis session
- **Request:** path `id`
- **Success:** 200; data = TUTOR_SERVICE reply: `true` (boolean from `!!deletedRow`)
- **Errors:** E-AUTH; E-RPC
- **Downstream:** RMQ `chapter.delete` `{id}` → TUTOR_SERVICE (`deleteChapterService`). Checks the id is a UUID (400), then that the chapter exists (404), then deletes. A retry after a successful delete returns 404 `Chapter not found`.
- **Request example:** path `/chapter/f0e1d2c3-b4a5-4968-8777-665544332211` (no body)
- **Success response example:**
  ```json
  {"statusCode":200,"message":"Success","data":true,"timestamp":"2026-10-10T08:38:00.000Z","method":"DELETE","path":"/chapter/f0e1d2c3-b4a5-4968-8777-665544332211","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17"}
  ```
- **Error response examples:**
  - **401:** `{"success":false,"statusCode":401,"message":"Unauthorized ...","path":"/chapter/f0e1d2c3-b4a5-4968-8777-665544332211","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **400** (`id` is not a UUID, from `CHAPTER_ID_INVALID`): `{"success":false,"statusCode":400,"message":"Invalid chapter id","path":"/chapter/abc","serviceName":"tutor-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **404** (unknown or already-deleted chapter, from `CHAPTER_NOT_FOUND`): `{"success":false,"statusCode":404,"message":"Chapter not found","path":"/chapter/00000000-0000-4000-8000-000000000000","serviceName":"tutor-service","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:31:02.114Z"}`
  - **504:** `{"success":false,"statusCode":504,"message":"Timeout has occurred","path":"/chapter/f0e1d2c3-b4a5-4968-8777-665544332211","correlationId":"7d1f0c2e-5b8a-4c3e-9f61-2a4b8e0d9c17","timestamp":"2026-10-10T08:41:10.009Z"}`
  - **500:** broker failure, same shape as #28.
