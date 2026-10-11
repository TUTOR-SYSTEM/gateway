# USER service: API and message-pattern review

- Scanned: 2026-10-10
- Module root: `/home/haidangphan/Documents/tutor/USER` (source in `src/`). All file paths below are relative to the module root; line numbers point at the handler method (route decorator line in brackets where different).
- Read-only review. Source is truth; `API_ENDPOINTS.md` and `PAGES_API_REVIEW.md` were not cross-checked.

## Global behaviour (applies to every HTTP route unless noted)

- No global prefix or versioning (`main.ts` has no `setGlobalPrefix`/`enableVersioning`). HTTP port `PORT` (default 8888).
- `APP_GUARD` `JwtAuthGuard` (`src/app.module.ts:35`): requires `Authorization: Bearer <access JWT>` unless the handler is `@Public()`. Token must have `typ:'access'`, `sub`, `email`, `role`, and the user row must still exist (else 401). `role` comes from the token, not the DB.
- `APP_GUARD` `LanguageGuard`: only sets `request.language` from `Accept-Language` (vi default). No auth.
- `RolesGuard` + `@Roles('ADMIN')` is applied only at `AdminController` (`src/features/admin/admin.controller.ts:108-109`). No other controller checks role.
- Success envelope: `{ statusCode, message, data, timestamp, method, path }` (`src/packages/interceptor/response.interceptor.ts`).
- Error envelope: `{ success:false, statusCode, message, errors?, path, timestamp }` (`src/packages/filters/http-exception.filter.ts`). `message` is an error code translated to vi/en.
- Zod validation failures: HTTP 422 with `errors: [{field, message, code}]` (`src/packages/pipes/zod-validation.pipe.ts`).
- Non-HttpException errors become 500 (`src/packages/interceptor/error.interceptor.ts`). Postgres unique/FK violations (23505/23503) therefore surface as 500 with "Record already exists" / "Referenced record not found".
- RabbitMQ handlers (`@MessagePattern`/`@EventPattern`) return raw data (no envelope). Errors go through `RpcExceptionFilter` (`src/packages/filters/rpc-exception.filter.ts`) as `{ statusCode, message, errors?, serviceName:'user-service' }`. No Zod validation runs on RPC payloads.

## Summary

Counts: 36 HTTP routes, 17 RPC message patterns (`user.*`, `auth.*`), 6 `kafka.*`/`health.*` handlers on the same queue (one is an EventPattern). Total 59.

| # | Method | Path | Auth | Success | Notable errors |
|---|---|---|---|---|---|
| 1 | GET | `/` | JWT | 200 `"Hello World!"` | 401 |
| 2 | GET | `/users` | JWT (any role) | 200 `{data, pagination}` | 422 |
| 3 | GET | `/users/detail-user` | JWT (self) | 200 user row, no password | 401 |
| 4 | GET | `/users/get-by-field` | JWT (any role) | 200 `User[]` **incl. password hash** | 400 UNSUPPORTED_FIELD, 422 |
| 5 | POST | `/users` | JWT (any role, no ADMIN check) | 201 `{message,data:{email,fullName,password(hash)}}` | 400 EMAIL_EXISTS / USERNAME_EXISTS, 422 |
| 6 | PUT | `/users` | JWT (self) | 200 full user row **incl. hash** | 400 STUDENT_CANNOT_UPDATE_NAME, 422 (strict) |
| 7 | PUT | `/users/:id` | JWT (any role, no ADMIN check) | 200 full user row **incl. hash** | 400 USER_ID_MUST_BE_UUID / USER_NOT_FOUND, 422 |
| 8 | PUT | `/users/:id/status` | JWT (any role, no ADMIN check) | 200 full user row **incl. hash** | 400 UUID / NOT_FOUND |
| 9 | DELETE | `/users/:id` | JWT (any role, no ADMIN check) | 200 `{id}` | 400 UUID / NOT_FOUND |
| 10 | POST | `/users/change-password` | JWT (self) | 200 `{message}` | 401 CURRENT_PASSWORD_INCORRECT, 422 |
| 11 | POST | `/auth/register` | Public | 200 `{user}` (TUTOR) | 400 EMAIL_EXISTS / USERNAME_EXISTS, 422 |
| 12 | POST | `/auth/login` | Public | 200 `{accessToken, refreshToken, user}` | 400 USER_NOT_FOUND / INVALID_PASSWORD, 422 |
| 13 | POST | `/auth/login/user-code` | Public | 200 token pair | 400 USER_NOT_FOUND / INVALID_PASSWORD, 422 |
| 14 | POST | `/auth/refresh` | Public | 200 token pair | 401 (invalid/expired, wrong typ, user gone), 422 |
| 15 | POST | `/auth/forgot-password` | Public | 200 `{ok:true}` | 400 USER_NOT_FOUND (enumeration), 504/500 on MQ failure |
| 16 | POST | `/auth/reset-password` | **JWT required** | 200 `{ok:true}` | 401 (no access token), 400 INVALID_RESET_PASSWORD_TOKEN, 422 |
| 17 | GET | `/auth/google` | Public | 302 to Google | Passport failure |
| 18 | GET | `/auth/google/callback` | Public (Passport) | 302 to frontend with tokens in query | Passport failure, 400 FAILED_TO_CREATE_USER |
| 19 | GET | `/auth/facebook` | Public | 302 to Facebook | Passport failure |
| 20 | GET | `/auth/facebook/callback` | Public (Passport) | 302 to frontend with tokens in query | Passport failure, 400 FAILED_TO_CREATE_USER |
| 21 | GET | `/students/get-student-code` | JWT (any role) | 200 string (6-char code) | 409 UNABLE_TO_GENERATE_UNIQUE_CODE |
| 22 | POST | `/students` | JWT (any role) | 201 full student row **incl. hash** | 409 STUDENT_CODE_EXISTS, 500 on duplicate email |
| 23 | GET | `/students` | JWT (any role) | 200 `{students, pagination}` | 422 |
| 24 | GET | `/students/:id` | JWT (any role) | 200 student detail | 404 STUDENT_NOT_FOUND, 500 if id not UUID |
| 25 | PUT | `/students/:id` | JWT (any role) | 200 full row **incl. hash** | 404 STUDENT_NOT_FOUND, 422, 500 on non-UUID / duplicate |
| 26 | DELETE | `/students/:id` | JWT (any role) | 200 `{id}` | 404 STUDENT_NOT_FOUND, 500 if id not UUID |
| 27 | POST | `/admin/tutors` | JWT + ADMIN | 201 tutor (no hash) | 409 EMAIL_EXISTS / USERNAME_EXISTS, 422 (strict) |
| 28 | GET | `/admin/tutors` | JWT + ADMIN | 200 `{tutors, pagination}` | 422 |
| 29 | GET | `/admin/tutors/:id` | JWT + ADMIN | 200 tutor | 400 ADMIN_INVALID_ID, 404 TUTOR_NOT_FOUND |
| 30 | PUT | `/admin/tutors/:id` | JWT + ADMIN | 200 tutor | 400, 404, 409, 422 (strict) |
| 31 | DELETE | `/admin/tutors/:id` | JWT + ADMIN | 200 `{id}` | 400, 404; **cascades to linked students** |
| 32 | POST | `/admin/students` | JWT + ADMIN | 201 student (no hash) | 409, 422 (strict) |
| 33 | GET | `/admin/students` | JWT + ADMIN | 200 `{students, pagination}` | 422 |
| 34 | GET | `/admin/students/:id` | JWT + ADMIN | 200 student + parent | 400, 404 STUDENT_NOT_FOUND |
| 35 | PUT | `/admin/students/:id` | JWT + ADMIN | 200 student detail | 404 PARENT/TUTOR/STUDENT_NOT_FOUND, 409 STUDENT_CODE_EXISTS, 422 |
| 36 | DELETE | `/admin/students/:id` | JWT + ADMIN | 200 `{id}` | 400, 404 |
| R1 | RPC | `user.getUsers` | none (queue) | `{data, pagination}` | 500 |
| R2 | RPC | `user.getDetailUser` | none | user row or null | - |
| R3 | RPC | `user.getUserByField` | none | `User[]` **incl. hash** | 400 UNSUPPORTED_FIELD |
| R4 | RPC | `user.createUser` | none | `{message, data:{email,fullName,password(hash)}}` | 400 EMAIL_EXISTS / USERNAME_EXISTS |
| R5 | RPC | `user.updateUser` | none (role from payload) | full row **incl. hash** | 400 STUDENT_CANNOT_UPDATE_NAME |
| R6 | RPC | `user.updateUserByAdmin` | none (no role check) | full row **incl. hash** | 400 |
| R7 | RPC | `user.updateStatusUser` | none | full row **incl. hash** | 400 |
| R8 | RPC | `user.deleteUserByAdmin` | none | `{id}` | 400 |
| R9 | RPC | `user.changePassword` | none | `{message}` | 401 CURRENT_PASSWORD_INCORRECT, 400 USER_NOT_FOUND |
| R10 | RPC | `auth.register` | none | `{user}` | 400 |
| R11 | RPC | `auth.login` | none | token pair | 400 USER_NOT_FOUND / INVALID_PASSWORD |
| R12 | RPC | `auth.loginByUserCode` | none | token pair | 400 |
| R13 | RPC | `auth.refresh` | none | token pair | 401 |
| R14 | RPC | `auth.forgotPassword` | none | `{ok:true}` | 400 USER_NOT_FOUND |
| R15 | RPC | `auth.resetPassword` | none | `{ok:true}` | 400 INVALID_RESET_PASSWORD_TOKEN |
| R16 | RPC | `auth.googleLogin` | none | token pair | 400 FAILED_TO_CREATE_USER |
| R17 | RPC | `auth.facebookLogin` | none | token pair | 400 FAILED_TO_CREATE_USER |
| R18 | Event | `kafka.emit` | none | no reply (log only) | - |
| R19 | RPC | `kafka.ping` | none | empty (log only) | - |
| R20 | RPC | `kafka.user.error` | none | always throws | 400 `data from user failed ...` |
| R21 | RPC | `kafka.user` | none | proxies reply of `kafka.tutor` | 504 on timeout, upstream status |
| R22 | RPC | `kafka.send` | none | canned `{statusCode:200, data:{...}}` (no DB) | - |
| R23 | RPC | `health.postgres` | none | health object (no throw) | returns `status:'unhealthy'` on DB error |

Note: table rows R1-R23 are the RPC/queue handlers. Numbering is only for reference.

---

## HTTP routes

### 1. GET `/`
- Handler: `AppController.getHello`, `src/app.controller.ts:25` (decorator 18).
- Auth: JWT (not `@Public`). Any role.
- Request: none.
- Success: 200, `data: "Hello World!"`.
- Errors: 401 when no or invalid token.
- Downstream: none.

### 2. GET `/users`
- Handler: `UserController.getUsers`, `src/features/user/user.controller.ts:55` (decorator 39). Logic `src/features/user/user.service.ts:53`.
- Auth: JWT, any role. No ADMIN check.
- Query (`getUsersQuerySchema`, `src/packages/entities/user/user.schema.ts:33`):
  - `page` int >=1, default 1
  - `limit` int 1-100, default 10. `pageSize` is accepted as alias when `limit` is absent.
  - `search` string, trimmed, optional. ILIKE on email, username, firstName, lastName.
  - `role` enum ADMIN|TUTOR|PARENT|STUDENT, optional
  - `isActive` `'true'|'false'`, optional
- Success: 200, `data: { data: [{id,email,name,role,status:'active'|'inactive',createdAt}], pagination:{page,pageSize,total,totalPages} }`. No password.
- Errors: 422 invalid query, 401.
- Downstream: DB `users` (count + paginate).

### 3. GET `/users/detail-user`
- Handler: `UserController.getDetailUserController`, `user.controller.ts:72` (decorator 62).
- Auth: JWT, returns the caller's own row (`@CurrentUser().id`).
- Request: none.
- Success: 200, user row minus `password` (`user.service.ts:87`). `data` is `null` if row is gone.
- Errors: 401; 400 USER_ID_MUST_BE_UUID (only if token sub is not a UUID).
- Downstream: DB `users`.

### 4. GET `/users/get-by-field`
- Handler: `UserController.getUserByField`, `user.controller.ts:88` (decorator 76). Service `user.service.ts:98`. Repo `user.repository.ts:15-27`.
- Auth: JWT, any role. No ADMIN check.
- Query (`dataFieldSchema`, `user.schema.ts:97`): `field` non-empty string, `value` non-empty string. `field` must be one of `id|email|username|phone|userCode`.
- Success: 200, `data: User[]`. Repo uses `select()` on every column, so each object includes `password` (bcrypt hash), `gradesId`, etc.
- Errors: 400 UNSUPPORTED_FIELD (`user.service.ts:104`), 422 (missing params), 401.
- Downstream: DB `users`.
- Security: any authenticated user can read any user's password hash (by id/email/username/phone/userCode). Also used internally by auth flows.

### 5. POST `/users`
- Handler: `UserController.createUser`, `user.controller.ts:106` (decorator 95). Service `user.service.ts:115`.
- Auth: JWT, any role. No ADMIN check, and `role` is accepted from the body.
- Body (`createUserSchema`, `user.schema.ts:211`):
  - `email` string, required, valid email
  - `firstName` string 2-100, required (trimmed)
  - `lastName` string 2-100, required (trimmed)
  - `username` string 1-100 trimmed, optional. Generated from last+first if absent.
  - `password` string, required, 6-20 chars. Complexity (lower, upper, digit, symbol) is enforced only when length is 8-100, so 6-7 char passwords skip it.
  - `role` enum ADMIN|TUTOR|PARENT|STUDENT, optional, default STUDENT
  - Optional and default-only, not persisted: `avatar` (url), `isActive` (bool, default true), `description`, `userCode`, `gender` (plain string), `dateOfBirth`, `address`, `district`, `province`, `subjects`, `facebookId`, `googleId`, `school`, `relationship`, `classId` (uuid[]), `gradesId` (uuid[]), `parentId` (uuid), `tutorId` (uuid). Repo only writes `id, userCode(TUTOR only), email, username, firstName, lastName, password(hash), role`.
- Success: 201, `data: { message:'User created successfully', data:{ email, fullName, password: <bcrypt hash> } }`. The hash is returned (`user.service.ts:161-168`).
- Errors: 400 EMAIL_EXISTS / USERNAME_EXISTS; 422; 401; 500 on unique race.
- Downstream: DB `users` (select by email and username, userCode lookup, insert).

### 6. PUT `/users` (self)
- Handler: `UserController.updateUserController`, `user.controller.ts:124` (decorator 113). Service `updateOwnProfileService`, `user.service.ts:209`.
- Auth: JWT. Acts on `@CurrentUser().id`.
- Body (`updateUserSchema`, `user.schema.ts:126`, `.strict()`, all optional): `email`, `username` (1-50), `firstName` (2-100), `lastName` (2-100), `avatar` (url|null), `phone` (<=20|null), `isActive` (bool), `role` (ADMIN|TUTOR|PARENT|STUDENT), `description` (<=5000|null), `userCode` (<=6|null), `gender` (MALE|FEMALE|OTHER|null), `dateOfBirth` (date|null), `address` (string|null), `district` (<=30|null), `province` (<=30|null), `subjects` (<=30|null), `facebookId` (<=200|null), `googleId` (<=200|null), `school` (<=255|null), `relationship` (<=50|null), `classId` (uuid|null), `gradesId` (uuid[]), `parentId` (uuid|null), `tutorId` (uuid|null). `password` is not accepted. Unknown keys give 422.
- Rule: a STUDENT caller sending `firstName` or `lastName` gets 400 STUDENT_CANNOT_UPDATE_NAME. No other role check.
- Success: 200, `data` = full updated `users` row **including `password` hash** (`user.repository.ts:108-115`, `.returning()`).
- Errors: 400 STUDENT_CANNOT_UPDATE_NAME, 400 USER_NOT_FOUND, 422, 401, 500 on email/username unique violation.
- Downstream: DB `users`.
- Security: a caller can set their own `role` (e.g. ADMIN) and `isActive`, because the role field is not blocked.

### 7. PUT `/users/:id`
- Handler: `UserController.updateUserByAdminController`, `user.controller.ts:148` (decorator 136). Service `user.service.ts:189`.
- Auth: JWT, any role. No ADMIN check, despite the RPC name `updateUserByAdmin`.
- Path: `id` must be a UUID.
- Body: same `updateUserSchema` as route 6.
- Success: 200, `data` = full updated row **including password hash**.
- Errors: 400 USER_ID_MUST_BE_UUID, 400 USER_NOT_FOUND, 422, 401, 500 on unique violation.
- Downstream: DB `users`.
- Security: any authenticated user can modify any other user, including `role`, `isActive`, and `email`.

### 8. PUT `/users/:id/status`
- Handler: `UserController.updateStatusUserController`, `user.controller.ts:167` (decorator 156). Service `user.service.ts:226`.
- Auth: JWT, any role. No ADMIN check.
- Path: `id` UUID. No body.
- Behaviour: reads the row, then writes `isActive = !isActive` (not atomic).
- Success: 200, `data` = full row **including password hash**.
- Errors: 400 USER_ID_MUST_BE_UUID, 400 USER_NOT_FOUND, 401.
- Downstream: DB `users`.

### 9. DELETE `/users/:id`
- Handler: `UserController.deleteUserByAdminController`, `user.controller.ts:182` (decorator 171). Service `user.service.ts:242`.
- Auth: JWT, any role. No ADMIN check.
- Path: `id` UUID.
- Success: 200, `data: { id }`.
- Errors: 400 USER_ID_MUST_BE_UUID, 400 USER_NOT_FOUND, 401.
- Downstream: DB `users` delete. `parent_id` and `tutor_id` are FKs with `onDelete: cascade` (`src/database/schema.ts`), so deleting a tutor or parent deletes linked students or children.

### 10. POST `/users/change-password`
- Handler: `UserController.changePasswordController`, `user.controller.ts:197` (decorator 186). Service `user.service.ts:259`.
- Auth: JWT (self).
- Body (`changePasswordSchema`, `user.schema.ts:55`):
  - `currentPassword` string, min 1, required
  - `newPassword` string, 8-14 chars, must contain lower, upper, digit, and symbol. Failures give 422.
- Success: 200, `data: { message:'Password changed successfully' }`.
- Errors: 401 CURRENT_PASSWORD_INCORRECT, 400 USER_NOT_FOUND, 422, 401.
- Downstream: DB `users` (read password, update hash). No session revocation.

### 11. POST `/auth/register`
- Handler: `AuthController.register`, `src/features/auth/auth.controller.ts:71` (decorator 47-50, `@Public`). Service `auth.service.ts:83`.
- Auth: Public. Creates a TUTOR (role is hard-coded).
- Body (`registerSchema`, `src/packages/entities/auth/auth.schema.ts:52`; not strict):
  - `email` valid email, required
  - `password` string 6-25 with lower, upper, digit, and symbol (always enforced)
  - `firstName` 1-25, required
  - `lastName` 1-25, required
  - `username` optional string, trimmed in service (no length check)
- Success: 200 (`@HttpCode(OK)`, not 201), `data: { user:{id,email,username,firstName,lastName} }`.
- Errors: 400 EMAIL_EXISTS, 400 USERNAME_EXISTS, 400 FAILED_TO_CREATE_USER (race), 422, 500 on unique race.
- Downstream: DB `users` only. No RMQ calls.

### 12. POST `/auth/login`
- Handler: `AuthController.login`, `auth.controller.ts:118` (decorator 79, `@Public`). Service `auth.service.ts:131`.
- Body (`loginSchema`, `auth.schema.ts:66`): `email` valid, required; `password` 6-25 with complexity (always enforced).
- Success: 200, `data: { accessToken, refreshToken, user:{id,email,userCode,username} }`.
- Errors: 400 USER_NOT_FOUND (unknown email, which allows enumeration), 400 INVALID_PASSWORD (wrong password is 400, not 401), 422.
- Downstream: DB `users` (by email). RMQ `redis.set` fire-and-forget to `third_queue`: key `session:{userId}`, value refresh token, TTL = refresh expiry. Does not check `isActive`.

### 13. POST `/auth/login/user-code`
- Handler: `AuthController.loginByUserCode`, `auth.controller.ts:166` (decorator 126, `@Public`). Service `auth.service.ts:162`.
- Body (`loginByUserCodeSchema`, `auth.schema.ts:71`): `userCode` exactly 6 chars, `password` (same rules as route 12), `role` PARENT|STUDENT.
- Success: 200, same shape as route 12.
- Errors: 400 USER_NOT_FOUND (no user with that code and role), 400 INVALID_PASSWORD, 422.
- Downstream: DB `users` (by `userCode`, then first row with matching role). RMQ `redis.set` session (same as route 12).

### 14. POST `/auth/refresh`
- Handler: `AuthController.refresh`, `auth.controller.ts:193` (decorator 174, `@Public`). Service `auth.service.ts:338`.
- Body (`refreshTokenBodySchema`): `refreshToken` string, min 1.
- Success: 200, `data: { accessToken, refreshToken, user }` (rotated pair).
- Errors: 401 INVALID_OR_EXPIRED_REFRESH_TOKEN (bad signature or expired), 401 INVALID_TOKEN_TYPE (`typ` is not `refresh`), 401 INVALID_TOKEN_PAYLOAD, 401 USER_NO_LONGER_EXISTS, 422.
- Downstream: DB `users` (by id). RMQ `redis.set` session rotate. The Redis session `session:{userId}` is not compared with the presented token.

### 15. POST `/auth/forgot-password`
- Handler: `AuthController.forgotPassword`, `auth.controller.ts:215` (decorator 200, `@Public`). Service `auth.service.ts:269`.
- Body (`forgotPasswordSchema`): `email` valid, required.
- Success: 200, `data: { ok:true }`.
- Errors: 400 USER_NOT_FOUND (enumeration), 422, 504 (MQ timeout) or 500 after the MQ retries.
- Downstream: DB `users` (by email). RMQ request/reply `redis.set` to `third_queue`: key `reset-password:{jti}`, value userId, TTL 300s. RMQ request/reply `email.sendForgotPasswordMail` `{to, resetToken: jti, displayName}` to `third_queue`. `RmqProducer.send` retries up to 3 attempts on any error, which can duplicate the email.

### 16. POST `/auth/reset-password`
- Handler: `AuthController.resetPassword`, `auth.controller.ts:253` (decorator 222-223). **Not `@Public`.** Service `auth.service.ts:296`.
- Auth: JWT required. A valid access token is needed even though the caller has only the emailed `jti`. This looks unintended. Verify against the frontend.
- Body (`resetPasswordSchema`, `auth.schema.ts:112`): `jti` UUID (422 otherwise), `password` (6-25 with complexity), `confirmPassword` (must equal `password`). `newPassword` is accepted as an alias for `password`.
- Success: 200, `data: { ok:true }`.
- Errors: 401 (no or invalid access token), 400 INVALID_RESET_PASSWORD_TOKEN (key missing or expired), 400 USER_NOT_FOUND, 400 FAILED_TO_UPDATE_PASSWORD, 422.
- Downstream: RMQ request/reply `redis.get` `{key:'reset-password:{jti}'}` on `third_queue`. DB `users` (read, then update hash). RMQ emit `redis.del` `{keys:[key]}` (best-effort). The token is single-use only after that delete succeeds.
- Logs: `console.log(resetPasswordDto)` at `auth.controller.ts:257` writes the plaintext password to stdout.

### 17. GET `/auth/google`
- Handler: `AuthController.googleAuth`, `auth.controller.ts:269` (decorator 261-263, `@Public`, `AuthGuard('google')`). Strategy `src/packages/strategy/google.strategy.ts` (scope email, profile).
- Success: 302 redirect to Google consent.
- Errors: Passport default failures.
- Downstream: none.

### 18. GET `/auth/google/callback`
- Handler: `AuthController.googleAuthCallback`, `auth.controller.ts:284` (decorator 273-275, `@Public`, `AuthGuard('google')`). Service `auth.service.ts:227` (`googleLoginService`).
- Query: `code`, `state` from Google (Passport).
- Behaviour: find user by `email`. If none, create a STUDENT with a random password. Issue tokens. `googleId` is not stored or linked.
- Success: 302 to `GOOGLE_OAUTH_REDIRECT_URL` (default `http://localhost:3000/oauth/callback`), with `?accessToken=&refreshToken=` in the URL.
- Errors: Passport failure, 400 FAILED_TO_CREATE_USER.
- Downstream: DB `users`. RMQ `redis.set` session (fire-and-forget).

### 19. GET `/auth/facebook`
- Handler: `AuthController.facebookAuth`, `auth.controller.ts:309` (decorator 301-303, `@Public`, `AuthGuard('facebook')`). Strategy scope `email`.
- Success: 302 to Facebook. Errors: Passport failure. Downstream: none.

### 20. GET `/auth/facebook/callback`
- Handler: `AuthController.facebookAuthCallback`, `auth.controller.ts:325` (decorator 314-316, `@Public`). Service `facebookLoginService`, `auth.service.ts:193`.
- Behaviour: same as route 18 (match by email, create STUDENT if missing).
- Success: 302 to `GOOGLE_OAUTH_REDIRECT_URL` (not a Facebook-specific variable), tokens in query.
- Errors: Passport failure, 400 FAILED_TO_CREATE_USER.
- Downstream: DB `users`. RMQ `redis.set` session.

### 21. GET `/students/get-student-code`
- Handler: `StudentController.generateStudentCodeController`, `src/features/student/student.controller.ts:39` (decorator 32).
- Auth: JWT, any role.
- Success: 200, `data` = 6-char code (`generateCode()`, A-Z0-9). Not reserved or stored.
- Errors: 409 UNABLE_TO_GENERATE_UNIQUE_CODE (after 5 tries). 401.
- Downstream: DB `users` (userCode lookup, any role).

### 22. POST `/students`
- Handler: `StudentController.create`, `student.controller.ts:104` (decorator 44). Service `student.service.ts:85`.
- Auth: JWT, any role (including STUDENT and PARENT). Creator id is stored as `tutorId` on both records.
- Body (`createStudentSchema`, `src/packages/entities/student/student.schema.ts:3`; not strict):
  - `studentName` string 1-255, required. Split on first space.
  - `email` valid, optional. Default `<username>@no-email.local`.
  - `userCode` string 1-50, optional. Auto-generated if absent.
  - `gender` MALE|FEMALE|OTHER, optional
  - `studentPhone` <=20, `school` <=255, optional
  - `parentName` 1-255, optional. If given, a PARENT is created.
  - `parentRelationship` FATHER|MOTHER|GUARDIAN, optional
  - `parentPhone` <=20, `parentEmail` valid, optional
- Behaviour: student password is hard-coded `Student@123456`. Parent password is hard-coded `Parent@123456`. Parent email defaults to `''`.
- Success: 201, `data` = full inserted student row **including password hash** (`student.repository.ts:30-34`, `.returning()`).
- Errors: 409 STUDENT_CODE_EXISTS (any user with that userCode), 422, 401, 500 on duplicate `email` or a second parent with empty email (unique constraint).
- Downstream: DB `users` (insert 1-2 rows).

### 23. GET `/students`
- Handler: `StudentController.getAllStudents`, `student.controller.ts:138` (decorator 112). Service `student.service.ts:152`. Repo `student.repository.ts:99`.
- Auth: JWT, any role. No tutor scoping.
- Query (`getStudentsQuerySchema`): `page` int >=1 (default 1), `limit` 1-100 (default 10), `search` (trimmed, searches userCode, firstName, lastName), `tutorId` UUID, `gender` enum, `isActive` `'true'|'false'`.
- Success: 200, `data: { students:[{id,email,username,firstName,lastName,userCode,phone,avatar,gender,dateOfBirth,school,address,district,province,parentId,parentName,parentPhone,parentEmail,parentRelationship,parent,role,isActive,createdAt,updatedAt}], pagination:{total,page,limit,totalPages} }`. No password. `parent` is an object with parent fields, or null.
- Errors: 422, 401.
- Downstream: DB `users` (left join `users` as parent).

### 24. GET `/students/:id`
- Handler: `StudentController.findById`, `student.controller.ts:210` (decorator 145). Service `student.service.ts:200`.
- Auth: JWT, any role. No ownership check.
- Path: `id` is **not** validated as UUID. A non-UUID causes a Postgres error, which becomes 500.
- Success: 200, `data` = detail object (same fields as list plus `parent` detail), no password.
- Errors: 404 STUDENT_NOT_FOUND, 500 (non-UUID id), 401.
- Downstream: DB `users` (student row, then parent row).

### 25. PUT `/students/:id`
- Handler: `StudentController.update`, `student.controller.ts:250` (decorator 214). Service `student.service.ts:251`.
- Auth: JWT, any role. No ownership check.
- Path: `id` not validated as UUID (500 if invalid).
- Body (`updateStudentSchema`, not strict): `studentName` 1-255, `studentPhone` <=20, `gender`, `birthday` (coerce date), `school` <=255, `address` <=500, `district` <=30, `province` <=30, `parentName` 1-255, `parentPhone` <=20, `parentEmail` valid, `parentRelationship` FATHER|MOTHER|GUARDIAN, `parentAddress` <=500, `parentDistrict` <=30, `parentProvince` <=30, `avatar` url|null.
- Behaviour: updates the student row. If a parent is linked, updates it. If not, and `parentName` is given, creates a PARENT (password `Parent@123456`, email `parentEmail` or `''`) and links it.
- Success: 200, `data` = full student row **including password hash** (`student.repository.ts:72-79`). When only parent fields change, the `findById` row is returned, which includes the student and nested parent `password` hashes.
- Errors: 404 STUDENT_NOT_FOUND, 422, 401, 500 (non-UUID id, duplicate parent email).
- Downstream: DB `users`.

### 26. DELETE `/students/:id`
- Handler: `StudentController.delete`, `student.controller.ts:263` (decorator 258). Service `student.service.ts:344`.
- Auth: JWT, any role. No ownership check.
- Path: `id` not validated as UUID.
- Success: 200, `data: { id }`. Parent is not deleted.
- Errors: 404 STUDENT_NOT_FOUND, 500 (non-UUID id), 401.
- Downstream: DB `users` (delete, role STUDENT only).

### 27. POST `/admin/tutors`
- Handler: `AdminController.createTutor`, `src/features/admin/admin.controller.ts:120` (decorator 115). Service `admin.service.ts:26`.
- Auth: JWT + ADMIN (`RolesGuard`). Non-admin gets 403, missing token gets 401.
- Body (`createManagedUserSchema`, `src/packages/entities/admin/admin.schema.ts:45`, `.strict()`):
  - `email` valid, required (lowercased in service)
  - `firstName` 2-100, `lastName` 2-100, required (trimmed)
  - `password` 6-20, required. Complexity is enforced only at 8-14 chars.
  - `username` 1-50 trimmed, optional. Generated if absent.
  - `phone` <=20, `gender` enum, `dateOfBirth` (coerce date), `school` <=255, `subjects` string[] (<=20 items, non-empty), `description` <=5000, `isActive` bool, default true.
- Success: 201, `data` = public tutor row (no password) with `userCode` (generated 6-char code) and `subjects` as string[].
- Errors: 409 EMAIL_EXISTS, 409 USERNAME_EXISTS, 409 UNABLE_TO_GENERATE_USERNAME / UNABLE_TO_GENERATE_USER_CODE, 422.
- Downstream: DB `users`.

### 28. GET `/admin/tutors`
- Handler: `AdminController.listTutors`, `admin.controller.ts:137` (decorator 124). Service `admin.service.ts:30`.
- Auth: JWT + ADMIN.
- Query (`listManagedUsersQuerySchema`): `page` (default 1), `limit` 1-100 (default 10), `search` (email, username, first, last, phone), `isActive` `'true'|'false'`.
- Success: 200, `data: { tutors:[...], pagination:{total,page,limit,totalPages} }`.
- Errors: 422, 401, 403.
- Downstream: DB `users`.

### 29. GET `/admin/tutors/:id`
- Handler: `AdminController.getTutor`, `admin.controller.ts:150` (decorator 144).
- Auth: JWT + ADMIN.
- Path: UUID, else 400 ADMIN_INVALID_ID.
- Success: 200, tutor object (public columns, `subjects` array).
- Errors: 400, 404 TUTOR_NOT_FOUND, 401, 403.
- Downstream: DB `users` (role TUTOR).

### 30. PUT `/admin/tutors/:id`
- Handler: `AdminController.updateTutor`, `admin.controller.ts:160` (decorator 154).
- Auth: JWT + ADMIN.
- Body (`updateManagedUserSchema`, `.strict()`, all optional): `email`, `username` (1-50), `firstName`, `lastName` (2-100), `phone` (nullable), `gender` (nullable), `dateOfBirth` (nullable), `school` (nullable), `subjects` (nullable string[] <=20), `description` (nullable), `avatar` (url nullable), `isActive`. `password`, `role`, `userCode` are rejected (422).
- Success: 200, updated public tutor row.
- Errors: 400 ADMIN_INVALID_ID, 404 TUTOR_NOT_FOUND, 409 EMAIL_EXISTS / USERNAME_EXISTS, 422, 401, 403.
- Downstream: DB `users`.

### 31. DELETE `/admin/tutors/:id`
- Handler: `AdminController.deleteTutor`, `admin.controller.ts:172` (decorator 167).
- Auth: JWT + ADMIN.
- Success: 200, `data: { id }`.
- Errors: 400, 404 TUTOR_NOT_FOUND, 401, 403.
- Downstream: DB `users` delete. The `tutor_id` FK cascades, so students linked to this tutor are deleted too.

### 32. POST `/admin/students`
- Handler: `AdminController.createStudent`, `admin.controller.ts:185` (decorator 177).
- Auth: JWT + ADMIN.
- Body: same `createManagedUserSchema` as route 27.
- Success: 201, public student row (no password). `userCode` stays null (code is generated only for TUTOR).
- Errors: 409 EMAIL_EXISTS / USERNAME_EXISTS, 422, 401, 403.
- Downstream: DB `users`.

### 33. GET `/admin/students`
- Handler: `AdminController.listStudents`, `admin.controller.ts:205` (decorator 189).
- Auth: JWT + ADMIN.
- Query: same as route 28.
- Success: 200, `data: { students:[...public columns...], pagination }`. No parent or tutor join.
- Errors: 422, 401, 403.
- Downstream: DB `users`.

### 34. GET `/admin/students/:id`
- Handler: `AdminController.getStudent`, `admin.controller.ts:218` (decorator 212). Service `admin.service.ts:55`.
- Auth: JWT + ADMIN.
- Path: UUID, else 400 ADMIN_INVALID_ID.
- Success: 200, public student row plus `address`, `district`, `province`, `tutorId`, `subjects` (array), and `parent: {id, firstName, lastName, email, phone, relationship, userCode, avatar} | null`. `parentId` is stripped from the response.
- Errors: 400, 404 STUDENT_NOT_FOUND, 401, 403.
- Downstream: DB `users` (student row, then parent row).

### 35. PUT `/admin/students/:id`
- Handler: `AdminController.updateStudent`, `admin.controller.ts:231` (decorator 222). Service `admin.service.ts:66`.
- Auth: JWT + ADMIN.
- Body (`updateManagedStudentSchema`, `.strict()`): all fields of route 30 plus `userCode` (<=6), `address` (nullable string), `district` (<=30 nullable), `province` (<=30 nullable), `parentId` (uuid nullable), `tutorId` (uuid nullable).
- Behaviour: if `userCode` is taken by another user, 409. If `parentId` is not a PARENT, 404 PARENT_NOT_FOUND. If `tutorId` is not a TUTOR, 404 TUTOR_NOT_FOUND. Then updates. Invalid id is caught later, after those checks.
- Success: 200, student detail (same shape as route 34).
- Errors: 409 STUDENT_CODE_EXISTS / EMAIL_EXISTS / USERNAME_EXISTS, 404 PARENT_NOT_FOUND / TUTOR_NOT_FOUND / STUDENT_NOT_FOUND, 400, 422, 401, 403.
- Downstream: DB `users`.

### 36. DELETE `/admin/students/:id`
- Handler: `AdminController.deleteStudent`, `admin.controller.ts:243` (decorator 238).
- Auth: JWT + ADMIN.
- Success: 200, `data: { id }`.
- Errors: 400, 404 STUDENT_NOT_FOUND, 401, 403.
- Downstream: DB `users` delete.

---

## RPC / queue handlers (`user_queue`, RabbitMQ)

All RPC handlers are in `src/features/user/user.rpc.controller.ts` and `src/features/auth/auth.rpc.controller.ts`, plus `src/app.controller.ts`. They skip the Zod pipes and the HTTP guards (see Unclear). Each delegates to the same service as its HTTP twin.

### R1. `user.getUsers`
- File: `user.rpc.controller.ts:22`.
- Payload: `GetUsersQueryDto` (not re-validated).
- Reply: `{ data, pagination }`.
- Downstream: DB `users`.

### R2. `user.getDetailUser`
- File: `user.rpc.controller.ts:27`.
- Payload: `{ userId }`.
- Reply: user row without password, or null. 400 if userId is not a UUID.
- Downstream: DB `users`.

### R3. `user.getUserByField`
- File: `user.rpc.controller.ts:32`.
- Payload: `{ field, value }`.
- Reply: `User[]` **including password hash**.
- Errors: 400 UNSUPPORTED_FIELD.
- Downstream: DB `users`.

### R4. `user.createUser`
- File: `user.rpc.controller.ts:37`.
- Payload: `CreateUserDto`. Service-level checks only: no password policy, `role` any value.
- Reply: `{ message, data:{ email, fullName, password: <hash> } }`.
- Errors: 400 EMAIL_EXISTS / USERNAME_EXISTS.
- Downstream: DB `users`.

### R5. `user.updateUser`
- File: `user.rpc.controller.ts:42`.
- Payload: `{ userId, role, ...UpdateUserDto }`. `role` is trusted from the caller.
- Reply: full row **including password hash**.
- Errors: 400 STUDENT_CANNOT_UPDATE_NAME, 400 USER_NOT_FOUND.
- Downstream: DB `users`.

### R6. `user.updateUserByAdmin`
- File: `user.rpc.controller.ts:49`.
- Payload: `{ id, ...UpdateUserDto }`. No role check here.
- Reply: full row **including password hash**.
- Downstream: DB `users`.

### R7. `user.updateStatusUser`
- File: `user.rpc.controller.ts:54`.
- Payload: `{ id }`. Toggles `isActive`.
- Reply: full row **including password hash**.
- Downstream: DB `users`.

### R8. `user.deleteUserByAdmin`
- File: `user.rpc.controller.ts:59`.
- Payload: `{ id }`.
- Reply: `{ id }`. Cascades as in route 9.
- Downstream: DB `users`.

### R9. `user.changePassword`
- File: `user.rpc.controller.ts:64`.
- Payload: `{ userId, currentPassword, newPassword }`. `newPassword` is **not** complexity-checked here (the HTTP route checks it with Zod).
- Reply: `{ message }`.
- Errors: 401 CURRENT_PASSWORD_INCORRECT, 400 USER_NOT_FOUND.
- Downstream: DB `users`.

### R10. `auth.register`
- File: `auth.rpc.controller.ts:28`.
- Payload: `RegisterDto` (not Zod-validated, so the password policy is skipped).
- Reply: `{ user }`. Creates a TUTOR.
- Downstream: DB `users`.

### R11. `auth.login`
- File: `auth.rpc.controller.ts:33`.
- Payload: `LoginDto`. Reply: token pair plus user. Errors: 400 USER_NOT_FOUND / INVALID_PASSWORD.
- Downstream: DB `users`. RMQ `redis.set` session (`third_queue`).

### R12. `auth.loginByUserCode`
- File: `auth.rpc.controller.ts:38`.
- Payload: `{ userCode, password, role }`. Same reply and errors as R11.
- Downstream: DB `users`. RMQ `redis.set` session.

### R13. `auth.refresh`
- File: `auth.rpc.controller.ts:43`.
- Payload: `{ refreshToken }`. Reply: token pair. Errors: 401.
- Downstream: DB `users`. RMQ `redis.set` session.

### R14. `auth.forgotPassword`
- File: `auth.rpc.controller.ts:48`.
- Payload: `{ email }`. Reply: `{ ok:true }`. Errors: 400 USER_NOT_FOUND.
- Downstream: DB `users`. RMQ `redis.set` `reset-password:{jti}` (TTL 300s), RMQ `email.sendForgotPasswordMail` (both `third_queue`).

### R15. `auth.resetPassword`
- File: `auth.rpc.controller.ts:53`.
- Payload: `{ jti, password, confirmPassword? }`. Not Zod-validated, so `jti` UUID and password match are not checked. Only `jti` and `password` are read. The `newPassword` alias is not handled here.
- Reply: `{ ok:true }`. Errors: 400 INVALID_RESET_PASSWORD_TOKEN, 400 USER_NOT_FOUND.
- Downstream: RMQ `redis.get`, `redis.del` (emit), DB `users`.

### R16. `auth.googleLogin`
- File: `auth.rpc.controller.ts:58`.
- Payload: `GoogleProfile` `{googleId, email, firstName, lastName, avatar?}`. `googleId` is not stored.
- Reply: token pair. Creates a STUDENT when the email is new.
- Downstream: DB `users`. RMQ `redis.set` session.

### R17. `auth.facebookLogin`
- File: `auth.rpc.controller.ts:63`.
- Payload: `FacebookProfile` `{facebookId, email, firstName, lastName, avatar?}`. `facebookId` is not stored.
- Reply: token pair. Creates a STUDENT when the email is new.
- Downstream: DB `users`. RMQ `redis.set` session.

### R18. `kafka.emit` (EventPattern)
- File: `src/app.controller.ts:29-32`.
- Payload: any. Logs only. No reply.

### R19. `kafka.ping`
- File: `src/app.controller.ts:34-37`.
- Payload: any. Logs and returns void (empty reply).

### R20. `kafka.user.error`
- File: `src/app.controller.ts:39-43`.
- Always throws `BadRequestException('data from user failed ...')`. Reply: `{statusCode:400, message, serviceName}`.

### R21. `kafka.user`
- File: `src/app.controller.ts:45-49`.
- Payload: any. Forwards to `kafka.tutor` (route in `rmq.constants.ts` to `tutor_queue`) via `RmqProducer.send`, which retries up to 3 attempts with 10s timeout each. Returns the tutor's reply.
- Errors: 504 on timeout. Upstream status otherwise.
- Downstream: `tutor_queue` (`kafka.tutor`).

### R22. `kafka.send`
- File: `src/app.controller.ts:51-103`.
- Payload: `{email?, firstName?, lastName?, username?, role?, timestamp?}`.
- Reply: canned `{statusCode:200, message, data:{ userId:'generated-uuid-<ts>', email, fullName, username, role (default STUDENT), processedAt, receivedAt }}`. **No DB access and nothing is persisted.**

### R23. `health.postgres`
- File: `src/app.controller.ts:105-164`.
- Payload: optional `{ fetchData?: boolean }`.
- Behaviour: `db.query.users.findMany()` loads every user row (including password hash) into memory and counts them by role. Sample users (5 items, no password) are returned only when `fetchData` is true.
- Reply: `{ status:'healthy', database:'PostgreSQL', connection:'connected', timestamp, message, stats:{ totalUsers, byRole:{admin,tutor,student,parent} }, sampleUsers? }`. On DB error it returns `{ status:'unhealthy', ... }` and does not throw.
- Routing: `RMQ_PATTERN_ROUTES` sends it to `user_queue`.

---

## Downstream calls (all routes)

- **Postgres (`users` table via Drizzle):** every user, student, and admin route, plus `auth.*` and `user.*` RPC. `grades` is only used by `findGradesByUser`/`findGradeById` in `user.repository.ts`, which no route calls.
- **RabbitMQ to `third_queue` (THIRD_SERVICE):**
  - `redis.set` (request/reply, awaited in forgot-password; sent but not awaited in login, refresh, and OAuth callbacks). Keys: `session:{userId}`, `reset-password:{jti}`.
  - `redis.get` (request/reply in reset-password).
  - `redis.del` (emit in reset-password, and in logout which has no route).
  - `email.sendForgotPasswordMail` (request/reply in forgot-password).
  - `log.create` (emit): `main.ts` ships every RPC-hop log row via `setLogSink`.
- **RabbitMQ to `tutor_queue` (TUTOR_SERVICE):** `kafka.tutor`, forwarded from `kafka.user`.
- **Kafka:** none. The module has no Kafka client. The `kafka.*` names are RabbitMQ patterns on `user_queue`.

## Unclear / not verified

1. **Guards on RPC handlers.** Not verified whether the global `APP_GUARD` `JwtAuthGuard` runs for `@MessagePattern` handlers. If it did, `request.headers` would be undefined in RPC context and every RPC would fail. RPC handlers are therefore assumed to be trusted by queue access only. Gateway enforcement was not checked, as the gateway repo was not read.
2. **Student list `parent` object.** Drizzle left-join nested objects may yield `{id:null,...}` rather than `null` when no parent exists. This would make `parentName` a truthy string like "null null" in `GET /students`. Not verified against a live DB.
3. **Schema drift.** `src/database/schema.ts` says it mirrors the gateway canonical schema. Unique constraints on `email`/`username` are taken from this mirror and were not checked against the real DB.
4. **Success message text.** Routes use the default `'SUCCESS'` translated, except the auth routes that use `@ApiResponse` (copy-pasted "Login successful" on several). Translations in `src/data/i18n/success.i18n.ts` were not read in detail.
5. **Passport strategy details.** `google.strategy.ts` and `facebook.strategy.ts` were read only for scope and callback lines. Whether provider emails are verified was not checked. Accounts are matched by email only, so this may allow account takeover if provider email is unverified. Not verified.
6. **JWT secret fallback.** If `JWT_ACCESS_SECRET` and `JWT_SECRET` are unset, both the guard and the signer fall back to `'dev-insecure-jwt-secret'`. Not verified in deployed env.
7. **Role staleness.** `role` is read from the access JWT, not the DB, so role changes take effect only after the access token expires (default 3h per `DEFAULT_JWT_ACCESS_EXPIRES_SECONDS`).
8. **Refresh tokens are not checked against Redis.** `refreshTokens` verifies the JWT signature and user existence only. It does not compare the token with `session:{userId}`, so old refresh tokens stay valid until they expire. Logout (`logoutService`) has no route, so the session cannot be revoked.
9. **Not read:** `logger.interceptor.ts`, `trace-context.interceptor.ts`, `jwt-user.strategy.ts` (may be unused), `app.service.ts` beyond `getHello`, and `packages/helpers` beyond the functions cited. `API_ENDPOINTS.md` and `PAGES_API_REVIEW.md` were not compared.
10. **Dead code.** `logoutService` (`auth.service.ts:378`) and grade repo methods have no route or handler.
