# Bug review — module `attendance`

Ngày: 2026-10-16
Phạm vi: `src/features/attendance/` + entity/guard/pipe liên quan.
Không build/test, chỉ đọc tĩnh.

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 1 |
| Medium | 1 |
| Low | 3 |

## Bug

| ID | Mức | File:dòng | Vấn đề | Kịch bản lỗi | Hướng sửa |
|---|---|---|---|---|---|
| ATT-02 | High | `src/features/attendance/attendance.controller.ts:35-37` | `GET /attendances/session/:sessionId` không có `@Roles`/`RolesGuard`, và payload chỉ gửi `{ userId, sessionId }` (không gửi role). | Mọi user đã đăng nhập (STUDENT, PARENT, ...) gọi được và nhận roster của session bất kỳ: họ tên, avatar, `userCode`, trạng thái điểm danh, ghi chú. Gateway không chặn; chỉ phụ thuộc `tutor-service` kiểm tra quyền (chưa xác minh được ở repo này). | Thêm `@UseGuards(RolesGuard)` + `@Roles('ADMIN','TUTOR')` (hoặc role cho phép đúng nghiệp vụ), và xác nhận `attendance.getBySession` bên `tutor-service` kiểm tra quyền theo `userId`. |
| ATT-03 | Medium | `src/features/attendance/attendance.controller.ts:35` | `@Param('sessionId')` không dùng `ParseUUIDPipe`, trong khi `@ApiParam` ghi `format: 'uuid'`. | Request với `sessionId` không phải UUID được forward thẳng xuống `tutor-service` thay vì bị 400 ở edge; lỗi trả về phụ thuộc downstream. Thiếu so với `PUT` vốn dùng Zod. | Dùng `@Param('sessionId', new ParseUUIDPipe())` (hoặc Zod param schema), theo convention của `student.controller.ts`. |
| ATT-04 | Low | `src/features/attendance/attendance.controller.ts:39-53` | `PUT` cho phép `TUTOR` ghi điểm danh, nhưng payload `{ userId, data: dto }` không gửi role và không có ràng buộc tutor–session phía gateway. | TUTOR có thể đánh dấu điểm danh cho `sessionId` của tutor khác nếu `tutor-service` không kiểm tra ownership. Chưa xác minh phía owner. | Xác nhận `attendance.upsert` bên `tutor-service` kiểm tra session thuộc `userId`; nếu cần, truyền thêm role/ownership check. |
| ATT-05 | Low | `src/features/attendance/attendance.controller.ts:41-53` | `PUT` không có `@ApiBody`, dù body được validate bằng `upsertAttendanceSchema`. | Swagger không hiển thị schema body (`sessionId`, `studentId`, `present`, `note`), lệch với contract thực tế. | Thêm `@ApiBody({ type: ... })` hoặc schema trong `src/data/swaggers/data/attendance.swagger.ts` theo convention. |
| ATT-06 | Low | `src/features/rabbitmq/rmq.constants.ts` (hàm `isIdempotentPattern`) | `attendance.upsert` không khớp regex read-only và không có policy riêng, nên khi timeout sẽ không retry và trả 504 dù thao tác là upsert (idempotent theo ngữ nghĩa). | Client nhận 504 "Upstream service timed out" dù thao tác có thể đã thành công; client phải gửi lại thủ công. Không gây trùng dữ liệu. | Thêm `attendance.upsert` vào danh sách idempotent (nếu owner đảm bảo upsert theo `(sessionId, studentId)`), hoặc chấp nhận và ghi nhận hành vi này. |

## Phụ thuộc cần repo khác (nếu có)
- Gateway chỉ forward; bug thật có thể nằm ở owner service `tutor-service`. Cần kiểm tra bên đó:
  - `attendance.getBySession` (`@MessagePattern` trong `tutor-service`): có kiểm tra quyền xem roster theo `userId` không (liên quan ATT-02).
  - `attendance.upsert`: có kiểm tra `session` thuộc tutor đang gọi không, và có upsert theo `(sessionId, studentId)` không (liên quan ATT-04, ATT-06).
  - Hình dạng payload hai pattern khác nhau: GET gửi `{ userId, sessionId }`, PUT gửi `{ userId, data }`. Cần đối chiếu với owner.
- Trùng lặp với báo cáo gateway có sẵn `bugs/gateway-bugs.md` (dòng 56 về thiếu role/ownership, dòng 70 về thiếu `ParseUUIDPipe` tại `attendance.controller.ts:35`) và `bugs/tutor-bugs.md:69` (`features/attendance/attendance.service.ts:29-57`, thuộc repo tutor, không đọc ở đây).

## Đã đọc
- `src/features/attendance/attendance.controller.ts`
- `src/features/attendance/attendance.module.ts`
- `src/packages/entities/attendance/attendance.schema.ts`
- `src/packages/entities/attendance/attendance.dto.ts`
- `src/packages/entities/attendance/index.ts`
- `src/packages/guards/roles.guard.ts`
- `src/packages/guards/index.ts`
- `src/packages/decorators/roles.decorator.ts`
- `src/packages/decorators/index.ts`
- `src/features/rabbitmq/rmq.producer.ts`
- `src/features/rabbitmq/rmq.constants.ts`
- Đã kiểm tra đăng ký: `src/app.module.ts` (import `AttendanceModule`, dòng 19) và `RMQ_PREFIX_ROUTES` (`attendance` → `TUTOR_SERVICE`).
- Ghi chú: lệnh Bash bị tạm chặn (rate limit của bộ phân loại), nên phần tìm kiếm chỉ dựa trên Read; không grep toàn bộ `src/`.

> Đã loại ATT-01 (báo cáo ban đầu nói lỗi cú pháp; đã kiểm tra lại: dòng 24 là `export class AttendanceController {`, hợp lệ).
