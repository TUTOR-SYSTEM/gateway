# Flow review: student

- Luồng: UI (`ui/lib/services/student.service.ts`, `ui/types/student.types.ts`) → gateway (`gateway/src/features/student/student.controller.ts`, `packages/entities/student/student.schema.ts`) → RMQ `student.*` → `user/src/features/student/{student.rpc.controller,student.service}.ts`.
- Phương pháp: sub agent `flow-review-student`, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Verdict: **CẦN SỬA** (0 Critical, 1 Major, 5 Minor). Tổng hợp chung: `auth-report.md` mục 5.

## Bảng luồng
| UI | HTTP | RMQ | Khớp? |
|---|---|---|---|
| `list` | GET /students (ADMIN, TUTOR) | `student.findAll` | Có |
| `detail` | GET /students/:id (ADMIN, TUTOR) | `student.findById` | Có |
| `generateCode` | GET /students/get-student-code | không gọi RMQ, trả 501 | **Không** (xem M-STU-2) |
| `create` | POST /students (ADMIN, TUTOR) | `student.create` | Có |
| `update` | PUT /students/:id (ADMIN) | `student.update` | Có |
| `delete` | DELETE /students/:id (ADMIN) | `student.delete` | Có |

## Major

| ID | Mức | Nội dung |
|---|---|---|
| M-STU-2 | Major | `GET /students/get-student-code` luôn 501 (`student.controller.ts:52-63`), UI vẫn gọi (`ui/lib/services/student.service.ts:88`). `student.rpc.controller.ts:23` đã có `@MessagePattern('student.generateCode')` nhưng gateway chưa gọi. Sửa: `rmqProducer.send('student.generateCode', …)` và bỏ `HttpCode(501)`. |

## Minor

| ID | Mức | Nội dung |
|---|---|---|
| — | Minor | `user/src/features/student/` (HTTP `StudentController`, `StudentModule`) còn là code không được gateway dùng; nếu `user` mở HTTP thì trùng route `/students` của gateway. |
| — | Minor | `@UseGuards`/`@Roles` đặt không đồng nhất: `student.controller.ts:53-54` là `@UseGuards` rồi `@Roles`, `140-141` là ngược lại. |
| — | Minor | UI `UpdateStudentPayload.classId` (`student.types.ts:162`) và `CreateStudentPayload.classCode` không có trong schema gateway (bị strip). |
| — | Minor | `GENDER_ENUM` ở UI (`ui/types/student.types.ts:28-31`) thiếu `OTHER` mà schema gateway (`student.schema.ts:10`) cho phép. |
| — | Minor | Chưa kiểm tra `userId` (payload create) và `actorId` khác nhau có được service dùng nhất quán không. |

## Sạch
Ownership TUTOR ở `StudentService` (`student.service.ts:43-50`); `findById` và `delete` ném 404 khi không phải student; `userId`/`actorId` từ `@CurrentUser()`; create/list/detail/update/delete dùng pattern `student.*`.

## Chưa xác minh
Hook gọi `useStudentActions`; upload endpoint (module khác); Zod pipe phía rpc của `user`.
