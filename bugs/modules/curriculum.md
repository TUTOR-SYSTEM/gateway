# Bug review — module `curriculum`

Ngày: 2026-10-16
Phạm vi: `src/features/curriculum/` + entity/guard/pipe liên quan.
Không build/test, chỉ đọc tĩnh.

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 5 |
| Low | 5 |

## Bug

| ID | Mức | File:dòng | Vấn đề | Kịch bản lỗi | Hướng sửa |
|---|---|---|---|---|---|
| CUR-01 | Medium | `src/features/curriculum/curriculum.controller.ts:51`, `:95`, `:108` | `GET /curriculum/generate-code`, `GET /curriculum`, `GET /curriculum/:id` không có `@Roles`, chỉ có JWT global. Mọi user đã đăng nhập (kể cả STUDENT) gọi được, `getById` trả chi tiết curriculum. **Chưa xác minh** ở `tutor-service` có lọc theo `userId`/role không. | Student đăng nhập gọi `GET /curriculum/:id` hoặc `generate-code` và nhận dữ liệu/mã mà nghiệp vụ không cho phép. | Xác nhận yêu cầu nghiệp vụ. Nếu hạn chế role: thêm `@UseGuards(RolesGuard)` + `@Roles(...)`. Nếu owner đã lọc: ghi chú lại trong Swagger. |
| CUR-02 | Medium | `src/features/curriculum/curriculum.controller.ts:139-147`, `:112-137` | `PUT /:id` và `DELETE /:id` cho role `TUTOR` nhưng gateway không kiểm tra ownership. Chỉ forward `userId: _user.id` + `id`. **Chưa xác minh** owner `curriculum.update`/`curriculum.delete` có kiểm tra `userId` là chủ curriculum không. | Tutor A gọi `DELETE /curriculum/<id của tutor B>`. Nếu owner không check, xóa thành công (IDOR). | Xác minh ở `tutor-service` (`curriculum.rpc.controller.ts` + service). Nếu owner chưa check: sửa bên đó, gateway không đổi. |
| CUR-03 | Medium | `src/features/curriculum/curriculum.controller.ts:108`, `:131`, `:146` | Param `id` không dùng `ParseUUIDPipe` (repo dùng ở `student.controller.ts:237`, `test-scenario.controller.ts:159`). `id` không phải UUID đi thẳng xuống owner. | `GET /curriculum/abc` → owner lỗi DB (cast uuid) → gateway trả 500 "Internal server error" thay vì 400/404. | Thêm `@Param('id', ParseUUIDPipe) _id: string` ở 3 handler. |
| CUR-04 | Medium | `src/packages/entities/curriculum/curriculum.schema.ts:17` | `grade: z.union([z.string(), z.number()]).transform((v) => Number(v))` không có kiểm tra số hợp lệ. Giá trị `"abc"` qua Zod, thành `NaN`, bị forward (JSON hóa thành `null`). `""` thành `0`. Áp dụng cho cả `create` và `update` (do `.partial()`). | `POST /curriculum` với `grade: "abc"` → pass validation → owner nhận `grade: null` → lỗi NOT NULL/500 hoặc lưu sai dữ liệu. | Thay bằng `z.coerce.number().int().positive()` hoặc `.refine(Number.isFinite)` sau transform. |
| CUR-05 | Medium | `src/features/rabbitmq/rmq.producer.ts:172-174`; áp dụng `src/features/curriculum/curriculum.controller.ts:80` (create), `:136` (update), `:147` (delete) | `send()` retry mọi lỗi không phải timeout và không phải business error (ví dụ connection/channel đứt sau khi broker đã nhận message). Chỉ timeout được chặn retry với pattern không idempotent. `curriculum.create` có thể tạo trùng nếu responder đã xử lý xong nhưng reply bị mất. **Chưa xác minh** ràng buộc unique `code` ở owner. | Mạng chập chờn khi tạo curriculum → gateway retry → 2 bản ghi curriculum giống nhau. | Với pattern ghi (`isIdempotentPattern` = false), không retry bất kỳ lỗi nào trừ khi chắc chắn chưa gửi. Hoặc thêm unique constraint `code` ở owner và idempotency key. Đây là lỗi chung của gateway, không riêng module này. |
| CUR-06 | Low | `src/packages/entities/curriculum/curriculum.schema.ts:12-16` | Message ghi "phải đúng 6 ký tự" nhưng schema cho phép 1–6 (`min(1)`, `max(6)`). Message và rule không khớp. | `code: "AB"` được chấp nhận dù message yêu cầu 6 ký tự. | Đổi thành `.length(6)` nếu nghiệp vụ yêu cầu đúng 6, hoặc sửa message thành "tối đa 6 ký tự". |
| CUR-07 | Low | `src/features/curriculum/curriculum.controller.ts:67` (create), `:118-128` (update) | Swagger drift: `grade` khai báo `type: string` nhưng schema nhận cả number. Update body không liệt kê `courseTime`, `gradesId` dù schema cho phép. | Client theo Swagger không biết có thể gửi `courseTime`/`gradesId` khi update. | Đồng bộ `@ApiBody` với schema (`grade` là string|number, thêm `courseTime`, `gradesId` vào update). |
| CUR-08 | Low | `src/features/curriculum/curriculum.controller.ts:80` (`createCurriculum: _dto`), `:136` (`data: _dto`), `:100` (`query`) | Tên key payload không thống nhất giữa các pattern. **Chưa xác minh** shape mà `tutor-service` `curriculum.create`/`curriculum.update` mong đợi. Nếu lệch, owner nhận `undefined`. | Gọi `POST /curriculum` nhưng owner đọc key khác → insert rỗng hoặc lỗi. | Kiểm tra `@MessagePattern('curriculum.create')` và `curriculum.update` ở `tutor-service` (`*.rpc.controller.ts`) và khớp lại key. |
| CUR-09 | Low | `src/features/curriculum/curriculum.controller.ts:47-52` | `generate-code` là GET nhưng trả `@HttpCode(201)`. Pattern `curriculum.generateCode` không khớp `isIdempotentPattern` (không bắt đầu bằng get/find/...), nên bị coi là ghi: timeout không được retry. Nếu handler không có side effect thì hành vi này không đúng. | Client thấy 201 cho GET, không đúng ngữ nghĩa HTTP. | Dùng `@HttpCode(200)`. Nếu handler thực sự chỉ đọc/sinh mã không lưu: đổi tên pattern theo prefix đọc hoặc ghi chú. |
| CUR-10 | Low | `src/packages/entities/curriculum/curriculum.schema.ts:23` | `updateCurriculumSchema = createCurriculumSchema.partial()` chấp nhận body rỗng `{}`. Gateway forward `data: {}` xuống owner không kiểm tra. **Chưa xác minh** owner xử lý ra sao. | `PUT /curriculum/:id` với `{}` → owner chạy update không có field, có thể trả 200 giả. | Thêm `.refine((d) => Object.keys(d).length > 0, 'Không có trường nào để cập nhật')` vào update schema. |

## Phụ thuộc cần repo khác (nếu có)
- Gateway chỉ forward; bug thật có thể nằm ở owner `tutor-service`. Cần kiểm tra ở `tutor-service` (không đọc trong lượt này):
  - `curriculum.getAll`, `curriculum.getById`, `curriculum.generateCode`: có lọc theo `userId`/role không (CUR-01).
  - `curriculum.update`, `curriculum.delete`: có kiểm tra quyền sở hữu bằng `userId` không (CUR-02).
  - `curriculum.create`: ràng buộc unique `code`, và shape payload `createCurriculum` (CUR-05, CUR-08).
  - `curriculum.update`: shape payload `data` (CUR-08).

## Đã đọc
- `/home/haidangphan/Documents/project/gateway/src/features/curriculum/curriculum.controller.ts`
- `/home/haidangphan/Documents/project/gateway/src/features/curriculum/curriculum.module.ts`
- `/home/haidangphan/Documents/project/gateway/src/packages/entities/curriculum/curriculum.schema.ts`
- `/home/haidangphan/Documents/project/gateway/src/packages/entities/curriculum/curriculum.dto.ts`
- `/home/haidangphan/Documents/project/gateway/src/packages/entities/curriculum/index.ts` (tồn tại, không đọc nội dung)
- `/home/haidangphan/Documents/project/gateway/src/features/rabbitmq/rmq.producer.ts` (logic retry, dòng 120-210)
- `/home/haidangphan/Documents/project/gateway/src/features/rabbitmq/rmq.constants.ts`
- `/home/haidangphan/Documents/project/gateway/src/packages/guards/roles.guard.ts`
- `/home/haidangphan/Documents/project/gateway/src/packages/pipes/zod-validation.pipe.ts`
- `/home/haidangphan/Documents/project/gateway/src/app.module.ts` (grep: `CurriculumModule` đã đăng ký dòng 13, 47)
- Grep `ParseUUIDPipe` trong `src/features/` (dùng ở `student`, `test-scenario`)
- Rule: `CLAUDE.md`, `.claude/rules/conventions.md`, `.claude/rules/nestjs-feature-pattern.md` (đã có trong context)
