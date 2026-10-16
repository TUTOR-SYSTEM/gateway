# Bug review — module `chapter`

Ngày: 2026-10-16
Phạm vi: `src/features/chapter/` + entity/guard/pipe liên quan (`src/packages/entities/curriculum/curriculum.schema.ts`, `src/packages/guards/roles.guard.ts`, `src/features/rabbitmq/rmq.producer.ts`, `src/features/rabbitmq/rmq.constants.ts`). Đối chiếu owner `tutor-service` (chỉ đọc).
Không build/test, chỉ đọc tĩnh.

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 2 |
| Low | 7 |

## Bug

| ID | Mức | File:dòng | Vấn đề | Kịch bản lỗi | Hướng sửa |
|---|---|---|---|---|---|
| CHP-01 | Medium | `src/features/chapter/chapter.controller.ts:76-78` | `GET /chapter/:id` không có kiểm tra "không tồn tại"; response thành công với `data: null`. | Gọi `GET /chapter/<uuid không tồn tại>` → HTTP 200, `data: null` thay vì 404. Owner `chapter.service.ts:57-61` chỉ trả `findById` (repo trả `null`, `chapter.repository.ts:74`). `ERROR_MESSAGES.CHAPTER_NOT_FOUND` có sẵn nhưng không dùng ở đường này. | Sửa ở owner: `getChapterByIdService` throw `NotFoundException(ERROR_MESSAGES.CHAPTER_NOT_FOUND)` khi `null`. Gateway giữ thin proxy, không tự map. |
| CHP-02 | Medium | `src/packages/entities/curriculum/curriculum.schema.ts:49-51` (dùng ở `chapter.controller.ts:90-91`) | `updateChapterSchema` cho phép body rỗng `{}`. Gateway forward `data: {}` xuống owner. | `PUT /chapter/:id` với body `{}` → owner `chapter.repository.ts:80` gọi `.set({})`. Drizzle thường ném lỗi "No values to set" → 500 "Internal server error" thay vì 400. Chưa chạy để xác minh. | Thêm `.refine((d) => Object.keys(d).length > 0, 'No fields to update')` cho `updateChapterSchema` (ghi chú: schema được tutor-service copy y hệt, cần đồng bộ cả hai). Hoặc owner return sớm khi `data` rỗng. |
| CHP-03 | Low | `src/features/chapter/chapter.controller.ts:46` | Param `:curriculumId` (POST) và `:id` (GET/PUT/DELETE, dòng 76, 89, 103) không dùng `ParseUUIDPipe`. Toàn repo gateway không dùng pipe này. | Id không phải UUID đi thẳng xuống RPC. Owner đã validate `checkUuidValid` (`chapter.service.ts:42-44`, `73-75`), nên kết quả vẫn 400 đúng. Chỉ là thiếu lớp phòng thủ ở edge. | Thêm `ParseUUIDPipe` cho các `@Param` id, hoặc giữ nguyên nếu chấp nhận validate ở owner. |
| CHP-04 | Low | `src/features/chapter/chapter.controller.ts:44-54` + `src/features/rabbitmq/rmq.producer.ts:174-212` | `chapter.create` không idempotent nhưng vẫn bị retry khi lỗi không phải timeout và không phải business error (`rmq.producer.ts:167-174`). `isIdempotentPattern` (`rmq.constants.ts:90-95`) chỉ chặn retry khi timeout. | Broker/connection lỗi sau khi owner đã insert nhưng trước khi gateway nhận reply → retry → tạo chapter trùng. Chưa xác minh tần suất thực tế. | Với `chapter.create`, không retry khi đã gửi message (cần policy `maxRetries: 0` trong `RMQ_*_PATTERN_POLICIES`), hoặc owner dedupe theo `correlationId`. |
| CHP-05 | Low | `src/features/chapter/chapter.controller.ts:98-104` + `src/features/rabbitmq/rmq.producer.ts:174-212` | `chapter.delete` bị retry khi lỗi không phải timeout (cùng cơ chế CHP-04). | Lần gửi đầu đã xóa thành công nhưng reply bị mất → retry → owner trả `CHAPTER_NOT_FOUND` → client nhận 404 dù thao tác đã thành công. | Cùng hướng sửa CHP-04: `maxRetries: 0` cho `chapter.delete`, hoặc owner trả 200 khi đã xóa. |
| CHP-06 | Low | `src/features/chapter/chapter.controller.ts:57-78` | `GET /chapter` và `GET /chapter/:id` không có `@Roles`; mọi user đã đăng nhập đọc được mọi chapter của mọi curriculum. | User bất kỳ (kể cả STUDENT) đọc nội dung chapter của curriculum không thuộc mình. Owner `tutor-service/.claude/rules/nestjs-feature-pattern.md` ghi "Reads stay open (shared library) — confirm with the PO before restricting", nên có thể là chủ đích. | Xác nhận với PO. Nếu cần hạn chế, thêm `@Roles` hoặc filter theo quyền ở owner. |
| CHP-07 | Low | `src/packages/entities/curriculum/curriculum.schema.ts:39-42` | `title` dùng `.min(1)` nhưng không `.trim()`; chuỗi toàn khoảng trắng hợp lệ. | `POST /chapter/:id` với `title: "   "` → được lưu. | Thêm `.trim()` trước `.min(1)`. |
| CHP-08 | Low | `src/features/chapter/chapter.controller.ts:42` (create), `82-86` (update), `98-102` (delete) | Swagger lệch schema: `@ApiBody` của create chỉ khai `required: ['title']` và không mô tả `description`/`order`; update không có `@ApiBody`; delete không có body. | Swagger UI không hiển thị đủ field `description`/`order`, client không biết các field này. | Thêm `@ApiBody` đầy đủ cho create và update, dùng schema từ `src/data/swaggers/data/`. |
| CHP-09 | Low | `src/features/chapter/chapter.controller.ts:46, 65-66, 76, 89, 91` | Tên param `_curriculumId`, `_query`, `_id`, `_data` có prefix `_` (quy ước "unused") nhưng đều được dùng trong thân hàm. | Người đọc hiểu nhầm là tham số không dùng, dễ sửa sai khi refactor. | Bỏ prefix `_` cho các tham số đang dùng. |

Không có bug Critical/High trong phạm vi đã đọc.

Ghi chú đã kiểm tra khớp (không phải bug):
- Pattern RMQ gateway khớp owner `tutor-service/src/features/chapter/chapter.rpc.controller.ts`: `chapter.create`, `chapter.getAll`, `chapter.getById`, `chapter.update`, `chapter.delete`.
- Prefix `chapter` → `TUTOR_SERVICE` (`rmq.constants.ts:36`).
- Payload khớp: create `{userId, curriculumId, data}`, getAll `{query}`, getById `{id}`, update `{userId, id, data}`, delete `{userId, id}`.
- `updateChapterSchema` giữ `order` không default (đúng quy tắc chống reset `order` về 0).
- Roles: create/update/delete `@Roles('ADMIN','TUTOR')` + `RolesGuard`; `userId` được truyền để owner kiểm tra quyền sở hữu curriculum.

## Phụ thuộc cần repo khác (nếu có)
- `tutor-service` `src/features/chapter/chapter.service.ts` (CHP-01): thiếu throw 404 khi không tìm thấy.
- `tutor-service` `src/features/chapter/chapter.repository.ts:80` (CHP-02): `.set(data)` không kiểm tra payload rỗng. Cần chạy thử `PUT /chapter/:id` với `{}` để xác minh 500.
- `tutor-service` `chapter.service.ts:33-47` và `:82-90` (CHP-04/05): owner không có dedupe theo `correlationId`, nên retry của gateway có thể gây trùng hoặc 404 giả.
- `tutor-service` `.claude/rules/nestjs-feature-pattern.md`: quy định reads mở, cần PO xác nhận (CHP-06).

## Đã đọc
- `src/features/chapter/chapter.controller.ts`
- `src/features/chapter/chapter.module.ts`
- `src/packages/entities/curriculum/curriculum.schema.ts`
- `src/features/rabbitmq/rmq.producer.ts`
- `src/features/rabbitmq/rmq.constants.ts`
- `src/packages/guards/roles.guard.ts`
- `.claude/agents/gw-module-reviewer.md`, `CLAUDE.md`, `.claude/rules/nestjs-feature-pattern.md`, `.claude/rules/conventions.md` (gateway)
- Owner (chỉ đọc): `tutor-service/src/features/chapter/chapter.rpc.controller.ts`, `chapter.service.ts`, `chapter.repository.ts`, `tutor-service/src/packages/entities/curriculum/curriculum.schema.ts`, `tutor-service/.claude/rules/nestjs-feature-pattern.md`, `tutor-service/.claude/rules/conventions.md`
- Không đọc: `src/data/i18n/*` (chỉ xác nhận tồn tại `CHAPTER_NOT_FOUND`, `CHAPTER_ID_INVALID` qua grep trước đó), `src/app.module.ts` (đã thấy `ChapterModule` được đăng ký ở dòng 14 và 48).
