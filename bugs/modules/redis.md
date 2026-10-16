# Bug review — module `redis`

Ngày: 2026-10-16
Phạm vi: `src/features/redis/` + entity `src/packages/entities/redis/` + `RolesGuard`, `rmq.constants.ts`, `rmq.producer.ts` liên quan.
Không build/test, chỉ đọc tĩnh.

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 4 |

## Bug

| ID | Mức | File:dòng | Vấn đề | Kịch bản lỗi | Hướng sửa |
|---|---|---|---|---|---|
| REDIS-01 | Low | `src/features/redis/redis.controller.ts:17-24, 48-51` | Denylist `SENSITIVE_KEY_PREFIXES` không bao giờ kích hoạt với schema hiện tại: `getRedisQuerySchema` (`src/packages/entities/redis/redis.schema.ts:10`) chỉ cho phép `cache:`, `public:`, `stats:`, nên mọi key trong denylist bị Zod trả 400 trước khi tới `ForbiddenException`. | Hiện không gây lỗi bảo mật (allowlist chặn trước). Nhưng hai danh sách nhạy cảm độc lập; nếu sau này mở rộng allowlist mà quên denylist, hoặc ngược lại, hai nơi lệch nhau và không có test nào bắt. | Gộp về một nguồn: đặt denylist trong entity cạnh `REDIS_READABLE_KEY_PREFIXES`, hoặc bỏ denylist và thêm unit test cho schema với key `session:*`, `reset-password:*`. |
| REDIS-02 | Low | `src/features/redis/redis.controller.ts:32-33` và `:39-40` | `@UseGuards(RolesGuard)` và `@Roles('ADMIN')` khai báo cả ở class lẫn method `get()`. | Không sai hành vi (guard chạy hai lần, kết quả giống nhau), nhưng lặp cấu hình dễ lệch khi sửa một chỗ quên chỗ kia. | Giữ ở class hoặc ở method, không cả hai. |
| REDIS-03 | Low | `src/packages/entities/redis/redis.schema.ts:7-9` | `key` chỉ có `.min(1)`, không có `.max(...)`. Key dài được forward nguyên qua RMQ tới `third-service`. | Giới hạn thực tế do HTTP parser của Node/Express (khoảng 16KB), nên tác động nhỏ. Chỉ là thiếu ràng buộc đầu vào. | Thêm `.max(...)` hợp lý, ví dụ 256 hoặc 512 ký tự. |
| REDIS-04 | Low | `src/packages/entities/redis/redis.schema.ts:4` | Prefix `cache:` rất rộng. Mọi key `cache:*` mà `third-service` ghi, kể cả nếu có dữ liệu nhạy cảm như profile, email, token, đều đọc được qua HTTP bởi mọi ADMIN. **Chưa xác minh**: không đọc code `third-service`, nên chưa có bằng chứng cache nào chứa PII hoặc token. | Admin (hoặc tài khoản admin bị lộ) đọc được dữ liệu cache có PII qua `GET /redis?key=cache:...`. Mức Low vì chưa có bằng chứng và yêu cầu quyền ADMIN. | Kiểm tra bên `third-service` các nơi ghi `cache:*`. Nếu có PII/token thì thu hẹp prefix hoặc loại trừ các key đó khỏi allowlist. |

## Phụ thuộc cần repo khác (nếu có)
- `redis.get` (gateway gửi `{ key }`, route `third_queue` theo `RMQ_PREFIX_ROUTES.redis` trong `src/features/rabbitmq/rmq.constants.ts:27`): cần kiểm tra bên `third-service` có `@MessagePattern('redis.get')` trong `*.rpc.controller.ts`, và payload là `{ key: string }`. Chưa xác minh.
- Owner `third-service` cần kiểm tra cách xử lý kiểu dữ liệu: các key `cache:`, `stats:`, `public:` có thể là hash, list, set. Khi đó `GET` ném `WRONGTYPE`, gateway trả 500 "Internal server error" thay vì lỗi nghiệp vụ rõ ràng. Chưa xác minh.
- Xác nhận đã làm: không có bypass allowlist/denylist. So sánh prefix trong denylist dùng `toLowerCase()`, còn allowlist phân biệt hoa thường, nên không có key nào vừa qua schema vừa khớp denylist.
- Xác nhận đã làm: route là admin-only. `RolesGuard` kiểm tra `@Roles('ADMIN')`, và `JwtAuthGuard` là `APP_GUARD` toàn cục (`src/app.module.ts:75-78`). Route không có `@Public()`.
- Timeout và retry của `redis.get`: không nằm trong `RMQ_FAST_PATTERN_POLICIES` hay `RMQ_SLOW_PATTERN_POLICIES`, nên dùng mặc định 10s, 2 retry. `isIdempotentPattern('redis.get')` trả về true, nên retry là an toàn. Không phải bug.

## Đã đọc
- `CLAUDE.md`
- `.claude/rules/conventions.md`
- `.claude/rules/nestjs-feature-pattern.md`
- `src/features/redis/redis.controller.ts`
- `src/features/redis/redis.module.ts`
- `src/packages/entities/redis/redis.schema.ts`
- `src/packages/entities/redis/redis.dto.ts`
- `src/packages/entities/redis/index.ts`
- `src/packages/guards/roles.guard.ts`
- `src/features/rabbitmq/rmq.constants.ts`
- `src/features/rabbitmq/rmq.producer.ts`
- `src/app.module.ts` (chỉ grep: `RedisModule` được đăng ký ở dòng 23 và 56; `APP_GUARD` ở dòng 71-78)
