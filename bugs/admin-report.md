# Flow review: admin

- Luồng: UI (`ui/hooks/useAdminUsers.hook.ts`, `ui/types/user.types.ts`) → gateway (`gateway/src/features/admin/admin.controller.ts`, `packages/entities/admin/admin.schema.ts`) → RMQ `admin.*` → `user/src/features/admin/{admin.rpc.controller,admin.service}.ts`.
- Phương pháp: sub agent `flow-review-admin`, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Verdict: **OK** (0 Critical, 0 Major, 3 Minor). Tổng hợp chung: `auth-report.md` mục 5.

## Bảng luồng
| UI | HTTP | RMQ | Khớp? |
|---|---|---|---|
| `useAdminTutors` | GET /admin/tutors | `admin.listTutors` | Có |
| `useCreateTutor` | POST /admin/tutors | `admin.createTutor` | Có |
| (không hook) | GET /admin/tutors/:id | `admin.getTutor` | Có |
| `useUpdateTutor` | PUT /admin/tutors/:id | `admin.updateTutor` | Có |
| `useDeleteTutor` | DELETE /admin/tutors/:id | `admin.deleteTutor` | Có |
| `useAdminStudents` | GET /admin/students | `admin.listStudents` | Có |
| `useCreateStudent` | POST /admin/students | `admin.createStudent` | Có |
| (không hook) | GET /admin/students/:id | `admin.getStudent` | Có |
| `useUpdateStudent` | PUT /admin/students/:id | `admin.updateStudent` | Có |
| `useDeleteStudent` | DELETE /admin/students/:id | `admin.deleteStudent` | Có |

## Critical
Không còn bug mở.

## Major
Không còn bug mở.

## Minor

| ID | Mức | Nội dung |
|---|---|---|
| — | Minor | Swagger password `maxLength: 14` (`admin.controller.ts:47`) nhưng Zod `max(100)` (`admin.schema.ts:69`). |
| — | Minor | `ui/components/flow-requests/flow-request-seed-data.ts:47,52` ghi topic `user.getUserByField` cho GET /admin/tutors/:id và /admin/students/:id; topic thật là `admin.getTutor` / `admin.getStudent`. |
| — | Minor | Tham số `_dto/_id/_currentUser` đặt tiền tố `_` dù đang dùng (`admin.controller.ts:124-219`). |

## Sạch
`@Roles('ADMIN')` + `RolesGuard`; gateway truyền `actorId/actorRole`; `assertAdmin` cho update/delete; delete chặn xóa admin cuối và khi còn tài khoản liên kết; không dùng raw `ClientProxy`; request body UI→GW khớp schema.

## Chưa xác minh
Route/trang UI nào dùng GET detail; `user/src/features/admin/admin.controller.ts` (HTTP) có phải mã chết; `userCode` có UNIQUE ở DB.
