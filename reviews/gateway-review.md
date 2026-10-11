# Review: gateway

## Tổng quan

- **Phạm vi**: `D:\projects\gateway` (NestJS 11 / Bun, gateway mỏng chuyển tiếp RMQ sang `user`, `tutor-service`, `third-service`). Đã đọc CLAUDE.md, AGENTS.md, API_ENDPOINTS.md, KNOWN_ISSUES.md, `gateway.architecture.md`, `auth-flows-rmq.md` (xem lướt các đoạn liên quan).
- **File đã review**: `src/main.ts`, `app.module.ts`, `app.controller.ts`, `features/rabbitmq/*`, các controller trong `src/features/*` (auth, user, admin, student, class, session, schedule, curriculum, chapter, lesson, exercise, tuition, notification, attendance, report, dashboard, ai-chat, log, redis, upload, email, test-scenario), `packages/guards/*`, `packages/strategy/*`, `packages/helpers/jwt.helper.ts`, `packages/configs/jwt-sign.config.ts`, `packages/interceptor/*`, `packages/filters/*`, `packages/pipes/*`, `packages/context/*`, các schema Zod (auth, user, admin, student, notification, redis), `src/database/schema.ts`, `drizzle/*.sql` + `_journal.json`, `drizzle.config.ts`.
- **Không review sâu**: logic thực của `user` / `tutor-service` / `third-service` (repo khác), nên một số lỗi phân quyền phụ thuộc downstream được ghi rõ là "gateway không chặn/không truyền" hoặc "Cần xác minh".
- **Đánh giá chung**: Gateway gần như KHÔNG có phân quyền (RBAC): `RolesGuard` không phải global, chỉ gắn ở admin/log/report/test-scenario. Các route quản trị user (`/users`, `/students`), upload, redis, notification, chapter, lesson đều mở cho mọi user đăng nhập (upload/email mở cho cả người chưa đăng nhập). Ngoài ra có lỗi leo thang đặc quyền qua `PUT /users` (client tự đặt `role`), `RmqProducer.send` retry cả lỗi nghiệp vụ và request không idempotent, `/admin/tutors` tạo/liệt kê sai role, và `POST /auth/reset-password` không public. Nên xử lý nhóm Critical/High trước khi lên production.

## Thống kê

| Severity | Số lượng |
| --- | --- |
| Critical | 5 |
| High | 7 |
| Medium | 12 |
| Low | 5 |
| **Tổng** | **29** |

## Danh sách bug

| ID | Severity | File:line | Mô tả | Kịch bản lỗi | Đề xuất sửa |
| --- | --- | --- | --- | --- | --- |
| GW-01 | Critical | `src/features/user/user.controller.ts:142` | `PUT /users` build payload `{ userId, role: _user.role, ..._updateUserDto }`; `updateUserSchema` cho phép `role`, `isActive`, `userCode`, `googleId`, `facebookId` (user.schema.ts:155-209). DTO spread sau nên ghi đè `role` | STUDENT gọi `PUT /users {"role":"ADMIN"}` tự nâng quyền; đổi `isActive`, `googleId` của chính mình | Tách schema self-update (bỏ các trường nhạy cảm), đặt `userId`/`role` SAU spread |
| GW-02 | Critical | `src/features/user/user.controller.ts:69-72,121-123,157-162,176-177,191-192` | Không có `@Roles`/`RolesGuard` cho `GET /users`, `POST /users`, `PUT /users/:id`, `PUT /users/:id/status`, `DELETE /users/:id`, `GET /users/get-by-field` (gọi `user.updateUserByAdmin`, `user.deleteUserByAdmin`...) | Mọi user đăng nhập (kể cả STUDENT) liệt kê, tạo (role ADMIN), sửa, khoá, xoá bất kỳ user | `@UseGuards(RolesGuard) @Roles('ADMIN')` cho route quản trị; giới hạn `get-by-field` |
| GW-03 | Critical | `src/features/upload/upload.controller.ts:43,68,95,110` | Cả 4 route upload/multiple/download/delete đều `@Public()`. `DELETE /upload/:key` không cần đăng nhập | Ai cũng xoá file R2 theo key, upload file tuỳ ý vào bucket, tải file bất kỳ | Bỏ `@Public()` cho upload/delete; kiểm quyền sở hữu key; chỉ public download với key công khai |
| GW-04 | Critical | `src/features/auth/auth.controller.ts:223-224` | `POST /auth/reset-password` thiếu `@Public()` (chỉ có `@ApiBearerAuth`) trong khi forgot-password public; guard toàn cục đòi Bearer | Người quên mật khẩu không có token nên bị 401, luồng reset không dùng được (auth-flows-rmq.md:241 mô tả client chỉ gửi `jti`) | Thêm `@Public()` và sửa API_ENDPOINTS.md:70-74 |
| GW-05 | Critical | `src/features/redis/redis.controller.ts:30-34`, `src/packages/entities/redis/redis.schema.ts` | `GET /redis?key=` cho mọi user đọc key Redis bất kỳ (`session:<id>`, `reset-password:<jti>`...); schema chỉ `min(1)` | User đọc session/reset-token của người khác; lộ `jti` thì chiếm tài khoản qua reset | Xoá route hoặc `@Roles('ADMIN')` + allowlist prefix |
| GW-06 | High | `src/features/rabbitmq/rmq.producer.ts:119-186` | `send()` retry mọi lỗi (kể cả lỗi nghiệp vụ 400/401/404/409/422 từ downstream) tối đa 3 lần, và retry cả khi timeout dù downstream có thể đã xử lý | `POST /classes`, `/tuitions`, `auth.register`, `notification.create` timeout lần 1 nhưng vẫn được xử lý, tạo trùng bản ghi; lỗi 4xx bị gọi lại 3 lần | Chỉ retry lỗi hạ tầng, không retry lỗi RPC có `statusCode`; `maxRetries=0` cho thao tác ghi |
| GW-07 | High | `src/features/rabbitmq/rmq.producer.ts:122,132` | Timeout mặc định 10s cho mọi pattern; không call site nào truyền timeout riêng | `ai.chat` (LLM), `testscenario.run` (đồng bộ), `testscenario.generate`, `upload.*` vượt 10s thì 504 giả rồi bị chạy lại tối đa 3 lần | Truyền timeout lớn hơn cho pattern chậm, không retry |
| GW-08 | High | `src/features/admin/admin.controller.ts:121-122,186-187` | `POST /admin/tutors` và `/admin/students` cùng gửi `user.createUser` với `_dto`, không gắn `role`; admin.schema.ts:6-8 nói role "forced by endpoint" nhưng không có code làm điều đó | Tạo tutor thực chất tạo STUDENT (default `'STUDENT'`, nếu user-service không tự suy ra) | Gửi `{ ..._dto, role: 'TUTOR' }` / `'STUDENT'` |
| GW-09 | High | `src/features/admin/admin.controller.ts:142,210,152,165,174,220,236,245` | `GET /admin/tutors` và `/admin/students` đều gọi `user.getUsers` chỉ với `_query` (không `role`); `tutors/:id`, `students/:id` thao tác mọi id mà không kiểm role đích | Danh sách "tutors" trả mọi user; `DELETE /admin/tutors/:id` xoá được cả admin/student | Thêm `role` vào payload/query, kiểm role đích ở downstream |
| GW-10 | High | `src/features/student/student.controller.ts:147-213,216-257,260-266` | `PUT /students/:id` gọi `user.updateUser` với `userId: _id` (id từ URL); `DELETE /students/:id` gọi `user.deleteUserByAdmin`; `GET /students/:id` gọi `getDetailUser`; không `@Roles` | STUDENT/PARENT bất kỳ sửa/xoá/xem hồ sơ học sinh khác (IDOR) | `@Roles('ADMIN','TUTOR')` và truyền `actorId`/`actorRole` |
| GW-11 | High | `src/features/chapter/chapter.controller.ts:44-89`, `src/features/lesson/lesson.controller.ts:46-91` | Chapter/lesson không truyền `userId`, không `@Roles`: create/update/delete/getById chỉ có id | Bất kỳ user (kể cả STUDENT) sửa/xoá chương, bài giảng của người khác (IDOR) | Truyền `userId`+role, kiểm ownership ở tutor-service; thêm `@Roles` |
| GW-12 | High | `src/features/notification/notification.controller.ts:90-109,57` | `getById`, `markAsRead`, `delete` chỉ truyền `{ id }`, không `userId`; `POST /notifications` cho mọi role gửi tới `userId/classId` tuỳ ý | User A đọc/đánh dấu/xoá thông báo của user B; mọi user phát thông báo hệ thống | Truyền `userId`, kiểm ownership; giới hạn quyền tạo |
| GW-13 | Medium | `src/packages/guards/jwt-auth.guard.ts:51-82,119-148` | Cache session 30s kể cả negative cache, không invalidate khi logout/login; guard fail-open khi RMQ/Redis lỗi | (a) sau logout token còn dùng được tới 30s; (b) login lại ngay sau một lần `valid:false` vẫn 401 tới 30s; (c) khi `redis.get` lỗi thì mọi token đúng chữ ký đều qua | TTL ngắn, bỏ negative cache, xoá cache khi login/logout; fail-closed cho route nhạy cảm |
| GW-14 | Medium | `src/packages/guards/jwt-auth.guard.ts:100-104`, `src/packages/configs/jwt-sign.config.ts:17-20`, `src/packages/strategy/jwt-user.strategy.ts:10` | Secret mặc định cứng `'dev-insecure-jwt-secret'` / `'dev-insecure-secret'` (hai chuỗi khác nhau) khi thiếu env; `JWT_REFRESH_SECRET` mặc định bằng access secret; role lạ rơi về `'STUDENT'` | Quên set `JWT_ACCESS_SECRET` trên production thì ai cũng ký được token hợp lệ (`role: ADMIN`) | Fail-fast khi thiếu secret; bỏ default; thống nhất một nguồn |
| GW-15 | Medium | `src/app.module.ts:64-67` | `JwtModule.register({ secret: process.env.JWT_SECRET, expiresIn: '1h' })` đọc env lúc import, dùng biến `JWT_SECRET` (không có trong `.env`), TTL 1h lệch mặc định 3h | Cấu hình gây hiểu nhầm; nơi nào ký không truyền secret sẽ dùng `undefined` | `JwtModule.registerAsync` với `getJwtModuleOptionsFromConfig` |
| GW-16 | Medium | `src/main.ts:27` | `enableCors({ origin: true, credentials: true })` phản chiếu mọi Origin kèm credentials; không helmet, không rate limit, không giới hạn body | Brute-force login/forgot-password không giới hạn; trang bất kỳ gọi API kèm credentials | Whitelist origin từ env; `@nestjs/throttler` cho `/auth/*`; helmet |
| GW-17 | Medium | `src/features/upload/upload.controller.ts:44-64,100-107` | `FileInterceptor('file')` không có `limits` (memory storage); không kiểm `file` undefined; file base64 hoá qua RMQ; `Content-Disposition` nối thẳng `key` chưa escape | Upload không file thì `TypeError` 500; file lớn thì hết RAM / vượt kích thước message RMQ; `key` chứa `"` hoặc CRLF phá header | `limits.fileSize`, `fileFilter`, 400 khi thiếu file, escape filename |
| GW-18 | Medium | `src/features/email/email.controller.ts:18-22` | `GET /emails` `@Public()` kích hoạt gửi email thật (Resend) | Spam / đốt quota; KNOWN_ISSUES cũng ghi route này 500 | Xoá khỏi production hoặc `@Roles('ADMIN')` |
| GW-19 | Medium | `src/features/auth/auth.controller.ts:293-300,337-344` | Token trả về frontend qua query string `?accessToken=&refreshToken=`; callback Facebook dùng `GOOGLE_OAUTH_REDIRECT_URL`; không dùng `state` | Rò rỉ refresh token qua history/log proxy/Referer; không cấu hình redirect riêng cho Facebook | Dùng URL fragment hoặc mã trao đổi một lần; tách env; bật `state` |
| GW-20 | Medium | `src/packages/strategy/google.strategy.ts:31`, `src/packages/strategy/facebook.strategy.ts:34` | Ném `new Error(...)` thuần trong `validate` (lỗi từ guard, trước interceptor, không phải `HttpException` nên `HttpExceptionFilter` không bắt) | Tài khoản không có email nhận 500 thay vì 400 như API_ENDPOINTS.md:77,80 | Ném `BadRequestException` |
| GW-21 | Medium | `src/packages/strategy/facebook.strategy.ts:19-20` | `config.get('FACEBOOK_APP_ID')!` không default (Google có default giả) | Thiếu env Facebook thì passport-facebook ném "requires clientID" lúc khởi tạo module, gateway không boot | Default giả như Google hoặc đăng ký strategy có điều kiện |
| GW-22 | Medium | `src/packages/interceptor/logger.interceptor.ts:131-173` | Ghi mọi request/response body (cắt 1000 ký tự) vào `request_logs`; redact theo danh sách key cố định (thiếu `jti`, `key`...); status log lấy `response.statusCode` tại finalize nên lỗi 422 có thể ghi 201 (KNOWN_ISSUES) | PII, reset `jti`, nội dung chat AI nằm trong DB và API `/logs`; thống kê status sai | Mở rộng redact, không log response nhạy cảm, lấy status từ exception |
| GW-23 | Medium | `src/packages/entities/user/user.schema.ts:276-291`, `src/packages/entities/admin/admin.schema.ts:13,67-70` | Kiểm độ mạnh mật khẩu bị bỏ qua theo độ dài: create user chỉ kiểm khi 8..100 (min 6), admin chỉ kiểm khi 8..14 trong khi `max(20)`; login dùng `passwordFieldSchema` (6-25 + complexity) | Mật khẩu 6-7 hoặc 15-20 ký tự khỏi cần chữ hoa/số/ký tự đặc biệt; ngược lại user có mật khẩu yếu hoặc >25 ký tự không đăng nhập được (422) | Thống nhất một schema; login chỉ `min(1)` |
| GW-24 | Medium | `src/features/auth/auth.controller.ts:64,223` (schema `registerSchema`/`loginSchema`) | `register`, `login`, `forgot-password` public nhưng `login` trả lỗi phân biệt "User not found" và "Invalid password" (API_ENDPOINTS.md:55-56, 68) | Liệt kê email tồn tại (user enumeration) | Trả thông báo chung; forgot-password luôn 200 |
| GW-25 | Low | `src/app.controller.ts:16-19` | `GET /` health check không `@Public()` | Probe của load balancer nhận 401 | Thêm `@Public()` |
| GW-26 | Low | `src/app.controller.ts:35-190` | Các route `kafka/*`, `health/*` public; `kafka/send` tạo user giả `test.kafka@example.com`; `kafka/error` cố ý ném lỗi; gọi vô hạn | Spam RMQ/DB, nhiễu log | Chỉ bật ngoài production hoặc yêu cầu admin |
| GW-27 | Low | `src/features/student/student.controller.ts:43` | `GET /students/get-student-code` gọi `user.getUserByField({})` rỗng, luôn 400 (KNOWN_ISSUES xác nhận) | Route không dùng được | Thêm RPC sinh mã bên user |
| GW-28 | Low | `src/features/student/student.controller.ts:111,257`, `src/features/user/user.controller.ts:142` | `{ userId: ..., ..._dto }` đặt `userId` trước spread: nếu schema thêm key trùng sẽ ghi đè (hiện Zod strip key lạ nên chưa khai thác được ở student) | Rủi ro tiềm ẩn khi mở rộng schema | Đặt trường tin cậy sau spread |
| GW-29 | Low | `src/packages/context/request-context.middleware.ts:17-21` | `x-correlation-id` từ client được tin tưởng, không kiểm độ dài/ký tự; dùng làm header RMQ và cột `varchar(100)` | Giá trị >100 ký tự làm fail insert `request_logs`; ký tự không hợp lệ làm `res.setHeader` ném lỗi (500) | Validate regex/độ dài, sai thì sinh UUID |

Ghi chú về schema/migration (không tính thành bug riêng): `src/database/schema.ts` khớp migration `0004` và snapshot đối với các cột thêm gần đây (`expected_message`, `response_body`, `auth_profile`, `request_path`, `request_headers`, `host`). Có lệch quy ước: `users.subjects varchar(255)` nhưng Zod user `max(30)` và admin gửi mảng; `userCode varchar(6)` không unique (nguy cơ trùng cho `login/user-code`); `role`/`isActive` nullable; cột `userCode`, `facebookUrl`, `googleUrl` đặt tên lệch quy ước snake_case.

## Chi tiết

### GW-01 Leo thang đặc quyền qua `PUT /users`
`src/features/user/user.controller.ts:142`
```ts
return this.rmqProducer.send('user.updateUser', { userId: _user.id, role: _user.role, ..._updateUserDto });
```
`updateUserSchema` (user.schema.ts:155) khai báo `role: z.enum([...]).optional()` cùng `isActive`, `userCode`, `googleId`, `facebookId`. Vì `..._updateUserDto` đứng sau nên giá trị client gửi ghi đè `role` lấy từ JWT. STUDENT gửi `PUT /users {"role":"ADMIN"}` có thể trở thành ADMIN nếu `user.updateUser` ghi `role` từ payload (Cần xác minh handler bên `user`; gateway đã chủ động chuyển trường này đi). Sửa: schema riêng cho self-update, đặt `userId`/`role` sau spread.

### GW-02 Route quản trị user không có phân quyền
`user.controller.ts` không import `Roles`/`RolesGuard`, và `RolesGuard` không nằm trong `APP_GUARD` (app.module.ts:72-78). Vì vậy `POST /users`, `PUT /users/:id`, `PUT /users/:id/status`, `DELETE /users/:id` chạy được với mọi token hợp lệ, dù pattern đích tên `updateUserByAdmin`/`deleteUserByAdmin` ngụ ý chỉ admin. `GET /users` liệt kê toàn bộ user. API_ENDPOINTS.md:640 ghi "3 (ADMIN,TUTOR)" role-restricted cho `/users`, code thực tế không có.

### GW-03 Upload/delete công khai
```ts
@Public()
@Delete(':key')
delete(@Param('key') key: string) { return this.rmqProducer.send('upload.delete', { key }); }
```
(upload.controller.ts:110-118). Không xác thực, không kiểm sở hữu. Upload cũng public (:43, :68) nên bucket R2 có thể bị lạm dụng. API_ENDPOINTS.md:518-522 ghi "Public", tức doc phản ánh đúng code nhưng thiết kế sai.

### GW-04 Reset password không dùng được
`auth.controller.ts:223-224`: `@ApiBearerAuth('access-token')` + `@Post('/reset-password')`, không có `@Public()`. `JwtAuthGuard` toàn cục trả 401 khi thiếu Bearer. Theo auth-flows-rmq.md client chỉ có `jti` từ email.

### GW-05 Đọc Redis tuỳ ý
`redis.controller.ts:30-34` truyền thẳng `key` từ query vào `redis.get`. Cùng pattern này guard dùng `session:<id>` (jwt-auth.guard.ts:124) và luồng reset dùng `reset-password:<jti>`.

### GW-06 Retry sai chỗ trong `RmqProducer.send`
```ts
for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
  try { ... firstValueFrom(client.send(...).pipe(timeout({ each: finalTimeoutMs }))) }
  catch (error) { ... if (attempt === maxRetries + 1) throw ...; await sleep(backoff) }
}
```
(rmq.producer.ts:119-186). Không phân biệt lỗi RPC nghiệp vụ (đã có `statusCode`) với lỗi hạ tầng; mọi lỗi đều gọi lại. Với timeout, message đầu có thể vẫn được downstream xử lý, dẫn tới bản ghi trùng. Lỗi 4xx cũng tốn thêm ít nhất 100ms + 200ms.

### GW-07 Timeout cố định 10s
Không call site nào truyền `timeoutMs` (grep toàn `src`); tác vụ chậm bị cắt 504 và chạy lại 3 lần.

### GW-08 / GW-09 Admin tutors / students
Hai cặp handler (admin.controller.ts:121 vs :186, :142 vs :210) gọi cùng pattern với cùng payload. Comment ở admin.schema.ts:6-8 khẳng định role được ép theo endpoint nhưng gateway không làm.

### GW-10 / GW-11 / GW-12 IDOR
Student/chapter/lesson/notification chỉ truyền id đối tượng, không truyền người gọi (hoặc truyền id đối tượng thay cho người gọi). Downstream không có dữ kiện để kiểm quyền sở hữu. Các controller khác (class, session, schedule, tuition, exercise, attendance) có truyền `userId` nhưng không truyền `role`; nếu tutor-service không tự suy role từ DB thì vẫn thiếu kiểm tra (Cần xác minh).

## Vấn đề tích hợp

- **Gateway - user**: `user.createUser` mặc định role STUDENT, gateway không đặt role cho admin (GW-08). `user.updateUser` nhận `role` từ payload (GW-01); user-service phải bỏ qua `role` khi người gọi không phải admin. `subjects` là mảng ở admin schema nhưng chuỗi ở user schema/DB varchar (cần xác nhận chuyển đổi). `user.getUserByField({})` chưa có RPC (KNOWN_ISSUES).
- **Gateway - third**: `redis.get` vừa dùng cho guard session vừa bị lộ ra HTTP (GW-05). `upload.*` truyền file base64 (trần kích thước RMQ/R2 chưa kiểm). `GET /emails` gửi mail thật và lỗi do domain chưa verify.
- **Gateway - tutor**: route không truyền `role` (chỉ `userId`); chapter, lesson, notification không truyền `userId` (GW-11, GW-12). `curriculum.create` với `gradesId` không tồn tại trả 500 do thiếu map FK sang 4xx (KNOWN_ISSUES).
- **Gateway - ui**: UI gọi reset-password phải gửi kèm Bearer vì route chưa public (GW-04); token OAuth trả qua query string (GW-19); lỗi OAuth không có email trả 500 thay vì 400 (GW-20).
- **API_ENDPOINTS.md lỗi thời**: bảng "Known bugs" còn nhắc `GET /curriculum` dùng wallet schema và thiếu Zod (đã sửa trong code), liệt kê `POST /users/avatar` (không tồn tại), tổng kết `/users` "13 routes, 3 ADMIN,TUTOR" (code thực tế không có route nào restricted), mật khẩu `/users` ghi 8-14 trong khi schema là min 6; reset-password ghi "JWT" (xem GW-04).

## Ghi chú / Cần xác minh

- **Cần xác minh (user service)**: `user.updateUser` có ghi `role`/`isActive` từ payload không (quyết định mức độ thực của GW-01); `user.deleteUserByAdmin`/`updateUserByAdmin` có tự kiểm tra người gọi không (gateway không gửi role/actor nên khó có thể).
- **Cần xác minh (tutor-service)**: class/session/schedule/tuition/exercise/attendance có tra role theo `userId` để chặn STUDENT tạo/xoá; gateway không có `@Roles` cho các route này.
- **Cần xác minh**: khi logout/đổi mật khẩu/khoá user, user-service có xoá `session:<id>` trong Redis không (guard phụ thuộc điều này; gateway không kiểm `isActive`, role trong token có hiệu lực tới hết TTL mặc định 3h).
- **Cần xác minh**: `session:<userId>` là một key cho mỗi user, nên đăng nhập thiết bị thứ hai có thể ghi đè phiên (thuộc user/third).
- `.env` tồn tại trên máy dev, đã nằm trong `.gitignore` (dòng 43); thư mục không phải git repo nên không kiểm tra được lịch sử commit chứa secret.
- Chưa diff từng cột/index của toàn bộ bảng giữa schema và snapshot, chỉ kiểm các migration gần đây. Không chạy test/build theo yêu cầu.
