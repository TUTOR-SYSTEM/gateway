# Bug review — module `dashboard`

Ngày: 2026-10-16
Phạm vi: `src/features/dashboard/` + entity/guard/pipe liên quan.
Không build/test, chỉ đọc tĩnh.

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |

## Bug

Không phát hiện bug trong phạm vi đã đọc.

Đã kiểm tra:
- Route `GET /dashboard/overview` có `@CurrentUser()` và chỉ forward `{ userId: user.id }`, `user.id` lấy từ JWT đã xác thực nên không có IDOR ở gateway.
- Pattern `dashboard.overview` khớp `@MessagePattern('dashboard.overview')` ở owner `tutor-service`, payload `{ userId }` khớp signature của owner.
- Prefix `dashboard` được route sang `TUTOR_SERVICE` trong `RMQ_PREFIX_ROUTES`.
- `DashboardModule` được đăng ký trong `src/app.module.ts`.
- Endpoint là GET, không có body, nên retry mặc định của `RmqProducer.send()` không gây trùng dữ liệu.

Ghi chú (không tính là bug, chưa xác minh):
- Endpoint tổng hợp dùng timeout mặc định (10s, 2 retry). Nếu owner chậm, client có thể chờ lâu trước khi nhận 504. Chưa đo, nên không ghi thành bug.

## Phụ thuộc cần repo khác (nếu có)
- Owner `tutor-service`: `src/features/dashboard/dashboard.rpc.controller.ts` (`overview`) đã khớp pattern và payload. Chưa kiểm tra logic scope theo `userId` bên trong service; nếu cần, đó là việc của review `tutor-service`.

## Đã đọc
- `CLAUDE.md`
- `.claude/rules/conventions.md`
- `.claude/rules/nestjs-feature-pattern.md`
- `src/features/dashboard/dashboard.controller.ts`
- `src/features/dashboard/dashboard.module.ts`
- `src/app.module.ts` (grep: dòng 18, 51)
- `src/features/rabbitmq/rmq.constants.ts`
- `src/features/rabbitmq/rmq.producer.ts` (grep: timeout/retry)
- `src/packages/guards/jwt-auth.guard.ts` (type `JwtGuardUser`)
- `src/packages/decorators/user.decorator.ts`
- `../tutor-service/src/features/dashboard/dashboard.rpc.controller.ts` (grep: pattern và payload)
