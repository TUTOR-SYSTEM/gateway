# Bug review — module `notification`

Ngày: 2026-10-16
Phạm vi: `src/features/notification/` + entity/guard/pipe liên quan.
Không build/test, chỉ đọc tĩnh.

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 3 |
| Low | 4 |

## Bug

| ID | Mức | File:dòng | Vấn đề | Kịch bản lỗi | Hướng sửa |
|---|---|---|---|---|---|
| NOT-01 | Medium | `src/packages/entities/notification/notification.schema.ts:4-8` (dùng ở dòng 24-27) | `isSafeRedirectUrl` chặn `//` và `/\`, nhưng không chặn ký tự control (tab, LF, CR). Giá trị `/\t/evil.com` và `/\n/evil.com` qua được validation. Trình duyệt bỏ tab/LF khỏi URL nên thành `//evil.com` (protocol-relative) | ADMIN/TUTOR tạo notification với `redirectUrl` = `/<TAB>/evil.com`; người nhận bấm và bị chuyển sang domain ngoài. Chưa xác minh frontend có dùng `redirectUrl` làm đích điều hướng hay không | Từ chối ký tự control và backslash ngay đầu hàm (ví dụ regex `[\x00-\x1f\x7f\\]`), hoặc parse bằng `new URL(value, 'https://x.invalid')` rồi yêu cầu `origin` không đổi |
| NOT-02 | Medium | `src/features/notification/notification.controller.ts:70-80` | Route POST có `@Roles('ADMIN', 'TUTOR')`, nhưng gateway không ràng buộc `type` (kể cả `SYSTEM`) và `userId`/`classId`/`studentId` (chỉ kiểm tra UUID) | TUTOR gửi thông báo `SYSTEM` tới `userId` bất kỳ. Gateway không có kiểm tra quan hệ người gửi và người nhận. Cần owner kiểm tra (chưa xác minh) | Gateway: với role TUTOR, giới hạn type và recipient trong handler, hoặc tách endpoint. Owner: xác minh `notification.create` ràng buộc người gửi với người nhận |
| NOT-03 | Medium | `src/features/rabbitmq/rmq.producer.ts:167-174`, áp cho `notification.create` (`notification.controller.ts:75`) | Retry chỉ bị chặn khi timeout (`unsafeToRetryTimeout`) hoặc lỗi business có `statusCode`. Lỗi khác (kết nối/channel đứt sau khi broker đã giao message) vẫn retry tối đa 2 lần. `notification.create` là POST, không idempotent | Owner đã insert notification, reply bị mất do đứt kết nối, gateway retry và tạo notification trùng | Thêm policy `maxRetries: 0` cho `notification.create` trong `rmq.constants.ts` (cùng mẫu `ai.chat` ở dòng 72). Vấn đề này áp cho mọi POST khác, nên nên xử lý ở mức producer |
| NOT-04 | Low | `src/features/notification/notification.controller.ts:115`, `:128`, `:141` | `@Param('id') id: string` không có `ParseUUIDPipe`, dù Swagger khai báo `format: 'uuid'`. Trong `src/features` chỉ có 2 controller dùng `ParseUUIDPipe` (student, test-scenario) | `GET /notifications/abc` đi thẳng xuống owner. Owner có thể trả 500 do lỗi cast UUID (chưa xác minh) | `@Param('id', ParseUUIDPipe) id: string` cho cả 3 handler |
| NOT-05 | Low | `src/features/notification/notification.controller.ts:53` và `src/packages/entities/notification/notification.schema.ts:19` | Drift Swagger và Zod. Swagger ghi `required: ['type', 'title']`, nhưng Zod bắt buộc `content` (`z.string()` không optional), nên client làm theo Swagger gửi thiếu `content` sẽ nhận 400. Ngược lại Swagger thiếu `senderId`, `subContent`, `actionLabel`, `actionType`, `redirectUrl`, `metadata` mà Zod nhận và forward | Client build theo Swagger không biết có `redirectUrl`, `actionType`, `metadata`. Gửi thiếu `content` bị 400 | Đồng bộ với contract của owner: thêm `content` vào `required` hoặc cho optional trong schema, và bổ sung các field còn thiếu vào `@ApiBody` |
| NOT-06 | Low | `src/features/notification/notification.controller.ts:86` và `:89`; `src/packages/entities/notification/notification.schema.ts:39` | `isRead` Swagger khai báo `type: Boolean`, Zod chỉ nhận chuỗi `'true'` hoặc `'false'`. Các giá trị `1`, `yes`, `True` bị 400. Swagger `limit` không ghi max 100 dù Zod có `max(100)` | Client generate từ Swagger gửi boolean hoặc `1` và nhận 400. Client không biết giới hạn `limit` | Swagger: `enum: ['true', 'false']` cho `isRead` và `maximum: 100` cho `limit`. Hoặc đổi Zod để nhận boolean-like nếu owner chấp nhận |
| NOT-07 | Low | `src/features/rabbitmq/rmq.producer.ts:174`, áp cho `notification.delete` và `notification.markAsRead` | Lỗi kết nối (không phải timeout) sau khi owner đã xử lý DELETE thì lần retry kế tiếp nhận 404. 404 là business error nên được trả cho client | Xóa thành công nhưng client nhận 404 (chưa xác minh owner trả 404 khi đã xóa) | Chấp nhận được ở mức Low. Nếu cần chính xác: owner xử lý delete idempotent (trả thành công khi đã xóa) |

## Phụ thuộc cần repo khác (nếu có)

- Gateway chỉ forward. Bug thật có thể nằm ở owner `third-service`. Pattern cần kiểm tra bên đó: `notification.create`, `notification.getAll`, `notification.getById`, `notification.markAsRead`, `notification.markAllAsRead`, `notification.delete`.
- Cần xác minh ở `third-service`:
  - `notification.create` có ràng buộc người gửi với `userId`/`classId`/`studentId` không (NOT-02).
  - `notification.getById`, `markAsRead`, `delete` có dùng `userId` và `role` đã forward để enforce ownership không. Gateway đã forward đủ tham số, không tự kết luận.
  - Hành vi khi `id` không phải UUID (NOT-04).
  - `delete` có trả 404 khi đã xóa rồi không (NOT-07).

## Đã kiểm tra, không phải bug

- Route `read-all` đặt trước `:id` không gây xung đột. Đường dẫn `:id/read` có số segment khác.
- `senderId` bị ghi đè bằng `user.id` từ JWT, nên không giả mạo người gửi được.
- `@Roles` + `RolesGuard` được gắn đúng. `ROLES_KEY` khớp giữa decorator và guard.
- Module đã đăng ký tại `src/app.module.ts:55`. Prefix `notification` đã có trong `RMQ_PREFIX_ROUTES` (`rmq.constants.ts:29`).
- Tên Swagger bearer `access-token` khớp với `src/main.ts:57`.

## Đã đọc

- `src/features/notification/notification.controller.ts`
- `src/features/notification/notification.module.ts`
- `src/packages/entities/notification/index.ts`, `notification.schema.ts`, `notification.dto.ts`
- `src/packages/guards/roles.guard.ts`, `src/packages/decorators/roles.decorator.ts`
- `src/packages/guards/jwt-auth.guard.ts` (chỉ phần đầu: type `JwtGuardUser`, parse role)
- `src/features/rabbitmq/rmq.producer.ts` (phần `send` và nhánh retry), `src/features/rabbitmq/rmq.constants.ts`
- `src/app.module.ts` (đăng ký module và `APP_GUARD`), `src/main.ts` (chỉ tên Swagger bearer)
- Grep `ParseUUIDPipe` và `@Param('id')` trong `src/features`
