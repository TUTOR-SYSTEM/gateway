# Flow review: exercise

- Luồng: UI (`ui/lib/services/exercise.service.ts`, `ui/types/session.types.ts`) → gateway (`gateway/src/features/exercise/exercise.controller.ts`, `packages/entities/exercise/exercise.schema.ts`) → RMQ `exercise.*` → `tutor/src/features/exercise/{exercise.rpc.controller,exercise.service}.ts`.
- Phương pháp: sub agent `flow-review-exercise`, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Verdict: **OK** (0 Critical, 0 Major, 0 Minor). Tổng hợp chung: `auth-report.md` mục 5.

## Bảng luồng
| UI | HTTP | RMQ | Khớp? |
|---|---|---|---|
| `create` (không có caller) | POST /exercises (ADMIN, TUTOR, STUDENT) | `exercise.create` | Pattern/payload khớp |
| `list` (`exercise-submit-page.tsx:164`) | GET /exercises | `exercise.getAll` | Có (`{data, pagination}`) |
| `detail` | GET /exercises/:id | `exercise.getById` | Có |
| `resubmit` (không có caller) | PATCH /exercises/:id/submit | `exercise.submit` | Có |
| `grade` (`exercise-grade-workspace.tsx:232`) | PATCH /exercises/:id/grade (ADMIN, TUTOR) | `exercise.grade` | Có |

5/5 pattern khớp. `exercise` → `TUTOR_SERVICE` (`rmq.constants.ts:38`).

## Critical
Không còn bug mở.

## Major

Không còn bug mở.

## Minor

Không còn bug mở.

## Sạch
IDOR: `getById` trả 404 cho người không liên quan, `findAll` lọc theo tutorId/studentId, grade yêu cầu tutorId khớp, submit yêu cầu studentId khớp; submit ghi có điều kiện `notStatus` (không ghi đè bài GRADED); update schema không dùng `.partial()`; `userId` từ `@CurrentUser()` ở mọi call; `:id` qua `ParseUUIDPipe`; `CreateExercisePayload` và `ResubmitExercisePayload` UI khớp schema; `gradeExerciseSchema` không còn `z.coerce` (UI gửi `Number(score)`); role STUDENT tồn tại trong `JWT_ROLES`.

## Chưa xác minh
Kiểu `score` trả về (cột `numeric` có thể là string, UI khai `number | null`); `lib/axios/api-error.ts`; `ui/API_ENDPOINTS.md`.
