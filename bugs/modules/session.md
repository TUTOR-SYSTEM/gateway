# Bug review — module `session`

Ngày: 2026-10-16
Phạm vi: `src/features/session/` + entity/guard/pipe/RMQ liên quan (`src/packages/entities/session/`, `src/packages/guards/roles.guard.ts`, `src/features/rabbitmq/rmq.producer.ts`, `src/features/rabbitmq/rmq.constants.ts`).
Không build/test, chỉ đọc tĩnh.

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 2 |
| Low | 5 |

## Bug

| ID | Mức | File:dòng | Vấn đề | Kịch bản lỗi | Hướng sửa |
|---|---|---|---|---|---|
| SES-01 | Medium | `src/features/session/session.controller.ts:54` | `@ApiBody` của `POST /sessions` khai báo required `['classId','date','startTime','endTime']`, nhưng `createSessionSchema` không có `date`/`startTime`/`endTime` mà yêu cầu `sessionNumber`, `startAt`, `endAt`. | Swagger sai hoàn toàn: client theo doc gửi `date`/`startTime`/`endTime` sẽ bị 400 do thiếu `startAt`/`endAt`/`sessionNumber`. | Thay bằng schema thật (`@ApiBody({ schema: ... })` sinh từ Zod hoặc liệt kê đúng field và required). |
| SES-02 | Medium | `src/features/session/session.controller.ts:110`, `:119`, `:131`, `:146` | Path param `classId` (`getByClass`), `id` (`getById`, `update`, `del`) không qua `ParseUUIDPipe`/Zod, dù `@ApiParam` ghi `format: 'uuid'`. | Gọi `GET /sessions/abc` đi thẳng xuống tutor-service; DB (nếu cột uuid) ném lỗi cú pháp, gateway trả 500 "Internal server error" thay vì 400. Lãng phí một RPC và lỗi sai mã. (Chưa xác minh cột tutor-service là uuid.) | Thêm `new ParseUUIDPipe()` cho các `@Param` tương ứng. |
| SES-03 | Low | `src/features/rabbitmq/rmq.producer.ts:172-174` (ảnh hưởng `session.create`, `session.createBulk`, `session.delete`) | Retry chỉ bị chặn khi là timeout trên pattern không idempotent. Lỗi transport khác (ví dụ mất kết nối channel sau khi responder đã nhận message) vẫn bị retry với `maxRetries=2`. | `POST /sessions` có thể tạo trùng session nếu responder đã insert nhưng reply bị mất và retry gửi lại. Chưa xác minh tần suất; nếu broker không bao giờ mất reply sau khi nhận thì rủi ro thấp. | Với pattern ghi không idempotent, không retry mọi lỗi sau khi đã publish; hoặc thêm idempotency key cho create. |
| SES-04 | Low | `src/features/rabbitmq/rmq.constants.ts:66-78` (không có policy cho `session.createBulk`) | `POST /sessions/bulk` (tối đa 50 session) dùng timeout mặc định 10s. Timeout không được retry (không idempotent). | Bulk lớn chạy quá 10s → 504 "Upstream service timed out" trong khi tutor-service có thể đã commit. Client retry thủ công → trùng. Chưa đo thời gian thực. | Thêm `'session.createBulk': { timeoutMs: 30000, maxRetries: 0 }` vào `RMQ_SLOW_PATTERN_POLICIES`, hoặc trả trạng thái rõ ràng cho bulk. |
| SES-05 | Low | `src/packages/entities/session/session.schema.ts:23-42`, `:68-86` | `createSessionSchema` và `updateSessionSchema` không có `refine` kiểm tra `endAt > startAt`. Update chỉ gửi một trong hai cũng không đối chiếu với giá trị đang lưu. | Gửi `endAt` trước `startAt` được gateway chấp nhận và forward. Nếu tutor-service cũng không kiểm tra, dữ liệu sai được lưu. (Chưa xác minh phía tutor-service.) | Thêm `.refine(...)` cho create; với update, kiểm tra khi cả hai cùng có mặt và ghi nhận giới hạn khi chỉ có một. |
| SES-06 | Low | `src/features/session/session.controller.ts:54`, `:66-79`, `:81-96`, `:123-137` | Swagger thiếu: `startDate`/`endDate` (schema `getSessionsSchema` có, `@ApiQuery` của `GET /sessions` không có); thiếu `@ApiBody` cho `POST /sessions/bulk` và `PUT /sessions/:id`. | Doc không phản ánh contract thật; client/SDK sinh từ Swagger thiếu tham số lọc theo ngày. | Bổ sung `@ApiQuery` và `@ApiBody` tương ứng với schema. |
| SES-07 | Low | `src/features/session/session.controller.ts:97-121` (`getAll`, `getByClass`, `getById`) | Các route GET không có `@Roles`/`RolesGuard` ở gateway; việc giới hạn theo owner/enrollment hoàn toàn dựa vào `userId` gửi xuống tutor-service. | Nếu tutor-service không kiểm `userId` trên `session.getById`/`session.getByClass`, người dùng khác đọc được session (IDOR). Không xác minh được trong phạm vi chỉ đọc gateway. | Xác minh handler `session.getById`, `session.getByClass`, `session.getAll` ở `tutor-service` có kiểm quyền theo `userId`. |

## Phụ thuộc cần repo khác (nếu có)
- Gateway chỉ forward. Cần kiểm ở `tutor-service` (`*.rpc.controller.ts` + `session.service.ts`):
  - Pattern `session.getAll`, `session.getByClass`, `session.getById`, `session.create`, `session.createBulk`, `session.update`, `session.delete` có tồn tại và khớp tên trong gateway.
  - Kiểm owner/enrollment theo `userId` cho mọi read và write (SES-07).
  - Validate `endAt > startAt` và UUID param (SES-02, SES-05).
- Không có bug Critical/High trong phạm vi gateway đã đọc. Route ordering (`class/:classId` trước `:id`) và các `@Roles('ADMIN','TUTOR')` trên write đúng.

## Đã đọc
- `/home/haidangphan/Documents/project/gateway/.claude/agents/gw-module-reviewer.md`
- `/home/haidangphan/Documents/project/gateway/src/features/session/session.controller.ts`
- `/home/haidangphan/Documents/project/gateway/src/features/session/session.module.ts`
- `/home/haidangphan/Documents/project/gateway/src/features/rabbitmq/rmq.producer.ts` (dòng 1-221, phần `send`/`emit`)
- `/home/haidangphan/Documents/project/gateway/src/features/rabbitmq/rmq.constants.ts`
- `/home/haidangphan/Documents/project/gateway/src/packages/entities/session/session.schema.ts`
- `/home/haidangphan/Documents/project/gateway/src/packages/entities/session/session.dto.ts`
- `/home/haidangphan/Documents/project/gateway/src/packages/guards/roles.guard.ts`
- Đăng ký module: `src/app.module.ts` có import `SessionModule`; `rmq.constants.ts` route `session` → `TUTOR_SERVICE`.
- Chưa đọc: `src/packages/entities/session/index.ts`, `@packages/decorators` (chỉ xác nhận tồn tại `Roles`/`CurrentUser`), `jwt-auth.guard.ts`, và mọi file ở repo `tutor-service`.
- Ghi chú: Bash tạm thời bị từ chối trong lúc làm, nên không chạy `ls`/`grep` bổ sung; danh sách trên dựa trên các lần Read và grep trước đó.
