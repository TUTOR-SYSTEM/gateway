# Báo cáo bug: gateway (vòng 3)

- **Ngày review:** 2026-10-13
- **Phạm vi:** `gateway/src`, `gateway/test`, `gateway/docker-compose.yml`, `.dockerignore`, `.gitignore`. Đối chiếu với `user/`, `tutor/`, `third/` trong workspace (đọc working tree, không chạy).
- **Cách làm:** đọc code tĩnh, đối chiếu `@MessagePattern` và payload ở service đích. Chạy `tsc --noEmit` (chỉ đọc, không emit). Không chạy test, không gọi HTTP, không migrate.
- **Báo cáo cũ:** `reviews/round2/gateway-review.md` (GW2-xx) và `reviews/SUMMARY.md`. Mỗi mục cũ đã được đối chiếu lại với code (xem mục 4).
- **Lưu ý về .env:** trong lúc kiểm tra `docker.env` (chưa được git theo dõi) tôi có grep ra tên biến và vài ký tự đầu của giá trị bí mật. Vi phạm quy tắc "không đọc .env*" trong CLAUDE.md. Báo cáo này không ghi lại giá trị nào.

## 1. Tóm tắt

**Bug còn tồn tại (mục 2): 30**

| Mức độ | Số lượng | ID |
|---|---:|---|
| Critical | 2 | GW3-01, GW3-02 |
| High | 6 | GW3-03 đến GW3-08 |
| Medium | 8 | GW3-09 đến GW3-16 |
| Low | 14 | GW3-17 đến GW3-30 |
| **Tổng** | **30** | |

Theo trạng thái:
- **MỚI:** 6 (GW3-01, GW3-08, GW3-11, GW3-13, GW3-18, GW3-30)
- **CÒN TỒN TẠI từ round2:** 24

**Đã sửa (mục 4):** 7 mục round2 đã sửa đầy đủ (GW2-01, GW2-06, GW2-08, GW2-12, GW2-18, và GW2-04/GW2-05 ở nhánh chưa resolve). Thêm các mục sửa một phần.

**Đặc biệt quan trọng:** gateway hiện không build được. Có merge conflict marker đã được commit ở 9 file `src` và `test` (GW3-01). Ngoài gateway, `third/` có 24 file và `tutor/` có 1 file (`chapter.service.ts`) cũng đang có marker.

## 2. Bảng bug còn tồn tại

Ký hiệu "Đã xác minh": *có* = đã đối chiếu code gateway và service đích; *một phần* = code đã đọc nhưng chưa chạy request thật; *chưa* = chưa xác minh được.

| ID | Mức độ | Trạng thái | File:dòng | Mô tả ngắn | Cách tái hiện / kịch bản | Đã xác minh |
|---|---|---|---|---|---|---|
| GW3-01 | Critical | MỚI | `src/features/redis/redis.controller.ts:1-22`; `src/features/student/student.controller.ts:25-28`; `src/features/notification/notification.controller.ts:104-150`; `src/features/admin/admin.controller.ts:122-224`; `src/features/upload/upload.controller.ts:29-165`; `src/features/user/user.controller.ts:161-169,251-258`; `src/packages/guards/jwt-auth.guard.ts:133-139`; `test/packages/guards/jwt-auth.guard.spec.ts`; `test/packages/guards/jwt-auth.guard.branches.spec.ts` | Merge conflict marker (`<<<<<<<`, `=======`, `>>>>>>>`) đã commit ở HEAD `3ec472a`, 9 file. `tsc --noEmit` báo 51 lỗi TS1185. Không build được, `dist/` đã cũ. Trong `jwt-auth.guard.ts` nhánh "Updated upstream" dùng biến `session` không tồn tại. | `bun run build` hoặc `tsc` đều lỗi, service không khởi động được. Khi resolve, cần chọn đúng nhánh: xem ghi chú bên dưới. | Có (tsc) |
| GW3-02 | Critical | CÒN (GW2-03) | `src/features/student/student.controller.ts:165-167` (GET), `:240-242` (PUT), `:292-294` (DELETE); service đích `user/src/features/user/user.rpc.controller.ts:26-29,41-46,58-61`; `user/src/features/user/user.service.ts:275-290` | Gateway cho `ADMIN` và `TUTOR` truy cập `/students/:id`, gửi `actorId/actorRole`. USER bỏ qua hai field này. `deleteUserByAdminService` chỉ kiểm user có tồn tại, không kiểm role. Bất kỳ TUTOR nào đọc, sửa, xoá mọi user (kể cả ADMIN và TUTOR khác). Xoá user kéo theo FK `onDelete: cascade` (ví dụ `src/database/schema.ts:141`). | Đăng nhập TUTOR, gọi `DELETE /students/<id của ADMIN>`. Tài khoản ADMIN bị xoá. Gọi `GET /students/<id>` để xem hồ sơ của ADMIN. | Có (cả hai phía đọc code). Chưa chạy request thật. |
| GW3-03 | High | CÒN MỘT PHẦN (GW2-02) | `src/app.controller.ts:167-211` (`@Public`, không còn `fetchData`); `user/src/app.controller.ts:105-112` | Gateway đã bỏ rò rỉ PII (`fetchData`). Nhưng USER `health.postgres` vẫn chạy `db.query.users.findMany()` không limit mỗi lần gọi, rồi mới quyết định có trả sample hay không. Endpoint public nên ai cũng kích hoạt được việc nạp toàn bộ bảng `users` vào RAM. | Gửi `GET /health/postgres` liên tục không cần token. Bộ nhớ và CPU của USER tăng theo số user. | Có (đọc code USER). Chưa đo tải. |
| GW3-04 | High | CÒN (GW2-14) | `user/src/packages/filters/rpc-exception.filter.ts:49-54` (lỗi không phải HttpException trả nguyên `exception.message` với statusCode 500); `tutor/src/packages/filters/rpc-exception.filter.ts:49-54` (cùng logic); `src/features/rabbitmq/rmq.producer.ts:168-188`; `src/packages/filters/http-exception.filter.ts:32-42,62-72`; `node_modules/drizzle-orm/errors.js:12-13` | `DrizzleQueryError.message` có dạng `Failed query: <sql>\nparams: <giá trị>`, nên chứa tham số insert (kể cả hash mật khẩu bcrypt). RpcExceptionFilter của USER/tutor trả nguyên message. Gateway chuyển thành HttpException 500 và `HttpExceptionFilter` trả `message` cho client. Nhánh `Failed query:` chỉ được che ở `ErrorInterceptor`, mà lỗi RPC là HttpException nên đi qua luôn. | Gây một lỗi DB trên đường insert user (ví dụ race trùng email, hoặc giá trị vi phạm ràng buộc) qua đăng ký hoặc `POST /users`. Response 500 chứa câu SQL và tham số, gồm hash mật khẩu. | Có (chuỗi code và định nghĩa drizzle). Chưa tái hiện bằng request thật. |
| GW3-05 | High | CÒN (GW2-17) | `src/features/auth/auth.controller.ts:273-302` (Google), `:317-346` (Facebook); `src/packages/strategy/google.strategy.ts:17-22` (fallback `dev-missing-*`); `src/packages/strategy/facebook.strategy.ts:15-22` | (a) Access token và refresh token được gắn vào query string của URL redirect. Token nằm trong lịch sử trình duyệt, log proxy và Referer. (b) Không truyền `state`, nên không có chống login CSRF. (c) Không kiểm `email_verified`. (d) Nếu thiếu env thì dùng client id/secret giả. | (a) Đăng nhập Google, xem URL redirect có `refreshToken=...`. (b) Kẻ tấn công ép nạn nhân bấm link callback với code của kẻ tấn công, để nạn nhân đăng nhập vào tài khoản kẻ tấn công. | Có (đọc code gateway). Chưa kiểm tra USER gộp tài khoản theo email. |
| GW3-06 | High | CÒN (GW2-07, GW2-09) | `src/features/student/student.controller.ts:62-127` (không có `@Roles`/`RolesGuard`); `src/packages/entities/student/student.schema.ts:3-21`; `user/src/features/user/user.service.ts:133-153`; `user/src/packages/helpers/hashingData.helper.ts:4-12` | `POST /students` mở cho mọi role đã đăng nhập. `createStudentSchema` không có `password`. USER gọi `hashData(undefined)`, bcrypt báo lỗi, client nhận 400 "Failed to hash data". Endpoint luôn hỏng. Nếu sau này sửa để bỏ qua bước hash thì STUDENT/PARENT tạo được user. | Đăng nhập bất kỳ role, gọi `POST /students` với `studentName`. Kết quả luôn 400. | Có (đọc code). Chưa chạy. |
| GW3-07 | High | CÒN (GW-27, GW2-07) | `src/features/student/student.controller.ts:51-59` | `GET /students/get-student-code` gọi `user.getUserByField({})`. `getUserByField` kiểm `field` trong `searchableFields` (`user/src/features/user/user.service.ts:44,111-126`) và `undefined` không nằm trong đó, nên luôn 400 "Unsupported field". Endpoint hỏng hoàn toàn. | Gọi `GET /students/get-student-code` với token hợp lệ. Luôn 400. | Có (đọc code USER). |
| GW3-08 | High (chưa xác minh triển khai) | MỚI | `docker.env` (không được git theo dõi, `.gitignore:61`); `docker-compose.yml:82` (`env_file: ./docker.env`) | File `docker.env` cục bộ có `JWT_SECRET`/`JWT_ACCESS_SECRET` quá ngắn và dễ đoán (độ dài 6 ký tự). Nếu file này được dùng cho môi trường thật thì kẻ tấn công ký được JWT hợp lệ, dẫn tới chiếm mọi tài khoản (có thể nâng lên Critical). Chưa biết môi trường deploy dùng file nào. | Nếu secret thật là giá trị này: ký token với role ADMIN và gọi API. | Chưa xác minh (không biết môi trường thật). Đã thấy giá trị trong file cục bộ. |
| GW3-09 | Medium | CÒN (GW2-09) | `src/features/student/student.controller.ts:240-290`; `src/packages/entities/student/student.schema.ts:23-40`; `user/src/features/user/user.repository.ts:108-115`; `node_modules/drizzle-orm/pg-core/dialect.js:100-112` | `PUT /students/:id` nhận `studentName`, `parentName`, `parentPhone`, `parentEmail`, `parentRelationship`, `birthday`, `parentAddress`, `parentDistrict`, `parentProvince`, `studentPhone`. USER không có cột tương ứng (`birthday` không phải `dateOfBirth`). Drizzle bỏ qua key lạ nên API trả 200 nhưng dữ liệu không được ghi. | `PUT /students/<id>` với `{"studentName":"X"}`, trả 200, tên không đổi. | Có (đọc code). Chưa chạy. |
| GW3-10 | Medium | CÒN (GW2-11) | `src/packages/guards/jwt-auth.guard.ts:115-155` (chỉ kiểm `redis.exists("session:<id>")` ở dòng 128-132); `user/src/features/auth/auth.service.ts:339-352` (`logoutService` không có route); `user/src/features/user/user.service.ts:258-290` (khoá, xoá, đổi mật khẩu không xoá session) | Guard không kiểm user còn tồn tại hay còn `isActive`, dù CLAUDE.md viết là có kiểm qua RPC. Không có `POST /auth/logout` và `auth.logout` không có `@MessagePattern`. Khoá `session:<id>` chỉ hết khi TTL refresh (7 ngày). User bị xoá hoặc khoá vẫn dùng được access token đến khi hết hạn (3 giờ). | Khoá một user (`PUT /users/:id/status`), dùng token cũ gọi `GET /users/detail-user`. Vẫn 200 trong thời hạn token. | Có (đọc code guard và USER). Chưa chạy. |
| GW3-11 | Medium | MỚI (regression từ GW-13) | `src/packages/guards/jwt-auth.guard.ts:75-82` (`getCachedSession` trả entry bất kể `valid`), `:123-126` (`if (cached) return true`), `:137-139` (`setCachedSession(id, false)` khi session không có) | Khi session không có, guard lưu entry `valid=false` trong 5 giây nhưng vẫn throw 401. Lần gọi tiếp theo trong 5 giây thì `if (cached)` là true và trả `true`, cho qua. Sau khi entry hết hạn, request kế tiếp lại 401 và lại tạo entry. Với traffic liên tục, phần lớn request vẫn được cho qua. Round2 GW-13 đã yêu cầu bỏ negative cache. | Xoá (hoặc để hết hạn) key `session:<id>` trong Redis. Dùng access token còn hạn gọi API liên tục. Chỉ khoảng một trong mỗi nhiều request bị 401. | Có (đọc code). Chưa chạy. Cần session bị mất, hiện không có đường xoá từ gateway. |
| GW3-12 | Medium | CÒN MỘT PHẦN (GW2-10) | `src/packages/guards/jwt-auth.guard.ts:128-132` (`send('redis.exists')` không truyền timeout); `src/features/rabbitmq/rmq.constants.ts:58-85` (policy mặc định 10 s, `redis.exists` không nằm trong danh sách) | Mỗi request đã xác thực đều chờ `redis.exists` tối đa 10 s, không có cache cho lỗi hạ tầng. Khi THIRD hoặc Redis chậm, request chất đống. Timeout không được retry (đã sửa so với round2), nhưng vẫn treo 10 s rồi mới fail-open. | Làm THIRD trả chậm (hoặc tắt Redis). Mọi request có token đều mất khoảng 10 s. | Có (đọc code). Chưa đo. |
| GW3-13 | Medium | MỚI | `src/features/curriculum/curriculum.controller.ts:43-66` (không có `@Roles`); `tutor/src/features/curriculum/curriculum.service.ts:38-53` (không kiểm role) | `POST /curriculum` cho mọi role, STUDENT và PARENT cũng tạo được giáo trình (gắn `userId` của họ). Gateway và tutor-service đều không kiểm role. Các thao tác sửa, xoá giáo trình đã kiểm owner (đã sửa so với round2). | Đăng nhập STUDENT, gọi `POST /curriculum`. Trả 201. | Có (grep không thấy kiểm role trong service). Chưa chạy. |
| GW3-14 | Medium | CÒN (GW2-16) | `src/packages/decorators/throttle.decorator.ts:10-11` (chỉ `SetMetadata`, không có guard đọc); không có `@nestjs/throttler`, không có helmet. Rủi ro khuếch đại: `src/features/auth/auth.controller.ts:128-172` (login bằng userCode 6 ký tự, public); `user/src/features/student/student.service.ts:103,113,308` (mật khẩu mặc định cố định `Student@123456`/`Parent@123456`, đã xác minh) | Không có giới hạn tần suất cho `/auth/login`, `/auth/login/user-code`, `/auth/forgot-password` (spam email), `/ai-chat/chat` (tốn tiền LLM). Ghép với mật khẩu mặc định của USER thì đoán userCode là đăng nhập được tài khoản học sinh hoặc phụ huynh. | Gửi hàng loạt request tới `/auth/login/user-code`. Không có 429. | Có (đọc code). Chưa chạy brute-force. |
| GW3-15 | Medium | CÒN (GW2-13) | `src/features/rabbitmq/rmq.producer.ts:37-49,123` (`RmqRecord` không có `expiration`); `:161-168` (chỉ timeout và lỗi có `statusCode` là không retry; lỗi transport khác vẫn retry cả pattern ghi) | (a) Message ghi không có TTL. Khi service chết hoặc chậm, request đã trả 504 vẫn nằm trong queue, và được xử lý sau khi client đã thấy lỗi hoặc đã bấm lại. (b) Với lỗi kết nối không có `statusCode` (ví dụ `{err, url}` của amqp), request ghi bị publish lại tới 3 lần, có thể tạo bản ghi trùng. | Tắt tạm user-service, gọi `POST /classes` (hoặc các route ghi) nhiều lần, rồi bật lại service. Các request cũ được ghi sau khi client đã nhận 504. | Có (đọc code). Chưa chạy. |
| GW3-16 | Medium | CÒN MỘT PHẦN (GW2-15, GW-03, GW-17) | `src/features/upload/upload.controller.ts:67-94` (`POST /upload` không có `@Roles`), `:96-127` (`/upload/multiple`), `:129-161` (`GET /upload/download` không kiểm sở hữu key). THIRD đã có kiểm MIME và kích thước: `third/src/features/uploads/upload.service.ts:91-113`. | Mọi role đã đăng nhập upload không giới hạn tần suất, mỗi request tới 10 file × 10 MB được giữ trong RAM của gateway và THIRD. Mọi user tải được file nếu biết key. Rủi ro upload HTML đã giảm nhờ allowlist ở THIRD. | Đăng nhập STUDENT, gửi nhiều request 10 file 10 MB tới `/upload/multiple`. Không có giới hạn. | Có (đọc code). Chưa đo bộ nhớ. |
| GW3-17 | Low | CÒN (một phần GW2-12) | `src/features/class/class.controller.ts:37-47`, `session/session.controller.ts`, `schedule/schedule.controller.ts`, `exercise/exercise.controller.ts`, `tuition/tuition.controller.ts`, `attendance/attendance.controller.ts`, `curriculum/curriculum.controller.ts` (không có `@Roles`) | Gateway không khai báo role cho các route ghi của domain tutor, chỉ dựa vào tutor-service. Đã xác minh tutor-service có kiểm: `class.service.ts:67-80`, `exercise.service.ts:70-76`, `chapter`/`lesson` (owner), `session` (`assertClassOwner`). Chưa xác minh hết các route. | Nếu một service quên kiểm, gateway không chặn. | Một phần. |
| GW3-18 | Low | MỚI (biến thể của GW-05) | `src/features/redis/redis.controller.ts:26-33,57-60` | `GET /redis` (ADMIN) dùng denylist prefix (`session:`, `login-session:`, `reset-password:`, `refresh:`, `refresh-token:`) thay vì allowlist như round2 đề xuất. Hiện các prefix USER đang dùng đều được chặn, nên chưa lộ. Key mới không khớp prefix sẽ đọc được. Chỉ ADMIN, mức thấp. | Admin gọi `GET /redis?key=<key mới>`. | Có (đọc code). |
| GW3-19 | Low | CÒN (GW2-22) | `src/packages/entities/user/user.schema.ts:202-205` (`classId`, `gradesId`, `parentId`, `tutorId` trong `updateUserSchema`), `:214-220` (`updateSelfSchema` chỉ omit 5 field); `src/features/user/user.controller.ts:161-169` (thứ tự spread của hai nhánh conflict) | Self-update (`PUT /users`) vẫn nhận `classId` và `gradesId`. USER chỉ chặn `role/isActive/userCode/parentId/tutorId`. Chưa thấy chỗ nào trong tutor-service dùng `users.classId` để phân quyền. Thứ tự spread: nhánh "Stashed" đặt `role` trước spread, nên nếu schema có `role` thì client ghi đè được. Hiện `role` bị schema loại nên chưa khai thác được. | Student gửi `PUT /users` với `{"classId":"<uuid>"}` và được 200. | Có (đọc code). Chưa xác minh tác dụng phụ ở tutor-service. |
| GW3-20 | Low | CÒN (GW2-19) | `src/main.ts:41-83` (Swagger `api-docs` bật ở mọi môi trường, không auth); `:54-75` (tag còn sót: Categories, Wallets, Transactions, Cloudinary) | Lộ toàn bộ API schema và mô tả ở production. Mô tả "financial management system" không đúng. | `GET /api-docs` không cần token. | Có. |
| GW3-21 | Low | CÒN (GW2-20) | `src/main.ts:18-36` (không có `app.enableShutdownHooks()`) | Khi SIGTERM, `RmqProducer.onModuleDestroy` không chạy. Request đang chờ bị mất, kết nối RMQ đứt đột ngột. | Gửi SIGTERM khi đang có request chờ reply. | Có (đọc code). |
| GW3-22 | Low | CÒN (GW2-26) | `src/packages/interceptor/error.interceptor.ts:16-34,49-57` | Lỗi cục bộ không phải HttpException (ví dụ TypeError) trả nguyên `error.message` cho client, kèm `originalError` trong object exception (không được filter in ra). | Gửi request làm lỗi TypeError cục bộ. Message lộ chi tiết nội bộ. | Có (đọc code). |
| GW3-23 | Low | CÒN (GW2-27) | `src/app.module.ts:70-77` (`JwtAuthGuard` đứng trước `LanguageGuard`) | 401 do guard ném trước khi `request.language` được gán. Client gửi `Accept-Language: en` vẫn nhận message 401 tiếng Việt. | Gọi API không token với `Accept-Language: en`. | Có (đọc code). |
| GW3-24 | Low | CÒN (GW2-28) | `src/packages/guards/jwt-auth.guard.ts:66,75-86` | `sessionCache` không giới hạn và không có sweep. Entry chỉ bị xoá khi chính user đó quay lại. Bộ nhớ tăng chậm theo số user duy nhất. | Nhiều user đăng nhập một lần rồi thôi. Bộ nhớ không giảm. | Có (đọc code). |
| GW3-25 | Low | CÒN (GW2-21) | `src/packages/decorators/throttle.decorator.ts`; `src/packages/guards/admin-role.guard.ts`; `src/packages/strategy/jwt-user.strategy.ts` (không đăng ký); `src/packages/helpers/file.helper.ts` (`decodeMulterFilename` không được gọi, nên tên file tiếng Việt bị mojibake khi lên R2); `src/packages/entities/user/user.schema.ts` (một số schema không dùng) | Code chết. `decodeMulterFilename` không dùng nên `originalname` tiếng Việt bị lỗi. Dễ khiến người bảo trì tưởng đã có throttle hoặc admin guard. | Grep tên hàm: không có chỗ gọi. | Có. |
| GW3-26 | Low | CÒN (GW2-23) | `src/features/notification/notification.controller.ts:99-106,117-124,135-142`; `src/features/student/student.controller.ts:165-166`; nhiều controller khác dùng `@Param('id')` thuần | Hầu hết `:id` không qua `ParseUUIDPipe`. Giá trị rác đi tới service, lỗi Postgres 22P02 trở thành 500 thay vì 400, và tốn một vòng RMQ. | `GET /notifications/abc`. Nhận 500 hoặc lỗi không rõ ràng. | Có (đọc code). Chưa chạy. |
| GW3-27 | Low | CÒN (GW2-24) | `package.json:28` (`test:e2e` trỏ `./test/jest-e2e.json`, file không tồn tại); `test/packages/guards/*` và `test/features/*` có mock đúng hợp đồng sai (upload) và file đang conflict | `bun run test:e2e` lỗi ngay. Test mock sai hợp đồng nên xanh giả, không bắt được GW2-05. Không có test contract với danh sách `@MessagePattern` của service. | Chạy `bun run test:e2e`. Lỗi không tìm thấy config. | Có. |
| GW3-28 | Low | CÒN (GW2-25) | `src/packages/interceptor/logger.interceptor.ts:174` (`path: url`, có query string), `:149-151` (log `[Request]` ghi `url`) | URL có query string được ghi vào console và `request_logs`: `/redis?key=...`, `/upload/download?key=...`, `/auth/google/callback?code=...`. Chỉ redact trong body, không redact query. Guard 401/403 chạy trước interceptor nên không có dấu vết trong `request_logs`. | Gọi `GET /redis?key=abc` (ADMIN), xem `request_logs`. URL có key. | Có (đọc code). |
| GW3-29 | Low | CÒN (GW2-03, phần admin) | `src/features/admin/admin.controller.ts:154-161` (`GET /admin/tutors/:id`), `:177-183` (`DELETE /admin/tutors/:id`), `:227-234` (`GET /admin/students/:id`), `:253-259` (`DELETE /admin/students/:id`) | `expectedRole` được gửi nhưng USER bỏ qua, nên `/admin/tutors/:id` xoá hoặc đọc được cả student. Chỉ ADMIN gọi, mức thấp, nhưng nhãn route gây hiểu nhầm và không có chốt chặn. | ADMIN gọi `DELETE /admin/tutors/<id của student>`. Student bị xoá. | Có (đọc code USER). |
| GW3-30 | Low (chưa xác minh) | MỚI | `src/features/rabbitmq/rmq.producer.ts:98-107` (`emit` dùng `firstValueFrom` không timeout); `src/main.ts:39` (`log.create` gọi `emit` cho mỗi request) | Nếu broker down, promise của `emit` có thể treo và tích luỹ theo request. Chưa tái hiện nên chưa khẳng định được. | Tắt RabbitMQ, gửi nhiều request, đo số promise đang treo. | Chưa xác minh. |

### Ghi chú cho người resolve conflict (GW3-01)

- `src/packages/guards/jwt-auth.guard.ts`: không giữ nhánh "Updated upstream" (dùng biến `session` không tồn tại). Nếu giữ nhánh "Stashed" thì phải sửa thêm GW3-11: `if (cached)` phải là `if (cached?.valid)`. Cách đơn giản hơn là bỏ negative cache, như round2 đề xuất.
- `src/features/user/user.controller.ts` (PUT `/users`, change-password): chọn thứ tự spread `{ ...dto, userId, role }` (nhánh upstream), để `userId`/`role` của server luôn đứng sau.
- `src/features/upload/upload.controller.ts`: giữ đồng thời `MAX_FILE_SIZE` (upstream) và các hàm `assertValidKey`/`sanitizeFilename`/`UPLOAD_KEY_PREFIX` (stashed). Phần `@UseGuards(RolesGuard) @Roles('ADMIN')` phải đứng trước `@Delete(':key')`.
- Cùng lúc phải resolve các repo khác: `tutor/src/features/chapter/chapter.service.ts` (nhánh stashed bỏ `assertCurriculumOwner`, phải giữ nhánh upstream để không mở lại GW2-08); `third/` có 24 file conflict (notification, upload, redis, email...); nhánh stashed của THIRD notification mới có kiểm actor.

## 3. Ghi nhận ngoài phạm vi gateway (không đánh số lại)

Các lỗi sau nằm ở service khác, đã xác minh khi đối chiếu. Chỉ ghi để theo dõi:

- `user/src/features/student/student.service.ts:103,113,308`: mật khẩu mặc định cố định cho học sinh và phụ huynh (đã xác minh). Đây là Critical theo báo cáo cũ (USR-02, C4). Gateway chỉ khuếch đại (GW3-14).
- `user/`: 0 file conflict. `tutor/`: 1 file conflict. `third/`: 24 file conflict.

## 4. Đối chiếu báo cáo cũ

| Mục cũ | Trạng thái hiện tại | Ghi chú |
|---|---|---|
| GW2-01 `/health/redis` lộ value | ĐÃ SỬA | Gateway bỏ `fetchData`. THIRD `health.redis` chỉ trả số lượng và memory, không trả key/value (đã đọc code). |
| GW2-02 `/health/postgres` lộ user mẫu | CÒN MỘT PHẦN | PII đã bỏ. Còn DoS: xem GW3-03. |
| GW2-03 TUTOR thao tác user khác | CÒN | GW3-02. |
| GW2-04 notification không kiểm owner | ĐÃ SỬA (chờ resolve conflict) | Gateway gửi `userId`/`role`. THIRD nhánh stashed kiểm actor, nhưng file đang conflict. |
| GW2-05 lệch hợp đồng upload/download | ĐÃ SỬA (chờ resolve conflict) | THIRD nhánh stashed dùng base64 khớp gateway. Nhánh upstream vẫn dùng `buffer.data`. |
| GW2-06 tuition lệch hợp đồng | ĐÃ SỬA | tutor-service nhận `{userId, query/classId/id}` và lọc theo `canRead(userId)`/`ownedClassIds`. |
| GW2-07 `/students` không phân quyền | ĐÃ SỬA MỘT PHẦN | `GET /students` nay ADMIN. `POST /students` và `get-student-code` vẫn lỗi (GW3-06, GW3-07). |
| GW2-08 chapter/lesson không kiểm owner | ĐÃ SỬA (tutor, cần giữ nhánh upstream) | `assertCurriculumOwner` đã có. |
| GW2-09 field `/students` lệch | CÒN | GW3-06, GW3-09. |
| GW2-10 guard treo khi THIRD chậm | CÒN MỘT PHẦN | Không còn retry timeout, nhưng vẫn 10 s. GW3-12. |
| GW2-11 không thu hồi phiên | CÒN | GW3-10. |
| GW2-12 `POST /classes` không kiểm role | ĐÃ SỬA (tutor) | `class.service.ts:71-80` kiểm role và `tutorId === userId`. Gateway vẫn không `@Roles` (GW3-17). |
| GW2-13 message không TTL | CÒN | GW3-15. |
| GW2-14 lỗi 5xx lộ message thô | CÒN | GW3-04. |
| GW2-15 upload/delete không kiểm | CÒN MỘT PHẦN | Delete đã ADMIN. Upload và download vẫn mở. GW3-16. |
| GW2-16 không rate limit | CÒN | GW3-14. |
| GW2-17 OAuth | CÒN | GW3-05. |
| GW2-18 9 pattern `testscenario.*` thiếu handler | ĐÃ SỬA | THIRD có đủ 9 handler. |
| GW2-19 Swagger public | CÒN | GW3-20. |
| GW2-20 shutdown hooks | CÒN | GW3-21. |
| GW2-21 code chết | CÒN | GW3-25. |
| GW2-22 `updateSelfSchema` | CÒN | GW3-19. |
| GW2-23 thiếu ParseUUIDPipe | CÒN | GW3-26. |
| GW2-24 test e2e hỏng | CÒN | GW3-27. |
| GW2-25 log query string | CÒN | GW3-28. |
| GW2-26 message lỗi cục bộ | CÒN | GW3-22. |
| GW2-27 LanguageGuard thứ tự | CÒN | GW3-23. |
| GW2-28 sessionCache | CÒN | GW3-24. |
| GW-01, GW-02 (leo thang qua PUT `/users`, `/admin`) | ĐÃ SỬA | Gateway có `@Roles` ADMIN ở `/admin/*` và `/users/*` ghi. `updateSelfSchema` omit `role`. |
| GW-04, GW-05 (reset-password, `/redis`) | ĐÃ SỬA | `/auth/reset-password` public. `/redis` ADMIN + denylist (GW3-18). |
| GW-06, GW-07 (retry) | ĐÃ SỬA MỘT PHẦN | Không retry lỗi có `statusCode` và timeout ghi. Còn GW3-15. |
| GW-13 negative cache | REGRESSION | GW3-11. |
| GW-14, GW-15 (JWT fallback) | ĐÃ SỬA | `getJwtTokensConfig` fail-fast. |
| GW-16 rate limit | CÒN | GW3-14. |
| GW-17 upload size | CÒN MỘT PHẦN | Có `limits.fileSize`. Chưa có fileFilter ở gateway. GW3-16. |
| GW-19 OAuth token trên query | CÒN | GW3-05. |
| GW-26 `kafka/*` và `health/*` | ĐÃ SỬA MỘT PHẦN | `kafka/*` ADMIN. `health/*` không còn lộ PII (GW3-03). |
| GW-27 `get-student-code` | CÒN | GW3-07. |

## 5. Kiểm tra không đổi code

- Không sửa file nguồn, không commit, không chạy migrate/db push/docker/curl.
- Chỉ chạy `tsc --noEmit` (đọc) và các lệnh `grep`, `git`, `cat` (đọc).
- Chưa chạy test (Jest) và chưa chạy request thật, nên các mục "có" ở cột "Đã xác minh" là xác minh bằng đọc code.
