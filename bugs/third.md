# Review THIRD_SERVICE (`/home/haidangphan/Documents/tutor/third`)

Ngày review: 2026-10-13. Branch `chore/sync-2026-10-11`, HEAD `c88e26a` ("fixbug"), working tree sạch.
Phương pháp: đọc tĩnh source `src/`, `test/`, đối chiếu gateway (`gateway/src`) và user (`user/src`), đọc source Nest trong `node_modules/@nestjs/microservices` để xác nhận hành vi RMQ, `git show`/`git ls-files` để kiểm tra trạng thái commit, và chạy `tsc --noEmit` (chỉ kiểm tra, không emit). Không chạy test, không chạy service, không gọi mạng.

Quy ước "đã xác minh": đã đọc đúng dòng code và (nếu cần) đối chiếu nguồn phụ thuộc. "Chưa xác minh": phụ thuộc môi trường/runtime hoặc quyết định nghiệp vụ chưa rõ.

Lưu ý quan trọng: nhánh hiện tại đang ở trạng thái **merge conflict đã commit** (xem TRD3-02). Nhiều chỗ có hai phiên bản (nhánh `Updated upstream` = HEAD, nhánh `Stashed changes` = bản stash). Báo cáo ghi rõ khi một bug chỉ nằm ở một nhánh.

---

## 1. Tóm tắt

Tổng: **26 bug** (không tính các mục đã sửa).

| Mức độ   | Số lượng | Ghi chú |
| -------- | -------- | ------- |
| Critical | 1        | TRD3-01 |
| High     | 8        | TRD3-02, 03, 04, 05, 06, 07, 08, 18 |
| Medium   | 9        | TRD3-09 .. 17 |
| Low      | 8        | TRD3-19 .. 26 |
| **Tổng** | **26**   | |

Trạng thái:
- **MỚI**: 12 (TRD3-01, 02, 03, 07, 08, 09, 10, 11, 16, 19, 21, 26)
- **CÒN TỒN TẠI từ round2/round1**: 14 (TRD3-04, 05, 06, 12, 13, 14, 15, 17, 18, 20, 22, 23, 24, 25)
- **ĐÃ SỬA**: không đưa vào bảng bug; xem mục 4 (đối chiếu từng bug cũ). Tóm tắt: round1 có 10 đã sửa hoàn toàn + 5 đã sửa một phần/có điều kiện; round2 có 6 đã sửa hoàn toàn + 4 có điều kiện + 3 còn tồn tại (TRD2-10, 11, 12 và TRD2-11 một phần).

### 5 bug nghiêm trọng nhất
1. TRD3-01 (Critical): `.env.compose` đang được git theo dõi, chứa JWT access/refresh secret, mật khẩu Postgres và RabbitMQ.
2. TRD3-04 (High): RPC `redis.get`/`redis.set`/`redis.del` không xác thực, không whitelist; đọc được refresh token (`session:{userId}`) và reset token.
3. TRD3-02 (High): 24 file đã commit với merge conflict marker; `tsc` báo 111 lỗi TS1185; service không build được.
4. TRD3-05 (High): `DELETE /upload/:key` không có `RolesGuard` ở nhánh HEAD; mọi user đăng nhập xoá được object R2.
5. TRD3-18 (High): `scripts/recreate-db.ts` DROP toàn bộ bảng và enum của `DATABASE_URL` (DB dùng chung), không có guard môi trường.

---

## 2. Bảng bug

| ID | Mức độ | Trạng thái | File:dòng | Mô tả ngắn | Cách tái hiện / kịch bản | Đã xác minh |
| -- | ------ | ---------- | --------- | ---------- | ------------------------ | ----------- |
| TRD3-01 | Critical | MỚI | `.env.compose` (git tracked, commit `a5d81b6`) | File env có secret thật được commit: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `POSTGRES_PASSWORD`, `DATABASE_URL`, `RABBITMQ_PASSWORD`, `RABBITMQ_URL`. `.gitignore` không chặn `.env.compose`. | Ai đọc được repo lấy được JWT secret, ký access token với `role: ADMIN` và `sub` là id một user có thật. `JwtAuthGuard` lấy role từ token và chỉ kiểm tra user tồn tại (`jwt-auth.guard.ts:56, 99-106`). Mức Critical nếu cùng secret đang dùng ở môi trường thật; chưa xác minh điều này. | Đã xác minh: `git ls-files`, liệt kê tên biến (giá trị KHÔNG in ra). Chưa xác minh secret có đang dùng ở deploy. |
| TRD3-02 | High | MỚI | 24 file: `src/features/redis/redis.service.ts:17-25`; `src/features/notification/{notification.controller.ts:84-125, notification.repository.ts:82-143, notification.rpc.controller.ts:3-92, notification.service.ts:41-110}`; `src/features/uploads/{upload.controller.ts:30-134, upload.module.ts:8-22, upload.rpc.controller.ts:1-96, upload.service.ts:1-42, upload.constant.ts:3-39}`; `src/features/email/email.controller.ts:3-18`; `src/features/test-scenario/test-scenario.service.ts:146-151`; `src/packages/configs/jwt-sign.config.ts:16-32`; `src/packages/guards/token-bucket.guard.ts:43-102`; `src/packages/interceptor/trace-context.interceptor.ts:23-277`; `src/packages/entities/notification/notification.schema.ts:39-43`; 8 file trong `test/` | Commit `c88e26a` ("fixbug") đưa cả marker `<<<<<<<`, `=======`, `>>>>>>>` vào HEAD. Service không compile và test không chạy. Nhiều chỗ hai nhánh có ngữ nghĩa khác nhau (ví dụ `userId` optional hay bắt buộc, `delete` có hay không `ADMIN`). | `tsc --noEmit` báo 111 lỗi `TS1185 Merge conflict marker encountered`; `tsc` dừng ở lỗi cú pháp nên không báo lỗi ngữ nghĩa. Mọi `nest build`, `start`, `jest` đều hỏng. Khi resolve, cần chọn nhánh có chủ đích, không chọn máy móc. | Đã xác minh (`git show HEAD`, `git status` sạch, `tsc`). |
| TRD3-03 | High | MỚI | `src/packages/guards/jwt-auth.guard.ts:13` và `:15`; `src/features/log/log.gateway.ts:14` và `:16` | Import `resolveJwtAccessSecret` hai lần từ cùng module → `TS2300 Duplicate identifier`. Đây là lỗi ngữ nghĩa, sẽ còn sau khi gỡ conflict. | Sau khi resolve conflict, `tsc`/`nest build` vẫn fail ở hai file này. Không phụ thuộc runtime. | Đã xác minh bằng đọc code. Chưa thấy trong output `tsc` vì lỗi cú pháp chặn bước kiểm tra ngữ nghĩa. |
| TRD3-04 | High | CÒN TỒN TẠI (round1 TRD-01 phần RPC; round2 TRD-01) | `src/features/redis/redis.rpc.controller.ts:14-17` (`redis.get`), `:28-32` (`redis.set`), `:34-37` (`redis.del`); `src/features/redis/redis.service.ts:101-115, 128-136` | RPC Redis không có kiểm tra prefix, không có kiểm tra role; bất kỳ publisher nào trên queue `third_queue` đọc, ghi, xoá key tuỳ ý. HTTP `GET /redis` đã có `RolesGuard('ADMIN')` và blacklist (`redis.controller.ts:14-40`), nhưng RPC không dùng. | User service lưu `session:{userId}` = refresh token thô (`user/src/features/auth/auth.service.ts:36, 74-80`) và `reset-password:{jti}` = userId. Publisher gửi `redis.get` với `key: "session:<userId>"` → lấy refresh token → gọi refresh để chiếm tài khoản. Có thể ghi `reset-password:*` tuỳ ý hoặc `redis.del` để logout hàng loạt. Mức High; lên Critical nếu RabbitMQ lộ ra ngoài hoặc một service bị chiếm. | Đã xác minh (code và luồng dữ liệu user→third). Chưa xác minh RabbitMQ có cô lập mạng hay không. |
| TRD3-05 | High | CÒN TỒN TẠI (round1 TRD-02, phần delete) | `src/features/uploads/upload.controller.ts:129-134` (nhánh HEAD không có decorator; nhánh stash thêm `@UseGuards(RolesGuard) @Roles('ADMIN')`) | `DELETE /upload/:key` chỉ có global `JwtAuthGuard`. Nếu resolve conflict theo nhánh HEAD thì mọi user đã đăng nhập xoá được mọi object `uploads/*` trong R2, kể cả file của người khác. | `DELETE /upload/uploads%2F<uuid>.jpg` bằng token role `STUDENT` → 200 và object bị xoá. Nhánh stash đã chặn ADMIN. | Đã xác minh (đọc hai nhánh). |
| TRD3-06 | High | CÒN TỒN TẠI (round1 TRD-08) | `src/main.ts:52-63`; `node_modules/@nestjs/microservices/constants.js:23` (`RQM_DEFAULT_NOACK = true`); `node_modules/@nestjs/microservices/server/server-rmq.js:29, 154-156, 176, 196` | Transport RMQ không set `noAck: false`, nên Nest dùng `noAck = true` (broker auto-ack khi giao). `prefetchCount: 10` không có tác dụng với consumer auto-ack. Không có DLQ. | Process crash hoặc restart khi đang xử lý → message đã mất (kể cả RPC đang chờ, `redis.del` EventPattern `redis.rpc.controller.ts:34`, `log.create` `log.rpc.controller.ts:18`). | Đã xác minh (source Nest + `main.ts`). |
| TRD3-07 | High | MỚI | `src/features/test-scenario/test-scenario.rpc.controller.ts:96-99`; `src/packages/entities/test-scenario/test-scenario.schema.ts:90-96`; `src/packages/pipes/zod-validation.pipe.ts:30`; `src/features/test-scenario/scenario-generator.ts:12, 259, 297`; gateway `gateway/src/features/test-scenario/test-scenario.controller.ts:92-100` | `testscenario.generate` nhận `routes` qua schema `z.object({method, path})` nên Zod strip `params`, `uuidParams`, `isPublic`, `roles`, `bodySchema`... và `listRoutes` không được khai báo nên bị bỏ. `generateForRoute` mặc định dùng `['valid','auth','validation','not_found']`, nhánh `validation` lặp `route.uuidParams` (`:259`) và nhánh `not_found` gọi `route.uuidParams.length` (`:297`) → `undefined`. | Admin gọi `POST /test-scenarios/generate` không truyền `categories` → third throw `TypeError ... uuidParams is not iterable` → 500. Tính năng gen test hỏng hoàn toàn. Test hiện có dùng object đầy đủ field nên không bắt được. | Đã xác minh bằng đọc code (chưa chạy). |
| TRD3-08 | High | MỚI (xác nhận round2 "cần xác minh" #1) | `src/features/uploads/upload.rpc.controller.ts:80-83`; `src/features/uploads/upload.service.ts` (`delete(): Promise<void>`); `node_modules/@nestjs/microservices/server/server.js:73-98`; `node_modules/@nestjs/microservices/client/client-proxy.js:74-79`; gateway `gateway/src/features/rabbitmq/rmq.producer.ts` (`firstValueFrom` không có default) | Handler `upload.delete` trả `undefined`. Nest server gửi `{isDisposed: true}` không kèm response, client chỉ `complete()` không `next()`, gateway `firstValueFrom` throw `EmptyError`. Object trên R2 đã bị xoá nhưng gateway trả lỗi. | `DELETE /upload/:key` qua gateway: object bị xoá, client nhận lỗi, retry sẽ lỗi tiếp. Mã HTTP cuối cùng do `toRpcErrorPayload` của gateway quyết định, chưa xác minh. | Đã xác minh chuỗi Nest/gateway đến `EmptyError`. Chưa xác minh mã HTTP cuối. |
| TRD3-09 | Medium | MỚI | `src/features/notification/notification.repository.ts:123-130` (`markAllAsRead`); `notification.rpc.controller.ts:57-60`; `notification.controller.ts` (`read-all`) | `markAllAsRead` đánh dấu đã đọc mọi row có `userId = me` **hoặc** `senderId = me`. Row của người nhận khác (người mình gửi) cũng bị đổi trạng thái. Đây là ghi chéo user. | TUTOR T gửi thông báo tới student S (`userId=S`, `senderId=T`). T gọi `PATCH /notifications/read-all` → thông báo của S bị đánh dấu đã đọc. | Đã xác minh (code). |
| TRD3-10 | Medium | MỚI (cần xác nhận nghiệp vụ) | `src/features/notification/notification.service.ts:18-20, 50-53` (`CREATABLE_TYPES_BY_ROLE`), `:56-66` (không kiểm tra quan hệ); `src/packages/entities/notification/notification.schema.ts:24-28` (`redirectUrl`) | Role `TUTOR` tạo được thông báo type `TUTOR`/`STUDENT` tới `userId`/`classId`/`studentId` bất kỳ, không kiểm tra quan hệ với người nhận. `redirectUrl` chấp nhận mọi `https://` (kể cả domain lạ). | TUTOR gửi thông báo spam tới user không liên quan, hoặc gửi kèm link `https://<domain lạ>` hiển thị trong app. Nếu nghiệp vụ cho phép, chỉ còn là vấn đề allowlist URL. | Đã xác minh (code). Chưa xác minh quy tắc nghiệp vụ. |
| TRD3-11 | Medium | MỚI (gốc ở user, third là nơi lưu) | `src/packages/interceptor/trace-context.interceptor.ts:48-64` (không có `jti`); `user/src/packages/interceptor/trace-context.interceptor.ts:22-30` (không có `jti`, `resetToken`); `user/src/features/auth/auth.service.ts:254`; `user/src/features/auth/auth.controller.ts:232-234` | Payload `auth.resetPassword` chứa `jti` = chính reset token (còn hiệu lực 5 phút, dùng một lần). `jti` không khớp `SENSITIVE_KEYS` ở cả third và user, và `JWT_PATTERN` không khớp UUID, nên được lưu nguyên trong `request_logs.requestBody`. | Admin mở `GET /logs` hoặc socket `log:new` và đọc được `jti` còn hạn → đặt lại mật khẩu của user đó. Cần sửa ở user (interceptor) và thêm `jti` vào danh sách redact của third. | Đã xác minh (code hai repo). Chưa chạy để xác nhận dòng log thực tế. |
| TRD3-12 | Medium | CÒN TỒN TẠI MỘT PHẦN (round1 TRD-07) | Nhánh HEAD: `src/features/redis/redis.service.ts:17-21` (`commandTimeout: 5_000`, `maxRetriesPerRequest: null`), `src/packages/guards/token-bucket.guard.ts:43-51` (không có timeout). Nhánh stash: `redis.service.ts:22-25` (`maxRetriesPerRequest: 3`, không `commandTimeout`), `token-bucket.guard.ts:53-64` (`withTimeout` 500ms) | `TokenBucketGuard` là APP_GUARD chạy trên mọi HTTP request. Ở nhánh HEAD, khi Redis treo (không down hẳn), mỗi request phải chờ tới 5s rồi mới fail-open. Ở nhánh stash, giới hạn 500ms, tốt hơn. | Redis treo (ví dụ network partition) → toàn bộ HTTP của third chậm thêm 5s mỗi request (nhánh HEAD). Fail-open vẫn đúng. | Đã xác minh (code hai nhánh). |
| TRD3-13 | Medium | CÒN TỒN TẠI (round1 TRD-12) | `src/features/email/email.service.ts:53-72` | `sendMail` không có timeout, không retry, không phân loại lỗi (429/5xx/key sai đều thành `Error`). `sendForgotPasswordMail` được user service gọi qua RPC đồng bộ. Timeout mặc định của SDK `resend` chưa xác minh. | Resend chậm → RPC `email.sendForgotPasswordMail` treo → user service và gateway hết timeout, trong khi token reset đã được ghi vào Redis. | Đã xác minh (code). Chưa xác minh timeout mặc định SDK. |
| TRD3-14 | Medium | CÒN TỒN TẠI (round1 TRD-19) | `src/packages/interceptor/error.interceptor.ts:22-31, 52-56` | Lỗi Postgres `23503`, `23505`, `23502`, `23514` được đổi message nhưng vẫn trả `InternalServerErrorException` (500) thay vì 400/409. | `POST /notifications` với `classId` không tồn tại → FK 23503 → HTTP 500 "Referenced record not found". Sai mã trạng thái theo API_ENDPOINTS. Chỉ áp dụng HTTP; RPC trả 500 chung qua `RpcExceptionFilter`. | Đã xác minh (code). |
| TRD3-15 | Medium | CÒN TỒN TẠI MỘT PHẦN (round1 TRD-11) | `src/features/email/email.rpc.controller.ts:19-23`; `src/features/log/log.rpc.controller.ts:18-21`; `src/features/notification/notification.rpc.controller.ts:57-60`; `src/features/redis/redis.rpc.controller.ts:20-23, 34-37` | RPC không validate payload: `email.sendForgotPasswordMail` nhận `to` và `resetToken` tuỳ ý; `log.create` ghi thẳng; `notification.markAllAsRead` không kiểm tra `userId`; `redis.exists`/`redis.del` không kiểm tra key/keys. | Publisher RMQ gửi `email.sendForgotPasswordMail` với `to` là địa chỉ bất kỳ → third gửi mail từ `MAIL_FROM` (domain thật) tới địa chỉ đó (spam/phishing). `redis.del` với `keys` không phải mảng → TypeError. | Đã xác minh (code). |
| TRD3-16 | Medium | MỚI | `src/features/test-scenario/test-fixture.service.ts:41-46` (`create`), `:48-62` (`update`), `:71-82` (`resolve`); `src/features/test-scenario/test-fixture.repository.ts:36-50` (`returning()`) | `findAll` đã ẩn `value` (F-22), nhưng `create`, `update`, `resolve` trả nguyên row có `value`. Fixture có resolver lấy `accessToken` (ví dụ `data.accessToken`) sẽ lộ token thô trong response. | Admin tạo fixture với resolver `GET /auth/me`, extract `data.accessToken` → response của `POST/PATCH/resolve` chứa token. Phạm vi admin, nhưng response có thể nằm trong log proxy/client. | Đã xác minh (code). Chưa xác minh fixture thực tế có lưu token hay không. |
| TRD3-17 | Medium | CÒN TỒN TẠI MỘT PHẦN (round1 TRD-13) | Nhánh HEAD: `src/features/email/email.controller.ts:9-22` (không có `@Roles`/`@UseGuards`). Nhánh stash thêm `@Roles('ADMIN')` + `RolesGuard`. | `GET /emails` không còn `@Public` (đã tốt hơn), nhưng nhánh HEAD cho mọi user đã đăng nhập gửi email thật tới `TEST_EMAIL_RECIPIENT`. | Bất kỳ user đăng nhập gọi `GET /emails` nhiều lần → spam hộp thư test và tốn quota Resend. | Đã xác minh (đọc hai nhánh). |
| TRD3-18 | High | CÒN TỒN TẠI (round1 TRD-21) | `scripts/recreate-db.ts:12` (đọc `DATABASE_URL`), `:39` (`DROP TABLE ... CASCADE`), `:51` (`DROP TYPE ... CASCADE`) | Script DROP mọi bảng và enum trong schema `public` không kiểm tra `NODE_ENV`, không có cờ xác nhận. DB này dùng chung cho 4 service. | Chạy `bun scripts/recreate-db.ts` khi `DATABASE_URL` trỏ tới DB dùng chung/production → mất toàn bộ dữ liệu. Yêu cầu thao tác thủ công, nhưng mức ảnh hưởng là mất dữ liệu. | Đã xác minh (code). |
| TRD3-19 | Low | MỚI (TRD-10 tái xuất hiện ở nhánh stash) | `src/features/test-scenario/test-scenario.service.ts:146-151` (nhánh stash: `dto.routes.flatMap`); nhánh HEAD dòng 147 có `dto.routes ?? []` | `routes` là optional trong schema, nhánh stash truy cập trực tiếp → TypeError khi không gửi `routes`. Gateway luôn gửi `routes`, nên chỉ ảnh hưởng caller RMQ trực tiếp. | Publish `testscenario.generate` với `{}` → TypeError. | Đã xác minh (code). |
| TRD3-20 | Low | CÒN TỒN TẠI (round1 TRD-16) | `src/features/uploads/upload.controller.ts:63-64`; `src/features/uploads/upload.service.ts:97-98` (nhánh stash: `file.buffer?.length` khi `file` undefined); `src/features/uploads/upload.rpc.controller.ts:89-92` (nhánh stash: `file.buffer` không guard) | Thiếu file → `file` là `undefined` → TypeError → 500 thay vì 400. Nhánh HEAD của RPC có guard `file?.buffer?.data`, nhánh stash thì không. | `POST /upload` không có field `file` → 500 (ở third, không qua gateway vì gateway đã kiểm tra). | Đã xác minh (code). |
| TRD3-21 | Low | MỚI | `src/main.ts:56` | Fallback `amqp://guest:guest@localhost:5672` khi thiếu `RABBITMQ_URL`. Mặc định RabbitMQ chỉ cho `guest` từ localhost, nên rủi ro thấp. Đây là credential mặc định trong code. | Chạy nhầm với env thiếu và RabbitMQ đã đổi mật khẩu thì fail; nếu RabbitMQ dev dùng guest mặc định và truy cập được từ mạng khác thì rủi ro lớn hơn. | Đã xác minh (code). |
| TRD3-22 | Low | CÒN TỒN TẠI (round2 TRD2-12; phần dead code của round1 TRD-27) | `src/packages/strategy/jwt-user.strategy.ts` (không file nào import); `src/packages/helpers/queryList.helper.ts:1-45` (`ilike` không escape, được `export *` từ `helpers/index.ts:3`, không có call site); `src/packages/helpers/{jwt,hashingData}.helper.ts`; `src/packages/entities/*` không dùng trong third | Code chết và helper chưa escape LIKE. Các dependency như `@nestjs/passport`, `bcrypt`, `passport-*` không dùng trong `src/` (chưa kiểm tra danh sách đầy đủ). | Không có đường tấn công trực tiếp; tăng bề mặt và rủi ro khi ai đó dùng lại helper. | Đã xác minh (grep import). Chưa xác minh toàn bộ dependency không dùng. |
| TRD3-23 | Low | CÒN TỒN TẠI (round1 TRD-02, phần download; cần xác nhận nghiệp vụ) | `src/features/uploads/upload.controller.ts:98-101`; `src/features/uploads/upload.service.ts` (`assertValidKey`: chỉ kiểm tra prefix `uploads/`, `..`, `\`) | Mọi user đăng nhập tải được mọi object `uploads/*`, không kiểm tra ownership. Nếu bucket là public (`CLOUDFLARE_R2_PUBLIC_URL`) thì không có tác dụng bảo mật. | User A tải file của user B bằng key đoán được. Nếu tài liệu là riêng tư thì là IDOR đọc. | Đã xác minh (code). Chưa xác minh bucket có public hay không. |
| TRD3-24 | Low | CÒN TỒN TẠI (round2 TRD2-10) | `src/features/notification/notification.repository.ts:110-121` (`markAsRead`: chỉ `isRead: true`), `:123-130` (`markAllAsRead`: không lọc `isRead = false`, không set `readAt`); `src/database/schema.ts:452` (cột `read_at`) | `readAt` không bao giờ được ghi. `markAllAsRead` ghi đè các row đã đọc. | Báo cáo theo thời điểm đọc luôn null. | Đã xác minh (code). |
| TRD3-25 | Low | CÒN TỒN TẠI MỘT PHẦN (round2 TRD2-11) | `src/packages/helpers/cors.helper.ts:14` (ngoài production trả `true` → phản chiếu mọi origin với `credentials: true`); dùng ở `src/main.ts:34`, `src/features/log/log.gateway.ts:35` | Production đã mặc định tắt CORS nếu không có `CORS_ORIGINS` (tốt). Môi trường dev/staging phản chiếu mọi origin kèm credentials. Log gateway cũng dùng cùng logic. | Trang web bất kỳ gọi API third bằng cookie/credential nếu môi trường không phải production bị expose. | Đã xác minh (code). |
| TRD3-26 | Low | MỚI (nhánh stash) | `src/features/notification/notification.service.ts:79-85` (nhánh stash, bỏ `assertUuid`); nhánh HEAD có `assertUuid` ở `:41-46`, `:75-78`, `:88-91`, `:104-107` | Nhánh stash bỏ kiểm tra UUID cho `findById`/`markAsRead`/`delete`. `id` không phải UUID sẽ đến Postgres (`invalid input syntax for type uuid`) → 500 thay vì 404. | `GET /notifications/abc` → 500. | Đã xác minh (đọc hai nhánh). |

---

## 3. Chi tiết theo bug (không lặp nội dung bảng)

Chỉ mô tả thêm những điểm bảng chưa đủ. Mỗi bug có một mục.

### TRD3-01 (Critical): secret commit trong `.env.compose`
- File được git theo dõi (`git ls-files`), tạo trong commit `a5d81b6`. `.gitignore` chặn `.env` và `docker.env` nhưng không chặn `.env.compose`.
- Các biến nhạy cảm có giá trị không rỗng: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `POSTGRES_PASSWORD`, `DATABASE_URL`, `RABBITMQ_PASSWORD`, `RABBITMQ_URL`. Giá trị không được in ra báo cáo.
- Việc cần làm: xoay toàn bộ secret, gỡ file khỏi index (`git rm --cached`), thêm vào `.gitignore`, cân nhắc xoá khỏi lịch sử git. Không tự sửa trong phạm vi review này.

### TRD3-02 (High): merge conflict marker commit trong HEAD
- Danh sách 24 file (16 trong `src/`, 8 trong `test/`) được liệt kê ở bảng. Không có file nào trong working tree sạch khác với HEAD, nên lỗi đã nằm trong commit.
- Đọc hai nhánh cho thấy khác biệt có ý nghĩa bảo mật: nhánh stash có `userId` bắt buộc ở notification RPC, `RolesGuard` cho delete upload, `base64` contract cho upload, timeout 500ms cho token bucket, redact `buffer`. Nhánh HEAD thì ngược lại ở nhiều chỗ. Nhánh stash đúng hơn về bảo mật nhưng vẫn có TRD3-26 và TRD3-19.
- Vì đây là lỗi build, nên nhiều bug khác (TRD3-03, TRD3-05, TRD3-10, TRD3-17, TRD3-22...) chỉ kiểm chứng được bằng đọc code, không chạy được test.

### TRD3-03 (High): import trùng
- `jwt-auth.guard.ts:13` và `:15` cùng import `resolveJwtAccessSecret` từ `'../configs/jwt-sign.config'`.
- `log.gateway.ts:14` và `:16` cùng import `resolveJwtAccessSecret` từ `'../../packages/configs/jwt-sign.config'`.
- Xoá một dòng ở mỗi file. Sau khi gỡ conflict, đây là lỗi TS2300 chắc chắn.

### TRD3-04 (High): RPC Redis không có authz
- Đây là điểm yếu trust boundary: third tin mọi RMQ publisher. Bất kỳ thành phần nào có quyền publish lên `third_queue` đều đọc được refresh token và reset token.
- Round2 cho rằng gateway đã chặn bằng whitelist/ADMIN. Điều đó đúng cho HTTP của gateway, nhưng RPC thì không. Gateway chỉ là một trong những publisher.
- Hướng sửa: tách pattern cho client được phép (`redis.getPublic`), hoặc thêm whitelist/blacklist giống HTTP ở tầng RPC; hạn chế quyền publish của từng service trên broker.

### TRD3-05 (High): DELETE upload không phân quyền ở nhánh HEAD
- Global `JwtAuthGuard` chỉ xác thực, không phân quyền. Nhánh stash đã thêm `@UseGuards(RolesGuard) @Roles('ADMIN')` cho `delete`.
- RPC `upload.delete` không có kiểm tra role. Gateway cũng chưa có kiểm tra ở nhánh HEAD của nó; chưa xác minh gateway có chặn trước hay không.

### TRD3-06 (High): RabbitMQ auto-ack
- `main.ts` không truyền `noAck: false`. `@nestjs/microservices` v11.1.27 có `RQM_DEFAULT_NOACK = true`, nên `noAck` mặc định là `true`.
- Hệ quả: `prefetchCount` vô hiệu, không có nack/requeue khi handler lỗi giữa chừng, không có DLQ. Cần đổi sang `noAck: false` kèm `channel.ack` sau khi xử lý xong, và cấu hình DLQ cho queue.

### TRD3-07 (High): `testscenario.generate` hỏng
- Chuỗi: gateway gửi `routes` đầy đủ + `listRoutes` → `ZodValidationPipe` (`return result.data`) strip các field không khai báo → `generateForRoute` truy cập `route.uuidParams` là `undefined`.
- Với mặc định (không gửi `categories`), nhánh `validation` (`scenario-generator.ts:258-259`) và `not_found` (`:297`) đều chạm `uuidParams`.
- Sửa: khai báo đầy đủ `RouteInfoDto` trong schema (`generateTestScenariosSchema`) và thêm `listRoutes`; thêm test contract đi qua pipe thật.

### TRD3-08 (High): `upload.delete` báo lỗi dù đã xoá
- Đây là xác nhận cho round2 "cần xác minh" #1. Chuỗi: handler `void` → Nest server không gửi `response` → client `complete()` không `next()` → gateway `firstValueFrom` không có default → `EmptyError`.
- Sửa đơn giản: trả `{ ok: true }` từ `upload.delete` (đúng cách `redis.set` đã làm, comment `redis.rpc.controller.ts:25-27`).

### TRD3-09 (Medium): `read-all` ghi chéo user
- Đề xuất sửa: `markAllAsRead` chỉ đặt `isRead` cho row có `userId = me` (bỏ `senderId`), và thêm `isRead = false` để không ghi đè `readAt` (liên quan TRD3-24).

### TRD3-10 (Medium): phạm vi tạo thông báo
- Cần quyết định nghiệp vụ: TUTOR có được gửi tới bất kỳ user nào không. Nếu không, cần kiểm tra quan hệ lớp/học sinh qua tutor-service. `redirectUrl` nên là allowlist domain hoặc chỉ cho đường dẫn nội bộ.

### TRD3-11 (Medium): reset token trong log
- Sửa tại user: thêm `jti`, `resetToken` vào `SENSITIVE_KEYS` của `trace-context.interceptor.ts` và `logger.interceptor.ts`.
- Sửa tại third: thêm `jti` vào danh sách redact của `trace-context.interceptor.ts` làm lớp phòng thủ thứ hai.
- Ngoài ra, `auth.resetPassword` không nên bị preview payload.

### TRD3-12 (Medium): Redis treo làm chậm mọi request
- Nhánh stash đã có `withTimeout(500ms)` trong `token-bucket.guard.ts:53-64`. Nên kết hợp: giữ timeout 500ms ở guard và thêm `commandTimeout` ở client để RPC khác cũng không treo.

### TRD3-13 (Medium): email không timeout
- Thêm `AbortSignal.timeout` hoặc tham số timeout của SDK nếu có; phân loại lỗi 4xx (địa chỉ sai, key sai) với 5xx/429 để user service có thể retry hợp lý. Chưa xác minh SDK `resend` có hỗ trợ tham số này không.

### TRD3-14 (Medium): PG error trả 500
- Map `23503` → 404 hoặc 400, `23505` → 409, `23502`/`23514` → 400. Giữ message chung như hiện tại.

### TRD3-15 (Medium): RPC thiếu validation
- Thêm `ZodValidationPipe` (hoặc `safeParse` như `notification.rpc.controller.ts`) cho `email.sendForgotPasswordMail` (`to` là email hợp lệ, `resetToken` là UUID), `log.create`, `notification.markAllAsRead`, `redis.exists`, `redis.del`.

### TRD3-16 (Medium): fixture lộ `value`
- Dùng cùng hàm ẩn `value` như `findAll` cho `create`, `update`, `resolve`. Với `resolve`, cần trả `hasValue: true` thay vì giá trị.

### TRD3-17 (Medium): `GET /emails` ở nhánh HEAD
- Thêm `@Roles('ADMIN')` và `@UseGuards(RolesGuard)` như nhánh stash. Đây là lỗi phụ thuộc conflict (TRD3-02).

### TRD3-18 (High): `recreate-db.ts` không có guard
- Thêm kiểm tra `NODE_ENV !== 'production'`, bắt buộc cờ xác nhận (ví dụ `--confirm=<db name>`), và từ chối nếu tên DB không khớp pattern dev.

### TRD3-19 (Low): `generate` với `routes` undefined
- Đặt default `dto.routes ?? []` như nhánh HEAD.

### TRD3-20 (Low): thiếu file → 500
- Thêm guard `if (!file) throw new BadRequestException(...)` ở HTTP controller và `reconstruct` của RPC.

### TRD3-21 (Low): fallback `guest:guest`
- Bắt buộc `RABBITMQ_URL` khi `NODE_ENV=production`, giống các secret khác.

### TRD3-22 (Low): dead code
- Xoá `src/packages/strategy/`, `queryList.helper.ts` (hoặc sửa để escape LIKE), các helper không dùng, và dependency thừa trong `package.json` sau khi xác nhận.

### TRD3-23 (Low): download không kiểm tra ownership
- Cần xác nhận nghiệp vụ: file upload có phải riêng tư không. Nếu có, lưu owner và kiểm tra khi download.

### TRD3-24 (Low): `readAt`
- Đặt `readAt: new Date()` khi `markAsRead` và `markAllAsRead`, thêm `isRead = false` trong `markAllAsRead`.

### TRD3-25 (Low): CORS dev
- Chỉ phản chiếu origin khi `CORS_ORIGINS` có giá trị. Ngoài ra nên tắt `credentials` khi origin là `true`.

### TRD3-26 (Low): stash bỏ `assertUuid`
- Khôi phục `assertUuid` (nhánh HEAD) hoặc dùng `ParseUUIDPipe` ở controller, và trả 404.

---

## 4. Đối chiếu bug cũ (round1 `third-review.md` và round2 `round2/third-review.md`)

Đã đọc code, không tin báo cáo cũ. Trạng thái: **ĐÃ SỬA**, **ĐÃ SỬA MỘT PHẦN / CÓ ĐIỀU KIỆN** (chỉ đúng ở một nhánh), **CÒN** (vẫn tồn tại), và cột "Tham chiếu" trỏ tới bug mới.

### Round1 (TRD-01 .. TRD-28)

| ID | Trạng thái | Ghi chú / file | Tham chiếu |
| -- | ---------- | -------------- | ---------- |
| TRD-01 | CÒN MỘT PHẦN | HTTP: `redis.controller.ts:14-40` đã ADMIN + blacklist. RPC `redis.get` vẫn không kiểm soát | TRD3-04 |
| TRD-02 | CÒN MỘT PHẦN | Không còn `@Public` ở upload controller; download/upload yêu cầu JWT. Delete chưa có ADMIN ở nhánh HEAD | TRD3-05 |
| TRD-03 | ĐÃ SỬA | `jwt-sign.config.ts:23-30` throw khi thiếu secret; không còn chuỗi `dev-insecure` trong `src/` (grep). Secret trong `.env.compose` là vấn đề khác | TRD3-01 |
| TRD-04 | ĐÃ SỬA (nhánh stash) | Stash bắt buộc `userId` ở RPC và kiểm tra quyền ở repo. Nhánh HEAD để `userId` optional nên không đủ | TRD3-02 |
| TRD-05 | CÒN MỘT PHẦN | `value`, `resetToken` đã được redact; `jti` chưa, và bodies `redis.`, `email.`, `health.`, `upload.` đã được bỏ qua | TRD3-11 |
| TRD-06 | ĐÃ SỬA | `upload.controller.ts:110` (HEAD) và `:113-118` (stash) dùng `pipeline` có callback lỗi | — |
| TRD-07 | CÒN MỘT PHẦN | Stash có timeout 500ms ở guard; HEAD chỉ có `commandTimeout` 5s | TRD3-12 |
| TRD-08 | CÒN | `main.ts` không `noAck: false` | TRD3-06 |
| TRD-09 | ĐÃ SỬA | `notification.schema.ts:44-46` parse `'true'/'false'` đúng | — |
| TRD-10 | ĐÃ SỬA (HEAD) / TÁI XUẤT HIỆN (stash) | HEAD có `?? []`; stash dùng `dto.routes.flatMap` | TRD3-19 |
| TRD-11 | CÒN MỘT PHẦN | Notification, upload, redis.get/set có validation; email, log, markAllAsRead, redis.exists/del thì không | TRD3-15 |
| TRD-12 | CÒN | Không có timeout/phân loại lỗi | TRD3-13 |
| TRD-13 | CÒN MỘT PHẦN | Không còn `@Public` nhưng nhánh HEAD không có ADMIN | TRD3-17 |
| TRD-14 | ĐÃ SỬA | `MulterModule` có `limits` (`upload.module.ts`); RPC kiểm tra `MAX_UPLOAD_BYTES` | — |
| TRD-15 | ĐÃ SỬA | `upload.constant.ts` có whitelist; `upload.service.ts` chọn `contentType` phía server | — |
| TRD-16 | CÒN | Thiếu file vẫn TypeError | TRD3-20 |
| TRD-17 | ĐÃ SỬA | `uploadMultiple` dùng `allSettled` và xoá các file đã upload khi lỗi (`upload.service.ts`) | — |
| TRD-18 | ĐÃ SỬA MỘT PHẦN | `NoSuchKey` → 404 ở HTTP và RPC. RPC vẫn đọc toàn bộ object vào RAM, nhưng có giới hạn 10MB | — |
| TRD-19 | CÒN | `error.interceptor.ts` vẫn trả 500 cho lỗi FK/unique | TRD3-14 |
| TRD-20 | ĐÃ SỬA MỘT PHẦN | `markAllAsRead` trả `{markedAll, count}` (`notification.repository.ts:129`); nhưng lỗi ghi chéo user | TRD3-09 |
| TRD-21 | CÒN | `scripts/recreate-db.ts` vẫn DROP không guard | TRD3-18 |
| TRD-22 | CÒN MỘT PHẦN (thiết kế) | Write method bị chặn chỉ khi `NODE_ENV=production` (`test-scenario.service.ts:216-223`). Không tạo mục riêng; cần xác nhận | — |
| TRD-23 | ĐÃ SỬA | `redis.service.ts:101-106` trả `BadRequest` khi key rỗng | — |
| TRD-24 | ĐÃ SỬA | Key rate-limit dùng route pattern (`token-bucket.guard.ts`); `TRUST_PROXY` cấu hình được (`main.ts:29-32`) | — |
| TRD-25 | ĐÃ SỬA | `log.gateway.ts:108-110` emit tới room `admins` | — |
| TRD-26 | ĐÃ SỬA | `redis.service.ts:116-127` kiểm tra TTL và kiểu value | — |
| TRD-27 | ĐÃ SỬA MỘT PHẦN | `escapeLike` có ở notification và log repo. `queryList.helper.ts` chưa escape (dead code). Kiểm tra UUID ở nhánh stash bị bỏ | TRD3-22, TRD3-26 |
| TRD-28 | CÒN MỘT PHẦN | `getPublicUrl` fail-fast (đã sửa). Còn tag Swagger `Cloudinary` (`main.ts:107`), port mặc định 8888 (`main.ts:125`) | Low, không tạo mục riêng |

Tổng round1: ĐÃ SỬA hoàn toàn 10 (TRD-03, 06, 09, 14, 15, 17, 23, 24, 25, 26); ĐÃ SỬA một phần/có điều kiện 5 (TRD-04, 10, 18, 20, 27); CÒN MỘT PHẦN 8 (TRD-01, 02, 05, 07, 11, 13, 22, 28); CÒN 5 (TRD-08, 12, 16, 19, 21).

### Round2 (TRD2-01 .. TRD2-13)

| ID | Trạng thái | Ghi chú / file | Tham chiếu |
| -- | ---------- | -------------- | ---------- |
| TRD2-01 | ĐÃ SỬA | Third chỉ trả count và info (`app.controller.ts:27-61`); gateway không trả stats (`gateway/src/app.controller.ts:239-258`) | — |
| TRD2-02 | ĐÃ SỬA (nhánh stash) | Stash dùng base64 hai chiều. Nhánh HEAD còn `file.buffer.data` và trả `Buffer` | TRD3-02 |
| TRD2-03 | ĐÃ SỬA (có handler) | Đủ 15 pattern `testscenario.*`; nhưng `generate` hỏng do strip | TRD3-07 |
| TRD2-04 | ĐÃ SỬA MỘT PHẦN | Stash có `redact` xử lý Buffer và bỏ qua `upload.`; nhánh HEAD vẫn stringify toàn bộ base64 ~13MB | TRD3-02 |
| TRD2-05 | ĐÃ SỬA | `database.module.ts` không còn log `DATABASE_URL` | — |
| TRD2-06 | ĐÃ SỬA | `rpc-exception.filter.ts:60-73` trả "Internal server error" chung; HTTP vẫn xem TRD3-14 | — |
| TRD2-07 | ĐÃ SỬA | `email.service.ts:6` escape HTML, `:43` `encodeURIComponent`. `to` chưa validate | TRD3-15 |
| TRD2-08 | ĐÃ SỬA | `upload.constant.ts` whitelist; ảnh luôn `.jpg`, `image/jpeg` | — |
| TRD2-09 | ĐÃ SỬA | `upload.controller.ts:102` sanitize tên file; `pipeline` huỷ stream khi lỗi | — |
| TRD2-10 | CÒN | `readAt` không được ghi | TRD3-24 |
| TRD2-11 | CÒN MỘT PHẦN | Production đã mặc định tắt CORS; dev vẫn phản chiếu mọi origin | TRD3-25 |
| TRD2-12 | CÒN | Dead code, helper không dùng | TRD3-22 |
| TRD2-13 | ĐÃ SỬA MỘT PHẦN | Có spec cho notification, redis, upload, email, guard. 8 file test có conflict marker nên không chạy được | TRD3-02 |

Tổng round2: ĐÃ SỬA hoàn toàn 6 (TRD2-01, 05, 06, 07, 08, 09); ĐÃ SỬA có điều kiện/một phần 4 (TRD2-02, 03, 04, 13); CÒN 2 (TRD2-10, 12); CÒN MỘT PHẦN 1 (TRD2-11).

---

## 5. Lưu ý phương pháp và giới hạn

- Không chạy được test và build do conflict. Mọi kết luận "đã xác minh" là đọc code, kiểm tra Nest source trong `node_modules` và `tsc --noEmit` (chỉ phát hiện lỗi cú pháp).
- Không tra cứu được timeout mặc định SDK `resend` (TRD3-13), mã HTTP cuối của gateway khi nhận `EmptyError` (TRD3-08), việc `.env.compose` có đang dùng ở deploy hay không (TRD3-01), và nghiệp vụ tạo thông báo/tải file (TRD3-10, TRD3-23).
- Gateway, user, tutor-service không được review ở đây ngoài phần đối chiếu contract RPC và redaction.
- Không có file nào trong repo bị sửa trong quá trình review; chỉ tạo báo cáo này.
