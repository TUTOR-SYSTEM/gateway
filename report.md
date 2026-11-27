# Báo cáo review tĩnh: gateway (bugs và lỗ hổng bảo mật)

- **Ngày:** 2026-11-27
- **Phạm vi:** `/home/user/gateway` (NestJS 11 HTTP edge, không có DB runtime, forward qua RabbitMQ bằng `RmqProducer`).
- **Commit / branch:** `e88691c` / `ccr-6e14d698-ruxjzr` (working tree sạch khi bắt đầu).
- **Phương pháp:** đọc tĩnh, không chạy app, không chạy test, không sửa source, không đọc file `.env*`. Đối chiếu chỉ đọc với `/home/user/USER` (user), `/home/user/tutor-service` (tutor), `/home/user/THIRD_SERVICE` (third) để kiểm tra contract RPC và cơ chế xác thực phía responder.
- **"Cần xác minh"** = phụ thuộc cấu hình deploy thật hoặc runtime; review tĩnh không chứng minh được.

## 1. Tóm tắt

Tổng: **18 finding**: High 2, Medium 3, Low 10, Info 3. Không có Critical.

Rủi ro quan trọng nhất:
1. **GW-01 (High):** `docker-compose.yml` publish Redis ra `6379:6379` không có mật khẩu. Redis giữ session, refresh hash, OTP reset, token verify email. Nếu port tới được từ mạng ngoài thì bypass toàn bộ xác thực.
2. **GW-02 (High, có điều kiện):** Gateway chỉ ký actor (HMAC) khi payload có `actorId`. Phần lớn route tới tutor-service và third-service gửi `userId`/`role` không ký, và hai service đó không có code kiểm tra chữ ký. Ai publish được lên `tutor_queue`/`third_queue` có thể mạo danh bất kỳ user, kể cả ADMIN. Giảm xuống Medium nếu broker có ACL theo queue.
3. **GW-03 (Medium):** `LoggerInterceptor` chỉ redact khoá bí mật, không redact PII (SĐT, địa chỉ, ngày sinh, email phụ huynh). Ghi vào stdout và `request_logs` (qua `log.create`); ADMIN đọc qua `GET /logs`.
4. **GW-04 (Medium):** Swagger `/api-docs` luôn bật kể cả `NODE_ENV=production` (Dockerfile đặt biến này).
5. **GW-05 (Medium, cần xác minh):** Rate limit toàn cục theo IP (3/s, 20/10s, 100/min) áp cho route không có `@Throttle`. Lớp học dùng chung NAT có thể bị 429 hàng loạt.

## 2. Bảng tổng hợp

| ID | Mức độ | Loại | File:line | Tiêu đề |
|---|---|---|---|---|
| GW-01 | High | Security | `docker-compose.yml:72-82` (ports ở `:76`) | Redis publish `6379` không mật khẩu/ACL, chứa session và token |
| GW-02 | High (có điều kiện) | Security | `src/features/rabbitmq/rmq.producer.ts:64,75`; call site: `class.controller.ts:164`, `dashboard.controller.ts:32`, `course-progress.controller.ts:28,40`, `ai-chat.controller.ts:52`, `upload.controller.ts:169`, `notification.controller.ts:117-121`, `exercise.controller.ts:123-126` | Identity gửi sang tutor/third không ký; responder không kiểm tra chữ ký |
| GW-03 | Medium | Security (privacy) | `src/packages/interceptor/logger.interceptor.ts:10-29, :174` (`emitRequestLog`) | Log request/response không redact PII |
| GW-04 | Medium | Security | `src/main.ts:97-101`; `Dockerfile:2` (`NODE_ENV=production`) | Swagger `/api-docs` công khai trên production |
| GW-05 | Medium | Bug (availability) | `src/features/throttler/throttler.module.ts:8-12` | Rate limit IP toàn cục quá chặt cho NAT dùng chung |
| GW-06 | Low | Bug | `src/features/rabbitmq/rmq.constants.ts:95-99`; `rmq.producer.ts:267`; `src/features/auth/auth.controller.ts:357` | `auth.verifyEmail` (consume-once) bị coi là idempotent và retry |
| GW-07 | Low | Security | `src/features/redis/redis.controller.ts:18-25` | Blocklist `GET /redis` thiếu `verify-email:` |
| GW-08 | Low | Bug | `src/features/api-routes/api-routes.controller.ts:63` | `apiRouteIdSchema.parse(id)` ném ZodError thành 500 |
| GW-09 | Low | Bug | `src/packages/pipes/zod-validation.pipe.ts` (`parseJsonString`); `src/features/log/log.controller.ts:62`; `src/packages/entities/log/log.schema.ts:20` | Pipe đơn tham số JSON.parse chuỗi; `correlationId` toàn số bị 422 |
| GW-10 | Low | Security | `src/features/rabbitmq/rmq.constants.ts:7` | `RABBITMQ_URL` fallback `guest:guest` khi thiếu env |
| GW-11 | Low | Security | `src/app.controller.ts:37,55,139,157,175,221` | Route debug/stub `/kafka/*`, `/health/postgres` chạy production; `/health/redis` public |
| GW-12 | Low | Security | `src/app.module.ts:71` | `TestScenarioModule` load khi `NODE_ENV` không đặt |
| GW-13 | Low | Security | `src/main.ts:49-53` | CORS mặc định `localhost:3000` kèm `credentials: true` |
| GW-14 | Low | Security (defense in depth) | `class.controller.ts:139-233`; `tuition.controller.ts:65,85,102`; `attendance.controller.ts:36`; `exercise.controller.ts:71,96`; `api-routes.controller.ts:30`; `dashboard.controller.ts:23-32` | Nhiều GET không có `RolesGuard`, phân quyền chỉ dựa vào tutor-service |
| GW-15 | Low (cần xác minh) | Security | `src/packages/strategy/facebook.strategy.ts:38-41` | Facebook không kiểm tra xác minh email; user-service liên kết theo email |
| GW-16 | Info | Hardening | `notification.schema.ts:48`; `api-routes.schema.ts:14`; `course-progress.schema.ts:14-29` | Schema `z.record`/`z.unknown` không giới hạn kích thước |
| GW-17 | Info | Design | `src/packages/guards/jwt-auth.guard.ts:81` | Cache session dương 5s mỗi process |
| GW-18 | Info | Hardening | `src/packages/filters/http-exception.filter.ts:67`; `src/packages/interceptor/response.interceptor.ts:35` | Body trả `path: request.url` kèm query string |

## 3. Chi tiết

### GW-01 (High, Security): Redis publish không có mật khẩu
- **File:** `docker-compose.yml:72-82`, ports ở `:76` (`['6379:6379']`). Service redis không có `command: requirepass`, không có ACL, không có biến mật khẩu.
- **Mô tả:** Redis publish trên mọi interface. Redis giữ `session:{uid}:{sid}`, `refresh:{uid}:{sid}` (hash), `reset-password-otp:*`, `verify-email:*`, `revoked-*`, `login-fail:*`: toàn bộ trạng thái xác thực.
- **Tác động:** từ mạng không tin cậy, không cần đi qua gateway. Đọc OTP reset và token verify email; `FLUSHALL` để đăng xuất toàn bộ và DoS; xoá/ghi `session:*` để thao túng revocation.
- **Kiểm tra:** từ mạng ngoài trên host staging/prod, thử kết nối `6379` không AUTH. `PONG` là lỗ hổng (cần xác minh deploy thật).
- **Đề xuất:** bỏ `ports` của redis (chỉ network nội bộ `app-network`); đặt `requirepass` hoặc ACL, truyền `REDIS_PASSWORD` cho third-service. Nếu cần từ host, bind `127.0.0.1:6379` như Postgres.
- **Đối chiếu:** `bugs/auth-report.md` ghi đã bỏ publish 5672/15672 và postgres bind 127.0.0.1, nhưng không nhắc Redis. Phát hiện mới.

### GW-02 (High, có điều kiện, Security): Identity sang tutor/third không ký
- **File:** `src/features/rabbitmq/rmq.producer.ts:64` (`const signsActor = typeof fields.actorId === 'string';`) và `:75` (`if (!signsActor && !signsIp && !oauthProvider) return message;`). Chỉ ký `actorId`/`actorRole`/`actorSid`, `clientIp`, OAuth profile.
- **Call site không ký** (gửi `userId`/`role`, không có `actorId`):
  - `class.controller.ts:164` (`class.getById`) và các route class/tuition/attendance/exercise/notification tương tự.
  - `dashboard.controller.ts:32`: `{userId, role}` tới `dashboard.overview`.
  - `course-progress.controller.ts:28,40`: `{userId}` tới `courseProgress.getResults` / `sync` (sync ghi dữ liệu).
  - `ai-chat.controller.ts:52,65,73`: `{userId, role}` tới `ai.*`.
  - `upload.controller.ts:169`: `{key, role}` tới `upload.delete` (không có `userId`/`actorId`).
  - `notification.controller.ts:117-121`, `exercise.controller.ts:123-126`: `{userId, role}`.
- **Responder:** tutor-service và third-service không có code kiểm tra chữ ký. Grep `actorSig|RPC_ACTOR_SECRET|verifyRpcActorSignature` trong `tutor-service/src` và `THIRD_SERVICE/src` không có kết quả. Chỉ user-service có (`USER/src/packages/helpers/rpc-actor-signature.helper.ts`).
- **Tác động:** publisher trên `tutor_queue` hoặc `third_queue` (có credential broker, hoặc service bị chiếm) gửi `{userId: bất kỳ, role: 'ADMIN'}`: `dashboard.overview`, `class.delete`, `redis.get` với `session:*` (third). Gateway đúng ở chỗ lấy identity từ JWT. Lỗ hổng ở trust boundary broker và phạm vi ký chưa phủ các pattern này.
- **Tái hiện:** cần quyền publish lên broker. Review tĩnh: đối chiếu bảng với `withActorSignature` và grep chữ ký ở tutor/third.
- **Đề xuất:** (1) mở rộng `withActorSignature` ký `userId` + `role` cho mọi acting payload, và verify ở tutor/third (copy helper như user); (2) và/hoặc ACL broker theo queue. Giảm xuống Medium nếu ACL đã chặn publish từ service không được phép.
- **Đối chiếu:** `bugs/auth-report.md` ghi H-TUT-2 và M-USER-1. Báo cáo đó đề xuất ACL hoặc ký actor, nhưng chưa nói gateway hiện chỉ ký cho user-service. Phát hiện này cụ thể hoá phần phía gateway.

### GW-03 (Medium, Security/privacy): Log chứa PII
- **File:** `src/packages/interceptor/logger.interceptor.ts:10-29` (`SENSITIVE_KEYS`), log `[Request]`/`[Response]` (`body=`, `data=`), `emitRequestLog` ở `:174` gửi `requestBody`/`responseBody` tới third-service qua `log.create`.
- **Mô tả:** `SENSITIVE_KEYS` có `password`, `token`, `otp`, `key`, `secret`, `cookie`, `buffer`... Không có `phone`, `studentPhone`, `parentPhone`, `address`, `dateOfBirth`, `dob`, `parentEmail`. Cắt 1000 ký tự nhưng không ẩn.
- **Tác động:** `POST /students` (SĐT học sinh và phụ huynh, địa chỉ, email phụ huynh), `PUT /users`, `GET /users`, `POST /auth/register` ghi PII vào stdout và `request_logs`. ADMIN đọc qua `GET /logs`.
- **Tái hiện:** `POST /students` có `studentPhone`, rồi xem stdout hoặc `GET /logs` (ADMIN).
- **Đề xuất:** thêm khoá PII vào `SENSITIVE_KEYS` (kể cả tên đã đổi như `studentPhone`, `parentPhone`); hoặc không ghi body/response cho route có PII (`/students`, `/users`, `/admin/*`, `/auth/register`).
- **Đối chiếu:** `bugs/log-report.md` ghi "chưa xác nhận redaction". Đã xác nhận: chỉ redact khoá bí mật, thiếu PII. Repo user có redact phone/address/dob ở interceptor của nó, gateway thì không.

### GW-04 (Medium, Security): Swagger công khai trên production
- **File:** `src/main.ts:97-101` (`SwaggerModule.createDocument` + `setup('api-docs')`) không có điều kiện môi trường. `Dockerfile:2` `ENV NODE_ENV=production`.
- **Tác động:** `/api-docs` và JSON đặc tả công khai, lộ toàn bộ route kể cả admin, `/kafka/*`, `/redis`, `/logs`. Swagger UI đăng ký trên HTTP adapter nên thường không đi qua guard toàn cục (cần xác minh runtime).
- **Đề xuất:** gate như repo user: chỉ bật khi `NODE_ENV !== 'production'` hoặc `SWAGGER_ENABLED=true`.

### GW-05 (Medium, availability, cần xác minh): Rate limit IP toàn cục quá chặt
- **File:** `src/features/throttler/throttler.module.ts:8-12`: `short` 3/1s, `medium` 20/10s, `long` 100/min theo IP, áp cho route không có `@Throttle`.
- **Mô tả:** `@Throttle` chỉ ghi đè bucket được nêu, các bucket khác vẫn áp (CLAUDE gateway đã nêu; login/user-code đã tăng cả ba bucket).
- **Tác động:** lớp học nhiều học sinh cùng NAT chung bucket `medium` 20/10s. `GET /notifications`, `/classes`, `/dashboard/overview` có thể 429 hàng loạt. Cần xác minh số IP/user thực.
- **Đề xuất:** route đã xác thực tracker theo `userId`; hoặc tăng `short`/`medium` toàn cục. Giữ chặt cho auth và upload.
- **Đối chiếu:** `bugs/auth-report.md` M-GW-3 vẫn còn; đã kiểm tra `auth.controller.ts:77,281,304` vẫn chỉ throttle theo IP.

### GW-06 (Low, Bug): `auth.verifyEmail` bị retry
- **File:** `src/features/rabbitmq/rmq.constants.ts:95-99` (`isIdempotentPattern`: regex `^(...|verify)` khớp method `verifyEmail`). `rmq.producer.ts:267` (`unsafeToRetry = !isIdempotentPattern(pattern)`) cho retry mặc định 2 lần. Route: `src/features/auth/auth.controller.ts:357-361`.
- **Mô tả:** user-service tiêu thụ token verify bằng GETDEL một lần (`user/src/features/auth/auth.service.ts:677,697`). Nếu lần đầu thành công nhưng reply mất/timeout, lần retry nhận "token không hợp lệ".
- **Tác động:** người dùng thấy thất bại dù email đã xác minh. Không có double-effect, nhưng đây là pattern ghi duy nhất bị retry.
- **Tái hiện:** responder chậm hơn timeout 10s (cần xác minh runtime).
- **Đề xuất:** danh sách tường minh các pattern idempotent thay vì regex prefix; hoặc `maxRetries: 0` cho `auth.verifyEmail`.
- **Đối chiếu:** `bugs/auth-report.md` L-GW-7 vẫn còn; đây là ca cụ thể.

### GW-07 (Low, Security): Blocklist `GET /redis` thiếu `verify-email:`
- **File:** `src/features/redis/redis.controller.ts:18-25` (`SENSITIVE_KEY_PREFIXES`: `session:`, `login-session:`, `reset-password:`, `reset-password-otp`, `refresh:`, `refresh-token:`).
- **Mô tả:** user-service ghi `verify-email:${jti}` chứa `{userId, email}`, token một lần (`user/src/features/auth/auth.service.ts:72, 404-405`). Prefix không nằm trong blocklist, ADMIN gọi `GET /redis?key=verify-email:<jti>` đọc được.
- **Tác động:** thấp (ADMIN đã có quyền rộng, `jti` là UUID). Nhưng deny-list dễ sót key mới.
- **Đề xuất:** allowlist prefix được phép, hoặc tối thiểu thêm `verify-email:`.

### GW-08 (Low, Bug): ZodError thành 500
- **File:** `src/features/api-routes/api-routes.controller.ts:63` (`const routeId = apiRouteIdSchema.parse(id);`).
- **Mô tả:** `parse()` ném `ZodError`, không phải `HttpException`. `ErrorInterceptor` biến thành 500 `INTERNAL_SERVER_ERROR` và log stack. Input sai lẽ ra là 422.
- **Tái hiện:** `PUT /api-routes/results/a.b` với token hợp lệ → 500.
- **Đề xuất:** `@Param('id', new ZodValidationPipe(apiRouteIdSchema))`.

### GW-09 (Low, Bug): Pipe đơn tham số parse JSON chuỗi
- **File:** `src/packages/pipes/zod-validation.pipe.ts` (`parseJsonString` parse mọi string). Áp dụng cho param đơn: `src/features/log/log.controller.ts:62` với `correlationIdParamSchema` (`src/packages/entities/log/log.schema.ts:20`, `z.string().trim().min(1).max(128)`).
- **Mô tả:** `correlationId` toàn chữ số (ví dụ `12345`) bị `JSON.parse` thành number, `z.string` từ chối, 422. Query object-level không bị (object không được parse).
- **Tái hiện:** `GET /logs/trace/12345` (ADMIN) → 422 (cần xác minh runtime).
- **Đề xuất:** pipe riêng không `JSON.parse` cho param chuỗi, hoặc chỉ parse khi content-type JSON.

### GW-10 (Low, Security): Fallback credential RabbitMQ
- **File:** `src/features/rabbitmq/rmq.constants.ts:7`: `process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672'`.
- **Mô tả:** Compose bắt buộc `RABBITMQ_USER`/`PASSWORD`, code thì không. Triển khai thiếu biến kết nối localhost với credential mặc định.
- **Đề xuất:** throw khi thiếu `RABBITMQ_URL` nếu `NODE_ENV=production`. Log đã redact (`redactConnectionSecrets`).

### GW-11 (Low, Security): Route debug/stub và health public
- **File:** `src/app.controller.ts:37` (`/kafka/emit`), `:55` (`/kafka/send`), `:139` (`/kafka/error`), `:157` (`/kafka/tutor/error`), `:175` (`/health/postgres`): đều `@Roles('ADMIN')` nhưng chạy production. `:221` (`/health/redis`) `@Public()`, gọi RPC `health.redis` mỗi request.
- **Mô tả:** `kafka.send` tới user-service là stub trả dữ liệu giả (`user/src/app.controller.ts`, không ghi DB). `kafka/tutor/error` đi qua `kafka.user` → user gọi `kafka.tutor`, không có handler ở tutor-service (cần xác minh). `/health/redis` trả status cố định (không lộ dữ liệu, đã kiểm tra) nhưng khuếch đại tải tới third.
- **Đề xuất:** loại `/kafka/*` khỏi build production; cache `/health/redis` vài giây.

### GW-12 (Low, Security): TestScenarioModule khi `NODE_ENV` không đặt
- **File:** `src/app.module.ts:71`: `...(process.env.NODE_ENV === 'production' ? [] : [TestScenarioModule])`.
- **Mô tả:** deploy không qua Docker không đặt `NODE_ENV` thì module load: chạy request thật bằng test account. Docker ổn. Route vẫn ADMIN only.
- **Đề xuất:** chỉ load khi `ENABLE_TEST_SCENARIO=true`.

### GW-13 (Low, Security): CORS mặc định
- **File:** `src/main.ts:49-53`: mặc định `http://localhost:3000,https://tutor.haiphan.org` khi `CORS_ORIGINS` không đặt; `credentials: true`.
- **Đề xuất:** ở production mặc định rỗng, fail-fast nếu thiếu. Cần xác minh `CORS_ORIGINS` thật.

### GW-14 (Low, defense in depth): GET không có RolesGuard
- **File:** `class.controller.ts:139-233` (`getAll`, `getById`, `getStudents`, `getMaterials`, `getWatch`); `tuition.controller.ts:65,85,102`; `attendance.controller.ts:36`; `exercise.controller.ts:71,96`; `api-routes.controller.ts:30,45`; `dashboard.controller.ts:23-32`; `course-progress.controller.ts:23`. Cho mọi role đã xác thực (STUDENT, PARENT).
- **Mô tả:** phạm vi nằm ở tutor-service. Đã kiểm tra: `class.getStudents` (`loadAccessibleClass`, roster rút gọn cho non-owner), `tuition.findAll` (`repo.findAll({userId, role})`), `attendance.getBySessionService` (kiểm tra session và lớp). Gateway không có lớp chặn thứ hai, và identity đi không ký (GW-02).
- **Đề xuất:** khai báo role tối thiểu ở gateway cho từng route, hoặc ghi rõ contract trong doc.

### GW-15 (Low, cần xác minh): Facebook không kiểm tra xác minh email
- **File:** `src/packages/strategy/facebook.strategy.ts:38-41` không kiểm tra cờ xác minh, dựa vào giả định của Facebook. Google (`google.strategy.ts`) kiểm tra `email_verified === true`.
- **Mô tả:** user-service liên kết OAuth theo email (`user/src/features/auth/auth.service.ts:429-445`, `findOrCreateOAuthUser`): nếu có STUDENT cùng email và `emailVerified=false`, đặt password ngẫu nhiên, đánh dấu đã xác minh, cấp token. Nếu Facebook trả email chưa xác minh, tài khoản Facebook có email đó có thể chiếm tài khoản.
- **Đề xuất:** xác minh chính sách Facebook. Phía user không auto-link theo email chưa xác minh; cân nhắc kiểm tra thêm ở gateway.

### GW-16 (Info): Schema không giới hạn kích thước
- **File:** `notification.schema.ts:48` (`metadata` `z.record(z.string(), z.unknown())`), `api-routes.schema.ts:14` (`z.record`), `course-progress.schema.ts:14-29` (record lồng).
- **Mô tả:** body bị chặn bởi giới hạn body-parser mặc định 100kb nên tác động thấp.
- **Đề xuất:** `.max()` cho số khoá và độ dài.

### GW-17 (Info): Cache session dương 5 giây
- **File:** `src/packages/guards/jwt-auth.guard.ts:81` (`SESSION_CACHE_TTL_MS = 5_000`). Sau logout/revoke, token vẫn được chấp nhận tối đa 5s mỗi process. Đã ghi trong comment. Chỉ ghi nhận.

### GW-18 (Info): Query string trong path
- **File:** `src/packages/filters/http-exception.filter.ts:67` và `src/packages/interceptor/response.interceptor.ts:35` trả `path: request.url` kèm query. Query có thể chứa `code`/`state` OAuth. Chỉ trả người gửi; `LoggerInterceptor` đã cắt query khi log.

## 4. Đối chiếu với `bugs/`

### 4.1 `bugs/report-report.md` (yêu cầu trực tiếp)
- Báo cáo kết luận OK (0 Critical, 0 Major, 2 Minor). Đối chiếu code: `report.controller.ts:26-27` `@UseGuards(RolesGuard)` + `@Roles('ADMIN')` cấp class; `report.summary`, `report.attendanceTrend`, `report.classList` gửi `{userId, role}` (`:41`, `:54`, `:84`). Khớp bảng luồng trong báo cáo.
- Hai Minor không liên quan gateway (UI gọi `useGet` trong component; một dòng trùng trong `API_ENDPOINTS.md` của UI).
- Không có finding mới của gateway trong module report. GW-02 áp dụng cho `report.*` vì identity không ký.

### 4.2 Các báo cáo khác

| Báo cáo | Kết luận cũ | Trạng thái hiện tại |
|---|---|---|
| auth-report H-TUT-2, M-USER-1 | RMQ không có trust boundary | Còn mở. GW-02 cho thấy phạm vi ký ở gateway chưa phủ tutor/third |
| auth-report M-GW-3 | Rate limit chỉ theo IP (register/forgot/reset/refresh) | Còn mở (`auth.controller.ts:77,226,281,304`). Xem GW-05 |
| auth-report L-GW-7 | Timeout ghi mơ hồ | Còn mở. Ca cụ thể: GW-06 |
| auth-report "Gateway không kiểm tra isActive" | Chấp nhận, dựa vào revoke ở user | Đúng. `user.service.ts:513,748` và `admin.service.ts:335` revoke session khi deactivate/đổi role |
| auth-report "/health/redis không lộ key/value" | Đã sửa | Đúng (`app.controller.ts:221-245` chỉ trả status) |
| auth-report "AdminRoleGuard là code chết" | Dead code | Đúng, không có import nào (đã grep) |
| log-report Minor "chưa xác nhận redaction" | Chưa xác nhận | Đã xác nhận: chỉ redact khoá bí mật, thiếu PII (GW-03) |
| upload-report Minor "DELETE /upload/:key với /" | Còn | Còn (`upload.controller.ts:162-169`). Phần `ERROR_MESSAGES` đã sửa |
| test-scenario-report Minor "accessToken qua RMQ" | Còn | Còn (`test-scenario.controller.ts:190, 310-314`). Giảm rủi ro vì third không lưu body của `testscenario.*` (CLAUDE third) |
| dashboard-report "userId từ `@CurrentUser`, không IDOR" | OK | Đúng về IDOR. Thiếu phần ký identity (GW-02) |
| ai-chat-report throttle 10/phút | OK | Đúng (`ai-chat.controller.ts:33`) |
| admin-report, notification-report (senderId ghi đè sau spread) | OK | Đúng (`notification.controller.ts:77-79`; admin truyền actor) |

## 5. Điểm đã kiểm tra và thấy ổn
- **JWT** (`jwt-auth.guard.ts`): verify HS256, `typ === 'access'`, bắt buộc `sid`, session trong Redis, fail-closed (503) khi Redis lỗi. Không có fallback secret (`jwt-sign.config.ts`).
- **Phân quyền:** mọi route admin, test, log, report, redis, email, upload delete và route ghi tutor đều có `RolesGuard` + `@Roles`. Đã grep toàn bộ controller; không có `@Roles` nào thiếu guard đi kèm.
- **`@Public()`:** chỉ `/`, `/health/redis`, auth (login, register, refresh, forgot, reset, verify-email) và OAuth. Logout, change-password, `PUT /users` đều cần JWT.
- **Mass assignment:** body spread đặt trước field actor/userId nên không ghi đè được identity (`student.controller.ts:138, 378-380`; `user.controller.ts:193-197`). `updateSelfSchema` `.omit()` các field đặc quyền; `updateUserSchema` `.strict()`.
- **Self-update STUDENT** chặn đổi email (`user.controller.ts:201-203`).
- **RPC signing** (`rpc-actor-signature.helper.ts`): HMAC-SHA256, `timingSafeEqual`, cửa sổ 300s, OAuth signature gắn provider.
- **Retry:** không retry pattern ghi (trừ GW-06), không retry lỗi nghiệp vụ; `ai.chat` / `upload` / `testscenario.run` `maxRetries 0`; `auth.refresh` không retry. Lỗi 5xx được che thành `INTERNAL_SERVER_ERROR` / `UPSTREAM_TIMEOUT`.
- **OAuth** (`oauth-state.guard.ts`): state 32 byte trong cookie HttpOnly, `timingSafeEqual`, cookie xoá mỗi callback. Google kiểm tra `email_verified`. Refresh token không đi trong URL.
- **Refresh cookie** (`refresh-cookie.helper.ts`): HttpOnly, `SameSite=lax`, `path=/auth`, `secure` khi production hoặc `COOKIE_SECURE`.
- **Log header:** allowlist, không ghi `authorization`/`cookie`. Query không được log.
- **Correlation ID:** regex `^[A-Za-z0-9._-]{1,100}$` (`request-context.middleware.ts`).
- **Upload** (`upload.controller.ts`): `assertValidKey` chặn `..` và `\`, chỉ prefix `uploads/` hoặc `submissions/`. Giới hạn 10MB và 5 file. Quyền download kiểm tra ở tutor qua `exercise.fileAccess`.
- **Security headers** (`security-headers.helper.ts`): `nosniff`, `X-Frame-Options DENY`, `Referrer-Policy`, HSTS khi production, bỏ `X-Powered-By`.
- **Trust proxy** (`main.ts`): hop count từ env, mặc định 1, log khi boot.
- **Docker:** user `node`, `.dockerignore` loại `.env*` và `docker-compose*.yml`. RabbitMQ không publish port. Postgres bind `127.0.0.1`.
- **Error mapping** (`http-exception.filter.ts`): stack chỉ khi `NODE_ENV=development`.
- **Đối chiếu không có vấn đề mới:** report, notification, admin, ai-chat, dashboard, student (payload và actor).

## 6. Hạn chế của lần review
- Review tĩnh: không chạy gateway, không chạy test. Các điểm cần xác minh (GW-01 deploy thật, GW-02 ACL broker, GW-04 Swagger runtime, GW-05 lưu lượng NAT, GW-06 timeout, GW-09, GW-15 chính sách Facebook) cần kiểm thử hoặc kiểm tra cấu hình thật.
- Không đọc `.env*` (theo quy tắc). `CORS_ORIGINS`, `NODE_ENV`, `RABBITMQ_URL`, `REDIS_PASSWORD` thực tế chưa xác nhận.
- Cross-repo chỉ ở mức handler/pattern liên quan (tutor: class, tuition, attendance, dashboard, ai, courseProgress, report; user: auth/OAuth/kafka; third: redis/log/upload). Chưa đọc hết service/repository của tutor và third.
- Không rà toàn bộ DTO/schema, không kiểm tra CI (`.gitlab-ci.yml`, `.github/`).

## Mức độ theo số lượng
- Critical: 0
- High: 2 (GW-01, GW-02)
- Medium: 3 (GW-03, GW-04, GW-05)
- Low: 10 (GW-06 đến GW-15)
- Info: 3 (GW-16 đến GW-18)
