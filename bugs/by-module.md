# Thống kê bug theo module — gateway

Ngày: 2026-10-16
Phương pháp: 23 subagent `gw-module-reviewer` (review tĩnh, read-only với `src/`), mỗi agent một module trong `src/features/`. Chi tiết từng module: `bugs/modules/<module>.md`.
Không build/test. Bug Critical/High đã được kiểm chứng lại bằng đọc code; ATT-01 (báo cáo ban đầu ghi lỗi cú pháp) đã bị loại vì không đúng.

## Tổng hợp

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 5 |
| Medium | 48 |
| Low | 114 |
| **Tổng** | **167** |

## Theo module

| Module | Critical | High | Medium | Low | Chi tiết |
|---|---|---|---|---|---|
| admin | 0 | 0 | 1 | 5 | [admin.md](modules/admin.md) |
| ai-chat | 0 | 0 | 1 | 4 | [ai-chat.md](modules/ai-chat.md) |
| attendance | 0 | 1 | 1 | 3 | [attendance.md](modules/attendance.md) |
| auth | 0 | 1 | 1 | 7 | [auth.md](modules/auth.md) |
| chapter | 0 | 0 | 2 | 7 | [chapter.md](modules/chapter.md) |
| class | 0 | 0 | 1 | 8 | [class.md](modules/class.md) |
| curriculum | 0 | 0 | 5 | 5 | [curriculum.md](modules/curriculum.md) |
| dashboard | 0 | 0 | 0 | 0 | [dashboard.md](modules/dashboard.md) |
| email | 0 | 0 | 1 | 3 | [email.md](modules/email.md) |
| exercise | 0 | 0 | 5 | 5 | [exercise.md](modules/exercise.md) |
| lesson | 0 | 0 | 1 | 4 | [lesson.md](modules/lesson.md) |
| log | 0 | 0 | 0 | 6 | [log.md](modules/log.md) |
| notification | 0 | 0 | 3 | 4 | [notification.md](modules/notification.md) |
| rabbitmq | 0 | 1 | 2 | 8 | [rabbitmq.md](modules/rabbitmq.md) |
| redis | 0 | 0 | 0 | 4 | [redis.md](modules/redis.md) |
| report | 0 | 0 | 0 | 3 | [report.md](modules/report.md) |
| schedule | 0 | 0 | 1 | 7 | [schedule.md](modules/schedule.md) |
| session | 0 | 0 | 2 | 5 | [session.md](modules/session.md) |
| student | 0 | 2 | 5 | 6 | [student.md](modules/student.md) |
| test-scenario | 0 | 0 | 2 | 4 | [test-scenario.md](modules/test-scenario.md) |
| tuition | 0 | 0 | 3 | 1 | [tuition.md](modules/tuition.md) |
| upload | 0 | 0 | 3 | 6 | [upload.md](modules/upload.md) |
| user | 0 | 1 | 8 | 9 | [user.md](modules/user.md) |

## High (cần xử lý trước)

| ID | Module | File:dòng | Vấn đề |
|---|---|---|---|
| ATT-02 | attendance | `src/features/attendance/attendance.controller.ts:35-37` | `GET /attendances/session/:sessionId` thiếu `@Roles`; mọi user đăng nhập đọc được roster session bất kỳ. |
| AUTH-01 | auth | `src/app.module.ts:33-79`, route `@Public()` auth | Không có rate limit: brute force login/user-code/forgot-password không bị chặn ở gateway. |
| RMQ-01 | rabbitmq | `src/features/rabbitmq/rmq.producer.ts:172-174` | `send()` retry mọi lỗi không phải timeout/business, kể cả ghi bị đứt giữa chừng → có thể tạo trùng. |
| STU-01 | student | `src/features/student/student.controller.ts:127-133` | `POST /students` gửi `user.createUser` với `studentName`, thiếu `firstName`/`lastName`/`password`/`username`; service hash `undefined`. |
| STU-02 | student | `src/features/student/student.controller.ts:283-295` | `PUT /students/:id` gửi field không khớp `updateUserSchema` (`.strict()`) → lỗi hoặc field bị bỏ. |
| USR-01 | user | `src/packages/entities/user/user.schema.ts:204-205, 214-223` | `updateSelfSchema` vẫn cho `parentId`/`tutorId`, mâu thuẫn với ý định chặn tự relink tài khoản. |

## Ghi chú
- Không có bug Critical sau khi loại ATT-01.
- `dashboard`, `log`, `redis`, `report` không có bug Medium/High; chỉ Low hoặc không có.
- Một số bug (RMQ-01, AUTH-01, STU-02, USR-01) cần kiểm chứng thêm ở repo owner (`user`, `tutor-service`) trước khi sửa.
- Chưa có bug nào được tái hiện bằng test; đây là kết quả đọc tĩnh.
