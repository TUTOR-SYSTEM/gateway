# Bug review — module `tuition`

Ngày: 2026-10-16
Phạm vi: `src/features/tuition/` + entity/guard/pipe liên quan (`src/packages/entities/tuition/`, `src/packages/guards/roles.guard.ts`, `src/packages/pipes/zod-validation.pipe.ts`, `src/features/rabbitmq/rmq.producer.ts`, `src/features/rabbitmq/rmq.constants.ts`). Đối chiếu handler bên `tutor-service` (`tuition.rpc.controller.ts`, `tuition.service.ts`, `tuition.repository.ts`) để xác minh.
Không build/test, chỉ đọc tĩnh.

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 3 |
| Low | 1 |

## Bug

| ID | Mức | File:dòng | Vấn đề | Kịch bản lỗi | Hướng sửa |
|---|---|---|---|---|---|
| TUI-01 | Medium | `src/packages/entities/tuition/tuition.schema.ts:8` | `amount: z.coerce.number()` ép `null`, `""`, `false`, `[]` thành `0`, nên qua được `min(0)`. Schema `updateTuitionSchema` kế thừa lỗi này. | `POST /tuitions` với `{"amount": null}` (hoặc `""`) qua validation và ghi học phí = 0 vào DB, không báo lỗi. | Dùng `z.number({ message: 'Amount is required' }).min(0)` cho JSON body. Nếu cần nhận chuỗi số, dùng union `z.number() \| z.string().regex(/^\d+(\.\d+)?$/).transform(Number)`. |
| TUI-02 | Medium | `src/features/tuition/tuition.controller.ts:59` (create), `:124` (delete) | `tuition.create` không có idempotency key. Khi timeout, `RmqProducer` không retry (`rmq.producer.ts:172`, `isIdempotentPattern('tuition.create')` = false), nên gateway trả 504 trong khi tutor-service có thể đã insert. Với lỗi transport không phải timeout (không có `statusCode`), producer vẫn retry tối đa 2 lần, có thể tạo trùng. | Client nhận 504 rồi gửi lại `POST /tuitions` → hai bản ghi học phí trùng cho cùng (classId, studentId). | Thêm `Idempotency-Key` (header) đi kèm payload và kiểm tra trùng ở tutor-service, hoặc kiểm tra trùng `(classId, studentId, dueDate)` trước insert. Với `delete`: lần retry sau một lần thành công trả 404, cần xử lý như thành công hoặc chấp nhận và ghi rõ. |
| TUI-03 | Medium | `src/features/tuition/tuition.controller.ts:71` (`getSummary`), `:97` (`getById`) | `classId` (query) và `:id` (path) không qua Zod/`ParseUUIDPipe` ở gateway, dù Swagger khai báo `format: 'uuid'`. `getAll` thì validate `classId` bằng Zod nên không nhất quán. | `GET /tuitions/summary?classId=abc` đi thẳng xuống `tutor-service/src/features/tuition/tuition.repository.ts:184-187` (`eq(tuitions.classId, classId)`, không kiểm tra UUID). Postgres báo lỗi kiểu uuid, producer che thành `500 Internal server error`. Client nhận 500 thay vì 422/400. (Giả định cột `classes.id`/`tuitions.classId` là uuid, khớp với schema Zod đang dùng.) | Thêm `new ParseUUIDPipe()` cho `@Param('id')`, và validate `classId` bằng schema Zod (`z.string().uuid().optional()`) cho `getSummary`. |
| TUI-04 | Low | `src/features/tuition/tuition.controller.ts:100-106` (`update`) | `update` không có `@ApiBody`. `create` có `@ApiBody` nhưng chỉ khai báo `required`, không có `properties`, nên Swagger không mô tả schema thực tế. | Swagger không hiển thị các field `amount`, `status`, `dueDate`… cho `PUT /tuitions/:id`, client phải đoán. | Dùng `@ApiBody({ schema: ... })` mô tả đầy đủ theo `updateTuitionSchema`, hoặc suy ra từ DTO. |

## Đã kiểm tra, không phải bug

- Các route `GET` (`summary`, list, `:id`) không có `@Roles`, nên STUDENT cũng gọi được. Không phải lỗ hổng: tutor-service giới hạn kết quả bằng `canRead(userId)` (tuition của chính student hoặc của lớp mà tutor sở hữu) và `getSummary` chỉ tính lớp của tutor (`tuition.repository.ts:37-40`, `:184-187`).
- `create`/`update`/`delete` có `@UseGuards(RolesGuard)` + `@Roles('ADMIN','TUTOR')`. Quyền sở hữu lớp/bản ghi được tutor-service kiểm tra (`tuition.service.ts:54-81`).
- Thứ tự route: `@Get('summary')` khai báo trước `@Get(':id')`, không bị nuốt route.
- `getAll` validate `page`/`limit`/`classId`/`studentId`/`status` bằng `getTuitionsQuerySchema` đúng quy ước.
- Message pattern `tuition.{create,getAll,getSummary,getById,update,delete}` khớp với `@MessagePattern` bên tutor-service. Prefix `tuition` có trong `RMQ_PREFIX_ROUTES` (`rmq.constants.ts:39`). `TuitionModule` được đăng ký trong `app.module.ts:50`.

## Phụ thuộc cần repo khác (nếu có)
- Gateway chỉ forward. Các bug trên đã đối chiếu với `tutor-service` để xác nhận `TUI-03` (không có kiểm tra UUID ở repository `getSummary`). `TUI-02` cần xác minh thêm xem tutor-service có kiểm tra trùng khi insert không (`tuition.repository.ts` hàm `create`, chưa đọc chi tiết).

## Đã đọc
- `src/features/tuition/tuition.controller.ts`
- `src/features/tuition/tuition.module.ts`
- `src/packages/entities/tuition/tuition.schema.ts`
- `src/packages/entities/tuition/tuition.dto.ts`
- `src/packages/entities/tuition/index.ts`
- `src/packages/guards/roles.guard.ts`
- `src/packages/decorators/roles.decorator.ts`
- `src/packages/pipes/zod-validation.pipe.ts`
- `src/features/rabbitmq/rmq.producer.ts` (phần `send`, retry gating)
- `src/features/rabbitmq/rmq.constants.ts`
- `src/app.module.ts` (grep `Tuition`)
- `.claude/rules/nestjs-feature-pattern.md`, `.claude/rules/conventions.md`, `CLAUDE.md` (phần liên quan)
- Ngoài repo gateway (chỉ đọc để đối chiếu): `/home/haidangphan/Documents/project/tutor-service/src/features/tuition/tuition.rpc.controller.ts`, `tuition.service.ts`, `tuition.repository.ts` (các đoạn grep)
