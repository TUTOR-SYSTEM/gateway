# Bug review — module `admin`

Ngày: 2026-10-16
Phạm vi: `src/features/admin/` + entity/guard/pipe liên quan (`src/packages/entities/admin/*`, `src/packages/guards/roles.guard.ts`, `src/packages/decorators/roles.decorator.ts`, `src/packages/decorators/user.decorator.ts`, `src/packages/pipes/zod-validation.pipe.ts`, `src/features/rabbitmq/rmq.producer.ts`, `src/features/rabbitmq/rmq.constants.ts`, `src/app.module.ts`).
Không build/test, chỉ đọc tĩnh.

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 5 |

## Bug

| ID | Mức | File:dòng | Vấn đề | Kịch bản lỗi | Hướng sửa |
|---|---|---|---|---|---|
| ADM-01 | Medium | `src/features/admin/admin.controller.ts:154,170,188,240,259,277` | Sáu route `/admin/tutors/:id` và `/admin/students/:id` dùng `@Param('id') _id: string` không có `ParseUUIDPipe`, dù `@ApiParam` khai báo `format: 'uuid'`. Gateway không validate id ở edge. | Gọi `GET /admin/tutors/abc` hoặc `DELETE /admin/students/1;--` → id không phải UUID được forward nguyên xuống `user.getDetailUser` / `user.deleteUserByAdmin`. Kết quả phụ thuộc owner service (chưa xác minh): có thể 500 bị mask thành "Internal server error" hoặc 404 không nhất quán. | Thêm `new ParseUUIDPipe()` (hoặc `checkUuidValid` từ `@packages/helpers`, theo `conventions.md`) cho từng `@Param('id')`. |
| ADM-02 | Low | `src/features/admin/admin.controller.ts:47` vs `src/packages/entities/admin/admin.schema.ts:69` | Swagger `CREATE_ACCOUNT_BODY_SCHEMA.password` khai báo `maxLength: 14`, Zod `createManagedUserSchema` cho phép `max(20)`. Hai nguồn lệch nhau. | Client theo Swagger từ chối mật khẩu 15–20 ký tự dù server chấp nhận. Nếu `user` service giới hạn 14 thì lỗi 4xx xuất hiện muộn hơn (chưa xác minh). | Đồng bộ `maxLength` trong swagger với Zod (hoặc đưa schema swagger sinh từ Zod). Xác minh giới hạn thật ở `user`. |
| ADM-03 | Low | `src/features/admin/admin.controller.ts:50,74-80,130-131,216-217` vs `src/packages/entities/admin/admin.schema.ts:72,76,127` | Swagger lệch Zod ở 3 chỗ: (a) `dateOfBirth` khai báo `format: date-time`, Zod là `z.coerce.date()` (nhận nhiều dạng); (b) `subjects` không có `maxItems: 20`; (c) `@ApiQuery limit` không khai báo max 100 (Zod `max(100)`). | Tài liệu API không phản ánh đúng ràng buộc; client gửi `limit=500` nhận 422 không có trong docs. | Thêm `maxItems`, `maxLength`/`maximum` tương ứng vào swagger; ghi rõ định dạng `dateOfBirth`. |
| ADM-04 | Low | `src/features/admin/admin.controller.ts:124,207` + `src/features/rabbitmq/rmq.producer.ts:132,174-175` | `user.createUser` (POST tạo tài khoản) không nằm trong policy riêng nên dùng `maxRetries` mặc định 2. `isRpcBusinessError` chỉ chặn retry với lỗi object có `statusCode`; lỗi transport kiểu `Error` (không phải timeout, ví dụ channel đóng sau khi broker đã nhận message) vẫn bị retry. | Request tạo tutor/student có thể chạy hai lần ở `user` nếu lần đầu đã ghi thành công nhưng reply bị mất. Tác động phụ thuộc ràng buộc unique email phía `user` (chưa xác minh). | Đặt `maxRetries: 0` cho `user.createUser` trong `RMQ_SLOW_PATTERN_POLICIES` hoặc chỉ retry khi chắc chắn chưa publish. Xác minh unique constraint ở `user`. |
| ADM-05 | Low | `src/packages/entities/admin/admin.schema.ts:129-132`, `src/features/admin/admin.controller.ts:145,231` | `listManagedUsersQuerySchema` transform `isActive` từ string thành boolean trước khi forward `user.getUsers`. Gateway gửi boolean, nhưng hợp đồng kiểu với owner không được kiểm chứng trong repo này. | Nếu `user.getUsers` mong string `'true'`/`'false'`, filter `isActive` bị bỏ qua hoặc sai kết quả, không có lỗi rõ ràng. | Xác minh `user.getUsers` nhận boolean. Nếu không, bỏ transform hoặc chuẩn hóa ở một phía và ghi vào contract. |
| ADM-06 | Low | `src/features/admin/admin.controller.ts:117-281` (tổng thể) | Các handler tutor/student lặp gần như nguyên văn (`createTutor`/`createStudent`, `getTutor`/`getStudent`, `updateTutor`/`updateStudent`, `deleteTutor`/`deleteStudent`). Chuỗi `'TUTOR'`/`'STUDENT'` lặp ở 12 chỗ. Swagger body schema viết tay song song với Zod, nên đây là nguyên nhân gốc của ADM-02 và ADM-03. | Sửa một nhánh (ví dụ thêm field hoặc đổi quyền) dễ bỏ sót nhánh còn lại; swagger tiếp tục lệch Zod khi schema đổi. | Tách helper theo role (ví dụ `roleRoutes(role)`) hoặc hằng số `Role.TUTOR`/`Role.STUDENT`; sinh swagger từ Zod (`z.toJSONSchema`) thay vì viết tay. |

## Đã kiểm tra và không phát hiện lỗi
- Phân quyền: `@UseGuards(RolesGuard)` + `@Roles('ADMIN')` ở cấp controller, áp dụng cho mọi handler (`admin.controller.ts:110-111`). Global `JwtAuthGuard` chạy trước (`app.module.ts`).
- Mass assignment: `createManagedUserSchema`, `updateManagedUserSchema`, `updateManagedStudentSchema` đều `.strict()` (trừ update student kế thừa từ schema strict), và `role`/`id`/`expectedRole`/`actorId`/`actorRole` được gắn sau spread nên client không ghi đè được.
- Query `listTutors`/`listStudents`: `role` đặt sau spread, schema không `.strict()` nhưng Zod strip key lạ, nên không ghi đè được role.
- Retry với `user.updateUserByAdmin`, `user.deleteUserByAdmin` (PUT/DELETE, không phải `get|find|list...`): timeout không retry (`rmq.producer.ts:172`), đúng.

## Phụ thuộc cần repo khác (nếu có)
- Gateway chỉ forward. Cần kiểm tra bên `user` service (không đọc trong phiên này):
  - `user.createUser`: unique email/username, và giới hạn password thật (ADM-02, ADM-04).
  - `user.getUsers`: kiểu của `isActive` (ADM-05).
  - `user.getDetailUser`, `user.updateUserByAdmin`, `user.deleteUserByAdmin`: có validate `userId` là UUID và kiểm tra `expectedRole` / `actorRole` hay không (ADM-01).

## Đã đọc
- `CLAUDE.md` (đã nạp trong ngữ cảnh), `.claude/rules/conventions.md`, `.claude/rules/nestjs-feature-pattern.md`
- `src/features/admin/admin.controller.ts`, `src/features/admin/admin.module.ts`
- `src/packages/entities/admin/admin.schema.ts`, `src/packages/entities/admin/admin.dto.ts`
- `src/packages/guards/roles.guard.ts`
- `src/packages/decorators/roles.decorator.ts`, `src/packages/decorators/user.decorator.ts`
- `src/packages/pipes/zod-validation.pipe.ts`
- `src/features/rabbitmq/rmq.producer.ts`, `src/features/rabbitmq/rmq.constants.ts`
- `src/app.module.ts`
