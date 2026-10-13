# Review vòng 2: THIRD_SERVICE

## Tổng quan

- **Scope**: `/home/haidangphan/Documents/project/THIRD_SERVICE` (NestJS 11, hybrid HTTP + RMQ listener `third_queue`; notification / email / redis / upload R2 / log / test-scenario). Đã đọc CLAUDE.md, README, API_ENDPOINTS (mục liên quan), toàn bộ `src/features/*`, `src/packages/{guards,interceptor,filters,pipes,context,entities/notification|log|test-scenario}`, `src/database/database.module.ts`, `src/main.ts`, `src/app.controller.ts`, `test/`, `*.spec.ts`, Dockerfile. Phương pháp: đọc tĩnh, không chạy build/test, không sửa source.
- **Đối chiếu**: review cũ `reviews/third-review.md` (TRD-01..28) và các call site mới của gateway (`gateway/src/features/{notification,redis,upload,email}/*.controller.ts`, `rabbitmq/rmq.producer.ts`, `app.controller.ts`).
- **Tình trạng các điểm trọng tâm**:
  - **Notification ownership**: gateway đã gửi `userId` ở `getById/markAsRead/delete`, nhưng **third-service bỏ qua hoàn toàn** (`notification.rpc.controller.ts:30-42` chỉ đọc `payload.id`; service/repo chỉ theo `id`). IDOR **vẫn còn** (TRD-04).
  - **redis.get**: gateway đã chặn bằng whitelist prefix + `@Roles('ADMIN')`, nhưng phía third **không có whitelist** (cả RPC lẫn `GET /redis` HTTP). Namespace `session:{userId}` (value = refresh token raw) và `reset-password:{jti}` **có thật** (USER `auth.service.ts:35-36`). Phát hiện mới: kênh `health.redis` (gateway `GET /health/redis` là `@Public()`) trả về giá trị key Redis (TRD2-01).
  - **Docs Kafka vs RabbitMQ**: CLAUDE.md/README/AGENTS.md không còn nhắc Kafka. Đã ổn.
  - **Upload**: gateway giới hạn 10MB/file; third không giới hạn gì; và hợp đồng payload gateway <-> third **lệch nhau** nên upload/download qua RPC lỗi (TRD2-02).
- **Đánh giá chung**: các lỗ hổng ở lớp gateway đã được vá một phần, nhưng third vẫn tin tuyệt đối vào caller; phát sinh thêm lỗi tích hợp (hợp đồng upload, test-scenario thiếu handler) và một đường rò rỉ dữ liệu Redis qua health.

## Thống kê (bug MỚI, TRD2-xx)

| Severity | Số lượng |
| -------- | -------- |
| Critical | 1        |
| High     | 3        |
| Medium   | 3        |
| Low      | 6        |
| **Tổng** | **13**   |

Phần (a): 27/28 mục cũ còn tồn tại (chỉ TRD-10 không còn; TRD-24/28 còn một phần; TRD-09 đã được sửa ở gateway nhưng còn ở third).

## (a) Mục cũ còn tồn tại (đã re-verify file:line hiện tại)

| ID cũ | Trạng thái | File:line hiện tại | Ghi chú |
| ----- | ---------- | ------------------ | ------- |
| TRD-01 | CÒN (giảm nhẹ ở gateway) | `features/redis/redis.controller.ts:17-24` (không role, không prefix), `redis.rpc.controller.ts:14-17`, `redis.service.ts:74` | Third `GET /redis` vẫn đọc key bất kỳ với JWT bất kỳ role. Gateway đã whitelist `cache:/public:/stats:` + ADMIN. Muốn an toàn phải thêm whitelist ở third (gateway guard dùng `redis.get` với `session:` nên third chỉ chặn được ở HTTP, hoặc tách pattern `redis.getPublic`). |
| TRD-02 | CÒN | `features/uploads/upload.controller.ts:38,58,81,109` (`@Public()` x4) | HTTP của third vẫn public. Gateway yêu cầu JWT nhưng mọi role đều `DELETE /upload/:key`, `GET /upload/download?key=` key tuỳ ý (không ownership, không prefix); RPC `upload.delete/download` (`upload.rpc.controller.ts:36,55`) không kiểm tra. |
| TRD-03 | CÒN | `packages/guards/jwt-auth.guard.ts:89`, `features/log/log.gateway.ts:59`, `packages/configs/jwt-sign.config.ts:20`, `packages/strategy/jwt-user.strategy.ts:10` | Secret cứng fallback. |
| TRD-04 | CÒN (gateway đã gửi userId, third bỏ qua) | `notification.rpc.controller.ts:30-42`, `notification.service.ts:45-66`, `notification.repository.ts:80-105` | Xem kịch bản bên dưới. |
| TRD-05 | CÒN | `packages/interceptor/trace-context.interceptor.ts:15-23,143,185` | `SENSITIVE_KEYS` khớp tên key chính xác: `value` (của `redis.set` = refresh token), `resetToken` (`email.sendForgotPasswordMail`) không bị redact, ghi vào `request_logs.requestBody`. |
| TRD-06 | CÒN | `features/uploads/upload.controller.ts:99` (`stream.pipe(res)`) | Không listener `error` trên stream nguồn, không destroy khi client ngắt. |
| TRD-07 | CÒN | `features/redis/redis.service.ts:10,12`; `packages/guards/token-bucket.guard.ts:40` | `enableOfflineQueue:true` + `maxRetriesPerRequest:null`, guard `await eval` không timeout/fail-open. |
| TRD-08 | CÒN | `main.ts:41-48` | Không `noAck:false`, không DLQ; `redis.del` là EventPattern (`redis.rpc.controller.ts:28`) mất message khi crash. |
| TRD-09 | CÒN ở third, ĐÃ SỬA ở gateway | `packages/entities/notification/notification.schema.ts:29` | Gateway dùng `z.enum(['true','false']).transform`. Third HTTP `GET /notifications?isRead=false` vẫn trả đã-đọc. |
| TRD-10 | KHÔNG CÒN | `test-scenario.service.ts` | Không còn `dto.routes` / fixtures trong repo này. |
| TRD-11 | CÒN | toàn bộ `*.rpc.controller.ts` | Không validate payload. |
| TRD-12 | CÒN | `features/email/email.service.ts:45-62` | Không timeout/retry/phân loại lỗi. |
| TRD-13 | CÒN (ở third HTTP) | `features/email/email.controller.ts:9`, `email.service.ts:25` | `GET /emails` public gửi mail thật tới địa chỉ cứng. Gateway đã ADMIN-only. |
| TRD-14 | CÒN | `features/uploads/upload.module.ts:10`, `upload.rpc.controller.ts:58-67` | Không `limits`, RPC không giới hạn size. |
| TRD-15 | CÒN | `features/uploads/upload.service.ts:76` | Mimetype non-image lấy từ client, không whitelist. |
| TRD-16 | CÒN | `upload.service.ts:57`, `upload.rpc.controller.ts:65` | file undefined -> TypeError 500. |
| TRD-17 | CÒN | `upload.service.ts:110` | `Promise.all` + orphan. |
| TRD-18 | CÒN | `upload.rpc.controller.ts:36-52` | Đọc cả object vào RAM; `NoSuchKey` -> 500 (không map 404). |
| TRD-19 | CÒN (một phần) | `packages/interceptor/error.interceptor.ts:50` | Message đã đẹp hơn nhưng PG 23505/23503 vẫn thành 500. |
| TRD-20 | CÒN | `notification.repository.ts:94-100` | `markAllAsRead` trả RowList, chỉ theo `userId`. |
| TRD-21 | CÒN | `scripts/recreate-db.ts:39,51` | DROP không guard. |
| TRD-22 | CÒN một phần | `test-scenario.service.ts:105-115` | Run request thật tới `GATEWAY_BASE_URL`, không guard môi trường (phần fixture cache không còn). |
| TRD-23 | CÒN | `redis.controller.ts:17-24` | Không validate `key` (third HTTP). |
| TRD-24 | CÒN | `token-bucket.guard.ts:64-65` | Key gồm `request.path`; không `trust proxy` trong `main.ts`. |
| TRD-25 | CÒN | `features/log/log.gateway.ts:93` | Broadcast tới mọi socket. |
| TRD-26 | CÒN | `redis.service.ts:88-93`, `redis.rpc.controller.ts:22-26` | `ttlSeconds<=0` lưu vĩnh viễn; không prefix. |
| TRD-27 | CÒN | `notification.repository.ts:48`, `log.repository.ts:50` | `ilike` không escape. |
| TRD-28 | CÒN một phần | `main.ts:94` (tag `Cloudinary`), `upload.service.ts:89` (URL `undefined/...`), `upload.provider.ts:15-17` (throw lúc boot, nhánh `!this.s3` là dead code) | Dockerfile/PORT đã thống nhất 4003 nhưng default code vẫn 8888. |

## (b) Bug mới

| ID | Severity | File:line | Mô tả | Kịch bản lỗi | Đề xuất sửa |
| -- | -------- | --------- | ----- | ------------ | ----------- |
| TRD2-01 | Critical | `src/app.controller.ts:43-44,65,71` (gọi từ `gateway/src/app.controller.ts:~216,245`) | `health.redis` với `fetchData:true` chạy `KEYS *`, lấy 10 key đầu và **trả luôn giá trị**. Gateway `GET /health/redis` là `@Public()` và luôn gửi `fetchData:true`. | Người dùng chưa đăng nhập gọi `GET /health/redis` nhận `cacheStats.sampleKeys` chứa `session:<userId>` (= refresh token raw) và `reset-password:<jti>`; gateway còn log nguyên response. Chiếm tài khoản. `KEYS *` còn chặn Redis khi DB lớn. | Bỏ trả value; chỉ trả ping/dbsize. Nếu cần sample, chỉ tên key đã mask, dùng `SCAN`, và ở gateway bỏ `@Public()` / ép ADMIN, bỏ `fetchData:true`. |
| TRD2-02 | High | `features/uploads/upload.rpc.controller.ts:65` và `:44-47`; gateway `upload.controller.ts` (`buffer: file.buffer.toString('base64')`, `result.buffer`) | Hợp đồng RPC lệch: gateway gửi `file.buffer` là chuỗi base64, third đòi `file.buffer.data` (mảng số) nên `Buffer.from(undefined)` ném TypeError. Download: third trả `{content: Buffer,...}` (JSON `{type:'Buffer',data:[..]}`) nhưng gateway đọc `result.buffer` (base64) nên `Buffer.from(undefined,'base64')` ném lỗi. | Mọi `POST /upload`, `POST /upload/multiple`, `GET /upload/download` qua gateway trả 500. | Thống nhất một định dạng (khuyến nghị base64 hai chiều): third `Buffer.from(file.buffer,'base64')` và trả `{buffer: content.toString('base64'), contentType, filename}`; thêm test contract. |
| TRD2-03 | High | Gateway `test-scenario.controller.ts:96,114,126,134,150,163,172,189,259` vs `features/test-scenario/test-scenario.rpc.controller.ts:18-53` | Third chỉ có handler `create/list/update/delete/stats/run`. Gateway gửi thêm `testscenario.generate/createMany/authprofiles/runs/fixtures.list|create|update|delete|resolve` nhưng không có `@MessagePattern` nào. | Các endpoint này trả lỗi "no matching message handler" (hoặc timeout 120s với `generate`, `rmq.constants.ts:67`). Tính năng gen/bulk/fixtures/runs history hỏng hoàn toàn. | Cài các handler còn thiếu ở third hoặc xoá route ở gateway; thêm test đối chiếu danh sách pattern giữa 2 repo. |
| TRD2-04 | High | `packages/interceptor/trace-context.interceptor.ts:25-35,143,152,185` | `redact()` đệ quy bằng `Object.entries` trên mọi object. Với `Buffer` (trả về của `upload.download`, `rpc.controller.ts:44`) `Object.entries(buffer)` sinh một cặp cho mỗi byte; với payload `buffer.data` là `number[]` thì map từng phần tử. Chạy đồng bộ trên mọi RPC (kể cả `previewPayload` ngay trước handler, dòng 143). | Download file 10MB: tạo ~10 triệu mảng `[k,v]` (hàng trăm MB tới GB) trên event loop, treo/OOM toàn service, cả consumer RMQ. | Chặn sớm: bỏ qua log body cho `upload.*` và khi `Buffer.isBuffer`/`ArrayBuffer.isView`; hoặc `JSON.stringify` với giới hạn kích thước trước khi redact; cắt chuỗi/ số phần tử ở mỗi cấp. |
| TRD2-05 | Medium | `src/database/database.module.ts:60` | `logger.log('this connection:', databaseUrl)` in nguyên `DATABASE_URL` (chứa user:password). Mỗi lần retry kết nối lại in một lần. | Credentials Postgres nằm trong log container / hệ thống log tập trung. | Xoá dòng; nếu cần thì log host/db đã mask. |
| TRD2-06 | Medium | `packages/filters/rpc-exception.filter.ts:49-58` | Lỗi non-HttpException (kể cả lỗi Drizzle `Failed query: ... params: ...`) được trả nguyên `exception.message` cho caller với 500. Không có mapping mã PG (23503/23505) như `ErrorInterceptor` của HTTP, và filter HTTP/interceptor không áp dụng cho RMQ. | `notification.create` với `userId`/`classId` không tồn tại: FK violation, gateway trả 500 kèm câu SQL + giá trị tham số (nội dung thông báo, uuid) tới client. | Trong filter map `code` PG sang 400/404/409 và thay message `Failed query:` bằng chuỗi chung; log chi tiết phía server. (Cần xác minh gateway có che message 500 không.) |
| TRD2-07 | Medium | `features/email/email.service.ts:38` | `displayName` chèn thẳng vào HTML email reset mật khẩu, không escape (`resetToken` cũng không `encodeURIComponent`, dòng 33). | User đặt tên hiển thị `<a href="https://evil">Bấm xác nhận</a>`: mail "Reset your password" từ domain thật chứa link độc (phishing). | Escape HTML cho `displayName`, `encodeURIComponent` cho token, validate `to` là email. |
| TRD2-08 | Low | `features/uploads/upload.service.ts:57-58,76,83` | Phần mở rộng lấy từ `originalname.split('.').pop()` không làm sạch (có thể chứa `/`, khoảng trắng, hoặc cả tên nếu không có dấu chấm). Ảnh luôn bị convert JPEG nhưng key giữ đuôi gốc (`.png`, `.gif`) và response trả `mimetype` gốc, PNG trong suốt thành nền đen, GIF động thành ảnh tĩnh. | Key lạ như `uploads/<uuid>./a/b`; URL đuôi `.png` nhưng nội dung JPEG; sai metadata cho client. | Whitelist đuôi theo mimetype, ép `.jpg` khi convert, trả `mimetype:'image/jpeg'`. |
| TRD2-09 | Low | `features/uploads/upload.controller.ts:94-99` | `Content-Disposition` dựng từ `key` thô (`filename="${filename}"`, không escape `"`, không RFC 5987); `res.setHeader` ném `ERR_INVALID_CHAR` với ký tự non-latin1/CRLF **sau khi** S3 stream đã mở, bị `catch` re-throw, stream không bị `destroy`. | `GET /upload/download?key=uploads/ảnh.jpg` trả 500 và rò socket S3 mỗi lần; `"` trong key phá header. | Sanitize như gateway (`replace(/[^A-Za-z0-9._-]/g,'_')`), `stream.destroy()` trong nhánh lỗi. |
| TRD2-10 | Low | `features/notification/notification.repository.ts:85-100` | `markAsRead`/`markAllAsRead` chỉ set `isRead:true`, không set cột `readAt` (`schema.ts` có `read_at`). Không có chỗ nào khác ghi `readAt`. | `readAt` luôn null; báo cáo/ sắp xếp theo thời điểm đọc sai. `markAllAsRead` còn ghi đè cả bản đã đọc. | `set({isRead:true, readAt: new Date()})`, thêm `and(eq(isRead,false))`. |
| TRD2-11 | Low | `main.ts:22` | `enableCors({origin:true, credentials:true})` phản chiếu mọi Origin kèm credentials trên cổng HTTP của third. | Trang web bất kỳ gọi API third bằng cookie/credentials nếu cổng bị expose. | Cấu hình danh sách origin hoặc tắt CORS (service nội bộ). |
| TRD2-12 | Low | dead code: `packages/strategy/{google,facebook,jwt-user}.strategy.ts`, `packages/configs/jwt-sign.config.ts`, `packages/helpers/{jwt,hashingData,queryList}.helper.ts` (`signAccessToken`, `hashData`...), `packages/entities/{wallet,session,curriculum,user,auth,admin,class,...}`, `src/data/swaggers/**` | Không file nào import (grep toàn `src`/`test`). Kèm thêm secret cứng thứ hai `'dev-insecure-secret'` (`jwt-user.strategy.ts:10`) và phụ thuộc thừa (`@nestjs/passport`, `bcrypt`, `@anthropic-ai/claude-agent-sdk`). | Tăng bề mặt tấn công/ bảo trì, build chậm. | Xoá hoặc đưa vào lib chung; gỡ dependency thừa. |
| TRD2-13 | Low | `src/**/*.spec.ts`, `test/`, `coverage-report.txt` | Chỉ có spec cho `log.repository`, `test-scenario.{service,repository}`, `app.service` và 1 e2e test-scenario. Không test cho notification (ownership), redis, email, upload, `TokenBucketGuard`, `RpcExceptionFilter`, các `*.rpc.controller`. `coverage-report.txt` là output `bun test` của dự án khác (các test `AuthController`, `CategoryController`). | Các lỗi TRD-04, TRD2-02, TRD2-03 không bị CI bắt. | Thêm test hợp đồng RPC và ownership; xoá report cũ. |

### Chi tiết (Critical / High)

#### TRD2-01 (Critical) - `health.redis` rò rỉ giá trị Redis

```ts
// src/app.controller.ts:43-44, 65, 71
const allKeys = await this.redisService.client.keys('*');
sampleKeys = allKeys.slice(0, 10);
...
const value = await this.redisService.client.get(key);
stats['sampleKeys'] = keyValues;
```

Gateway: `@Public() @Get('health/redis')` gọi `rmqProducer.send('health.redis', { fetchData: true })`, rồi trả `cacheStats: response` và còn log `JSON.stringify(response)`. USER lưu `session:{userId}` = refreshToken raw và `reset-password:{jti}` trong chính Redis này (`USER/src/features/auth/auth.service.ts:35-36`), nên 10 key đầu có thể là token đăng nhập/đặt lại mật khẩu của người dùng thật. Whitelist prefix ở `/redis` của gateway bị vòng qua hoàn toàn.

#### TRD2-02 (High) - Hợp đồng upload/download gateway <-> third lệch

Third (`upload.rpc.controller.ts:65`): `Buffer.from(file.buffer.data)`. Gateway gửi `buffer: file.buffer.toString('base64')` (chuỗi) nên `file.buffer.data` là `undefined`. Chiều download: third trả `content` (Buffer), gateway đọc `result.buffer`. Cả hai chiều đều ném TypeError, trả 500. Gateway không có chỗ nào biến đổi payload (`rmq.producer.ts` không đụng tới Buffer/base64).

#### TRD2-03 (High) - Gateway gọi pattern không có handler

Gateway gửi 9 pattern `testscenario.*` mà `test-scenario.rpc.controller.ts` không khai báo. Chỉ các pattern `create/list/update/delete/stats/run` có handler.

#### TRD2-04 (High) - `redact()` trên Buffer / mảng số lớn

`redact` chỉ kiểm `Array.isArray` rồi `typeof === 'object'` -> `Object.entries`. `Buffer` là TypedArray nên entries liệt kê từng byte. `responseData` của `upload.download` chứa `content: Buffer` và được truyền vào `previewResponse` ở dòng 185 (chạy trong `complete`, đồng bộ) trước khi cắt 1000 ký tự.

#### Notification IDOR (TRD-04, còn nguyên)

```ts
// notification.rpc.controller.ts:30-42
@MessagePattern('notification.getById')  getById(@Payload() payload: { id: string }) ...
@MessagePattern('notification.markAsRead') markAsRead(@Payload() payload: { id: string }) ...
@MessagePattern('notification.delete') del(@Payload() payload: { id: string }) ...
```

Kịch bản: user A gọi `DELETE /notifications/<uuid của B>`. Gateway gửi `{id, userId:A}`, third bỏ `userId`, `repo.delete(id)` xoá thông báo của B; `GET /notifications/:id` đọc nội dung của B. Sửa: nhận `userId` trong payload, thêm `and(eq(id), or(eq(userId), eq(senderId)))` vào repo cho cả 3 thao tác, trả 404 nếu không khớp. Tương tự, `GET /notifications/abc` (id không phải uuid) vẫn ra 500 do thiếu `checkUuidValid` (TRD-27).

## Cần xác minh

1. **`upload.delete` trả `void`**: `UploadService.delete` trả `undefined` (`upload.service.ts:101-104`); trong `redis.rpc.controller.ts:19-21` chính tác giả ghi rằng reply `undefined` làm `RmqProducer.send()` coi là thất bại (`firstValueFrom` không có `defaultValue`, `rmq.producer.ts:139`). Nếu đúng thì `DELETE /upload/:key` qua gateway luôn lỗi dù xoá thành công. Cần chạy thử.
2. **Namespace `cache:` / `public:` / `stats:`** mà gateway cho phép đọc (`gateway/.../redis.schema.ts:4`) không thấy service nào ghi (grep USER, tutor-service, gateway, THIRD). Nếu không có producer thì `GET /redis` của admin vô dụng; nếu sau này có, cần đảm bảo không lẫn dữ liệu nhạy cảm.
3. **TRD2-06**: chưa xác minh gateway có che message 500 từ RPC (`RmqProducer.toRpcErrorPayload`) trước khi trả client hay không.
4. **TRD-09 phía gateway**: đã xác nhận gateway dùng `z.enum(['true','false'])`; phần third chỉ còn ảnh hưởng nếu cổng HTTP third bị expose.
5. **Exposure cổng HTTP của third** (Dockerfile `EXPOSE 4003`): mức độ thật của TRD-01/02/13 phụ thuộc việc cổng này có public không (Railway networking). Global guard `APP_GUARD` không áp dụng cho handler RMQ (microservice dùng `ApplicationConfig` riêng, xem comment `main.ts:30-36`), nên RPC hoàn toàn không có xác thực, chỉ tin RabbitMQ.
6. **Rò rỉ SQL trong log RPC**: `TraceContextInterceptor` ghi `errorMessage` + `responseBody` (kể cả câu `Failed query`) vào `request_logs`, admin đọc được qua `/logs`; chưa kiểm tra có chứa tham số nhạy cảm.
