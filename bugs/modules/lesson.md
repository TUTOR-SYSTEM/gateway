# Bug review — module `lesson`

Ngày: 2026-10-16
Phạm vi: `src/features/lesson/` + entity/guard/pipe/RMQ liên quan (`src/packages/entities/curriculum/`, `src/features/rabbitmq/rmq.producer.ts`, `src/features/rabbitmq/rmq.constants.ts`, `src/app.module.ts`). Đối chiếu owner: `tutor-service/src/features/lesson/`.
Không build/test, chỉ đọc tĩnh.

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 4 |

## Bug

| ID | Mức | File:dòng | Vấn đề | Kịch bản lỗi | Hướng sửa |
|---|---|---|---|---|---|
| LES-01 | Medium | `src/features/lesson/lesson.controller.ts:52-56`, `:93-96`; `src/packages/entities/curriculum/curriculum.schema.ts:66-68`; owner `tutor-service/src/features/lesson/lesson.service.ts:44-51`, `:89-90` | `chapterId` được forward mà không kiểm tra chapter thuộc curriculum. Tutor-service chỉ check UUID, không tra chapter. Update giữ nguyên `chapterId` sau khi strip `curriculumId`. | Tutor A (sở hữu curriculum A) tạo hoặc sửa lesson với `chapterId` của chapter thuộc curriculum B do tutor khác sở hữu. Lesson bị gắn vào nội dung của curriculum không thuộc quyền mình, và list theo `curriculumId + chapterId` trả dữ liệu không nhất quán. Đã đọc `lesson.service.ts` dòng 35-101 (không thấy chapter lookup). Chưa đọc `lesson.repository.ts`. | Tutor-service: create/update phải kiểm tra `chapter.curriculumId === curriculumId` (create) hoặc `=== existing.curriculumId` (update), trả 404/400 khi lệch. Gateway: cân nhắc bỏ `chapterId` khỏi `updateLessonSchema` nếu không cần đổi chapter qua update. |
| LES-02 | Low | `src/features/lesson/lesson.controller.ts:47-48`, `:54-55` | `curriculumId` và `chapterId` ở `POST /curriculum/lessons` là `@Query` string thô, không qua `ZodValidationPipe`/UUID. Vi phạm `conventions.md` ("every request body/query is validated with Zod"). | Thiếu `curriculumId` hoặc giá trị không phải UUID đi thẳng xuống RPC. Tutor-service đã check UUID (`lesson.service.ts:44-47`) nên hiện trả 400 qua RPC, tác động thực tế thấp. | Thêm schema Zod cho query (`curriculumId` uuid bắt buộc, `chapterId` uuid optional) và `@Query(new ZodValidationPipe(...))`. |
| LES-03 | Low | `src/features/lesson/lesson.controller.ts:79-80`, `:92`, `:106-107` | `@Param('id')` ở `getById`, `update`, `delete` không qua `ParseUUIDPipe` hoặc Zod. | Id không hợp lệ đi xuống RPC. Tutor-service đã check UUID (`lesson.service.ts:66`, `:81`, `:94`) và trả 400, tác động thấp. | Thêm `ParseUUIDPipe` cho `@Param('id')` để trả 400 ngay ở edge. |
| LES-04 | Low | `src/features/lesson/lesson.controller.ts:66-72` (getAll), `:83-97` (update); `curriculum.schema.ts:66-68` | Swagger thiếu tài liệu: `getAll` không có `@ApiQuery` cho `curriculumId`, `chapterId`, `page`, `limit`. `update` không có `@ApiBody`. `updateLessonSchema` chấp nhận `curriculumId` nhưng tutor-service âm thầm bỏ (`lesson.service.ts:89`). | Client đọc Swagger không biết tham số. Client gửi `curriculumId` trong update tưởng đã đổi curriculum, thực tế bị bỏ qua. | Thêm `@ApiQuery` cho getAll và `@ApiBody` cho update. Trong `updateLessonSchema` bỏ `curriculumId` (`.omit({ curriculumId: true })`) để khớp hành vi owner. |
| LES-05 | Low | `src/features/lesson/lesson.controller.ts:45-58`, `:67-72`, `:79-80`, `:90-97`, `:106-107` | Không handler nào có `requestId` và log `[SEND-START]`/`[SEND-SUCCESS]`/`[SEND-FAILED]` theo `conventions.md` ("RPC request tracking"). | Khi lỗi lesson production, khó đối chiếu log gateway với log tutor-service. Rủi ro vận hành, không phải lỗi chức năng. | Thêm requestId theo mẫu trong `conventions.md`, hoặc thống nhất với các module khác rồi áp dụng đồng loạt. |

Không phát hiện bug Critical hoặc High trong phạm vi đã đọc.

## Đã kiểm tra và không phải bug

- 5 message pattern (`lesson.create`, `lesson.getAll`, `lesson.getById`, `lesson.update`, `lesson.delete`) khớp với `tutor-service/src/features/lesson/lesson.rpc.controller.ts`. Payload shape khớp: `{userId, curriculumId, chapterId, data}`, `{query}`, `{id}`, `{userId, id, data}`, `{userId, id}`.
- Route `lesson` → `TUTOR_SERVICE` có trong `RMQ_PREFIX_ROUTES` (`rmq.constants.ts`).
- `LessonModule` có trong `imports` của `app.module.ts`. Đăng ký trước `CurriculumModule`, nên `GET /curriculum/lessons` không bị `curriculum/:id` che.
- Retry: `lesson.create`, `update`, `delete` không retry khi timeout (`rmq.producer.ts:172`, `isIdempotentPattern`). `getAll`/`getById` là read nên được retry.
- Write endpoint có `RolesGuard` + `@Roles('ADMIN', 'TUTOR')`. `userId` được truyền cho create/update/delete.
- `getAll` và `getById` không có role guard. Theo ghi chú `tutor-service/.claude/rules/nestjs-feature-pattern.md` ("Reads stay open"), đây là thiết kế, không tính là bug.
- Schema update không dính lỗi `.partial()` reset default (`order` được khai báo lại với `.optional()`).

## Phụ thuộc cần repo khác (nếu có)
- LES-01: cần kiểm tra `tutor-service/src/features/lesson/lesson.repository.ts` và cách `CurriculumRepository`/`ChapterRepository` được inject, để xác nhận không có ràng buộc DB nào chặn chapter khác curriculum.
- LES-02, LES-03: tác động phụ thuộc việc tutor-service trả 400 đúng (đã thấy trong `lesson.service.ts`).

## Đã đọc
- `src/features/lesson/lesson.controller.ts`
- `src/features/lesson/lesson.module.ts`
- `src/app.module.ts`
- `src/features/rabbitmq/rmq.constants.ts`
- `src/features/rabbitmq/rmq.producer.ts`
- `src/packages/entities/curriculum/curriculum.schema.ts`
- `src/packages/entities/curriculum/curriculum.dto.ts`
- `.claude/rules/conventions.md`, `.claude/rules/nestjs-feature-pattern.md`, `CLAUDE.md`
- `tutor-service/src/features/lesson/lesson.rpc.controller.ts`
- `tutor-service/src/features/lesson/lesson.service.ts`
- `tutor-service/.claude/rules/nestjs-feature-pattern.md`, `tutor-service/.claude/rules/conventions.md`
