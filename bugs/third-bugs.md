# Báo cáo lỗi tĩnh – third-service (D:\projects\third\src)

Phạm vi: review tĩnh (chỉ đọc code), bỏ qua node_modules/dist. Chỉ ghi các lỗi đã xác minh bằng cách đọc code. Đường dẫn tính từ `D:\projects\third\src`.

## Thống kê theo mức độ

| Mức độ   | Số lỗi |
|----------|-------:|
| Critical | 0 |
| High     | 1 |
| Medium   | 7 |
| Low      | 17 |
| **Tổng** | **25** |

---

## High

### TH-01 (High) – RPC `redis.*` không giới hạn key, bỏ qua danh sách chặn của HTTP
- File: `features/redis/redis.rpc.controller.ts:14-40` (so với `features/redis/redis.controller.ts:14-38`)
- Mô tả: HTTP `GET /redis` chặn các prefix nhạy cảm (`session:`, `login-session:`, `reset-password:`, `refresh:`...). Nhưng handler RPC `redis.get`, `redis.set`, `redis.del` gọi thẳng `RedisService` cho mọi key. Bất kỳ ai publish được vào `third_queue` đều đọc được session/refresh/reset token, ghi đè (forge) session hoặc token reset-password, xoá session người khác. Danh sách chặn của HTTP là denylist theo prefix nên cũng dễ sót prefix mới.
- Cách sửa: chuyển sang allowlist prefix theo từng pattern (ví dụ `redis.exists` chỉ cho `session:`), validate payload bằng Zod; tách API riêng cho `user`/gateway (theo namespace) thay vì KV tổng quát; dùng user/vhost RabbitMQ riêng và ACL cho queue này.

---

## Medium

### TH-02 (Medium) – RPC tin `role`/`userId` do payload tự khai
- File: `features/uploads/upload.rpc.controller.ts:82-85`; `features/notification/notification.rpc.controller.ts:41-76`; `features/test-scenario/test-scenario.rpc.controller.ts:79-94`; `features/email/email.rpc.controller.ts:27-30`
- Mô tả: quyền ADMIN của `upload.delete`, quyền tạo notification theo role, phạm vi `userId` của notification (`getAll/getById/markAsRead/delete/markAllAsRead`) đều lấy từ payload không có chữ ký. Chỉ cần gửi `role: 'ADMIN'` hoặc `userId` của nạn nhân là vượt quyền. `email.test` không kiểm tra role (HTTP yêu cầu ADMIN) và gửi mail thật mỗi lần gọi.
- Cách sửa: gateway truyền kèm access token (hoặc claim đã ký), service verify lại bằng `JwtService` trước khi tin `role/userId`; hoặc bảo vệ queue bằng ACL và chỉ nhận message từ service tin cậy. Thêm kiểm tra role cho `email.test`.

### TH-03 (Medium) – `JwtAuthGuard` lấy role từ token, không đối chiếu DB và không kiểm tra trạng thái user
- File: `packages/guards/jwt-auth.guard.ts:39-45, 55, 98-105`
- Mô tả: guard chỉ kiểm tra user còn tồn tại; `request.user.role` lấy từ JWT (access token mặc định sống 3 giờ). User bị hạ quyền ADMIN hoặc bị khoá vẫn dùng được token cũ đến khi hết hạn. `parseJwtUserRole` còn âm thầm đổi role lạ thành `STUDENT` thay vì từ chối.
- Cách sửa: dùng role/status đọc từ bản ghi `users` vừa query để gán `request.user`; từ chối nếu tài khoản bị khoá; role lạ thì ném 401.

### TH-04 (Medium) – `LogGateway` (WebSocket) chỉ tin role trong JWT, kết nối giữ đến hết hạn token
- File: `features/log/log.gateway.ts:62-79, 86-92`
- Mô tả: xác thực admin dựa vào `role === 'ADMIN'` trong token; DB chỉ kiểm tra user tồn tại. Admin bị hạ quyền hoặc bị khoá vẫn nhận toàn bộ log (gồm request body, header của mọi user) cho đến khi token hết hạn.
- Cách sửa: kiểm tra `role`/trạng thái từ bảng `users` khi connect; kiểm tra lại định kỳ hoặc khi có sự kiện đổi quyền.

### TH-05 (Medium) – `log.create` / `log.trace` không validate payload
- File: `features/log/log.rpc.controller.ts:18-21, 32-35`; `features/log/log.service.ts:15-23`
- Mô tả: `log.create` nhận `@Payload() dto` và ghi thẳng, không dùng `createRequestLogSchema` (đã có sẵn trong `packages/entities/log`). Payload sai (userId không phải uuid, `host` > 100 ký tự, thiếu trường bắt buộc, body khổng lồ) làm INSERT lỗi và bị `catch` nuốt chỉ còn warn, nên log mất âm thầm; publisher bất kỳ có thể chèn log giả hoặc đẩy dữ liệu rất lớn. `log.trace` với payload thiếu gây TypeError (500) hoặc truy vấn `eq(col, undefined)`.
- Cách sửa: `createRequestLogSchema.safeParse` trước khi insert (cắt độ dài chuỗi), validate `correlationId` ở `log.trace`.

### TH-06 (Medium) – Lỗi ràng buộc Postgres qua RPC trả 500 thay vì 400/409
- File: `main.ts:41, 80`; `packages/filters/rpc-exception.filter.ts:60-73` (HTTP có xử lý ở `packages/interceptor/error.interceptor.ts:43-56`)
- Mô tả: `ErrorInterceptor` (map 23503/23505/23502 thành 400/409) chỉ gắn cho HTTP app. Listener RMQ chỉ có `RmqAckInterceptor` và `TraceContextInterceptor`, nên mọi lỗi không phải `HttpException` thành `500 Internal server error`. Ví dụ `notification.create` với `userId/classId/studentId` không tồn tại vi phạm FK (`database/schema.ts:423-434`) trả 500; tạo fixture trùng key khi race (`test-fixture.service.ts:42-45`) cũng 500.
- Cách sửa: trong `RpcExceptionFilter` map `code` 23503/23505/23502/23514 thành 400/409 như HTTP, hoặc service tự kiểm tra tồn tại và ném `BadRequest/Conflict`.

### TH-07 (Medium) – Notification: người gửi lẫn trong danh sách của người nhận, trạng thái đọc không nhất quán
- File: `features/notification/notification.repository.ts:44-46, 83-88, 110-114, 125-129`
- Mô tả: `findAll`/`findById` dùng `userId = me OR senderId = me`, nhưng `markAsRead`, `markAllAsRead`, `delete` chỉ áp dụng cho người nhận. Hậu quả: người gửi (tutor) thấy thông báo đã gửi trong `GET /notifications?isRead=false`, không thể đánh dấu đã đọc (404 ở `markAsRead`) và `read-all` không bao giờ xoá chúng, nên số "chưa đọc" của người gửi sai vĩnh viễn. Thông báo broadcast (`userId = null`) chỉ người gửi thấy.
- Cách sửa: danh sách/đếm chưa đọc chỉ theo `userId = me`; nếu cần "đã gửi" thì tách endpoint riêng; đồng bộ quy tắc sở hữu giữa các thao tác.

### TH-08 (Medium) – Tạo notification không kiểm tra quyền trên đối tượng đích
- File: `features/notification/notification.service.ts:47-64`
- Mô tả: TUTOR được tạo loại `TUTOR`/`STUDENT` nhưng `userId`, `classId`, `studentId` bất kỳ đều được chấp nhận (chỉ check dạng UUID). Tutor có thể gửi thông báo (kèm `redirectUrl` https, `actionLabel`) tới user/lớp/học sinh không thuộc mình, dùng để phishing hoặc spam.
- Cách sửa: xác minh quan hệ tutor–lớp–học sinh qua tutor-service trước khi tạo; chỉ ADMIN được gửi tới user tuỳ ý.

---

## Low

### TH-09 (Low) – Upload/download không phân quyền theo role hay chủ sở hữu
- File: `features/uploads/upload.controller.ts:45-95`
- Mô tả: mọi user đăng nhập (kể cả STUDENT/PARENT) upload tối đa 10 file x 10MB mỗi request (60 req/phút theo rate limit mặc định) và tải mọi object có prefix `uploads/` nếu biết key. Không lưu chủ sở hữu file.
- Cách sửa: giới hạn role/quota upload, lưu metadata chủ sở hữu và kiểm tra khi download; đặt `@Throttle` chặt hơn cho upload.

### TH-10 (Low) – Upload qua RPC: payload thiếu trường gây TypeError (500) thay vì 400
- File: `features/uploads/upload.rpc.controller.ts:90-106`; `features/uploads/upload.service.ts:92`
- Mô tả: `file.originalname.lastIndexOf` ném TypeError khi `originalname` không có; `Buffer.from(file.buffer.data)` lỗi khi `data` không phải mảng; chuỗi base64 được decode hết rồi mới kiểm tra kích thước.
- Cách sửa: validate payload bằng Zod (kiểu, độ dài base64 tối đa) trước khi decode.

### TH-11 (Low) – `sharp` không đặt `limitInputPixels`, rủi ro decompression bomb
- File: `features/uploads/upload.service.ts:109-113`
- Mô tả: ảnh PNG/WebP nhỏ hơn 10MB nhưng có số điểm ảnh rất lớn (mặc định cho phép tới ~268 MP) làm tăng đột biến RAM/CPU; `uploadMultiple` xử lý song song tới 10 ảnh.
- Cách sửa: `sharp(buf, { limitInputPixels: ... })`, giới hạn song song.

### TH-12 (Low) – Loại file chỉ kiểm tra theo đuôi tên file
- File: `features/uploads/upload.service.ts:91-101`; `features/uploads/upload.constant.ts:13-25`
- Mô tả: file không phải ảnh (`pdf, docx, zip, mp4, ...`) chỉ cần đúng đuôi, không kiểm tra magic bytes; nội dung bất kỳ được lưu với ContentType tin cậy. Có `ContentDisposition: attachment` giảm rủi ro nhưng file độc vẫn được lưu và phân phối qua URL công khai.
- Cách sửa: kiểm tra signature (file-type) và quét virus nếu cần.

### TH-13 (Low) – Fixture trả lại `value` dù đã có quy định ẩn (F-22)
- File: `features/test-scenario/test-fixture.service.ts:36-39, 41-46, 64-67, 74`
- Mô tả: `findAll` ẩn `value`, nhưng `create`, `update`, `delete`, `resolve` (khi fixture không có resolver) trả nguyên hàng gồm `value`. Giá trị cố định có thể là dữ liệu nhạy cảm do admin nhập.
- Cách sửa: dùng chung hàm mask cho mọi giá trị trả về.

### TH-14 (Low) – `redact` của test run phân biệt hoa thường, bỏ sót nhiều khoá
- File: `features/test-scenario/test-scenario.service.ts:26-47, 92-103`
- Mô tả: so khớp `SENSITIVE_KEYS.includes(key)` theo đúng chữ hoa/thường; thiếu `access_token`, `refresh_token`, `Authorization`, `secret`, `resetToken`...; body không phải JSON không được che; chuỗi JWT trong giá trị không bị mask (khác `trace-context.interceptor.ts`). `responseBody` được lưu vào `test_runs`.
- Cách sửa: dùng chung hàm redact (lowercase + regex JWT) như `trace-context.interceptor.ts`.

### TH-15 (Low) – Update rỗng gây 500; đổi resolver thành null làm mất giá trị fixture
- File: `features/test-scenario/test-scenario.repository.ts:148-155`; `features/test-scenario/test-fixture.repository.ts:44-50`; `features/test-scenario/test-fixture.service.ts:55-58`
- Mô tả: `updateTestScenarioSchema`/`updateTestFixtureSchema` đều `partial()` nên body `{}` cho `.set({})` rỗng, drizzle ném "No values to set" thành 500. Ở `TestFixtureService.update`, gửi `resolver: null` mà không có `value` thì `value` bị xoá, khiến fixture không còn value lẫn resolver (create có refine chặn, update thì không).
- Cách sửa: thêm `refine` yêu cầu ít nhất một trường, và kiểm tra trạng thái cuối của fixture sau update.

### TH-16 (Low) – `createMany` kiểm tra trùng theo kiểu check-then-insert, không có unique index
- File: `features/test-scenario/test-scenario.service.ts:164-174`; `database/schema.ts:516`
- Mô tả: trùng `(method, path, name)` chỉ được chặn bằng so sánh trong bộ nhớ; bảng `test_scenarios` chỉ có index thường nên hai lệnh đồng thời tạo bản ghi trùng.
- Cách sửa: thêm unique index `(method, path, name)` và `onConflictDoNothing()`.

### TH-17 (Low) – `page` không có giới hạn trên
- File: `packages/entities/notification/notification.schema.ts:35`; `packages/entities/log/log.schema.ts:26`; `features/notification/notification.repository.ts:42`; `features/log/log.repository.ts:48`
- Mô tả: `page` rất lớn làm `offset` vượt phạm vi bigint của Postgres, lỗi DB và trả 500.
- Cách sửa: `.max(...)` cho `page` hoặc dùng cursor pagination.

### TH-18 (Low) – `readAt` ghi bằng hai nguồn thời gian khác nhau
- File: `features/notification/notification.repository.ts:99` (SQL `now()`) và `:113` (`new Date()`)
- Mô tả: cột `timestamp` không có timezone; `markAsRead` dùng giờ DB, `markAllAsRead` dùng JS Date (drizzle serialize UTC). Khi timezone DB khác UTC, `readAt` giữa hai đường bị lệch nhau (và lệch so với `created_at` dùng `defaultNow()`).
- Cách sửa: dùng một nguồn (`sql now()` cho cả hai) hoặc chuyển sang `timestamptz`.

### TH-19 (Low) – Guard query toàn bộ cột `users` ở mỗi request
- File: `packages/guards/jwt-auth.guard.ts:101`
- Mô tả: `db.select().from(users)` kéo cả hash mật khẩu và mọi cột chỉ để kiểm tra tồn tại, tốn băng thông và tăng nguy cơ lộ dữ liệu nếu sau này gán nhầm vào `request`.
- Cách sửa: chọn tối thiểu `id, role, status`.

### TH-20 (Low) – `buildListWhereClause` không escape ký tự đại diện của `ILIKE`
- File: `packages/helpers/queryList.helper.ts:43`
- Mô tả: `search` đưa thẳng vào `%${search}%` mà không dùng `escapeLike` (helper có sẵn), `%`/`_` khớp mọi chuỗi. Hiện chưa có nơi nào trong repo gọi hàm này nhưng là bẫy khi dùng lại.
- Cách sửa: `ilike(col, '%' + escapeLike(search.trim()) + '%')`.

### TH-21 (Low) – Link reset password mặc định trỏ `localhost`; email test gửi mail thật bằng GET
- File: `features/email/email.service.ts:18-21`; `features/email/email.controller.ts:11-16`
- Mô tả: nếu thiếu `PASSWORD_RESET_URL_BASE` ở production, mail reset vẫn gửi với link `http://localhost:3000`, không báo lỗi. `GET /emails` có side-effect (gửi mail) và có thể bị gọi lặp tới giới hạn rate (60/phút).
- Cách sửa: dùng `getOrThrow` khi `NODE_ENV=production`; đổi sang `POST` và đặt `@Throttle` thấp.

### TH-22 (Low) – `LogGateway`: timer hết hạn có thể rò rỉ và có nguy cơ tràn `setTimeout`
- File: `features/log/log.gateway.ts:81-92`
- Mô tả: nếu client ngắt kết nối trong lúc `await` truy vấn DB/`join`, `handleDisconnect` chạy trước khi timer được đặt, nên timer và entry `expiryTimers` tồn tại đến khi token hết hạn. `setTimeout` với `ms > 2^31-1` (khoảng 24,8 ngày, khi cấu hình `JWT_ACCESS_EXPIRES_SECONDS` lớn) kích hoạt ngay và ngắt kết nối.
- Cách sửa: kiểm tra `client.connected` trước khi đặt timer, chặn `ms` tối đa `2^31-1`.

### TH-23 (Low) – Token tài khoản test cache không bị huỷ khi fixture resolver nhận 401
- File: `features/test-scenario/test-fixture.service.ts:104-120` (so với `test-scenario.service.ts:293-298`)
- Mô tả: chỉ `execute` gọi `auth.invalidate` khi 401. Khi resolver nhận 401 (token bị thu hồi/đổi mật khẩu), token cũ vẫn nằm trong cache đến sát `exp`, mọi lần resolve fixture sau đó đều lỗi.
- Cách sửa: gọi `auth.invalidate(profile)` khi `res.status === 401` ở `resolveRow` và thử lại một lần.

### TH-24 (Low) – Fallback `JWT_REFRESH_SECRET` bằng `??`
- File: `packages/configs/jwt-sign.config.ts:31`
- Mô tả: dùng `??` nên chuỗi rỗng không fallback (secret rỗng); khi thiếu biến thì refresh dùng chung secret với access (chỉ dựa vào claim `typ` để phân biệt).
- Cách sửa: dùng `||` hoặc bắt buộc `JWT_REFRESH_SECRET` riêng ở production.

### TH-25 (Low) – `generateCode` dùng `Math.random`
- File: `packages/helpers/generate.helper.ts:1-11`
- Mô tả: sinh mã không an toàn mật mã học. Hiện chưa được gọi trong repo này nhưng nếu dùng cho OTP/mã xác thực sẽ đoán được.
- Cách sửa: dùng `crypto.randomInt`.
