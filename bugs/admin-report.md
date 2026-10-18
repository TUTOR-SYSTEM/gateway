# Flow review: admin

- Luồng: UI (`ui/hooks/useAdminUsers.hook.ts`, `ui/types/user.types.ts`) → gateway (`gateway/src/features/admin/admin.controller.ts`, `packages/entities/admin/admin.schema.ts`) → RMQ `admin.*` → `user/src/features/admin/{admin.rpc.controller,admin.service}.ts`.
- Phương pháp: sub agent `flow-review-admin`, **chỉ đọc, chưa chạy test**. Ngày 2026-10-17.
- Verdict: **OK** (0 Critical, 0 Major, 0 Minor). Tổng hợp chung: `auth-report.md` mục 5.

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

Không còn bug mở.

## Sạch
`@Roles('ADMIN')` + `RolesGuard`; gateway truyền `actorId/actorRole`; `assertAdmin` cho update/delete; delete chặn xóa admin cuối và khi còn tài khoản liên kết; không dùng raw `ClientProxy`; request body UI→GW khớp schema.

## Chưa xác minh
Route/trang UI nào dùng GET detail; `user/src/features/admin/admin.controller.ts` (HTTP) có phải mã chết; `userCode` có UNIQUE ở DB.
