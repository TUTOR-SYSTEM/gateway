# Flow review: lesson

- Luồng: UI (`ui/lib/services/lesson.service.ts`, `ui/types/lesson.types.ts`) → gateway (`gateway/src/features/lesson/lesson.controller.ts`, schema ở `packages/entities/curriculum/curriculum.schema.ts`) → RMQ `lesson.*` → `tutor/src/features/lesson/{lesson.rpc.controller,lesson.service}.ts`.
- Phương pháp: sub agent `flow-review-lesson`, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Verdict: **OK** (0 Critical, 0 Major, 2 Minor). Tổng hợp chung: `auth-report.md` mục 5.

## Bảng luồng
| UI | HTTP | RMQ | Khớp? |
|---|---|---|---|
| `create` (service.ts:77-93) | POST /curriculum/lessons?curriculumId&chapterId | `lesson.create` | Có |
| `list` | GET /curriculum/lessons | `lesson.getAll` | Có (`{lessons, pagination}`) |
| `detail` | GET /curriculum/lessons/:id | `lesson.getById` | Có |
| `update` | PUT /curriculum/lessons/:id | `lesson.update` | Có |
| `delete` | DELETE /curriculum/lessons/:id | `lesson.delete` | Có |

5 pattern khớp 1-1, không mồ côi. `lesson` → `TUTOR_SERVICE` (`rmq.constants.ts:37`).

## Critical
Không còn bug mở.

## Major
Không còn bug mở.

## Minor

| ID | Mức | Nội dung |
|---|---|---|
| — | Minor | `curriculumId`/`chapterId` của create đọc bằng `@Query` thô, không qua Zod (`lesson.controller.ts:64-65`); service bắt bằng `BadRequestException`. |
| — | Minor | `UpdateLessonDto` trong `curriculum.dto.ts:26` là `Partial<z.infer<createLessonSchema>>`, không phải `updateLessonSchema`. |

## Sạch
`userId` từ `@CurrentUser()` trong create/update/delete và `assertCurriculumOwner` (ADMIN được bypass); `@Roles('ADMIN','TUTOR')` + `RolesGuard` trên route ghi; update từ chối body rỗng (400); `updateLessonSchema` không dính `.default()`; dùng `RmqProducer`; đọc lesson theo catalog chung (quyết định thiết kế).

## Chưa xác minh
`tutor/src/features/lesson/lesson.controller.ts` (HTTP) có route khác; `unwrapApiData`/`api-error.ts`.
