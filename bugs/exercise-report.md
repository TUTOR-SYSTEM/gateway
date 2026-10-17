# Flow review: exercise

- Luồng: UI (`ui/lib/services/exercise.service.ts`, `ui/types/session.types.ts`) → gateway (`gateway/src/features/exercise/exercise.controller.ts`, `packages/entities/exercise/exercise.schema.ts`) → RMQ `exercise.*` → `tutor/src/features/exercise/{exercise.rpc.controller,exercise.service}.ts`.
- Phương pháp: sub agent `flow-review-exercise`, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Verdict: **CẦN SỬA** (0 Critical, 1 Major, 3 Minor). Tổng hợp chung: `auth-report.md` mục 5.

## Bảng luồng
| UI | HTTP | RMQ | Khớp? |
|---|---|---|---|
| `create` (không có caller) | POST /exercises (ADMIN, TUTOR) | `exercise.create` | Pattern/payload khớp |
| `list` (`exercise-submit-page.tsx:164`) | GET /exercises | `exercise.getAll` | Có (`{data, pagination}`) |
| `detail` | GET /exercises/:id | `exercise.getById` | Có |
| `resubmit` (không có caller) | PATCH /exercises/:id/submit | `exercise.submit` | Pattern khớp; type UI lệch schema (xem Minor) |
| `grade` (`exercise-grade-workspace.tsx:232`) | PATCH /exercises/:id/grade (ADMIN, TUTOR) | `exercise.grade` | Có |

5/5 pattern khớp. `exercise` → `TUTOR_SERVICE` (`rmq.constants.ts:38`).

## Critical
Không còn bug mở.

## Major

| ID | Mức | Nội dung |
|---|---|---|
| M-EXE-1 | Major | Gateway `POST /exercises` chỉ cho `ADMIN, TUTOR` (`exercise.controller.ts:47-49`) nhưng service coi student là bên nộp (`exercise.service.ts:70`, comment "student who nop bai"). Luồng student nộp lần đầu có thể bị chặn. Chưa xác nhận STUDENT bị chặn thật (chưa đọc `RolesGuard`). Sửa: mở thêm STUDENT cho create hoặc ghi rõ tutor tạo bản ghi. |

## Minor

| ID | Mức | Nội dung |
|---|---|---|
| — | Minor | `ResubmitExercisePayload` `{content?, attachments?}` (`ui/types/session.types.ts`) lệch `submitExerciseSchema` (`exercise.schema.ts:37`, `exerciseUrls` bắt buộc, min 1). |
| — | Minor | `gradeExercise` không chặn chấm lại bài đã GRADED (`exercise.service.ts:172-184`); có thể chủ ý, cần xác nhận hành vi regrade. |
| — | Minor | `gradeExerciseSchema` dùng `z.coerce.number()` nên chuỗi rỗng thành 0; UI đã chặn `score.trim()===""` (`exercise-grade-workspace.tsx:235-237`). |

## Sạch
IDOR: `getById` trả 404 cho người không liên quan, `findAll` lọc theo tutorId/studentId, grade yêu cầu tutorId khớp, submit yêu cầu studentId khớp; submit ghi có điều kiện `notStatus` (không ghi đè bài GRADED); update schema không dùng `.partial()`; `userId` từ `@CurrentUser()` ở mọi call; `:id` qua `ParseUUIDPipe`; `CreateExercisePayload` UI khớp schema.

## Chưa xác minh
Giá trị role STUDENT trong `RolesGuard`; kiểu `score` trả về (cột `numeric` có thể là string, UI khai `number | null`); `lib/axios/api-error.ts`; `ui/API_ENDPOINTS.md`.
