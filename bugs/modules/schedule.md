# Bug review — module `schedule`

Ngày: 2026-10-16
Phạm vi: `src/features/schedule/` + entity/guard/pipe liên quan.
Không build/test, chỉ đọc tĩnh.

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 7 |

## Bug

| ID | Mức | File:dòng | Vấn đề | Kịch bản lỗi | Hướng sửa |
|---|---|---|---|---|---|
| SCH-01 | Medium | `src/features/schedule/schedule.controller.ts:107` (`classId`), `:116` (`id`), `:127-128` (`id`), `:143` (`id`) | Path param không được validate UUID ở edge, dù Swagger khai báo `format: 'uuid'` (`:105`, `:114`, `:125`, `:141`). Không có `ParseUUIDPipe`. | Client gửi `/schedules/abc` hoặc `/schedules/class/abc`: chuỗi không hợp lệ được forward thẳng sang `tutor-service`. Nếu owner không validate, lỗi DB/parse trả về dạng 500 và tốn một vòng RPC. Lệch với quy tắc "param phải có ParseUUIDPipe" (review checklist). | Thêm `new ParseUUIDPipe()` (hoặc Zod uuid) cho mọi `@Param` id/classId. |
| SCH-02 | Low | `schedule.controller.ts:94-100`, `:107-109`, `:116-118` | Các route đọc (`getAll`, `getByClass`, `getById`) không có `@Roles`/`RolesGuard`, gateway chỉ gửi `userId` xuống. Việc kiểm tra "user có thuộc lớp/schedule này không" hoàn toàn phụ thuộc owner. | Nếu `tutor-service` không lọc theo membership/ownership, bất kỳ user đăng nhập nào đọc được schedule của lớp khác bằng `id` hoặc `classId`. Chưa xác minh được từ repo này. | Xác minh bên `tutor-service` (xem phần phụ thuộc). Nếu cần, thêm kiểm tra ở owner, không cần đổi edge. |
| SCH-03 | Low | `src/packages/entities/schedule/schedule.schema.ts:27-34` (create), `:36-50` (bulk) | Không có kiểm tra chéo trường: `startTime < endTime` không được ràng buộc; bulk cho phép trùng `dayOfWeek` trong cùng request. | Gửi `startTime: "10:00", endTime: "09:00"` hoặc hai slide cùng thứ, gateway chấp nhận và forward. Chưa xác minh owner có chặn không. | Thêm `.refine()` ở schema (create/bulk; update khi có đủ cả hai trường). |
| SCH-04 | Low | `src/packages/entities/schedule/schedule.dto.ts:7`; `schedule.controller.ts:129-130` | `UpdateScheduleDto = Partial<z.infer<createScheduleSchema>>` có `classId`, nhưng `updateScheduleSchema` đã `.omit({ classId })`. Type và runtime lệch nhau. | Type cho phép `dto.classId`, nhưng Zod strip âm thầm field này. Dev dùng type có thể tin rằng `classId` được cập nhật. Vi phạm convention "DTO là `z.infer<>` của schema". | Đổi thành `export type UpdateScheduleDto = z.infer<typeof updateScheduleSchema>;`. |
| SCH-05 | Low | `schedule.controller.ts:54-56` (create), `:70-73` (bulk), `:120-126` (update) | Swagger body: `create` chỉ khai báo `required` mà không có `properties`; `createBulk` và `update` không có `@ApiBody`. Lệch với convention "body schema ở `src/data/swaggers/data/`". | Swagger UI không hiển thị kiểu/ràng buộc field, dễ lệch khi schema đổi. | Bổ sung schema body cho từng route (hoặc tham chiếu `src/data/swaggers/data/schedule.swagger.ts` nếu có chuẩn). |
| SCH-06 | Low | `schedule.schema.ts:33`, `:45` (`location`), `:55` (`search`) | `location` và `search` là `z.string()` không giới hạn độ dài, `location` cho phép chuỗi rỗng. | Payload rất lớn hoặc `location: ""` đi thẳng xuống DB owner. | Thêm `.max(...)` (và `.trim().min(1)` nếu muốn chặn rỗng). |
| SCH-07 | Low | `schedule.schema.ts:3-11` và `:13-21` | Danh sách ngày trong tuần khai báo hai lần (`dayOfWeekEnum` và `dayOfWeeks`), có thể lệch khi sửa. | Thêm/bớt một ngày ở một chỗ, chỗ còn lại không đồng bộ. | Dùng `dayOfWeeks` làm nguồn duy nhất: `z.enum(dayOfWeeks)`. |
| SCH-08 | Low | `schedule.controller.ts:63`, `:80`, `:99`, `:108`, `:117`, `:133`, `:144` | Các call `rmqProducer.send` không có pattern tracking `requestId` / `[SEND-START]` / `[SEND-SUCCESS]` theo convention `conventions.md` (RPC request tracking). | Khi production lỗi, khó tương quan log gateway với log tutor-service cho module này. Log `RmqProducer` vẫn có `correlationId`, nên mức ảnh hưởng thấp. | Thêm `requestId` theo convention nếu module khác trong gateway đang làm vậy; nếu không, ghi nhận là chấp nhận được. |

Không phát hiện vấn đề về: route order (`class/:classId` trước `:id`), `@Roles('ADMIN','TUTOR')` + `RolesGuard` trên create/bulk/update/delete, routing prefix `schedule` → `TUTOR_SERVICE` (`rmq.constants.ts:41`), đăng ký `ScheduleModule` trong `app.module.ts:12,45`, và retry: `schedule.create`, `schedule.createBulk`, `schedule.update`, `schedule.delete` không khớp `isIdempotentPattern` nên không retry khi timeout (đúng); `schedule.getAll/getById/getByClass` được retry (đúng cho đọc).

## Phụ thuộc cần repo khác (nếu có)

Gateway chỉ forward. Cần kiểm tra bên `tutor-service` (`*.rpc.controller.ts` và `schedule.service.ts`):

- `@MessagePattern('schedule.create')` nhận `{ userId, data }`
- `@MessagePattern('schedule.createBulk')` nhận `{ userId, data }`
- `@MessagePattern('schedule.getAll')` nhận `{ userId, query }`: có lọc theo lớp user sở hữu/được ghi danh không (SCH-02)
- `@MessagePattern('schedule.getByClass')` nhận `{ userId, classId }`: kiểm tra membership (SCH-02), validate UUID (SCH-01)
- `@MessagePattern('schedule.getById')` nhận `{ userId, id }`: kiểm tra membership (SCH-02), validate UUID (SCH-01)
- `@MessagePattern('schedule.update')` nhận `{ userId, id, data }`: có kiểm tra `startTime < endTime` và quyền ownership không (SCH-03)
- `@MessagePattern('schedule.delete')` nhận `{ userId, id }`: kiểm tra ownership

## Đã đọc

- `/home/haidangphan/Documents/project/gateway/CLAUDE.md`
- `/home/haidangphan/Documents/project/gateway/.claude/rules/conventions.md`
- `/home/haidangphan/Documents/project/gateway/.claude/rules/nestjs-feature-pattern.md`
- `/home/haidangphan/Documents/project/gateway/src/features/schedule/schedule.controller.ts`
- `/home/haidangphan/Documents/project/gateway/src/features/schedule/schedule.module.ts`
- `/home/haidangphan/Documents/project/gateway/src/packages/entities/schedule/schedule.schema.ts`
- `/home/haidangphan/Documents/project/gateway/src/packages/entities/schedule/schedule.dto.ts`
- `/home/haidangphan/Documents/project/gateway/src/features/rabbitmq/rmq.constants.ts`
- `/home/haidangphan/Documents/project/gateway/src/features/rabbitmq/rmq.producer.ts`
- `/home/haidangphan/Documents/project/gateway/src/app.module.ts`
- `/home/haidangphan/Documents/project/gateway/.claude/agents/gw-module-reviewer.md`

Chưa đọc: `src/packages/entities/schedule/index.ts` (lệnh Bash bị rate-limit), `src/data/swaggers/*` (chưa xác minh có file `schedule.swagger.ts` hay không), `src/packages/guards/*`, `src/packages/pipes/*`.
